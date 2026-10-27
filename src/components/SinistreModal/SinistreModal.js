import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getClientByCode } from '../../services/clientApi';
import {
  createSinistre, deleteSinistre, extractSinistre, findClaimPolicy, getSinistre, getSinistreLookups, listSinistres, nextSinistreNumber, updateSinistre,
} from '../../services/sinistreApi';
import './SinistreModal.css';

const today = () => new Date().toISOString().slice(0, 10);
const shortDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const money = (value) => (value == null || value === '' ? '' : Number(value).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }));

const DATES = ['Date_Saisie', 'Date_Reglement', 'Date_Cloture'];
const FLAGS = ['IDA', 'Regle', 'Cloture'];
// Only the main fields are on screen. The other columns of a stored claim are kept as loaded and saved back unchanged.
const blank = () => ({
  Num_Sinistre_Agence: '', Date_Saisie: today(), Date_Sinistre: '', Lieu_Sinistre: '', Num_Sinistre_Compagnie_Assure: '',
  Num_Int: '', Num_Imat: '', Code_Client: '', nom_client: '', Code_Compagnie_Assure: '', Code_Type_Branche: '', code_branche: '', Risque: '',
  Tiers1: '', Code_Compagnie_Advers1: '0', Num_Imat1: '', Num_Int1: '', Num_Sinistre_Compagnie_Advers1: '',
  Type_Sinistre: '', Garantie: '', Type_Degats: '', Degats: '', Code_Responsabilite: '0', IDA: false,
  Code_Expert1: '0', Montant_Devis: '', Montant_Reglement: '', Regle: false, Date_Reglement: '', Cloture: false, Date_Cloture: '',
  Observation: '',
});

function toForm(record) {
  const form = { ...blank() };
  Object.entries(record).forEach(([key, value]) => {
    if (value == null) return;
    if (key === 'Date_Sinistre') form[key] = String(value).slice(0, 16);
    else if (DATES.includes(key)) form[key] = String(value).slice(0, 10);
    else if (FLAGS.includes(key)) form[key] = Boolean(value);
    else if (key in form) form[key] = String(value).trim();
  });
  return form;
}

const STATUS_FILTERS = [['en_cours', 'En cours'], ['regle', 'Réglés'], ['cloture', 'Clôturés'], ['', 'Tous']];
const statusOf = (row) => (row.Cloture ? ['Clôturé', 'is-closed'] : row.Regle ? ['Réglé', 'is-paid'] : ['En cours', 'is-open']);

export default function SinistreModal({ onClose, mode = 'manage', moduleId = '620' }) {
  const { accessToken } = useAuth();
  const fileInput = useRef(null);
  const [lookups, setLookups] = useState({ responsabilites: [], types_sinistre: [], branches: [], compagnies: [], experts: [], garanties: [], types_degats: [] });
  const [form, setForm] = useState(blank);
  const [current, setCurrent] = useState(''); // number of the stored claim being edited ('' = new claim)
  const [proposed, setProposed] = useState('');
  const [dirty, setDirty] = useState(false);
  const [tried, setTried] = useState(false); // a save was attempted: required fields are highlighted
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState(null); // { kind: 'error' | 'info', text }
  const [list, setList] = useState(mode === 'manage' ? { q: '', statut: 'en_cours', items: null, total: 0 } : null);

  const info = (text) => setMessage(text ? { kind: 'info', text } : null);
  const fail = (text) => setMessage({ kind: 'error', text });

  useEffect(() => {
    let active = true;
    getSinistreLookups(accessToken).then((data) => { if (active) setLookups(data); }).catch((requestError) => { if (active) fail(requestError.message); });
    return () => { active = false; };
  }, [accessToken]);

  // Number a new claim will get: year and month of the claim date, then the next sequence of that month.
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

  // Claims list: search as you type, filtered by status.
  const listKey = list ? `${list.statut}|${list.q}` : null;
  useEffect(() => {
    if (listKey === null) return undefined;
    const [statut, q] = [listKey.split('|')[0], listKey.slice(listKey.indexOf('|') + 1)];
    let active = true;
    const timer = setTimeout(() => {
      listSinistres(accessToken, { q, statut, limit: 300 })
        .then((result) => { if (active) setList((value) => value && { ...value, items: result.items, total: result.total }); })
        .catch((requestError) => { if (active) fail(requestError.message); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [accessToken, listKey]);

  function change(patch) {
    setForm((value) => ({ ...value, ...patch }));
    setDirty(true);
    if (message?.kind === 'info') setMessage(null);
  }

  const confirmLeave = () => !dirty || window.confirm('Les modifications non enregistrées seront perdues. Continuer ?');

  function startNew() {
    if (!confirmLeave()) return;
    setForm(blank()); setCurrent(''); setDirty(false); setTried(false); setMessage(null);
  }

  async function open(numero) {
    if (!confirmLeave()) return;
    setBusy(true); setMessage(null);
    try {
      const record = await getSinistre(accessToken, numero);
      setForm(toForm(record)); setCurrent(String(record.Num_Sinistre_Agence).trim()); setDirty(false); setTried(false); setList(null);
    } catch (requestError) {
      fail(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  // N° police or immatriculation: the insured's policy fills the client, company and branch.
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
      info(`Police ${policy.num_int} : ${policy.code_client} ${policy.nom_client || ''}${policy.etat && policy.etat !== 'AN' ? ` — police ${policy.etat}` : ''}`);
    } catch (requestError) {
      info(requestError.message);
    }
  }

  // Client code typed by hand: its name.
  async function fillClientName() {
    const code = form.Code_Client.trim();
    if (!code || form.nom_client) return;
    try {
      const client = await getClientByCode(accessToken, code);
      change({ nom_client: client.nom_client || [client.lastName, client.firstName].filter(Boolean).join(' ') });
    } catch {
      info(`Client ${code} introuvable.`);
    }
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setScanning(true); setMessage(null);
    try {
      const result = await extractSinistre(accessToken, file);
      const patch = Object.fromEntries(Object.entries(result.sinistre || {}).filter(([key]) => key !== 'Num_Sinistre_Agence').map(([key, value]) => [
        key, key === 'Date_Sinistre' ? String(value).slice(0, 16) : String(value),
      ]));
      if (!Object.keys(patch).length) { fail('Aucune information lisible dans ce document : saisissez le dossier à la main.'); return; }
      change(patch);
      const kindLabel = result.fields?.type_document === 'constat' ? 'Constat' : result.fields?.type_document === 'declaration' ? 'Déclaration' : 'Document';
      info(`${kindLabel} lu (${result.source === 'ai' ? 'IA' : 'OCR'}) · ${result.police ? `véhicule ${result.vehicule_assure} = votre assuré (police ${result.police.num_int})` : 'aucune police de l’agence reconnue'} · vérifiez puis enregistrez.`);
    } catch (requestError) {
      fail(`Lecture du document impossible : ${requestError.message}`);
    } finally {
      setScanning(false);
    }
  }

  const problem = () => {
    if (!form.Date_Sinistre) return 'La date du sinistre est obligatoire.';
    if (form.Date_Sinistre.slice(0, 10) > today()) return 'La date du sinistre ne peut pas être dans le futur.';
    if (!form.Code_Client.trim() && !form.Num_Int.trim()) return 'Indiquez la police ou le client assuré.';
    if (form.Regle && !form.Montant_Reglement) return 'Renseignez le montant du règlement.';
    return '';
  };

  const save = useCallback(async () => {
    setTried(true);
    const issue = problem();
    if (issue) { fail(issue); return; }
    setBusy(true); setMessage(null);
    try {
      const payload = { ...form };
      if (!current) delete payload.Num_Sinistre_Agence; // numbered by the server
      const numero = current
        ? (await updateSinistre(accessToken, current, payload)).numero
        : (await createSinistre(accessToken, payload)).numero;
      const record = await getSinistre(accessToken, numero);
      setForm(toForm(record)); setCurrent(numero); setDirty(false); setTried(false);
      info(current ? `Dossier ${numero} enregistré.` : `Dossier ${numero} créé.`);
    } catch (requestError) {
      fail(requestError.message);
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, current, form]);

  async function remove() {
    if (!current || !window.confirm(`Supprimer définitivement le dossier ${current} ?`)) return;
    setBusy(true); setMessage(null);
    try {
      await deleteSinistre(accessToken, current);
      setForm(blank()); setCurrent(''); setDirty(false);
      info(`Dossier ${current} supprimé.`);
    } catch (requestError) {
      fail(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (confirmLeave()) onClose();
  }

  // Ctrl+S saves, Échap closes the list.
  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (!busy && !scanning) save(); }
      if (event.key === 'Escape' && list) setList(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, scanning, save, list]);

  // Field helpers -----------------------------------------------------------------------------
  const missing = (name) => tried && ((name === 'Date_Sinistre' && !form.Date_Sinistre) || (['Num_Int', 'Code_Client'].includes(name) && !form.Code_Client.trim() && !form.Num_Int.trim()));
  const input = (label, name, { type = 'text', span = 3, maxLength, onBlur, placeholder, required = false } = {}) => (
    <label className={`snr-span-${span}${missing(name) ? ' is-missing' : ''}`}>
      <span>{label}{required && <i> *</i>}</span>
      <input
        type={type} value={form[name]} maxLength={maxLength} onBlur={onBlur} placeholder={placeholder}
        step={type === 'number' ? 'any' : undefined} min={type === 'number' ? '0' : undefined} max={type === 'datetime-local' ? `${today()}T23:59` : undefined}
        onChange={(event) => change({ [name]: event.target.value })}
      />
    </label>
  );
  const choose = (label, name, options, { none = '', noneLabel = '—', span = 3 } = {}) => {
    const known = options.some((option) => String(option.id) === String(form[name])) || String(form[name]) === String(none);
    return (
      <label className={`snr-span-${span}`}>
        <span>{label}</span>
        <select value={form[name]} onChange={(event) => change({ [name]: event.target.value })}>
          <option value={none}>{noneLabel}</option>
          {!known && form[name] !== '' && <option value={form[name]}>{form[name]}</option>}
          {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
    );
  };
  const asOptions = (values) => values.map((value) => ({ id: value, label: value }));
  const flag = (label, name, dateName) => (
    <div className="snr-span-3 snr-flag">
      <label className="snr-check">
        <input type="checkbox" checked={form[name]} onChange={(event) => change({ [name]: event.target.checked, ...(event.target.checked && !form[dateName] ? { [dateName]: today() } : {}) })} />
        {label}
      </label>
      <input type="date" value={form[dateName]} disabled={!form[name]} onChange={(event) => change({ [dateName]: event.target.value })} aria-label={`Date ${label}`} />
    </div>
  );

  const [statusLabel, statusClass] = statusOf(form);
  const reste = form.Montant_Devis !== '' ? Number(form.Montant_Devis || 0) - Number(form.Montant_Reglement || 0) : null;

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
          <button type="button" className="snr-tool snr-primary" onClick={save} disabled={busy || scanning || (!dirty && Boolean(current))} title="Ctrl+S">{busy ? 'Patientez…' : current ? 'Enregistrer' : 'Créer le dossier'}</button>
          <button type="button" className="snr-tool" onClick={remove} disabled={busy || !current}>Supprimer</button>
          <button type="button" className="snr-tool" onClick={() => setList({ q: '', statut: 'en_cours', items: null, total: 0 })} disabled={busy}>Lister</button>
          {message && <p className={`snr-message is-${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'} title={message.text}>{message.text}</p>}
          <span className="snr-spacer" />
          <span className="snr-number">{current ? `N° ${current}` : proposed ? `Nouveau · n° ${proposed}` : 'Nouveau dossier'}{dirty && <em> · modifié</em>}</span>
          <span className={`snr-badge ${statusClass}`}>{statusLabel}</span>
        </div>

        <div className="snr-body">
          <fieldset className="snr-group">
            <legend>Dossier</legend>
            {input('Date et heure du sinistre', 'Date_Sinistre', { type: 'datetime-local', span: 4, required: true })}
            {input('Date saisie', 'Date_Saisie', { type: 'date', span: 2 })}
            {input('Lieu du sinistre', 'Lieu_Sinistre', { span: 6, maxLength: 50 })}
            {input('N° sinistre compagnie', 'Num_Sinistre_Compagnie_Assure', { span: 3, maxLength: 20 })}
            {choose('Branche', 'Code_Type_Branche', lookups.branches)}
          </fieldset>

          <fieldset className="snr-group">
            <legend>Assuré et police</legend>
            {input('N° police', 'Num_Int', { maxLength: 15, onBlur: fillFromPolicy, placeholder: 'Recherche auto', required: true })}
            {input('Immatriculation', 'Num_Imat', { maxLength: 12, onBlur: () => { if (!form.Code_Client) fillFromPolicy(); }, placeholder: '209 TU 2222' })}
            {input('Code client', 'Code_Client', { span: 2, maxLength: 8, onBlur: fillClientName })}
            {input('Nom client', 'nom_client', { span: 4, maxLength: 255 })}
            {choose('Compagnie', 'Code_Compagnie_Assure', lookups.compagnies, { span: 6 })}
          </fieldset>

          <fieldset className="snr-group">
            <legend>Partie adverse</legend>
            {input('Tiers', 'Tiers1', { span: 6, maxLength: 50 })}
            {choose('Compagnie adverse', 'Code_Compagnie_Advers1', lookups.compagnies, { none: '0', noneLabel: '(Aucune)' })}
            {input('Immatriculation', 'Num_Imat1', { maxLength: 12 })}
            {input('N° police', 'Num_Int1', { maxLength: 15 })}
            {input('N° sinistre adverse', 'Num_Sinistre_Compagnie_Advers1', { maxLength: 20 })}
          </fieldset>

          <fieldset className="snr-group">
            <legend>Nature du sinistre</legend>
            {choose('Type sinistre', 'Type_Sinistre', lookups.types_sinistre)}
            {choose('Garantie', 'Garantie', asOptions(lookups.garanties))}
            {choose('Type dégâts', 'Type_Degats', asOptions(lookups.types_degats))}
            {choose('Responsabilité', 'Code_Responsabilite', lookups.responsabilites, { none: '0', noneLabel: 'Non définie' })}
            {input('Dégâts', 'Degats', { span: 4, maxLength: 50 })}
            <div className="snr-span-2 snr-flag"><label className="snr-check"><input type="checkbox" checked={form.IDA} onChange={(event) => change({ IDA: event.target.checked })} />Convention IDA</label></div>
          </fieldset>

          <fieldset className="snr-group">
            <legend>Expertise et règlement</legend>
            {choose('Expert', 'Code_Expert1', lookups.experts, { none: '0', noneLabel: '(Aucun)', span: 6 })}
            {input('Montant devis', 'Montant_Devis', { type: 'number', span: 2 })}
            {input('Montant réglé', 'Montant_Reglement', { type: 'number', span: 2 })}
            <label className="snr-span-2"><span>Reste</span><input value={reste == null ? '' : money(reste)} readOnly className={reste != null && reste < 0 ? 'is-negative' : undefined} /></label>
            {flag('Réglé', 'Regle', 'Date_Reglement')}
            {flag('Clôturé', 'Cloture', 'Date_Cloture')}
          </fieldset>

          <fieldset className="snr-group snr-observation">
            <legend>Observation</legend>
            <textarea value={form.Observation} maxLength={200} onChange={(event) => change({ Observation: event.target.value })} placeholder="Circonstances, suivi, pièces attendues…" aria-label="Observation" />
            <small>{form.Observation.length}/200</small>
          </fieldset>
        </div>
      </section>

      {list && (
        <div className="snr-nested" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setList(null); }}>
          <section className="snr-list" role="dialog" aria-modal="true" aria-label="Dossiers sinistres">
            <header>
              <h3>Dossiers sinistres</h3>
              <div className="snr-filters" role="radiogroup" aria-label="Statut">
                {STATUS_FILTERS.map(([value, label]) => (
                  <button key={value || 'all'} type="button" className={list.statut === value ? 'is-active' : undefined} onClick={() => setList((current) => ({ ...current, statut: value, items: null }))}>{label}</button>
                ))}
              </div>
              <input autoFocus value={list.q} onChange={(event) => setList((value) => ({ ...value, q: event.target.value }))} placeholder="N° sinistre, client, police, immatriculation, tiers…" />
              <button type="button" className="snr-close" onClick={() => setList(null)} aria-label="Fermer">×</button>
            </header>
            <div className="snr-table-wrap">
              <table className="snr-table">
                <thead><tr><th>N° sinistre</th><th>Date</th><th>Client</th><th>N° police</th><th>Immat.</th><th>Type</th><th>Tiers</th><th className="is-number">Devis</th><th className="is-number">Réglé</th><th>Statut</th></tr></thead>
                <tbody>
                  {list.items === null ? <tr><td colSpan={10} className="snr-empty">Chargement…</td></tr>
                    : list.items.length === 0 ? <tr><td colSpan={10} className="snr-empty">Aucun dossier trouvé.</td></tr>
                    : list.items.map((row) => {
                      const [label, className] = statusOf(row);
                      return (
                        <tr key={row.Num_Sinistre_Agence} className="is-clickable" onClick={() => open(row.Num_Sinistre_Agence)}>
                          <td>{row.Num_Sinistre_Agence}</td><td>{shortDate(row.Date_Sinistre)}</td><td>{[row.Code_Client, row.nom_client].filter(Boolean).join(' ')}</td>
                          <td>{row.Num_Int}</td><td>{row.Num_Imat}</td><td>{row.Type_Sinistre}</td><td>{row.Tiers1}</td>
                          <td className="is-number">{row.Montant_Devis ? money(row.Montant_Devis) : ''}</td><td className="is-number">{row.Montant_Reglement ? money(row.Montant_Reglement) : ''}</td>
                          <td><span className={`snr-badge ${className}`}>{label}</span></td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <footer><span>{list.items ? `${list.items.length} dossier(s) affiché(s) sur ${list.total}` : ''} · cliquez une ligne pour l’ouvrir · Échap pour fermer</span><button type="button" className="snr-tool" onClick={() => setList(null)}>Fermer</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}
