import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  createSinistre, deleteSinistre, extractSinistre, findClaimPolicy, getSinistre, getSinistreLookups, listSinistres, nextSinistreNumber, updateSinistre,
} from '../../services/sinistreApi';
import './SinistreModal.css';

const today = () => new Date().toISOString().slice(0, 10);
const shortDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const money = (value) => (value == null || value === '' ? '' : Number(value).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }));

const DATES = ['Date_Saisie', 'Date_FTUSA', 'Date_Reglement', 'Date_CXP', 'Date_Cloture', 'Date_Prescription'];
const FLAGS = ['IDA', 'FTUSA', 'Regle', 'CXP', 'Cloture', 'Prescription'];
const blank = () => ({
  Num_Sinistre_Agence: '', Date_Saisie: today(), Date_Sinistre: '', Lieu_Sinistre: '', Agence: '', Num_Sinistre_Compagnie_Assure: '', reference: '',
  Num_Int: '', Num_Imat: '', Code_Client: '', nom_client: '', Code_Compagnie_Assure: '', Code_Type_Branche: '', code_branche: '', Risque: '',
  code_assure: '', nom_assure: '', Type_Sinistre: '', Garantie: '', Type_Degats: '', Degats: '', Code_Responsabilite: '0', PC: 'N', classer: 'N',
  Tiers1: '', Code_Compagnie_Advers1: '0', Num_Sinistre_Compagnie_Advers1: '', Num_Int1: '', Num_Imat1: '',
  Tiers2: '', Code_Compagnie_Advers2: '0', Num_Sinistre_Compagnie_Advers2: '', Num_Int2: '', Num_Imat2: '',
  Code_Expert1: '0', Code_Expert2: '0', Code_Expert3: '0', code_garage: '',
  Montant_Devis: '', MTVA_Devis: '', Montant_Facture: '', MTVA_Facture: '', Montant_Rapport: '', MTVA_Rapport: '', Montant_Reglement: '', mont_cie: '', solde: '',
  ...Object.fromEntries(FLAGS.map((flag) => [flag, false])), ...Object.fromEntries(DATES.slice(1).map((key) => [key, ''])),
  Observation: '',
});

// Stored record -> form values (dates for the inputs, empty strings instead of null).
function toForm(record) {
  const form = blank();
  Object.keys(form).forEach((key) => {
    const value = record[key];
    if (value == null) return;
    if (key === 'Date_Sinistre') form[key] = String(value).slice(0, 16);
    else if (DATES.includes(key)) form[key] = String(value).slice(0, 10);
    else if (FLAGS.includes(key)) form[key] = Boolean(value);
    else form[key] = String(value).trim();
  });
  return form;
}

export default function SinistreModal({ onClose, mode = 'manage', moduleId = '620' }) {
  const { accessToken } = useAuth();
  const fileInput = useRef(null);
  const [lookups, setLookups] = useState({ responsabilites: [], types_sinistre: [], branches: [], compagnies: [], experts: [], garages: [], garanties: [], types_degats: [] });
  const [form, setForm] = useState(blank);
  const [current, setCurrent] = useState(''); // number of the stored claim being edited ('' = new claim)
  const [proposed, setProposed] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [list, setList] = useState(mode === 'manage' ? { q: '', items: null, total: 0 } : null);

  useEffect(() => {
    let active = true;
    getSinistreLookups(accessToken).then((data) => { if (active) setLookups(data); }).catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [accessToken]);

  // The number a new claim will get: year and month of the claim date, then the next sequence.
  useEffect(() => {
    if (current) { setProposed(''); return undefined; }
    let active = true;
    const timer = setTimeout(() => {
      nextSinistreNumber(accessToken, form.Date_Sinistre ? form.Date_Sinistre.slice(0, 10) : today())
        .then((result) => { if (active) setProposed(result.numero); })
        .catch(() => { if (active) setProposed(''); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [accessToken, current, form.Date_Sinistre]);

  // Claims list (search as you type).
  const listQuery = list?.q;
  useEffect(() => {
    if (listQuery === undefined) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      listSinistres(accessToken, { q: listQuery, limit: 200 })
        .then((result) => { if (active) setList((value) => value && { ...value, items: result.items, total: result.total }); })
        .catch((requestError) => { if (active) setError(requestError.message); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [accessToken, listQuery]);

  function change(patch) {
    setForm((value) => ({ ...value, ...patch }));
    setDirty(true);
    setNotice('');
  }

  const confirmLeave = () => !dirty || window.confirm('Les modifications non enregistrées seront perdues. Continuer ?');

  function startNew() {
    if (!confirmLeave()) return;
    setForm(blank()); setCurrent(''); setDirty(false); setError(''); setNotice('');
  }

  async function open(numero) {
    if (!confirmLeave()) return;
    setBusy(true); setError('');
    try {
      const record = await getSinistre(accessToken, numero);
      setForm(toForm(record)); setCurrent(String(record.Num_Sinistre_Agence).trim()); setDirty(false); setList(null);
      setNotice(`Dossier ${String(record.Num_Sinistre_Agence).trim()} ouvert.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  // N° police or immatriculation typed: the insured's policy fills the client, company, branch and risk.
  async function fillFromPolicy() {
    if (!form.Num_Int.trim() && !form.Num_Imat.trim()) return;
    try {
      const policy = await findClaimPolicy(accessToken, { numero: form.Num_Int, immat: form.Num_Imat });
      change({
        Num_Int: policy.num_int || form.Num_Int, Num_Imat: form.Num_Imat || policy.num_imat || '', Code_Client: policy.code_client || '',
        nom_client: policy.nom_client || '', Code_Compagnie_Assure: policy.code_compagnie != null ? String(policy.code_compagnie) : form.Code_Compagnie_Assure,
        code_branche: policy.code_branche || '', Code_Type_Branche: policy.code_type_branche != null ? String(policy.code_type_branche) : form.Code_Type_Branche,
        Risque: (policy.risque || form.Risque).slice(0, 50),
      });
      setNotice(`Police ${policy.num_int} : client ${policy.code_client} ${policy.nom_client || ''}${policy.etat && policy.etat !== 'AN' ? ` (police ${policy.etat})` : ''}.`);
    } catch (requestError) {
      setNotice(requestError.message);
    }
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setScanning(true); setError(''); setNotice('');
    try {
      const result = await extractSinistre(accessToken, file);
      const values = result.sinistre || {};
      const patch = Object.fromEntries(Object.entries(values).filter(([key]) => key in form && key !== 'Num_Sinistre_Agence').map(([key, value]) => [
        key, key === 'Date_Sinistre' ? String(value).slice(0, 16) : String(value),
      ]));
      if (!Object.keys(patch).length) { setError('Aucune information lisible dans ce document : saisissez le dossier à la main.'); return; }
      change(patch);
      const kindLabel = result.fields?.type_document === 'constat' ? 'Constat' : result.fields?.type_document === 'declaration' ? 'Déclaration' : 'Document';
      const insured = result.police ? ` Véhicule ${result.vehicule_assure} = votre assuré (police ${result.police.num_int}, client ${result.police.code_client}).` : ' Aucune police de l’agence reconnue : complétez N° police / client.';
      setNotice(`${kindLabel} lu (${result.source === 'ai' ? 'IA' : 'OCR'}) : ${Object.keys(patch).length} champ(s) rempli(s).${insured} Vérifiez puis enregistrez.`);
    } catch (requestError) {
      setError(`Lecture du document impossible : ${requestError.message}`);
    } finally {
      setScanning(false);
    }
  }

  async function save() {
    if (!form.Date_Sinistre) { setError('La date du sinistre est obligatoire.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = { ...form };
      if (!current) delete payload.Num_Sinistre_Agence; // numbered by the server
      const numero = current
        ? (await updateSinistre(accessToken, current, payload)).numero
        : (await createSinistre(accessToken, payload)).numero;
      const record = await getSinistre(accessToken, numero);
      setForm(toForm(record)); setCurrent(numero); setDirty(false);
      setNotice(current ? `Dossier ${numero} modifié.` : `Dossier ${numero} créé.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!current || !window.confirm(`Supprimer définitivement le dossier ${current} ?`)) return;
    setBusy(true); setError('');
    try {
      await deleteSinistre(accessToken, current);
      setForm(blank()); setCurrent(''); setDirty(false);
      setNotice(`Dossier ${current} supprimé.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (confirmLeave()) onClose();
  }

  // Field helpers -----------------------------------------------------------------------------
  const input = (label, name, { type = 'text', wide = false, maxLength, readOnly = false, onBlur, placeholder } = {}) => (
    <label className={wide ? 'snr-wide' : undefined}>
      {label}
      <input
        type={type} value={form[name]} maxLength={maxLength} readOnly={readOnly} onBlur={onBlur} placeholder={placeholder}
        step={type === 'number' ? 'any' : undefined} min={type === 'number' ? '0' : undefined}
        onChange={(event) => change({ [name]: event.target.value })}
      />
    </label>
  );
  const choose = (label, name, options, { none = '', noneLabel = 'Sélectionner', wide = false } = {}) => {
    const known = options.some((option) => String(option.id) === String(form[name])) || String(form[name]) === String(none);
    return (
      <label className={wide ? 'snr-wide' : undefined}>
        {label}
        <select value={form[name]} onChange={(event) => change({ [name]: event.target.value })}>
          <option value={none}>{noneLabel}</option>
          {!known && form[name] !== '' && <option value={form[name]}>{form[name]}</option>}
          {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
    );
  };
  const asOptions = (values) => values.map((value) => ({ id: value, label: value }));
  // A status flag and the date it was set.
  const flag = (label, name, dateName) => (
    <div className="snr-flag">
      <label className="snr-check">
        <input type="checkbox" checked={form[name]} onChange={(event) => change({ [name]: event.target.checked, ...(dateName && event.target.checked && !form[dateName] ? { [dateName]: today() } : {}) })} />
        {label}
      </label>
      {dateName && form[name] && <input type="date" value={form[dateName]} onChange={(event) => change({ [dateName]: event.target.value })} aria-label={`Date ${label}`} />}
    </div>
  );
  const adverse = (index) => (
    <fieldset className="snr-group">
      <legend>Partie adverse {index}</legend>
      {input('Tiers', `Tiers${index}`, { wide: true, maxLength: 50 })}
      {choose('Compagnie', `Code_Compagnie_Advers${index}`, lookups.compagnies, { none: '0', noneLabel: '(Aucune)' })}
      {input('N° sinistre compagnie', `Num_Sinistre_Compagnie_Advers${index}`, { maxLength: 20 })}
      {input('N° police', `Num_Int${index}`, { maxLength: 15 })}
      {input('Immatriculation', `Num_Imat${index}`, { maxLength: 12 })}
    </fieldset>
  );

  return (
    <div className="snr-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy && !scanning) close(); }}>
      <section className="snr-dialog" role="dialog" aria-modal="true" aria-labelledby="snr-title">
        <header className="snr-header">
          <div><span>SINISTRES · MODULE {moduleId}</span><h2 id="snr-title">{mode === 'new' ? 'Déclarer un sinistre' : 'Gestion des sinistres'}</h2></div>
          <div className="snr-header-actions">
            <input ref={fileInput} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf" hidden onChange={importFile} />
            <button type="button" className="snr-import" onClick={() => fileInput.current?.click()} disabled={scanning || busy} title="Scanner un constat amiable ou une déclaration (image ou PDF) pour remplir le dossier">
              {scanning ? 'Lecture…' : 'Importer'}
            </button>
            <button type="button" className="snr-close" onClick={close} aria-label="Fermer">×</button>
          </div>
        </header>

        <div className="snr-toolbar">
          <button type="button" className="snr-tool" onClick={startNew} disabled={busy}>Nouveau</button>
          <button type="button" className="snr-tool snr-primary" onClick={save} disabled={busy || scanning || (!dirty && Boolean(current))}>{busy ? 'Patientez…' : current ? 'Enregistrer' : 'Créer le dossier'}</button>
          <button type="button" className="snr-tool" onClick={remove} disabled={busy || !current}>Supprimer</button>
          <button type="button" className="snr-tool" onClick={() => setList({ q: '', items: null, total: 0 })} disabled={busy}>Lister</button>
          <span className="snr-spacer" />
          <span className={`snr-status${current ? '' : ' is-new'}`}>{current ? `Dossier n° ${current}${dirty ? ' · modifié' : ''}` : `Nouveau dossier${proposed ? ` · n° proposé ${proposed}` : ''}`}</span>
        </div>

        <div className="snr-body">
          {error && <p className="snr-error" role="alert">{error}</p>}
          {notice && !error && <p className="snr-notice" role="status">{notice}</p>}

          <div className="snr-columns">
            <fieldset className="snr-group">
              <legend>Dossier</legend>
              <label>N° sinistre agence<input value={current || proposed} readOnly placeholder="Automatique" /></label>
              {input('Date saisie', 'Date_Saisie', { type: 'date' })}
              {input('Date et heure du sinistre *', 'Date_Sinistre', { type: 'datetime-local' })}
              {input('Lieu du sinistre', 'Lieu_Sinistre', { wide: true, maxLength: 50 })}
              {input('Agence', 'Agence', { maxLength: 50 })}
              {input('N° sinistre compagnie', 'Num_Sinistre_Compagnie_Assure', { maxLength: 20 })}
              {input('Référence', 'reference', { maxLength: 50 })}
            </fieldset>

            <fieldset className="snr-group">
              <legend>Assuré et police</legend>
              {input('N° police', 'Num_Int', { maxLength: 15, onBlur: fillFromPolicy, placeholder: 'num_int' })}
              {input('Immatriculation', 'Num_Imat', { maxLength: 12, onBlur: () => { if (!form.Code_Client) fillFromPolicy(); }, placeholder: '209 TU 2222' })}
              {input('Code client', 'Code_Client', { maxLength: 8 })}
              {input('Nom client', 'nom_client', { wide: true, maxLength: 255 })}
              {choose('Compagnie', 'Code_Compagnie_Assure', lookups.compagnies)}
              {choose('Branche', 'Code_Type_Branche', lookups.branches)}
              {input('Code branche', 'code_branche', { maxLength: 3 })}
              {input('Risque', 'Risque', { wide: true, maxLength: 50 })}
              {input('Code assuré', 'code_assure', { maxLength: 50 })}
              {input('Nom assuré (si différent)', 'nom_assure', { wide: true, maxLength: 200 })}
            </fieldset>
          </div>

          <fieldset className="snr-group">
            <legend>Nature du sinistre</legend>
            {choose('Type sinistre', 'Type_Sinistre', lookups.types_sinistre)}
            {choose('Garantie', 'Garantie', asOptions(lookups.garanties))}
            {choose('Type dégâts', 'Type_Degats', asOptions(lookups.types_degats))}
            {input('Dégâts', 'Degats', { wide: true, maxLength: 50 })}
            {choose('Responsabilité', 'Code_Responsabilite', lookups.responsabilites, { none: '0', noneLabel: 'Non définie' })}
            <div className="snr-flags-inline">
              {flag('IDA', 'IDA')}
              <label className="snr-check"><input type="checkbox" checked={form.PC === 'O'} onChange={(event) => change({ PC: event.target.checked ? 'O' : 'N' })} />PC</label>
            </div>
          </fieldset>

          <div className="snr-columns">
            {adverse(1)}
            {adverse(2)}
          </div>

          <div className="snr-columns">
            <fieldset className="snr-group">
              <legend>Expertise et montants</legend>
              {choose('Expert 1', 'Code_Expert1', lookups.experts, { none: '0', noneLabel: '(Aucun)' })}
              {choose('Expert 2', 'Code_Expert2', lookups.experts, { none: '0', noneLabel: '(Aucun)' })}
              {choose('Expert 3', 'Code_Expert3', lookups.experts, { none: '0', noneLabel: '(Aucun)' })}
              {choose('Garage', 'code_garage', lookups.garages)}
              <div className="snr-amounts">
                <span /><b>Montant</b><b>TVA</b>
                {[['Devis', 'Montant_Devis', 'MTVA_Devis'], ['Facture', 'Montant_Facture', 'MTVA_Facture'], ['Rapport', 'Montant_Rapport', 'MTVA_Rapport']].map(([label, amount, tva]) => (
                  <div className="snr-amount-row" key={label}>
                    <span>{label}</span>
                    <input type="number" step="any" min="0" value={form[amount]} onChange={(event) => change({ [amount]: event.target.value })} aria-label={`Montant ${label}`} />
                    <input type="number" step="any" min="0" value={form[tva]} onChange={(event) => change({ [tva]: event.target.value })} aria-label={`TVA ${label}`} />
                  </div>
                ))}
              </div>
              {input('Montant règlement', 'Montant_Reglement', { type: 'number' })}
              {input('Montant compagnie', 'mont_cie', { type: 'number' })}
              {input('Solde', 'solde', { type: 'number' })}
            </fieldset>

            <fieldset className="snr-group snr-follow">
              <legend>Suivi du dossier</legend>
              {flag('FTUSA', 'FTUSA', 'Date_FTUSA')}
              {flag('Réglé', 'Regle', 'Date_Reglement')}
              {flag('CXP', 'CXP', 'Date_CXP')}
              {flag('Clôturé', 'Cloture', 'Date_Cloture')}
              {flag('Prescription', 'Prescription', 'Date_Prescription')}
              <label className="snr-check"><input type="checkbox" checked={form.classer === 'O' || form.classer === '1'} onChange={(event) => change({ classer: event.target.checked ? 'O' : 'N' })} />Classé</label>
              <label className="snr-wide">Observation
                <textarea value={form.Observation} maxLength={200} rows={4} onChange={(event) => change({ Observation: event.target.value })} />
              </label>
            </fieldset>
          </div>
        </div>
      </section>

      {list && (
        <div className="snr-nested" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setList(null); }}>
          <section className="snr-list" role="dialog" aria-modal="true" aria-label="Dossiers sinistres">
            <header>
              <h3>Dossiers sinistres</h3>
              <input autoFocus value={list.q} onChange={(event) => setList((value) => ({ ...value, q: event.target.value }))} placeholder="N° sinistre, client, police, immatriculation, tiers…" />
              <button type="button" onClick={() => setList(null)} aria-label="Fermer">×</button>
            </header>
            <div className="snr-table-wrap">
              <table className="snr-table">
                <thead><tr><th>N° sinistre</th><th>Date sinistre</th><th>Client</th><th>N° police</th><th>Immat.</th><th>Type</th><th>Garantie</th><th>Tiers</th><th>Réglé</th><th>Clôturé</th></tr></thead>
                <tbody>
                  {list.items === null ? <tr><td colSpan={10} className="snr-empty">Chargement…</td></tr>
                    : list.items.length === 0 ? <tr><td colSpan={10} className="snr-empty">Aucun dossier trouvé.</td></tr>
                    : list.items.map((row) => (
                      <tr key={row.Num_Sinistre_Agence} className="is-clickable" onClick={() => open(row.Num_Sinistre_Agence)}>
                        <td>{row.Num_Sinistre_Agence}</td><td>{shortDate(row.Date_Sinistre)}</td><td>{[row.Code_Client, row.nom_client].filter(Boolean).join(' ')}</td>
                        <td>{row.Num_Int}</td><td>{row.Num_Imat}</td><td>{row.Type_Sinistre}</td><td>{row.Garantie}</td><td>{row.Tiers1}</td>
                        <td>{row.Regle ? `Oui${row.Montant_Reglement ? ` (${money(row.Montant_Reglement)})` : ''}` : 'Non'}</td><td>{row.Cloture ? 'Oui' : 'Non'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <footer><span>{list.items ? `${list.items.length} dossier(s) affiché(s) sur ${list.total}` : ''} — cliquez une ligne pour l’ouvrir</span><button type="button" className="snr-tool" onClick={() => setList(null)}>Fermer</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}
