import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../auth/AuthContext';
import { getClientByCode } from '../../services/clientApi';
import {
  addVehicle, cancelExit, ConfirmationNeeded, getFleet, getVehicleClaims, importVehicles, removeVehicle, replaceVehicle, updateVehicle,
} from '../../services/flotteApi';
import { readFleetFile } from '../../services/flotteImport';
import '../../pages/ClientManagement/ClientManagementPage.css';
import './FlotteDialog.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => (value == null || value === '' ? '—' : money.format(Number(value)));
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—');
const today = () => new Date().toISOString().slice(0, 10);
const day = (value) => (value ? String(value).slice(0, 10) : '');
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// Share of the contract left from `start` (included) to its expiration (included), as the server bills the avenants.
function prorata(contract, start) {
  const effet = day(contract.effet) || start;
  const expiration = day(contract.expiration) || new Date(Date.parse(`${effet}T00:00:00Z`) + 364 * 86400000).toISOString().slice(0, 10);
  const period = Math.max(daysBetween(effet, expiration) + 1, 1);
  const days = Math.max(Math.min(daysBetween(start, expiration) + 1, period), 0);
  return { share: days / period, days, period };
}
// Entry date proposed for a new vehicle: today once the contract has started, else its effective date.
const entryDate = (contract) => {
  const effet = day(contract.effet);
  const expiration = day(contract.expiration);
  const value = effet && today() < effet ? effet : today();
  return expiration && value > expiration ? expiration : value;
};

// The vehicle form: [key, label, type, options]; the client is entered apart (code + name shown).
const VEHICLE_FIELDS = [
  ['num_imat', 'Immatriculation *', 'text'], ['marque', 'Marque / modèle', 'text'], ['serie', 'N° de série (châssis)', 'text'],
  ['puissance', 'Puissance (CV)', 'number'], ['energie', 'Énergie', 'select', ['', 'Essence', 'Diesel', 'Hybride', 'Électrique', 'GPL']],
  ['genre', 'Genre', 'text'], ['nbpl', 'Places', 'number'], ['circulation', '1re mise en circulation', 'date'],
  ['effet', 'Date d’entrée dans la flotte', 'date'], ['risque', 'Risque', 'text'], ['garantie', 'Garanties', 'text'],
  ['venale', 'Valeur vénale', 'number'], ['neuf', 'Valeur à neuf', 'number'], ['franchise', 'Franchise', 'number'],
  ['prime_net', 'Prime nette annuelle', 'number'], ['commission', 'Commission annuelle', 'number'], ['prime_total', 'Prime totale annuelle', 'number'],
  ['obser', 'Observation', 'text'],
];
const NUMBER_KEYS = new Set(VEHICLE_FIELDS.filter(([, , type]) => type === 'number').map(([key]) => key));
const EXIT_MOTIFS = [['vendu', 'Vendu'], ['epave', 'Épave'], ['transfert', 'Transféré vers une autre police'], ['autre', 'Autre motif']];
const FILTERS = [['actifs', 'Dans la flotte'], ['sortis', 'Sortis'], ['tous', 'Tous']];
const AVENANT_LABELS = { incorporation: 'Incorporation', retrait: 'Retrait', modification: 'Modification', remplacement: 'Remplacement' };

const formValues = (vehicle = {}) => Object.fromEntries([...VEHICLE_FIELDS.map(([key, , type]) => {
  const value = vehicle[key];
  if (value == null) return [key, ''];
  return [key, type === 'date' ? day(value) : String(value)];
}), ['code_client', vehicle.code_client || '']]);

function toPayload(values, extra = {}) {
  const payload = { ...extra };
  Object.entries(values).forEach(([key, raw]) => {
    const value = String(raw ?? '').trim();
    payload[key] = value === '' ? null : NUMBER_KEYS.has(key) ? Number(value) : value;
  });
  return payload;
}

// Sends; a registration on another policy in force asks the user, then sends again with forcer.
async function withConfirmation(send, build) {
  try {
    return await send(build(false));
  } catch (error) {
    if (!(error instanceof ConfirmationNeeded) || !window.confirm(error.message)) throw error;
    return send(build(true));
  }
}

function Estimate({ amount, days, period, positive = 'Quittance d’avenant', negative = 'Ristourne' }) {
  if (!Number.isFinite(amount) || Math.abs(amount) < 0.0005) return <p className="flt-estimate">Aucune prime à régler pour cet avenant.</p>;
  return <p className={`flt-estimate ${amount > 0 ? 'is-due' : 'is-back'}`}>
    {amount > 0 ? positive : negative} estimée : <b>{fmt(Math.abs(amount))}</b> ({days} jours sur {period}, au prorata de la prime annuelle)
  </p>;
}

// Vehicle added, modified or replacing another: the form, with the client of the vehicle (the souscripteur when left
// empty) and the avenant it makes (amount estimated as the server bills it).
// draft: a "police fictive" entered before its police flotte is stored: it stays in the form (no avenant yet, the
// souscripteur may not exist yet) and onSubmit receives it with nom_client, for the list.
export function VehicleForm({ contract, vehicle, mode, onSubmit, onClose, draft = false }) {
  const { accessToken } = useAuth();
  const replacing = mode === 'replace';
  const [values, setValues] = useState(() => formValues(replacing
    ? { code_client: vehicle.code_client, risque: vehicle.risque, garantie: vehicle.garantie, prime_net: vehicle.prime_net, commission: vehicle.commission, prime_total: vehicle.prime_total }
    : vehicle || { code_client: contract.code_client, effet: entryDate(contract) }));
  const [avenantDate, setAvenantDate] = useState(today);
  const [bill, setBill] = useState(null); // null: automatic (an entry after the contract's start is billed)
  const [clientName, setClientName] = useState(vehicle?.nom_client || contract.nom_client || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const code = values.code_client.trim();
    if (!code) { setClientName(contract.nom_client || ''); return undefined; }
    if (draft && code === String(contract.code_client || '').trim()) { setClientName(contract.nom_client || `Client ${code}`); return undefined; } // not stored yet
    let active = true;
    const timer = setTimeout(() => {
      getClientByCode(accessToken, code)
        .then((client) => { if (active) setClientName([client.lastName, client.firstName].filter(Boolean).join(' ') || client.relatedName || `Client ${code}`); })
        .catch(() => { if (active) setClientName(''); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [accessToken, draft, values.code_client, contract.code_client, contract.nom_client]);

  // The avenant this form makes and its estimated amount (+ owed, - returned).
  const premium = Number(values.prime_total || 0);
  const before = Number(vehicle?.prime_total || 0);
  const avenant = (() => {
    if (mode === 'add') {
      const start = values.effet || entryDate(contract);
      const auto = Boolean(day(contract.effet) && start > day(contract.effet));
      return { kind: 'incorporation', start, auto, on: bill ?? auto, delta: premium };
    }
    if (replacing) return { kind: 'remplacement', start: avenantDate, on: bill ?? true, delta: premium - before };
    const changed = Math.abs(premium - before) >= 0.0005 || Math.abs(Number(values.prime_net || 0) - Number(vehicle.prime_net || 0)) >= 0.0005;
    return { kind: 'modification', start: avenantDate, on: changed && (bill ?? true), delta: premium - before, changed, active: vehicle.actif };
  })();
  const estimate = prorata(contract, avenant.start);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (values.code_client.trim() && !clientName) { setError('Client introuvable : vérifiez le code client.'); return; }
    setSaving(true);
    try {
      await withConfirmation(onSubmit, (forcer) => {
        if (draft) return toPayload(values, { nom_client: clientName });
        if (replacing) return { date_remplacement: avenantDate, avenant: avenant.on, vehicule: toPayload(values, { forcer }) };
        if (mode === 'add') return toPayload(values, { forcer, avenant: avenant.on });
        return toPayload(values, { forcer, avenant: avenant.on, date_avenant: avenantDate });
      });
    } catch (submitError) {
      setError(submitError.message);
      setSaving(false);
    }
  }

  const title = draft ? (vehicle ? `Police fictive ${vehicle.num_imat}` : 'Ajouter une police fictive')
    : replacing ? `Remplacer ${vehicle.num_imat}` : vehicle ? `Véhicule ${vehicle.num_imat}` : 'Ajouter un véhicule';
  const fields = replacing ? VEHICLE_FIELDS.filter(([key]) => key !== 'effet') : VEHICLE_FIELDS;
  return <div className="client-records-backdrop is-nested flt-nested" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="client-records-dialog flt-form" onSubmit={submit} role="dialog" aria-modal="true" aria-label={title}>
      <header><div><span>POLICE FLOTTE {contract.num_police || contract.num_int}</span><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></header>
      <div className="flt-form-body">
        {replacing && <div className="flt-grid flt-replace">
          <label><span>Date du remplacement</span><input type="date" required value={avenantDate} min={day(vehicle.effet) || undefined} max={day(contract.expiration) || undefined} onChange={(event) => setAvenantDate(event.target.value)} /></label>
          <p className="flt-hint is-wide">{vehicle.num_imat} sort de la flotte à cette date et le nouveau véhicule y entre : seule la différence de prime est facturée ou ristournée.</p>
        </div>}
        <fieldset className="flt-client">
          <legend>Client du véhicule</legend>
          <label><span>Code client</span><input value={values.code_client} maxLength={8} onChange={(event) => set('code_client', event.target.value)} placeholder={contract.code_client} /></label>
          <p className={clientName ? 'flt-client-name' : 'flt-client-name is-error'}>
            {clientName || 'Client introuvable'}
            {(!values.code_client.trim() || values.code_client.trim() === contract.code_client) && <small> · souscripteur</small>}
          </p>
        </fieldset>
        <div className="flt-grid">
          {fields.map(([key, label, type, options]) => <label key={key} className={['risque', 'garantie', 'obser'].includes(key) ? 'is-wide' : undefined}>
            <span>{label}</span>
            {type === 'select'
              ? <select value={values[key]} onChange={(event) => set(key, event.target.value)}>{options.map((option) => <option key={option} value={option}>{option || '—'}</option>)}</select>
              : <input type={type} step={type === 'number' ? 'any' : undefined} min={type === 'number' ? 0 : key === 'effet' ? day(contract.effet) || undefined : undefined}
                  max={key === 'effet' ? day(contract.expiration) || undefined : undefined} required={key === 'num_imat'} value={values[key]}
                  onChange={(event) => set(key, key === 'num_imat' ? event.target.value.toUpperCase() : event.target.value)} />}
          </label>)}
        </div>

        {draft ? (avenant.auto && <p className="flt-hint">Entrée après le début de la police : un avenant d’incorporation (quittance au prorata) sera établi à l’enregistrement.</p>) : <fieldset className="flt-avenant">
          <legend>Avenant</legend>
          {mode === 'add' && <>
            <label className="flt-check"><input type="checkbox" checked={avenant.on} onChange={(event) => setBill(event.target.checked)} /> Avenant d’incorporation : facturer la prime au prorata</label>
            <p className="flt-hint">{avenant.auto ? 'Le véhicule entre après le début du contrat : une quittance d’avenant est établie.' : 'Véhicule de la composition initiale : couvert par la quittance du contrat (pas d’avenant).'}</p>
            {avenant.on && <Estimate amount={avenant.delta * estimate.share} days={estimate.days} period={estimate.period} />}
          </>}
          {mode === 'edit' && (avenant.changed ? <>
            <label className="flt-check"><input type="checkbox" checked={avenant.on} disabled={!avenant.active} onChange={(event) => setBill(event.target.checked)} /> Avenant de modification : facturer (ou ristourner) la différence de prime</label>
            {avenant.on && <>
              <label className="flt-inline"><span>À partir du</span><input type="date" value={avenantDate} onChange={(event) => setAvenantDate(event.target.value)} /></label>
              <Estimate amount={avenant.delta * estimate.share} days={estimate.days} period={estimate.period} />
            </>}
            {!avenant.on && <p className="flt-hint">Simple correction : la prime est modifiée sans quittance ni ristourne.</p>}
          </> : <p className="flt-hint">La prime ne change pas : simple correction, sans avenant.</p>)}
          {replacing && <>
            <label className="flt-check"><input type="checkbox" checked={avenant.on} onChange={(event) => setBill(event.target.checked)} /> Facturer (ou ristourner) la différence de prime</label>
            {avenant.on && <Estimate amount={avenant.delta * estimate.share} days={estimate.days} period={estimate.period} />}
          </>}
        </fieldset>}
        {error && <p className="client-records-message is-error flt-error" role="alert">{error}</p>}
      </div>
      <footer><span /><div className="client-footer-actions"><button className="client-secondary-button" type="button" onClick={onClose}>Annuler</button><button className="client-primary-button" type="submit" disabled={saving}>{saving ? 'Enregistrement…' : replacing ? 'Remplacer' : vehicle ? 'Enregistrer' : draft ? 'Ajouter' : 'Ajouter à la flotte'}</button></div></footer>
    </form>
  </div>;
}

// A vehicle taken out of the fleet (avenant de retrait): date, reason and the ristourne of the days left.
function ExitForm({ contract, vehicle, onSubmit, onClose }) {
  const [values, setValues] = useState({ date_sortie: today(), motif: 'vendu', observation: '', ristourne: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const estimate = prorata(contract, values.date_sortie || today());
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit({ ...values, observation: values.observation.trim() || null });
    } catch (submitError) {
      setError(submitError.message);
      setSaving(false);
    }
  }
  return <div className="client-records-backdrop is-nested flt-nested" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="client-records-dialog flt-exit" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Retirer le véhicule">
      <header><div><span>AVENANT DE RETRAIT</span><h2>Retirer {vehicle.num_imat}</h2></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></header>
      <div className="flt-form-body flt-grid">
        <label><span>Date de sortie</span><input type="date" required value={values.date_sortie} min={day(vehicle.effet) || undefined} onChange={(event) => setValues({ ...values, date_sortie: event.target.value })} /></label>
        <label><span>Motif</span><select value={values.motif} onChange={(event) => setValues({ ...values, motif: event.target.value })}>{EXIT_MOTIFS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="is-wide"><span>Observation</span><input maxLength={30} value={values.observation} onChange={(event) => setValues({ ...values, observation: event.target.value })} /></label>
        <label className="flt-check is-wide"><input type="checkbox" checked={values.ristourne} onChange={(event) => setValues({ ...values, ristourne: event.target.checked })} /> Ristourner la prime des jours restants</label>
        {values.ristourne && <div className="is-wide"><Estimate amount={-Number(vehicle.prime_total || 0) * estimate.share} days={estimate.days} period={estimate.period} /></div>}
        <p className="flt-hint is-wide">Le véhicule reste dans l’historique de la police avec ses sinistres ; la ristourne apparaît dans « Gestion des ristournes ».</p>
        {error && <p className="client-records-message is-error flt-error is-wide" role="alert">{error}</p>}
      </div>
      <footer><span /><div className="client-footer-actions"><button className="client-secondary-button" type="button" onClick={onClose}>Annuler</button><button className="client-primary-button" type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Retirer de la flotte'}</button></div></footer>
    </form>
  </div>;
}

// The vehicles read in a list (Excel / PDF / photo): checked, then added at once; the refused ones keep their reason.
function ImportPreview({ contract, file, vehicles, onImport, onClose }) {
  const [rows, setRows] = useState(() => vehicles.map((vehicle, index) => ({ ...vehicle, key: index, chosen: true })));
  const [entry, setEntry] = useState(() => entryDate(contract));
  const [results, setResults] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const chosen = rows.filter((row) => row.chosen);
  const later = Boolean(day(contract.effet) && entry > day(contract.effet));

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const payload = chosen.map(({ key, chosen: _chosen, ...vehicle }) => ({ ...vehicle, effet: vehicle.effet || entry }));
      setResults(await onImport(payload));
    } catch (importError) {
      setError(importError.message);
    } finally {
      setSaving(false);
    }
  }

  return <div className="client-records-backdrop is-nested flt-nested" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="client-records-dialog flt-import" role="dialog" aria-modal="true" aria-label="Importer des véhicules">
      <header><div><span>IMPORT · {file.name}</span><h2>{results ? 'Résultat de l’import' : `${vehicles.length} véhicule(s) lu(s)`}</h2></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></header>
      {results ? <div className="client-records-table-wrap"><table>
        <thead><tr><th>Immatriculation</th><th>Résultat</th></tr></thead>
        <tbody>{results.map((result, index) => <tr key={index} className={result.ok ? undefined : 'is-exited'}><td><b>{result.num_imat}</b></td><td><span className={`flt-status ${result.ok ? 'is-active' : 'is-out'}`}>{result.ok ? 'Ajouté' : 'Refusé'}</span> {result.message}</td></tr>)}</tbody>
      </table></div> : <>
        <div className="flt-toolbar">
          <label className="flt-inline"><span>Date d’entrée (si absente du fichier)</span><input type="date" value={entry} min={day(contract.effet) || undefined} max={day(contract.expiration) || undefined} onChange={(event) => setEntry(event.target.value)} /></label>
          <p className="flt-hint">{later ? 'Entrée après le début du contrat : chaque véhicule fait un avenant d’incorporation (quittance au prorata).' : 'Composition initiale : pas d’avenant.'} Vérifiez les lignes ; les valeurs absentes restent vides.</p>
        </div>
        <div className="client-records-table-wrap flt-table">
          <table>
            <thead><tr><th><input type="checkbox" aria-label="Tout choisir" checked={chosen.length === rows.length} onChange={(event) => setRows((current) => current.map((row) => ({ ...row, chosen: event.target.checked })))} /></th><th>Immatriculation</th><th>Marque</th><th>Puissance</th><th>Client</th><th>Entrée</th><th className="is-number">Prime totale</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.key} className={row.chosen ? undefined : 'is-exited'}>
              <td><input type="checkbox" checked={row.chosen} aria-label={`Importer ${row.num_imat}`} onChange={(event) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, chosen: event.target.checked } : item)))} /></td>
              <td><b>{row.num_imat}</b></td><td>{row.marque || '—'}</td><td>{row.puissance ?? '—'}</td><td>{row.code_client || <small>souscripteur</small>}</td>
              <td>{formatDate(row.effet || entry)}</td><td className="is-number">{fmt(row.prime_total)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
      {error && <p className="client-records-message is-error flt-error" role="alert">{error}</p>}
      <footer><span>{results ? `${results.filter((result) => result.ok).length} ajouté(s), ${results.filter((result) => !result.ok).length} refusé(s)` : `${chosen.length} véhicule(s) choisi(s)`}</span>
        <div className="client-footer-actions">
          <button className="client-secondary-button" type="button" onClick={onClose}>{results ? 'Fermer' : 'Annuler'}</button>
          {!results && <button className="client-primary-button" type="button" disabled={saving || !chosen.length} onClick={submit}>{saving ? 'Import…' : `Importer ${chosen.length} véhicule(s)`}</button>}
        </div>
      </footer>
    </section>
  </div>;
}

// The claims of one vehicle.
function VehicleClaims({ numInt, vehicle, onClose }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', rows: [] });
  useEffect(() => {
    let active = true;
    getVehicleClaims(accessToken, numInt, vehicle.ordre)
      .then((result) => { if (active) setState({ loading: false, error: '', rows: result.sinistres }); })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, rows: [] }); });
    return () => { active = false; };
  }, [accessToken, numInt, vehicle.ordre]);
  return <div className="client-records-backdrop is-nested flt-nested" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="client-records-dialog flt-exit" role="dialog" aria-modal="true" aria-label={`Sinistres de ${vehicle.num_imat}`}>
      <header><div><span>SINISTRES DU VÉHICULE</span><h2>{vehicle.num_imat} {vehicle.marque ? `· ${vehicle.marque}` : ''}</h2></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></header>
      {state.loading ? <p className="client-records-message">Chargement…</p> : state.error ? <p className="client-records-message is-error">{state.error}</p> : !state.rows.length ? <p className="client-records-message">Aucun sinistre pour ce véhicule.</p>
        : <div className="client-records-table-wrap"><table>
          <thead><tr><th>N° sinistre</th><th>Date</th><th>Type</th><th className="is-number">Règlement</th><th>Réglé</th><th>Clôturé</th></tr></thead>
          <tbody>{state.rows.map((row) => <tr key={row.numero}><td>{row.numero}</td><td>{formatDate(row.date_sinistre)}</td><td>{row.type || '—'}</td><td className="is-number">{fmt(row.reglement)}</td><td>{row.regle ? 'Oui' : 'Non'}</td><td>{row.cloture ? 'Oui' : 'Non'}</td></tr>)}</tbody>
        </table></div>}
      <footer><span>{state.rows.length} sinistre(s)</span><button className="client-secondary-button" type="button" onClick={onClose}>Fermer</button></footer>
    </section>
  </div>;
}

// "Véhicules de la flotte" of a policy: the contract (souscripteur), its vehicles and their totals, its avenants, with
// Ajouter / Importer / Modifier / Remplacer / Retirer / Réintégrer. onChanged runs after each change.
export default function FlotteDialog({ numInt, onClose, onChanged }) {
  const { accessToken } = useAuth();
  const fileInput = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('vehicules');
  const [filter, setFilter] = useState('actifs');
  const [editing, setEditing] = useState(null); // { vehicle, mode: add | edit | replace }
  const [exiting, setExiting] = useState(null);
  const [claimsOf, setClaimsOf] = useState(null);
  const [importing, setImporting] = useState(null); // { file, vehicles } read, or { file, reading: progress }

  const load = useCallback(() => getFleet(accessToken, numInt).then(setData).catch((loadError) => setError(loadError.message)), [accessToken, numInt]);
  useEffect(() => { load(); }, [load]);
  const busy = Boolean(editing || exiting || claimsOf || importing);
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  function changed(result, message) {
    setData(result);
    setNotice(result.message || message || '');
    setError('');
    if (onChanged) onChanged(result);
  }

  async function reinstate(vehicle) {
    if (!window.confirm(`Remettre ${vehicle.num_imat} dans la flotte ? L’avenant de retrait sera annulé et sa ristourne supprimée.`)) return;
    try {
      changed(await cancelExit(accessToken, numInt, vehicle.ordre));
    } catch (requestError) { setError(requestError.message); }
  }

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    setImporting({ file, reading: 0 });
    try {
      const { vehicules } = await readFleetFile(accessToken, file, (progress) => setImporting((current) => current && { ...current, reading: progress }));
      if (!vehicules.length) throw new Error('Aucun véhicule trouvé dans le fichier.');
      setImporting({ file, vehicles: vehicules });
    } catch (readError) {
      setImporting(null);
      setError(`Import impossible : ${readError.message}`);
    }
  }

  const contract = data?.contrat;
  const vehicles = useMemo(() => (data?.vehicules || []).filter((vehicle) => (filter === 'tous' ? true : filter === 'actifs' ? vehicle.actif : !vehicle.actif)), [data, filter]);
  const exitedCount = (data?.vehicules || []).filter((vehicle) => !vehicle.actif).length;
  const avenants = data?.avenants || [];
  const plateOf = (ordre) => (data?.vehicules || []).find((vehicle) => vehicle.ordre === ordre)?.num_imat || ordre;

  return createPortal(<div className="client-records-backdrop is-nested flt-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="client-records-dialog flt-dialog" role="dialog" aria-modal="true" aria-label="Véhicules de la flotte">
      <header>
        <div>
          <span>MODULE 110 · POLICE FLOTTE</span>
          <h2>Véhicules de la flotte {contract ? `· Police ${contract.num_police || contract.num_int}` : ''}</h2>
          {contract && <p className="client-records-subtitle">Souscripteur : <b>{contract.code_client} {contract.nom_client}</b> · {contract.nom_compagnie || '—'} · du {formatDate(contract.effet)} au {formatDate(contract.expiration)}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer">×</button>
      </header>

      {data && <div className="flt-summary">
        <div><strong>{data.nb_actifs}</strong><span>véhicule{data.nb_actifs > 1 ? 's' : ''} dans la flotte</span></div>
        <div><strong>{fmt(data.prime_nette)}</strong><span>prime nette annuelle</span></div>
        <div><strong>{fmt(data.prime_totale)}</strong><span>prime totale annuelle</span></div>
        <div><strong>{avenants.filter((avenant) => avenant.annule !== 'O').length}</strong><span>avenant(s)</span></div>
        {!contract.flotte && <p className="flt-hint">Cette police n’est pas encore une flotte : ajouter un véhicule la transforme en police flotte.</p>}
      </div>}

      <div className="flt-toolbar">
        <div className="client-records-status" role="group" aria-label="Affichage">
          <button type="button" className={tab === 'vehicules' ? 'is-active' : ''} aria-pressed={tab === 'vehicules'} onClick={() => setTab('vehicules')}>Véhicules</button>
          <button type="button" className={tab === 'avenants' ? 'is-active' : ''} aria-pressed={tab === 'avenants'} onClick={() => setTab('avenants')}>Avenants ({avenants.length})</button>
        </div>
        {tab === 'vehicules' && <div className="client-records-status" role="group" aria-label="Véhicules affichés">
          {FILTERS.map(([value, label]) => <button type="button" key={value} className={filter === value ? 'is-active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}{value === 'sortis' && exitedCount ? ` (${exitedCount})` : ''}</button>)}
        </div>}
        <div className="flt-actions">
          <input ref={fileInput} type="file" hidden accept=".xlsx,.xls,.csv,.pdf,image/*" onChange={chooseFile} />
          <button type="button" className="client-secondary-button" onClick={() => fileInput.current?.click()} disabled={!data || Boolean(importing)}>{importing && !importing.vehicles ? `Lecture… ${Math.round((importing.reading || 0) * 100)}%` : 'Importer une liste'}</button>
          <button type="button" className="client-primary-button" onClick={() => setEditing({ vehicle: null, mode: 'add' })} disabled={!data}>+ Ajouter un véhicule</button>
        </div>
      </div>
      {notice && !error && <p className="flt-notice" role="status">{notice}</p>}
      {error && <p className="client-records-message is-error flt-error" role="alert">{error}</p>}

      {!data ? (!error && <p className="client-records-message">Chargement de la flotte…</p>)
        : tab === 'avenants' ? (avenants.length === 0 ? <p className="client-records-message">Aucun avenant : les entrées, sorties et changements de prime après le début du contrat en créent un.</p>
          : <div className="client-records-table-wrap flt-table"><table>
            <thead><tr><th>N°</th><th>Type</th><th>Date d’effet</th><th>Véhicule</th><th>Jours</th><th className="is-number">Montant</th><th>Quittance / ristourne</th><th>Statut</th></tr></thead>
            <tbody>{avenants.map((avenant) => <tr key={avenant.num_avenant} className={avenant.annule === 'O' ? 'is-exited' : undefined}>
              <td>{avenant.num_avenant}</td><td>{AVENANT_LABELS[avenant.type] || avenant.type}</td><td>{formatDate(avenant.date_effet)}</td>
              <td>{avenant.type === 'remplacement' && avenant.ordre_remplace ? `${plateOf(avenant.ordre_remplace)} → ${avenant.num_imat}` : avenant.num_imat || '—'}</td>
              <td>{avenant.jours != null ? `${avenant.jours} / ${avenant.jours_periode}` : '—'}</td>
              <td className={`is-number ${Number(avenant.montant) < 0 ? 'flt-negative' : ''}`}>{Number(avenant.montant) ? fmt(avenant.montant) : '—'}</td>
              <td>{avenant.num_quittance ? `${Number(avenant.montant) < 0 ? 'Ristourne' : 'Quittance'} ${avenant.num_quittance}` : 'Sans prime'}</td>
              <td><span className={`flt-status ${avenant.annule === 'O' ? 'is-out' : 'is-active'}`}>{avenant.annule === 'O' ? 'Annulé' : 'Valide'}</span></td>
            </tr>)}</tbody>
          </table></div>)
        : vehicles.length === 0 ? <p className="client-records-message">{filter === 'sortis' ? 'Aucun véhicule sorti.' : 'Aucun véhicule dans la flotte : cliquez sur « Ajouter un véhicule » ou « Importer une liste ».'}</p>
        : <div className="client-records-table-wrap flt-table">
          <table>
            <thead><tr><th>N°</th><th>Immatriculation</th><th>Marque</th><th>Client</th><th>Entrée</th><th>Sortie</th><th>Garanties</th><th className="is-number">Prime totale</th><th>Sinistres</th><th>Statut</th><th /></tr></thead>
            <tbody>{vehicles.map((vehicle) => <tr key={vehicle.ordre} className={vehicle.actif ? undefined : 'is-exited'}>
              <td>{vehicle.ordre}</td>
              <td><b>{vehicle.num_imat}</b></td>
              <td>{vehicle.marque || '—'}</td>
              <td title={vehicle.nom_client || ''}>{vehicle.code_client} {vehicle.nom_client}{vehicle.code_client === contract.code_client && <small className="flt-tag">souscripteur</small>}</td>
              <td>{formatDate(vehicle.effet)}</td>
              <td>{vehicle.date_re ? formatDate(vehicle.date_re) : '—'}</td>
              <td className="flt-garantie" title={vehicle.garantie || vehicle.risque || ''}>{vehicle.garantie || vehicle.risque || '—'}</td>
              <td className="is-number">{fmt(vehicle.prime_total)}</td>
              <td>{Number(vehicle.nb_sinistres) ? <button type="button" className="flt-link" onClick={() => setClaimsOf(vehicle)}>{vehicle.nb_sinistres} sinistre{vehicle.nb_sinistres > 1 ? 's' : ''}</button> : '—'}</td>
              <td><span className={`flt-status ${vehicle.actif ? 'is-active' : 'is-out'}`}>{vehicle.actif ? 'Dans la flotte' : vehicle.obser || 'Sorti'}</span></td>
              <td><div className="client-row-actions">
                <button type="button" onClick={() => setEditing({ vehicle, mode: 'edit' })}>Modifier</button>
                {vehicle.actif && <button type="button" onClick={() => setEditing({ vehicle, mode: 'replace' })}>Remplacer</button>}
                {vehicle.actif ? <button type="button" onClick={() => setExiting(vehicle)}>Retirer</button> : <button type="button" onClick={() => reinstate(vehicle)}>Réintégrer</button>}
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>}

      <footer><span>{data ? (tab === 'avenants' ? 'Quittances d’avenant et ristournes sont établies au nom du souscripteur, au prorata des jours restants' : `${vehicles.length} véhicule(s) affiché(s) · un véhicule retiré reste dans l’historique`) : ''}</span><button className="client-secondary-button" type="button" onClick={onClose}>Fermer</button></footer>
    </section>

    {editing && contract && <VehicleForm contract={contract} vehicle={editing.vehicle} mode={editing.mode} onClose={() => setEditing(null)}
      onSubmit={async (payload) => {
        const result = editing.mode === 'replace' ? await replaceVehicle(accessToken, numInt, editing.vehicle.ordre, payload)
          : editing.mode === 'edit' ? await updateVehicle(accessToken, numInt, editing.vehicle.ordre, payload)
          : await addVehicle(accessToken, numInt, payload);
        setEditing(null);
        if (editing.mode !== 'edit') setFilter('actifs');
        changed(result);
      }} />}
    {exiting && contract && <ExitForm contract={contract} vehicle={exiting} onClose={() => setExiting(null)}
      onSubmit={async (sortie) => {
        changed(await removeVehicle(accessToken, numInt, exiting.ordre, sortie));
        setExiting(null);
      }} />}
    {claimsOf && <VehicleClaims numInt={numInt} vehicle={claimsOf} onClose={() => setClaimsOf(null)} />}
    {importing?.vehicles && contract && <ImportPreview contract={contract} file={importing.file} vehicles={importing.vehicles} onClose={() => setImporting(null)}
      onImport={async (vehicules) => {
        const result = await importVehicles(accessToken, numInt, vehicules);
        const added = result.resultats.filter((item) => item.ok).length;
        changed(result, `${added} véhicule(s) importé(s) depuis ${importing.file.name}.`);
        return result.resultats;
      }} />}
  </div>, document.body);
}
