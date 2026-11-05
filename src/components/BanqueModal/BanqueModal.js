import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { createBanque, deleteBanque, extractBanque, listBanques, updateBanque } from '../../services/banqueApi';
import { listCompanies } from '../../services/companyApi';
import { showToast } from '../../services/toast';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../CompanyManagementModal/CompanyManagementModal.css';
import DocumentImportDialog from '../DocumentImportDialog/DocumentImportDialog';
import './BanqueModal.css';

// What an account is for (TBanque.Type_Dep), as on the legacy screen.
// The M. JEMMALI frais généraux (F) are no longer offered; the old accounts of that type keep their label.
const TYPES = [['T', 'Technique'], ['D', 'Frais Généraux (W. JEMMALI)']];
const typeLabel = (code) => (code === 'F' ? 'Frais Généraux (M. JEMMALI)' : (TYPES.find(([value]) => value === code) || [])[1] || code || '');
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ code_banque: '', nom_banque: '', num_compte_b: '', credit_ini: '0', date_ini: today(), debit: 0, credit: 0, date_maj: '', type_dep: 'T', code_compagnie: '', archive: false });
const day = (value) => (value ? String(value).slice(0, 10) : '');
const frDate = (value) => (value ? day(value).split('-').reverse().join('/') : '');
const dt = (value) => Number(value || 0).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const digits = (value) => String(value || '').replace(/\D/g, '');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Module "Gestion des banques": the agency's own accounts (TBanque) — technique accounts collect for a company,
// the others take the frais généraux. Débit / crédit en cours are kept up to date by the operations.
export default function BanqueModal({ moduleId = '740', onClose }) {
  const { accessToken } = useAuth();
  const [banques, setBanques] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState('');
  const [bank, setBank] = useState(blank());
  const [mode, setMode] = useState('view'); // view | create | edit
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importFile, setImportFile] = useState(null); // the document being read in the import window
  const scanning = Boolean(importFile);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const fileRef = useRef(null);
  const editing = mode !== 'view';
  const listed = banques.filter((item) => showArchived || !item.archive);
  const companyName = (code) => companies.find((item) => String(item.code_compagnie) === String(code))?.nom_compagnie || '';

  const load = useCallback(async (code = '') => {
    setLoading(true);
    try {
      const items = await listBanques(accessToken);
      setBanques(items);
      const shown = items.find((item) => item.code_banque === code) || items.find((item) => !item.archive);
      if (shown) { setSelected(shown.code_banque); setBank(shown); setMode('view'); } else { setSelected(''); setBank(blank()); setMode('create'); }
    } catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    listCompanies(accessToken).then((result) => setCompanies(Array.isArray(result) ? result : result.items || [])).catch(() => setCompanies([]));
  }, [accessToken]);

  function show(item) { setSelected(item.code_banque); setBank(item); setMode('view'); setError(''); setNotice(''); }
  function startCreate(values = {}) { setSelected(''); setBank({ ...blank(), ...values }); setMode('create'); setError(''); setNotice(''); }
  function cancel() { const current = banques.find((item) => item.code_banque === selected); if (current) show(current); else startCreate(); }
  const change = (name, value) => setBank((current) => ({ ...current, [name]: value }));

  async function save(event) {
    event.preventDefault();
    if (bank.type_dep === 'T' && !bank.code_compagnie) { setError('Choisissez la compagnie du compte technique.'); return; }
    setSaving(true); setError(''); setNotice('');
    const payload = {
      code_banque: bank.code_banque.trim(), nom_banque: bank.nom_banque.trim(), num_compte_b: bank.num_compte_b || null,
      credit_ini: Number(bank.credit_ini || 0), date_ini: day(bank.date_ini) || null, type_dep: bank.type_dep,
      code_compagnie: bank.type_dep === 'T' ? Number(bank.code_compagnie) : null, archive: Boolean(bank.archive),
    };
    try {
      const saved = mode === 'create' ? await createBanque(accessToken, payload) : await updateBanque(accessToken, selected, payload);
      await load(saved.code_banque);
      showToast(mode === 'create' ? `Banque ${saved.code_banque} ajoutée avec succès.` : `Banque ${saved.code_banque} modifiée avec succès.`);
    } catch (saveError) { setError(saveError.message); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!selected || !window.confirm(`Supprimer le compte ${selected} ?`)) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await deleteBanque(accessToken, selected);
      await load();
      showToast(`Banque ${selected} supprimée.`);
    } catch (deleteError) { setError(deleteError.message); }
    finally { setSaving(false); }
  }

  // Importer (once the import window has read the RIB / relevé): fills the sheet. A RIB already known opens that
  // account; otherwise the values go into the account being added or modified (a new one when only viewing).
  function applyImport({ fields = {}, source }) {
    setImportFile(null); setError(''); setNotice('');
    const account = fields.rib || fields.numero_compte || '';
    const known = digits(account).length >= 8 && banques.find((item) => {
      const own = digits(item.num_compte_b);
      return own.length >= 8 && (digits(account).includes(own) || own.includes(digits(account)));
    });
    if (known && mode !== 'edit') {
      show(known);
      setNotice(`Ce compte existe déjà : ${known.code_banque} (${known.nom_banque}).`);
      return;
    }
    const bankName = String(fields.banque || '').toUpperCase().replace(/\s+BANK$/, '').trim();
    const tail = digits(account).slice(-4);
    const values = {};
    if (account) values.num_compte_b = account.slice(0, 20);
    if (bankName && (mode !== 'edit' || !bank.nom_banque)) values.nom_banque = `${bankName}${tail ? ` ${tail}` : ''}`.slice(0, 50);
    if (fields.solde && !Number.isNaN(Number(fields.solde)) && mode !== 'edit') values.credit_ini = String(Number(fields.solde));
    const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fields.date || '');
    if (date && mode !== 'edit') values.date_ini = `${date[3]}-${date[2]}-${date[1]}`;
    if (mode === 'view') startCreate({ code_banque: `${bankName}${tail ? ` ${tail}` : ''}`.slice(0, 15), ...values });
    else setBank((current) => ({ ...current, ...values }));
    const read = [fields.banque && `banque ${fields.banque}`, account && `compte ${account}`, fields.titulaire && `titulaire ${fields.titulaire}`, fields.solde && `solde ${fields.solde}`].filter(Boolean);
    setNotice(read.length ? `Document lu (${source === 'ai' ? 'IA' : 'OCR'}) : ${read.join(' · ')}. Vérifiez les champs avant d’enregistrer.` : 'Aucune information bancaire lisible dans ce document.');
  }

  // What the import window shows once the RIB / relevé is read.
  const summarizeImport = ({ fields = {} }) => ({
    rows: [['Banque', fields.banque], ['RIB', fields.rib], ['N° de compte', fields.numero_compte], ['Titulaire', fields.titulaire], ['Agence', fields.agence], ['Solde', fields.solde], ['Date', fields.date]]
      .filter(([, value]) => value),
    empty: 'Aucune information bancaire lisible dans ce document.',
  });

  function print() {
    const rows = listed.map((item) => `<tr><td>${escapeHtml(item.code_banque)}</td><td>${escapeHtml(item.nom_banque)}</td><td>${escapeHtml(item.num_compte_b)}</td><td>${escapeHtml(typeLabel(item.type_dep))}${item.type_dep === 'T' ? ` · ${escapeHtml(companyName(item.code_compagnie))}` : ''}</td><td class="n">${dt(item.credit_ini)}</td><td>${frDate(item.date_ini)}</td><td class="n">${dt(item.debit)}</td><td class="n">${dt(item.credit)}</td><td>${item.archive ? 'Archivé' : ''}</td></tr>`).join('');
    const page = window.open('', '_blank');
    if (!page) { setError('Autorisez les fenêtres pop-up pour imprimer la liste.'); return; }
    page.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Liste des banques</title><style>body{font:12px Arial,sans-serif;color:#1c3342;margin:24px}h1{font-size:17px;margin:0 0 4px}p{margin:0 0 14px;color:#5f7480}table{width:100%;border-collapse:collapse}th,td{border:1px solid #c9d6db;padding:5px 7px;text-align:left}th{background:#eef4f5}.n{text-align:right}</style></head><body><h1>Liste des banques</h1><p>Assurance Jemmali · ${listed.length} compte(s) · imprimé le ${new Date().toLocaleDateString('fr-FR')}</p><table><thead><tr><th>Code</th><th>Libellé</th><th>N° compte</th><th>Type</th><th>Crédit initial</th><th>Date initiale</th><th>Débit en cours</th><th>Crédit en cours</th><th></th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    page.document.close();
    page.focus();
    page.print();
  }


  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="catalog-modal bnk-modal" role="dialog" aria-modal="true" aria-labelledby="bank-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali · Siège</small></span></div><div className="expert-title"><span>PARAMÉTRAGE · MODULE {moduleId}</span><h2 id="bank-title">Gestion des banques</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      {loading && !banques.length ? <div className="catalog-empty">Chargement des banques…</div> : <form className="catalog-body" onSubmit={save}>
        <div className="catalog-toolbar cmp-toolbar">
          {editing ? <>
            <button type="submit" className="expert-submit" disabled={saving || scanning}>{saving ? 'Enregistrement…' : mode === 'create' ? 'Ajouter la banque' : 'Enregistrer'}</button>
            <button type="button" className="expert-cancel" onClick={cancel} disabled={saving}>Annuler</button>
          </> : <>
            <button type="button" className="expert-submit" onClick={() => startCreate()} disabled={saving}>Ajouter</button>
            <button type="button" className="expert-cancel" onClick={() => { setMode('edit'); setNotice(''); }} disabled={saving || !selected}>Modifier</button>
            <button type="button" className="catalog-delete" onClick={remove} disabled={saving || !selected}>Supprimer</button>
          </>}
          <button type="button" className="expert-cancel" onClick={() => setPreview(true)} disabled={saving}>Aperçu</button>
          <button type="button" className="expert-cancel bnk-import" onClick={() => fileRef.current?.click()} disabled={saving || scanning} title="Scanner un RIB, une attestation ou un relevé bancaire (image ou PDF) pour remplir la fiche">{scanning ? 'Lecture…' : '⬆ Importer un document'}</button>
          <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) setImportFile(file); }} />
          <button type="button" className="expert-cancel" onClick={onClose}>Fermer</button>
          <span className="catalog-count">{banques.filter((item) => !item.archive).length} compte(s) actif(s)</span>
        </div>

        <div className="catalog-section">
          <div className="catalog-section-heading"><div><span>COMPTE BANCAIRE</span><h3>{mode === 'create' ? 'Nouvelle banque' : bank.nom_banque}</h3></div>{bank.archive && <span className="bnk-archived">Archivé</span>}</div>
          <div className="cmp-grid">
            <label className="catalog-field cmp-span-3"><span>Code banque</span>
              {mode === 'create'
                ? <input value={bank.code_banque} onChange={(event) => change('code_banque', event.target.value.toUpperCase())} maxLength={15} required autoFocus />
                : <select value={selected} onChange={(event) => { const item = banques.find((row) => row.code_banque === event.target.value); if (item) show(item); }} disabled={mode === 'edit'}>
                  {banques.filter((item) => showArchived || !item.archive || item.code_banque === selected).map((item) => <option key={item.code_banque} value={item.code_banque}>{item.code_banque}{item.archive ? ' (archivé)' : ''}</option>)}
                </select>}
            </label>
            <label className="catalog-field cmp-span-3"><span>N° compte bancaire</span><input value={bank.num_compte_b || ''} onChange={(event) => change('num_compte_b', event.target.value)} readOnly={!editing} maxLength={20} /></label>
            <label className="catalog-field cmp-span-3"><span>Libellé</span><input value={bank.nom_banque || ''} onChange={(event) => change('nom_banque', event.target.value.toUpperCase())} readOnly={!editing} maxLength={50} required /></label>
            <label className="catalog-field cmp-span-3"><span>Débit en cours (DT)</span><input value={dt(bank.debit)} readOnly /></label>
            <label className="catalog-field cmp-span-3"><span>Crédit initial (DT)</span><input type="number" step="0.001" value={bank.credit_ini ?? ''} onChange={(event) => change('credit_ini', event.target.value)} readOnly={!editing} /></label>
            <label className="catalog-field cmp-span-3"><span>Crédit en cours (DT)</span><input value={dt(bank.credit)} readOnly /></label>
            <label className="catalog-field cmp-span-3"><span>Date D/C initial</span><input type="date" value={day(bank.date_ini)} onChange={(event) => change('date_ini', event.target.value)} readOnly={!editing} /></label>
            <label className="catalog-field cmp-span-3"><span>Date maj du compte</span><input value={frDate(bank.date_maj)} readOnly /></label>
          </div>
        </div>

        <div className="catalog-section">
          <div className="catalog-section-heading"><div><span>UTILISATION DU COMPTE</span></div></div>
          <div className="bnk-types">
            {TYPES.map(([value, label]) => <label key={value} className="bnk-type">
              <input type="radio" name="type_dep" checked={bank.type_dep === value} disabled={!editing} onChange={() => change('type_dep', value)} />{label}
              {value === 'T' && <select value={bank.type_dep === 'T' ? bank.code_compagnie ?? '' : ''} disabled={!editing || bank.type_dep !== 'T'} onChange={(event) => change('code_compagnie', event.target.value)} aria-label="Compagnie">
                <option value="">(Aucune)</option>
                {companies.map((item) => <option key={item.code_compagnie} value={item.code_compagnie}>{item.nom_compagnie}</option>)}
              </select>}
            </label>)}
          </div>
        </div>

        {error && <div className="expert-error catalog-message cmp-message" role="alert">{error}</div>}
        {notice && <div className="catalog-notice" role="status">{notice}</div>}
        <div className="cmp-spacer" />
      </form>}
    </section>
    {preview && <div className="cmp-list-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(false); }}>
      <section className="cmp-list bnk-list" role="dialog" aria-modal="true" aria-labelledby="bnk-list-title">
        <header><h3 id="bnk-list-title">Liste des banques</h3><label className="catalog-check"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Afficher les archivés</label><button className="expert-close" onClick={() => setPreview(false)} type="button" aria-label="Fermer">×</button></header>
        <div className="cmp-list-wrap">
          {listed.length === 0 ? <p className="catalog-empty">Aucune banque.</p> : <table>
            <thead><tr><th>Code</th><th>Libellé</th><th>N° compte</th><th>Type</th><th className="n">Crédit initial</th><th>Date initiale</th><th className="n">Débit en cours</th><th className="n">Crédit en cours</th></tr></thead>
            <tbody>{listed.map((item) => (
              <tr key={item.code_banque} className={`${item.code_banque === selected ? 'is-current' : ''}${item.archive ? ' is-archived' : ''}`} onClick={() => { show(item); setPreview(false); }} title="Ouvrir ce compte">
                <td><b>{item.code_banque}</b></td><td>{item.nom_banque}</td><td>{item.num_compte_b}</td><td>{typeLabel(item.type_dep)}{item.type_dep === 'T' && companyName(item.code_compagnie) ? ` · ${companyName(item.code_compagnie)}` : ''}</td>
                <td className="n">{dt(item.credit_ini)}</td><td>{frDate(item.date_ini)}</td><td className="n">{dt(item.debit)}</td><td className="n">{dt(item.credit)}</td>
              </tr>
            ))}</tbody>
          </table>}
        </div>
        <footer><span>{listed.length} compte(s) · cliquez une ligne pour l’ouvrir</span><span className="bnk-list-actions"><button type="button" className="expert-submit" onClick={print}>Imprimer</button><button type="button" className="expert-cancel" onClick={() => setPreview(false)}>Fermer</button></span></footer>
      </section>
    </div>}
    {importFile && <DocumentImportDialog file={importFile} kicker={`PARAMÉTRAGE · MODULE ${moduleId} · IMPORT`} title="Importer un RIB / relevé bancaire" read={(onProgress) => extractBanque(accessToken, importFile, onProgress)} summarize={summarizeImport} applyLabel="Appliquer à la fiche banque" onApply={applyImport} onClose={() => setImportFile(null)} />}
  </div>;
}
