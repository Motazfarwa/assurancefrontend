import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { deleteCompany, listCompanies, updateCompany } from '../../services/companyApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import './CompanyManagementModal.css';

// Laid out as the legacy "Gestion des compagnies" screen: the company, then the agency it is reached through.
const sections = [
  ['Compagnie', [
    ['nom_compagnie', 'Libellé', 'text'], ['Nbr_Chiffre_Code', 'Longueur branche', 'number'],
    ['contre_ass_spe', 'Prime CAS', 'number'], ['Capital_CAS', 'Capital CAS', 'number'],
    ['Assistance_Voyage', 'Assistance voyage', 'number'], ['Num_Quittance_Auto', 'N° quittance automatique', 'select'],
    ['Taux_Majoration', 'Taux majoration', 'number'], ['Adresse_Compagnie', 'Adresse compagnie', 'text'],
    ['Ville_Compagnie', 'Ville compagnie', 'text'],
  ]],
  ['Agence', [
    ['Adresse_Agence', 'Adresse', 'text'], ['Code_Agent', 'Code', 'text'], ['Ville_Agence', 'Ville', 'text'],
    ['CP_Agence', 'Code postal', 'number'], ['Pays_Agence', 'Pays', 'text'], ['Tel_Agence', 'Tél', 'text'],
    ['Fax_Agence', 'Fax', 'text'], ['Nom_Agence', 'Nom agence', 'text'],
  ]],
];
const fields = sections.flatMap(([, list]) => list);

function CompanyFields({ list, company, editing, onChange }) {
  return <div className="catalog-fields-grid">
    {list.map(([name, label, type]) => <label className="catalog-field" key={name}>
      <span>{label}</span>
      {type === 'select' ? <select name={name} value={company[name] ?? ''} disabled={!editing} onChange={onChange}><option value="">Non</option><option value="O">Oui</option></select> :
        <input name={name} type={type} step={type === 'number' ? 'any' : undefined} value={company[name] ?? ''} readOnly={!editing} onChange={onChange} />}
    </label>)}
  </div>;
}

export default function CompanyManagementModal({ moduleId = '730', onClose }) {
  const { accessToken } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [company, setCompany] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCompanies = useCallback(async (preferredCode = '') => {
    setLoading(true);
    try {
      const result = await listCompanies(accessToken);
      const items = Array.isArray(result) ? result : result.items || [];
      setCompanies(items);
      const nextCode = items.some((item) => String(item.code_compagnie) === String(preferredCode)) ? String(preferredCode) : items.length ? String(items[0].code_compagnie) : '';
      setSelectedCode(nextCode);
      setCompany(items.find((item) => String(item.code_compagnie) === nextCode) || null);
      setEditing(false);
    } catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [accessToken]);

  useEffect(() => { loadCompanies(''); }, [loadCompanies]);

  function selectCompany(event) {
    const code = event.target.value;
    setSelectedCode(code);
    setCompany(companies.find((item) => String(item.code_compagnie) === code) || null);
    setEditing(false); setError(''); setNotice('');
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
      await updateCompany(accessToken, selectedCode, payload);
      setEditing(false); setNotice('Les informations de la compagnie ont été modifiées.');
      await loadCompanies(selectedCode);
    } catch (saveError) { setError(saveError.message); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!company || !window.confirm(`Supprimer la compagnie ${company.nom_compagnie || selectedCode} ?`)) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await deleteCompany(accessToken, selectedCode);
      setNotice('Compagnie supprimée.');
      await loadCompanies('');
    } catch (deleteError) { setError(deleteError.message); }
    finally { setSaving(false); }
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="catalog-modal" role="dialog" aria-modal="true" aria-labelledby="company-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali · Siège</small></span></div><div className="expert-title"><span>PRODUCTION · MODULE {moduleId}</span><h2 id="company-title">Gestion compagnies</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="catalog-body">
        <div className="catalog-toolbar"><label className="catalog-picker"><span>Code compagnie</span><select value={selectedCode} onChange={selectCompany} disabled={loading || saving}><option value="">Sélectionner une compagnie</option>{companies.map((item) => <option key={item.code_compagnie} value={item.code_compagnie}>{item.code_compagnie} · {item.nom_compagnie}</option>)}</select></label><span className="catalog-count">{companies.length} compagnie{companies.length > 1 ? 's' : ''}</span></div>
        {loading ? <div className="catalog-empty">Chargement des compagnies…</div> : company ? <form onSubmit={save}>{sections.map(([title, list], index) => <div className="catalog-section" key={title}><div className="catalog-section-heading"><div><span>{title.toUpperCase()}</span>{index === 0 && <h3>{company.nom_compagnie || 'Compagnie sélectionnée'}</h3>}</div>{index === 0 && <span className="catalog-code">Code {company.code_compagnie}</span>}</div><CompanyFields list={list} company={company} editing={editing} onChange={changeField} /></div>)}
          {error && <div className="expert-error catalog-message">{error}</div>}{notice && <div className="catalog-notice" role="status">{notice}</div>}
          <footer className="expert-modal-actions catalog-actions">{editing ? <><button type="button" className="expert-cancel" onClick={() => { setCompany(companies.find((item) => String(item.code_compagnie) === selectedCode)); setEditing(false); }}>Annuler</button><button type="submit" className="expert-submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer les modifications'}</button></> : <><button type="button" className="catalog-delete" onClick={remove} disabled={saving}>Supprimer</button><button type="button" className="expert-submit" onClick={() => setEditing(true)} disabled={saving}>Modifier</button></>}</footer>
        </form> : <div className="catalog-empty">{error || 'Aucune compagnie disponible.'}</div>}
      </div>
    </section>
  </div>;
}
