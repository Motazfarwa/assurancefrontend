import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getClientByCode } from '../../services/clientApi';
import {
  createSinistre, deleteSinistre, extractSinistre, findClaimPolicy, getSinistre, getSinistreLookups, listClientPolicies, listSinistres, nextSinistreNumber, updateSinistre,
} from '../../services/sinistreApi';
import './SinistreModal.css';

const today = () => new Date().toISOString().slice(0, 10);
const shortDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const money = (value) => (value == null || value === '' ? '' : Number(value).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
// A client's policies as listed by the server, trimmed, state in capitals.
const asPolicies = (rows) => (Array.isArray(rows) ? rows : []).map((row) => ({ ...row, num_int: String(row.num_int || '').trim(), num_police: String(row.num_police || '').trim(), etat: String(row.etat || '').trim().toUpperCase() }));

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
    if (key === 'Date_Sinistre') form[key] = String(value).length <= 10 ? `${String(value).slice(0, 10)}T00:00` : String(value).slice(0, 16);
    else if (DATES.includes(key)) form[key] = String(value).slice(0, 10);
    else if (FLAGS.includes(key)) form[key] = Boolean(value);
    else if (key in form) form[key] = String(value).trim();
  });
  return form;
}

// Claims list filters: not closed ("Cloture" false), claims up to a date.
const STATUS_FILTERS = [['nonCloture', 'non_cloture', 'Non clôturés']];
const newList = () => ({ q: '', nonCloture: true, dateMax: '', typeSinistre: '', items: null, total: 0, counts: null });
// Claims list shown as one table per opposing company: the claims without one first, then the companies by name.
function byAdverseCompany(items, compagnies) {
  const names = new Map(compagnies.map((option) => [String(option.id), option.label]));
  const groups = new Map();
  items.forEach((row) => {
    const code = row.Code_Compagnie_Advers1 && String(row.Code_Compagnie_Advers1) !== '0' ? String(row.Code_Compagnie_Advers1) : '';
    if (!groups.has(code)) groups.set(code, { code, label: code ? names.get(code) || `Compagnie ${code}` : 'Sans compagnie adverse', rows: [] });
    groups.get(code).rows.push(row);
  });
  return [...groups.values()].sort((a, b) => (!a.code ? -1 : !b.code ? 1 : a.label.localeCompare(b.label, 'fr')));
}
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
  const [list, setList] = useState(mode === 'manage' ? newList : null);
  const [clientPolicies, setClientPolicies] = useState([]); // the typed client's policies, proposed in "N° police"
  const formRef = useRef(form); // the latest values, for the lookups that run once typing pauses
  formRef.current = form;
  const typingTimers = useRef({});
  useEffect(() => () => Object.values(typingTimers.current).forEach(clearTimeout), []);

  const info =(text) => setMessage(text ? { kind: 'info', text } : null);
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

  // Claims list: search as you type, filtered by status, type and date.
  const listKey = list ? JSON.stringify([list.q, list.nonCloture, list.dateMax, list.typeSinistre]) : null;
  useEffect(() => {
    if (listKey === null) return undefined;
    const [q, nonCloture, dateMax, typeSinistre] = JSON.parse(listKey);
    let active = true;
    const timer = setTimeout(() => {
      listSinistres(accessToken, { q, non_cloture: nonCloture || '', date_max: dateMax, type_sinistre: typeSinistre, limit: 300 })
        .then((result) => { if (active) setList((value) => value && { ...value, items: result.items, total: result.total, counts: result.counts || null }); })
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
    setForm(blank()); setCurrent(''); setDirty(false); setTried(false); setMessage(null); setClientPolicies([]);
  }

  // A stored claim may lack the client name, company or branch: they are taken from its client and policy.
  async function completed(loaded) {
    const next = { ...loaded };
    if (next.Num_Int && (!next.Code_Client || !next.nom_client || !next.Code_Compagnie_Assure || !next.Code_Type_Branche)) {
      try {
        const policy = await findClaimPolicy(accessToken, { numero: next.Num_Int });
        next.Code_Client = next.Code_Client || policy.code_client || '';
        next.nom_client = next.nom_client || policy.nom_client || '';
        next.Num_Imat = next.Num_Imat || policy.num_imat || '';
        if (!next.Code_Compagnie_Assure && policy.code_compagnie != null) next.Code_Compagnie_Assure = String(policy.code_compagnie);
        if (!next.Code_Type_Branche && policy.code_type_branche != null) next.Code_Type_Branche = String(policy.code_type_branche);
        next.code_branche = next.code_branche || policy.code_branche || '';
        next.Risque = next.Risque || (policy.risque || '').slice(0, 50);
      } catch { /* policy no longer in the portfolio: the claim is shown as stored */ }
    }
    if (next.Code_Client && !next.nom_client) {
      try {
        const client = await getClientByCode(accessToken, next.Code_Client);
        next.nom_client = client.nom_client || [client.lastName, client.firstName].filter(Boolean).join(' ');
      } catch { /* unknown client: name left empty */ }
    }
    return next;
  }

  async function open(numero, { ask = true } = {}) {
    if (ask && !confirmLeave()) return false;
    setBusy(true); setMessage(null);
    try {
      const record = await getSinistre(accessToken, numero);
      const loaded = await completed(toForm(record));
      setForm(loaded); setCurrent(String(record.Num_Sinistre_Agence).trim()); setDirty(false); setTried(false); setList(null);
      setClientPolicies([]);
      if (loaded.Code_Client) {
        listClientPolicies(accessToken, loaded.Code_Client)
          .then((rows) => setClientPolicies(asPolicies(rows)))
          .catch(() => {});
      }
      return true;
    } catch (requestError) {
      fail(requestError.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  // A claim number typed in "N° sinistre" (agency) or "N° sinistre compagnie": the stored claim is opened with all its information.
  // While typing (quiet), only an exact match does something; on leaving the field, misses are reported.
  async function openByNumber(field, { quiet = false } = {}) {
    const numero = String(formRef.current[field] || '').trim();
    const restore = () => { if (!quiet && field === 'Num_Sinistre_Agence') setForm((value) => ({ ...value, Num_Sinistre_Agence: current })); };
    if (!numero || numero === current) { restore(); return; }
    try {
      const result = await listSinistres(accessToken, { q: numero, limit: 50 });
      if (String(formRef.current[field] || '').trim() !== numero) return; // typed on meanwhile
      const same = (value) => String(value || '').trim().toLowerCase() === numero.toLowerCase();
      const byAgency = result.items.find((row) => same(row.Num_Sinistre_Agence));
      const byCompany = result.items.find((row) => same(row.Num_Sinistre_Compagnie_Assure));
      const found = field === 'Num_Sinistre_Agence' ? byAgency || byCompany : byCompany || byAgency;
      if (!found) {
        if (quiet) return;
        restore();
        if (field === 'Num_Sinistre_Agence') fail(`Aucun dossier n° ${numero}.`);
        else if (!current) info(`Aucun dossier avec le n° sinistre compagnie ${numero} : nouveau dossier.`);
        return;
      }
      const foundNumber = String(found.Num_Sinistre_Agence).trim();
      if (foundNumber === current) { restore(); return; }
      // Only the number was typed in a new file: nothing to lose, no confirmation.
      const typedOnlyNumber = !current && Object.entries(blank()).every(([key, value]) => key === field || String(formRef.current[key]) === String(value));
      if (await open(foundNumber, { ask: !typedOnlyNumber })) info(`Dossier ${foundNumber} chargé.`);
      else restore();
    } catch (requestError) {
      restore();
      if (!quiet) fail(requestError.message);
    }
  }

  // N° police or immatriculation: the insured's policy fills the client, company, branch and risk.
  // `plate` searches by the typed registration only, so a half-typed policy number never picks another vehicle's policy.
  async function fillFromPolicy({ numero, plate = false, quiet = false } = {}) {
    const typed = formRef.current;
    const number = plate ? '' : (numero ?? typed.Num_Int.trim());
    const immat = plate ? typed.Num_Imat.trim() : '';
    if (!number && !immat) return;
    try {
      const policy = await findClaimPolicy(accessToken, { numero: number, immat });
      const latest = formRef.current;
      if (plate ? latest.Num_Imat.trim() !== immat : !numero && latest.Num_Int.trim() !== number) return; // typed on meanwhile
      const clientCode = String(policy.code_client || '').trim();
      if (clientCode && clientCode !== latest.Code_Client.trim()) {
        listClientPolicies(accessToken, clientCode)
          .then((rows) => setClientPolicies(asPolicies(rows)))
          .catch(() => setClientPolicies([]));
      }
      change({
        Num_Int: policy.num_int || number, Num_Imat: (plate ? latest.Num_Imat : policy.num_imat || latest.Num_Imat) || '', Code_Client: policy.code_client || '',
        nom_client: policy.nom_client || latest.nom_client, Code_Compagnie_Assure: policy.code_compagnie != null ? String(policy.code_compagnie) : latest.Code_Compagnie_Assure,
        code_branche: policy.code_branche || '', Code_Type_Branche: policy.code_type_branche != null ? String(policy.code_type_branche) : latest.Code_Type_Branche,
        Risque: (policy.risque || latest.Risque).slice(0, 50),
      });
      info(`Police ${policy.num_int} : ${policy.code_client} ${policy.nom_client || ''}${policy.etat && policy.etat !== 'AN' ? ` — police ${policy.etat}` : ''}`);
    } catch (requestError) {
      if (!quiet) info(requestError.message);
    }
  }

  // Client code typed: its name, then its policies; the most recent policy in force fills the police fields.
  async function fillFromClient() {
    const code = formRef.current.Code_Client.trim();
    const stale = () => formRef.current.Code_Client.trim() !== code;
    if (!code) { setClientPolicies([]); return; }
    let client;
    try {
      client = await getClientByCode(accessToken, code);
    } catch {
      if (stale()) return;
      setClientPolicies([]);
      change({ nom_client: '' });
      info(`Client ${code} introuvable.`);
      return;
    }
    if (stale()) return;
    change({ nom_client: client.nom_client || [client.lastName, client.firstName].filter(Boolean).join(' ') });
    try {
      const rows = await listClientPolicies(accessToken, code);
      if (stale()) return;
      const policies = asPolicies(rows);
      setClientPolicies(policies);
      if (!policies.length) { info(`Client ${code} : aucune police enregistrée.`); return; }
      const typedPolicy = formRef.current.Num_Int.trim();
      if (typedPolicy && policies.some((row) => row.num_int === typedPolicy || row.num_police === typedPolicy)) return; // already one of this client's policies
      const chosen = policies.find((row) => row.etat === 'AN') || policies[0];
      await fillFromPolicy({ numero: chosen.num_int || chosen.num_police });
      if (policies.length > 1) info(`${policies.length} polices pour ce client — police ${chosen.num_int || chosen.num_police} affichée, choisissez-en une autre dans « N° police ».`);
    } catch { /* policies unavailable: the name alone is shown */ }
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
      setForm(await completed(toForm(record))); setCurrent(numero); setDirty(false); setTried(false);
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
  const input = (label, name, { type = 'text', span = 3, maxLength, onBlur, onType, list, placeholder, required = false, search = false } = {}) => (
    <label className={`snr-span-${span}${missing(name) ? ' is-missing' : ''}${search ? ' snr-search' : ''}`}>
      <span>{label}{required && <i> *</i>}</span>
      <input
        type={type} value={form[name]} maxLength={maxLength} onBlur={onBlur} placeholder={placeholder} list={list}
        onKeyDown={onBlur ? (event) => { if (event.key === 'Enter') { event.preventDefault(); onBlur(); } } : undefined}
        step={type === 'number' ? 'any' : undefined} min={type === 'number' ? '0' : undefined} max={type === 'datetime-local' ? `${today()}T23:59` : undefined}
        onChange={(event) => {
          change({ [name]: event.target.value });
          // Like the policy screen: the lookup runs as soon as typing pauses.
          if (onType) { clearTimeout(typingTimers.current[name]); typingTimers.current[name] = setTimeout(onType, 450); }
        }}
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
          <button type="button" className="snr-tool" onClick={() => setList(newList())} disabled={busy}>Lister</button>
          {message && <p className={`snr-message is-${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'} title={message.text}>{message.text}</p>}
          <span className="snr-spacer" />
          <span className="snr-number">{current ? `N° ${current}` : proposed ? `Nouveau · n° ${proposed}` : 'Nouveau dossier'}{dirty && <em> · modifié</em>}</span>
          <span className={`snr-badge ${statusClass}`}>{statusLabel}</span>
        </div>

        <div className="snr-body">
          <fieldset className="snr-group">
            <legend>Dossier</legend>
            {/* Both claim numbers first: typing either one opens that claim with all its information. */}
            {input('N° sinistre', 'Num_Sinistre_Agence', { span: 3, maxLength: 12, onBlur: () => openByNumber('Num_Sinistre_Agence'), onType: () => openByNumber('Num_Sinistre_Agence', { quiet: true }), placeholder: '🔍 Ex : 202610003', search: true })}
            {input('N° sinistre compagnie', 'Num_Sinistre_Compagnie_Assure', { span: 3, maxLength: 20, onBlur: () => openByNumber('Num_Sinistre_Compagnie_Assure'), onType: () => openByNumber('Num_Sinistre_Compagnie_Assure', { quiet: true }), placeholder: '🔍 Ex : 20260125954V', search: true })}
            {input('Date et heure du sinistre', 'Date_Sinistre', { type: 'datetime-local', span: 4, required: true })}
            {input('Date saisie', 'Date_Saisie', { type: 'date', span: 2 })}
            {input('Lieu du sinistre', 'Lieu_Sinistre', { span: 3, maxLength: 50, placeholder: 'Adresse, route…' })}
            {choose('Branche', 'Code_Type_Branche', lookups.branches)}
          </fieldset>

          <fieldset className="snr-group">
            <legend>Assuré et police</legend>
            {input('N° police', 'Num_Int', { maxLength: 15, onBlur: () => fillFromPolicy(), onType: () => fillFromPolicy({ quiet: true }), list: 'snr-client-policies', placeholder: 'Recherche auto', required: true })}
            {input('Immatriculation', 'Num_Imat', { maxLength: 12, onBlur: () => { if (!form.Code_Client) fillFromPolicy({ plate: true }); }, onType: () => { if (!formRef.current.Code_Client) fillFromPolicy({ plate: true, quiet: true }); }, placeholder: '209 TU 2222' })}
            <datalist id="snr-client-policies">{clientPolicies.map((row) => <option key={row.num_int || row.num_police} value={row.num_int || row.num_police}>{[row.num_police, row.num_imat, row.nom_branche, row.etat].filter(Boolean).join(' · ')}</option>)}</datalist>
            {input('Code client', 'Code_Client', { span: 2, maxLength: 8, onType: fillFromClient })}
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
              <div className="snr-filters" role="group" aria-label="Statut">
                {STATUS_FILTERS.map(([key, countKey, label]) => (
                  <label key={key} className={`snr-filter-check${list[key] ? ' is-active' : ''}`}>
                    <input type="checkbox" checked={list[key]} onChange={(event) => { const on = event.target.checked; setList((value) => ({ ...value, [key]: on, items: null })); }} />
                    {label}
                    <b className="snr-count">{list.counts ? list.counts[countKey] : '…'}</b>
                  </label>
                ))}
              </div>
              <label className="snr-date-filter">
                <span>Type</span>
                <select value={list.typeSinistre} onChange={(event) => { const typeSinistre = event.target.value; setList((value) => ({ ...value, typeSinistre, items: null })); }} aria-label="Filtrer par type de sinistre">
                  <option value="">Tous</option>
                  {lookups.types_sinistre.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <label className="snr-date-filter">
                <span>Jusqu’au</span>
                <input type="date" value={list.dateMax} max={today()} onChange={(event) => { const dateMax = event.target.value; setList((value) => ({ ...value, dateMax, items: null })); }} aria-label="Sinistres survenus jusqu’au" />
                {list.dateMax && <button type="button" onClick={() => setList((value) => ({ ...value, dateMax: '', items: null }))} aria-label="Effacer la date">×</button>}
              </label>
              <input autoFocus value={list.q} onChange={(event) => setList((value) => ({ ...value, q: event.target.value }))} placeholder="N° sinistre, code ou nom client, police, immatriculation, tiers…" />
              <button type="button" className="snr-close" onClick={() => setList(null)} aria-label="Fermer">×</button>
            </header>
            <div className="snr-table-wrap">
              {list.items === null ? <p className="snr-empty">Chargement…</p>
                : list.items.length === 0 ? <p className="snr-empty">Aucun dossier trouvé.</p>
                : byAdverseCompany(list.items, lookups.compagnies).map((group) => (
                  <section key={group.code || 'none'} className="snr-claims-group">
                    <h4>{group.label} <b className="snr-count">{group.rows.length}</b></h4>
                    <table className="snr-table snr-claims">
                      <thead><tr><th>N° sinistre</th><th>Date</th><th>Client</th><th>Nom client</th><th>N° police</th><th>Immat.</th><th>Type</th><th>Observation</th><th className="is-number">Devis</th><th className="is-number">Réglé</th></tr></thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={row.Num_Sinistre_Agence} className="is-clickable" onClick={() => open(row.Num_Sinistre_Agence)}>
                            <td>{row.Num_Sinistre_Agence}</td><td>{shortDate(row.Date_Sinistre)}</td><td>{row.Code_Client}</td><td title={row.nom_client || ''}>{row.nom_client}</td>
                            <td>{row.Num_Int}</td><td>{row.Num_Imat}</td><td>{row.Type_Sinistre}</td><td className="snr-risque" title={row.Risque || ''}>{row.Risque}</td>
                            <td className="is-number">{row.Montant_Devis ? money(row.Montant_Devis) : ''}</td><td className="is-number">{row.Montant_Reglement ? money(row.Montant_Reglement) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ))}
            </div>
            <footer><span>{list.items ? `${list.items.length} dossier(s) affiché(s) sur ${list.total}` : ''} · cliquez une ligne pour l’ouvrir · Échap pour fermer</span><button type="button" className="snr-tool" onClick={() => setList(null)}>Fermer</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}
