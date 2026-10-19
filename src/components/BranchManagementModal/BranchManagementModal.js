import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { deleteCompanyBranch, listCompanies, listCompanyBranches, saveCompanyBranch } from '../../services/companyApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import './BranchManagementModal.css';

const branchFields = [
  ['code_branche', 'Code branche', 'text'], ['nom_branche', 'Nom branche', 'text'],
  ['taux_comm', 'T. Com', 'number'], ['Taux_Comm2', 'M. Com', 'number'], ['Taxe', 'Taxe', 'number'],
  ['frais_quitt', 'F. Quit.', 'number'], ['Timbre', 'Timbre', 'number'],
  ['Cout_Attestation', 'C. Att.', 'number'], ['Transport', 'F. Trans.', 'number'],
  ['Taxe2', 'Taxe 2', 'number'], ['Montant_Comm', 'Montant commission', 'number'],
  ['Automobile', 'Automobile', 'select'], ['Nature_Tarif', 'Nature tarif', 'text'],
];
const emptyBranch = Object.fromEntries(branchFields.map(([key]) => [key, '']));

function BranchForm({ value, onChange, readOnly = false, disableCode = false }) {
  return <div className="branch-form-grid">{branchFields.map(([name, label, type]) => <label className="catalog-field" key={name}>
    <span>{label}{(name === 'code_branche' || name === 'nom_branche') && <b> *</b>}</span>
    {type === 'select' ? <select name={name} value={value[name] ?? ''} disabled={readOnly} onChange={onChange}><option value="">Non</option><option value="O">Oui</option></select> :
      <input name={name} type={type} maxLength={name === 'code_branche' ? 4 : undefined} step={type === 'number' ? 'any' : undefined} value={value[name] ?? ''} readOnly={readOnly || (name === 'code_branche' && disableCode)} onChange={onChange} required={name === 'code_branche' || name === 'nom_branche'} />}
  </label>)}</div>;
}

export default function BranchManagementModal({ onClose }) {
  const { accessToken } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [companyCode, setCompanyCode] = useState('');
  const [branches, setBranches] = useState([]);
  const [selectedBranchCode, setSelectedBranchCode] = useState('');
  const [form, setForm] = useState(null);
  const [mode, setMode] = useState('view');
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    listCompanies(accessToken).then((result) => {
      if (!active) return;
      const items = Array.isArray(result) ? result : result.items || [];
      setCompanies(items);
      setCompanyCode(items.length ? String(items[0].code_compagnie) : '');
    }).catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoadingCompanies(false); });
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    if (!companyCode) { setBranches([]); setSelectedBranchCode(''); setForm(null); return undefined; }
    let active = true;
    setLoadingBranches(true); setError(''); setNotice(''); setMode('view'); setForm(null);
    listCompanyBranches(accessToken, companyCode).then((result) => {
      if (!active) return;
      const items = Array.isArray(result) ? result : result.items || [];
      setBranches(items);
      setSelectedBranchCode(items.length ? String(items[0].code_branche) : '');
    }).catch((loadError) => { if (active) { setBranches([]); setError(loadError.message); } })
      .finally(() => { if (active) setLoadingBranches(false); });
    return () => { active = false; };
  }, [accessToken, companyCode]);

  const selectedBranch = branches.find((item) => String(item.code_branche) === selectedBranchCode) || null;

  function selectCompany(event) { setCompanyCode(event.target.value); setSelectedBranchCode(''); }
  function selectBranch(branch) { setSelectedBranchCode(String(branch.code_branche)); setForm(null); setMode('view'); setError(''); }
  function startAdd() { setForm({ ...emptyBranch }); setSelectedBranchCode(''); setMode('add'); setError(''); setNotice(''); }
  function startEdit() { if (selectedBranch) { setForm({ ...selectedBranch }); setMode('edit'); setError(''); setNotice(''); } }
  function changeField(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }

  async function refreshBranches(preferredCode = '') {
    const result = await listCompanyBranches(accessToken, companyCode);
    const items = Array.isArray(result) ? result : result.items || [];
    setBranches(items);
    const nextCode = items.some((item) => String(item.code_branche) === String(preferredCode)) ? String(preferredCode) : items.length ? String(items[0].code_branche) : '';
    setSelectedBranchCode(nextCode);
    return items;
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const payload = { ...form };
      branchFields.forEach(([name, , type]) => {
        if (payload[name] === '') payload[name] = null;
        else if (type === 'number' && payload[name] != null) payload[name] = Number(payload[name]);
      });
      const code = payload.code_branche;
      await saveCompanyBranch(accessToken, companyCode, payload, mode === 'edit');
      await refreshBranches(code);
      setMode('view'); setForm(null); setNotice(mode === 'add' ? 'Branche ajoutée.' : 'Branche modifiée.');
    } catch (saveError) { setError(saveError.message); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!selectedBranch || !window.confirm(`Supprimer la branche ${selectedBranch.code_branche} · ${selectedBranch.nom_branche || ''} ?`)) return;
    setSaving(true); setError(''); setNotice('');
    try { await deleteCompanyBranch(accessToken, companyCode, selectedBranch.code_branche); await refreshBranches(''); setNotice('Branche supprimée.'); }
    catch (deleteError) { setError(deleteError.message); }
    finally { setSaving(false); }
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="branch-modal" role="dialog" aria-modal="true" aria-labelledby="branch-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali · Siège</small></span></div><div className="expert-title"><span>PRODUCTION · MODULE 740</span><h2 id="branch-title">Tables Branche</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="branch-content">
        <div className="branch-toolbar"><label className="catalog-picker"><span>Compagnie</span><select value={companyCode} onChange={selectCompany} disabled={loadingCompanies || saving}><option value="">Sélectionner une compagnie</option>{companies.map((company) => <option key={company.code_compagnie} value={company.code_compagnie}>{company.code_compagnie} · {company.nom_compagnie}</option>)}</select></label><div className="branch-toolbar-actions"><button type="button" className="expert-submit" onClick={startAdd} disabled={!companyCode || saving}>＋ Ajouter</button><button type="button" className="expert-cancel" onClick={() => selectedBranch && setMode(mode === 'preview' ? 'view' : 'preview')} disabled={!selectedBranch || saving}>Aperçu</button></div></div>
        {error && <div className="expert-error branch-message">{error}</div>}{notice && <div className="catalog-notice branch-message" role="status">{notice}</div>}
        <div className="branch-table-wrap"><table className="branch-table"><thead><tr>{['Code', 'Nom branche', 'T. Com', 'M. Com', 'Taxe', 'F. Quit.', 'Timbre', 'C. Att.', 'F. Trans.'].map((label) => <th key={label}>{label}</th>)}<th>Actions</th></tr></thead>
          <tbody>{loadingCompanies || loadingBranches ? <tr><td colSpan="10" className="branch-empty">Chargement…</td></tr> : branches.length ? branches.map((branch) => <tr key={`${branch.code_compagnie}-${branch.code_branche}`} className={selectedBranchCode === String(branch.code_branche) ? 'is-selected' : ''} onClick={() => selectBranch(branch)} onDoubleClick={() => { selectBranch(branch); setForm({ ...branch }); setMode('preview'); }}>
            <td>{branch.code_branche}</td><td>{branch.nom_branche || '—'}</td><td>{branch.taux_comm ?? '—'}</td><td>{branch.Taux_Comm2 ?? '—'}</td><td>{branch.Taxe ?? '—'}</td><td>{branch.frais_quitt ?? '—'}</td><td>{branch.Timbre ?? '—'}</td><td>{branch.Cout_Attestation ?? '—'}</td><td>{branch.Transport ?? '—'}</td><td><button type="button" className="branch-row-action" onClick={(event) => { event.stopPropagation(); selectBranch(branch); setForm({ ...branch }); setMode('edit'); }}>Modifier</button></td>
          </tr>) : <tr><td colSpan="10" className="branch-empty">{companyCode ? 'Aucune branche pour cette compagnie.' : 'Sélectionnez une compagnie.'}</td></tr>}</tbody></table></div>
        {form && (mode === 'add' || mode === 'edit' || mode === 'preview') && <form className="branch-editor" onSubmit={save}><div className="catalog-section-heading"><div><span>{mode === 'add' ? 'NOUVELLE BRANCHE' : mode === 'edit' ? 'MODIFICATION' : 'APERÇU BRANCHE'}</span><h3>{mode === 'add' ? 'Ajouter une branche' : `${form.code_branche || ''} · ${form.nom_branche || ''}`}</h3></div></div><BranchForm value={form} onChange={changeField} readOnly={mode === 'preview'} disableCode={mode === 'edit'} />
          {mode !== 'preview' && <div className="branch-editor-actions"><button className="expert-cancel" type="button" onClick={() => { setMode('view'); setForm(null); }}>Annuler</button><button className="expert-submit" type="submit" disabled={saving}>{saving ? 'Enregistrement…' : mode === 'add' ? 'Enregistrer la branche' : 'Enregistrer les modifications'}</button></div>}
        </form>}
      </div>
      <footer className="expert-modal-actions branch-footer"><span>{branches.length} branche{branches.length > 1 ? 's' : ''}</span><div>{selectedBranch && mode === 'view' && <><button type="button" className="catalog-delete" onClick={remove} disabled={saving}>Supprimer</button><button type="button" className="expert-submit" onClick={startEdit} disabled={saving}>Modifier</button></>}<button type="button" className="expert-cancel" onClick={onClose} disabled={saving}>Fermer</button></div></footer>
    </section>
  </div>;
}
