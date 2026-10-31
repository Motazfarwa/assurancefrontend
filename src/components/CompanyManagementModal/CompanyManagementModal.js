import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { createCompany, deleteCompany, listCompanies, updateCompany } from '../../services/companyApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import './CompanyManagementModal.css';

// Fields in the order of the legacy "Gestion des compagnies" screen ([name, label, type, columns out of 6]);
// the last ones of each group are not on the legacy screen and come after.
const COMPANY_FIELDS = [
  ['Nbr_Chiffre_Code', 'Longueur branche', 'number', 2], ['contre_ass_spe', 'Prime CAS', 'number', 2], ['Capital_CAS', 'Capital CAS', 'number', 2],
  ['Assistance_Voyage', 'Assistance voyage', 'number', 2], ['Num_Quittance_Auto', 'N° quittance automatique', 'check', 4],
  ['Taux_Majoration', 'Taux majoration', 'number', 2], ['Adresse_Compagnie', 'Adresse compagnie', 'text', 2], ['Ville_Compagnie', 'Ville compagnie', 'text', 2],
];
const AGENCY_FIELDS = [
  ['Adresse_Agence', 'Adresse', 'text', 6],
  ['Code_Agent', 'Code', 'text', 2], ['Ville_Agence', 'Ville', 'text', 2], ['CP_Agence', 'Code postal', 'number', 2],
  ['Pays_Agence', 'Pays', 'text', 2], ['Tel_Agence', 'Tél', 'text', 2], ['Fax_Agence', 'Fax', 'text', 2],
  ['Nom_Agence', 'Nom agence', 'text', 2],
];
const fields = [['nom_compagnie', 'Libellé', 'text'], ...COMPANY_FIELDS, ...AGENCY_FIELDS];
const blankCompany = (code = '') => ({ code_compagnie: code, Num_Quittance_Auto: 'N' });

function Fields({ list, company, editing, onChange }) {
  return list.map(([name, label, type, span]) => type === 'check'
    ? <label className={`catalog-check cmp-span-${span}`} key={name}><input type="checkbox" name={name} checked={company[name] === 'O'} disabled={!editing} onChange={(event) => onChange({ target: { name, value: event.target.checked ? 'O' : 'N' } })} />{label}</label>
    : <label className={`catalog-field cmp-span-${span}`} key={name}><span>{label}</span>
      <input name={name} type={type} step={type === 'number' ? 'any' : undefined} value={company[name] ?? ''} readOnly={!editing} onChange={onChange} />
    </label>);
}

// Module "Gestion des compagnies": opens on an empty sheet; typing the code of an existing company shows it
// (to modify or delete it), typing a new code keeps the sheet to add the company.
export default function CompanyManagementModal({ moduleId = '730', onClose }) {
  const { accessToken } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [codeText, setCodeText] = useState('');
  const [company, setCompany] = useState(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const find = (code, list = companies) => list.find((item) => String(item.code_compagnie) === String(code).trim());

  const loadCompanies = useCallback(async (preferredCode = '') => {
    setLoading(true);
    try {
      const result = await listCompanies(accessToken);
      const items = Array.isArray(result) ? result : result.items || [];
      setCompanies(items);
      const shown = items.find((item) => String(item.code_compagnie) === String(preferredCode));
      if (shown) {
        setSelectedCode(String(shown.code_compagnie)); setCodeText(String(shown.code_compagnie)); setCompany(shown);
        setEditing(false); setCreating(false);
      } else {
        setSelectedCode(''); setCodeText(''); setCompany(blankCompany()); setEditing(true); setCreating(true);
      }
    } catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [accessToken]);

  useEffect(() => { loadCompanies(''); }, [loadCompanies]);

  function show(item) {
    setSelectedCode(String(item.code_compagnie)); setCodeText(String(item.code_compagnie)); setCompany(item);
    setEditing(false); setCreating(false); setError(''); setNotice('');
  }

  function startBlank() {
    setSelectedCode(''); setCodeText(''); setCompany(blankCompany());
    setEditing(true); setCreating(true); setError(''); setNotice('');
  }

  function typeCode(event) {
    const text = event.target.value.replace(/\D/g, '').slice(0, 5);
    setCodeText(text);
    const existing = find(text);
    if (existing) { show(existing); return; }
    if (!text) { startBlank(); return; }
    // A code not used yet: a blank sheet to add the company (keeping what was already typed in it).
    setCompany((current) => ({ ...(creating ? current : blankCompany(text)), code_compagnie: text }));
    setCreating(true); setEditing(true); setError(''); setNotice('');
  }

  function cancelEdit() {
    const current = find(selectedCode);
    if (current) show(current); else startBlank();
  }

  function changeField(event) { setCompany((current) => ({ ...current, [event.target.name]: event.target.value })); }

  async function save(event) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const payload = { ...company };
      fields.forEach(([name, , type]) => {
        if (payload[name] === '') payload[name] = null;
        else if (type === 'number' && payload[name] != null) payload[name] = Number(payload[name]);
      });
      if (creating) {
        payload.code_compagnie = Number(payload.code_compagnie);
        const saved = await createCompany(accessToken, payload);
        await loadCompanies(saved.code_compagnie);
        setNotice(`Compagnie ${saved.nom_compagnie} ajoutée (code ${saved.code_compagnie}). Pensez à créer ses branches.`);
        return;
      }
      await updateCompany(accessToken, selectedCode, payload);
      await loadCompanies(selectedCode);
      setNotice('Les informations de la compagnie ont été modifiées.');
    } catch (saveError) { setError(saveError.message); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!company || !window.confirm(`Supprimer la compagnie ${company.nom_compagnie || selectedCode} ?`)) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await deleteCompany(accessToken, selectedCode);
      await loadCompanies('');
      setNotice('Compagnie supprimée.');
    } catch (deleteError) { setError(deleteError.message); }
    finally { setSaving(false); }
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="catalog-modal" role="dialog" aria-modal="true" aria-labelledby="company-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali · Siège</small></span></div><div className="expert-title"><span>PRODUCTION · MODULE {moduleId}</span><h2 id="company-title">Gestion compagnies</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      {loading && !company ? <div className="catalog-empty">Chargement des compagnies…</div> : <form className="catalog-body" onSubmit={save}>
        <div className="catalog-toolbar cmp-toolbar">
          {creating ? <button type="submit" className="expert-submit" disabled={saving || !codeText}>{saving ? 'Enregistrement…' : 'Ajouter la compagnie'}</button>
            : editing ? <><button type="submit" className="expert-submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button><button type="button" className="expert-cancel" onClick={cancelEdit} disabled={saving}>Annuler</button></>
              : <><button type="button" className="expert-submit" onClick={() => { setEditing(true); setNotice(''); }} disabled={saving || !company}>Modifier</button><button type="button" className="catalog-delete" onClick={remove} disabled={saving || !company}>Supprimer</button></>}
          <span className="catalog-count">{companies.length} compagnie{companies.length > 1 ? 's' : ''}</span>
        </div>

        <div className="catalog-section">
          <div className="catalog-section-heading"><div><span>COMPAGNIE</span>{creating && codeText && <h3>Nouvelle compagnie</h3>}{!creating && <h3>{company?.nom_compagnie}</h3>}</div></div>
          <div className="cmp-grid">
            <label className="catalog-field cmp-span-2"><span>Code compagnie</span>
              <input value={codeText} onChange={typeCode} inputMode="numeric" readOnly={editing && !creating} autoFocus autoComplete="off" required title="Tapez un code existant pour l’ouvrir, ou un nouveau code pour ajouter une compagnie" />
            </label>
            <label className="catalog-field cmp-span-4"><span>Libellé</span>
              <input name="nom_compagnie" value={company?.nom_compagnie ?? ''} onChange={changeField} readOnly={!editing} required maxLength={50} />
            </label>
            {company && <Fields list={COMPANY_FIELDS} company={company} editing={editing} onChange={changeField} />}
          </div>
          <p className="cmp-hint">Tapez le code d’une compagnie pour l’afficher, ou un nouveau code pour l’ajouter.</p>
        </div>

        {company && <div className="catalog-section">
          <div className="catalog-section-heading"><div><span>AGENCE</span></div></div>
          <div className="cmp-grid"><Fields list={AGENCY_FIELDS} company={company} editing={editing} onChange={changeField} /></div>
        </div>}

        {error && <div className="expert-error catalog-message cmp-message" role="alert">{error}</div>}
        {notice && <div className="catalog-notice" role="status">{notice}</div>}
        <div className="cmp-spacer" />
      </form>}
    </section>
  </div>;
}
