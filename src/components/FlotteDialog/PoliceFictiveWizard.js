import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../auth/AuthContext';
import { EMPTY_CLIENT } from '../../contexts/ClientContext';
import { CoordinatesFields, FieldErrors, IdentityFields } from '../../pages/ClientManagement/ClientFormFields';
import { clientStepErrors } from '../../pages/ClientManagement/clientValidation';
import { getClientByCode, getNextClientCode, saveClient } from '../../services/clientApi';
import { checkPlate, importVehicles } from '../../services/flotteApi';
import { quittanceErrors } from '../ModuleModal/policyValidation';
import { VEHICLE_FIELDS } from './FlotteDialog';
import '../../pages/ClientManagement/ClientManagementPage.css';
import './FlotteDialog.css';

const STEPS = ['Identité du client', 'Coordonnées', 'Saisir police', 'Saisir quittance', 'Saisir sinistre'];
// The premiums of the vehicle are those of its quittance (step 4): they are not entered twice.
const POLICE_FIELDS = VEHICLE_FIELDS.filter(([key]) => !['prime_net', 'commission', 'prime_total'].includes(key));
const NUMBER_FIELDS = new Set(POLICE_FIELDS.filter(([, , type]) => type === 'number').map(([key]) => key));
const QUITTANCE_FIELDS = [
  ['date_saisie', 'Date saisie *', 'date'], ['date_emission', 'Date émission *', 'date'], ['periode', 'Période *', 'text'], ['prime_net', 'Prime nette *', 'number'],
  ['commission', 'Commission', 'number'], ['prime_total', 'Prime totale *', 'number'], ['taxe', 'Taxe', 'number'], ['timbre', 'Timbre', 'number'],
  ['cout_attestation', 'Coût attestation', 'number'], ['montant_quittance', 'Montant quittance *', 'number'], ['solde_quittance', 'Solde quittance *', 'number'], ['num_attestation', 'N° Attestation', 'text'],
];
const QUITTANCE_AMOUNTS = new Set(QUITTANCE_FIELDS.filter(([, , type]) => type === 'number').map(([key]) => key));
const today = () => new Date().toISOString().slice(0, 10);
const day = (value) => (value ? String(value).slice(0, 10) : '');
const clean = (value) => String(value ?? '').trim();
const plateKey = (value) => clean(value).replace(/\s/g, '').toUpperCase();
const clientLabel = (client) => [client.lastName, client.firstName].filter(Boolean).join(' ') || client.nom_client || '';

const blankClient = () => ({ ...EMPTY_CLIENT, clientCode: '', createdAt: today() });
const blankForm = (contract) => ({
  mode: 'nouveau', code: '', client: blankClient(), loaded: '', forcer: false, withClaim: false,
  vehicle: { ...Object.fromEntries(POLICE_FIELDS.map(([key]) => [key, ''])), effet: day(contract.effet) },
  quittance: { ...Object.fromEntries(QUITTANCE_FIELDS.map(([key]) => [key, ''])), date_saisie: today(), carte_verte: false, cv_du: '', cv_au: '', observation: '' },
});

function vehicleErrors(values, contract) {
  const errors = {};
  const plate = clean(values.num_imat);
  if (plate.length < 2) errors.num_imat = 'Ce champ est obligatoire.';
  else if (plate.length > 20) errors.num_imat = '20 caractères maximum.';
  if (!values.effet) errors.effet = 'Ce champ est obligatoire.';
  else if (day(contract.effet) && values.effet < day(contract.effet)) errors.effet = 'La date d’entrée précède la date d’effet de la police.';
  else if (day(contract.expiration) && values.effet > day(contract.expiration)) errors.effet = 'La date d’entrée est après l’expiration de la police.';
  POLICE_FIELDS.forEach(([key, , type]) => {
    if (type === 'number' && clean(values[key]) && !(Number(values[key]) >= 0)) errors[key] = 'Saisissez un nombre positif.';
    if (type === 'text' && clean(values[key]).length > (['risque', 'garantie'].includes(key) ? 100 : 50) && !errors[key]) errors[key] = 'Texte trop long.';
  });
  return errors;
}

// What the list of the Police flotte section shows, the wizard's own values kept for "Modifier".
function toDraft(form, contract) {
  const { client, vehicle, quittance, mode, code } = form;
  return {
    form,
    num_imat: clean(vehicle.num_imat).toUpperCase(),
    marque: clean(vehicle.marque),
    effet: vehicle.effet,
    code_client: mode === 'souscripteur' ? contract.code_client : mode === 'existant' ? code : '',
    nom_client: mode === 'souscripteur' ? contract.nom_client : clientLabel(client),
    prime_total: Number(quittance.prime_total),
  };
}

// Stores one police fictive of a stored police flotte: its client when new or changed, then the vehicle and its quittance.
// A new client gets its code here (the last code + 1), once the souscripteur exists. Resolves to the client's code, and
// on a refusal rejects with `draft` set to what remains to do, so that a retry does not create the client twice.
export async function storeDraft(accessToken, numInt, draft) {
  const { form } = draft;
  let current = draft;
  try {
    let code = draft.code_client;
    if (form.mode === 'nouveau') {
      code = await getNextClientCode(accessToken);
      const saved = await saveClient(accessToken, { ...form.client, clientCode: code }, false);
      code = String(saved.clientCode || code).trim();
      const stored = { ...form, mode: 'existant', code, loaded: '', client: { ...form.client, clientCode: code, _persisted: true } };
      current = { ...draft, form: { ...stored, loaded: JSON.stringify(stored.client) }, code_client: code };
    } else if (form.mode === 'existant' && form.loaded !== JSON.stringify(form.client)) {
      await saveClient(accessToken, form.client, true);
      current = { ...draft, form: { ...form, loaded: JSON.stringify(form.client) } };
    }
    const vehicle = Object.fromEntries(Object.entries(form.vehicle).map(([key, value]) => {
      const text = clean(value);
      return [key, text === '' ? null : NUMBER_FIELDS.has(key) ? Number(text) : key === 'num_imat' ? text.toUpperCase() : text];
    }));
    const { carte_verte: carteVerte, cv_du: du, cv_au: au, ...fields } = form.quittance;
    const quittance = Object.fromEntries(Object.entries(fields).map(([key, value]) => {
      const text = clean(value);
      return [key, QUITTANCE_AMOUNTS.has(key) && text !== '' ? Number(text) : text === '' && key !== 'observation' ? null : text];
    }));
    const { resultats } = await importVehicles(accessToken, numInt, [{
      ...vehicle, code_client: code, forcer: form.forcer, prime_net: quittance.prime_net, commission: quittance.commission, prime_total: quittance.prime_total,
      quittance, carte_verte: carteVerte ? { du, au } : null,
    }]);
    if (!resultats[0]?.ok) throw new Error(resultats[0]?.message || 'Refusée par le serveur.');
    return code;
  } catch (error) {
    error.draft = current;
    throw error;
  }
}

// "Ajouter une police fictive": the five steps of a client file, one vehicle at a time. Everything stays in the police
// flotte's form and is stored with it, at its last step.
export default function PoliceFictiveWizard({ contract, draft, otherPlates = [], onSubmit, onClose }) {
  const { accessToken } = useAuth();
  const [form, setForm] = useState(() => draft?.form || blankForm(contract));
  const [step, setStep] = useState(1);
  const [tried, setTried] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { mode, client, vehicle, quittance } = form;
  const usesForm = mode !== 'souscripteur';
  const editable = mode === 'nouveau' || (mode === 'existant' && Boolean(form.loaded));

  const patch = (changes) => { setForm((current) => ({ ...current, ...changes })); setError(''); };
  const setClientField = (name, value) => setForm((current) => ({ ...current, client: { ...current.client, [name]: value } }));
  const setClientType = (value) => setForm((current) => ({ ...current, client: { ...current.client, clientType: value, firstName: value === 'Societe' ? '' : current.client.firstName } }));
  const setVehicle = (name, value) => setForm((current) => ({ ...current, forcer: name === 'num_imat' ? false : current.forcer, vehicle: { ...current.vehicle, [name]: value } }));
  const setQuittance = (name, value) => setForm((current) => ({ ...current, quittance: { ...current.quittance, [name]: value } }));

  const errorsOf = (number) => {
    if (number <= 2) return usesForm && editable ? clientStepErrors(client, number) : {};
    if (number === 3) return vehicleErrors(vehicle, contract);
    if (number === 4) return quittanceErrors(quittance);
    return {};
  };
  const errors = tried[step] ? errorsOf(step) : {};
  const message = (name) => (errors[name] ? <small className="client-field-error" role="alert">{errors[name]}</small> : null);

  async function loadExisting() {
    const code = clean(form.code);
    if (!code) { setError('Saisissez le code du client.'); return; }
    if (code === clean(contract.code_client)) { setError('Ce code est celui du souscripteur : choisissez « Souscripteur ».'); return; }
    setBusy(true);
    try {
      const record = { ...await getClientByCode(accessToken, code), _persisted: true };
      patch({ client: record, loaded: JSON.stringify(record) });
    } catch {
      patch({ client: blankClient(), loaded: '' });
      setError(`Client ${code} introuvable.`);
    } finally {
      setBusy(false);
    }
  }

  // A suggested name is an existing client: it is taken as it is, never created twice.
  async function pickExisting(record) {
    const code = clean(record.clientCode);
    setBusy(true);
    try {
      const fresh = { ...await getClientByCode(accessToken, code), _persisted: true };
      patch({ mode: 'existant', code, client: fresh, loaded: JSON.stringify(fresh) });
    } catch (pickError) {
      setError(pickError.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkVehicle() {
    const plate = clean(vehicle.num_imat).toUpperCase();
    if (otherPlates.some((item) => plateKey(item) === plateKey(plate))) { setError(`Le véhicule ${plate} est déjà dans cette police flotte.`); return false; }
    if (form.forcer) return true;
    const found = await checkPlate(accessToken, plate, contract.num_police);
    if (found.flotte) { setError(`Le véhicule ${plate} est déjà dans la flotte de la police ${found.flotte}.`); return false; }
    if (found.police) {
      if (!window.confirm(`Le véhicule ${plate} est assuré par la police ${found.police} en vigueur. L’ajouter quand même ?`)) return false;
      patch({ forcer: true });
    }
    return true;
  }

  async function next() {
    setError('');
    if (step === 1 && mode === 'existant' && !form.loaded) { setError('Saisissez le code du client puis cliquez sur « Rechercher ».'); return; }
    if (Object.keys(errorsOf(step)).length) {
      setTried((current) => ({ ...current, [step]: true }));
      setError('Corrigez les champs signalés pour continuer.');
      return;
    }
    if (step === 3) {
      setBusy(true);
      try {
        if (!await checkVehicle()) return;
      } catch (checkError) {
        setError(checkError.message);
        return;
      } finally {
        setBusy(false);
      }
    }
    if (step === 5) { onSubmit(toDraft(form, contract)); return; }
    // The souscripteur's own file is entered in the main steps.
    setStep(step === 1 && !usesForm ? 3 : step + 1);
  }
  const back = () => { setError(''); setStep(step === 3 && !usesForm ? 1 : step - 1); };

  return createPortal(<div className="client-records-backdrop is-nested flt-nested" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="client-records-dialog flt-form flt-wizard" role="dialog" aria-modal="true" aria-label="Police fictive">
      <header><div><span>POLICE FLOTTE {contract.num_police}</span><h2>{draft ? `Police fictive ${draft.num_imat}` : 'Ajouter une police fictive'}</h2></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></header>
      <div className="client-form-progress" aria-label={`Étape ${step} sur 5`}>
        {STEPS.map((label, index) => <div key={label} style={{ display: 'contents' }}>
          {index > 0 && <i />}
          <div className={step === index + 1 ? 'is-active' : step > index + 1 ? 'is-complete' : ''}><span>{index + 1}</span><strong>{label}</strong></div>
        </div>)}
      </div>
      <div className="flt-form-body">
        {step === 1 && <fieldset className="client-record-options flt-client-mode">
          <legend>Client du véhicule</legend>
          {[['nouveau', 'Nouveau client'], ['existant', 'Client existant'], ['souscripteur', `Souscripteur (${contract.nom_client || contract.code_client})`]].map(([value, label]) => <label key={value}>
            <input type="radio" name="flt-client-mode" checked={mode === value} onChange={() => patch({ mode: value, ...(value === 'nouveau' ? { code: '', client: blankClient(), loaded: '' } : value === 'existant' ? { client: blankClient(), loaded: '' } : {}) })} />{label}
          </label>)}
          {mode === 'existant' && <div className="flt-client-code">
            <label><span>Code client *</span><input value={form.code} maxLength={8} onChange={(event) => patch({ code: event.target.value, loaded: '' })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); loadExisting(); } }} /></label>
            <button type="button" className="client-secondary-button" disabled={busy} onClick={loadExisting}>{busy ? 'Recherche…' : 'Rechercher'}</button>
          </div>}
        </fieldset>}
        <FieldErrors.Provider value={step <= 2 ? errors : {}}>
          {step === 1 && editable && <div className="client-record-form flt-client-form"><IdentityFields client={client} updateField={setClientField} changeClientType={setClientType} accessToken={accessToken} pickExistingClient={pickExisting} /></div>}
          {step === 2 && <div className="client-record-form client-record-form-step-two flt-client-form"><CoordinatesFields client={client} updateField={setClientField} /></div>}
        </FieldErrors.Provider>
        {step === 3 && <div className="flt-grid">
          {POLICE_FIELDS.map(([key, label, type, options]) => <label key={key} className={['risque', 'garantie', 'obser'].includes(key) ? 'is-wide' : undefined}>
            <span>{label}{key === 'effet' ? ' *' : ''}</span>
            {type === 'select'
              ? <select value={vehicle[key]} onChange={(event) => setVehicle(key, event.target.value)}>{options.map((option) => <option key={option} value={option}>{option || '—'}</option>)}</select>
              : <input type={type} step={type === 'number' ? 'any' : undefined} min={type === 'number' ? 0 : undefined} value={vehicle[key]} onChange={(event) => setVehicle(key, key === 'num_imat' ? event.target.value.toUpperCase() : event.target.value)} />}
            {message(key)}
          </label>)}
        </div>}
        {step === 4 && <>
          <p className="flt-hint">Cette quittance est au nom du client du véhicule : {mode === 'souscripteur' ? contract.nom_client || contract.code_client : clientLabel(client) || 'nouveau client'}.</p>
          <div className="flt-grid">
            {QUITTANCE_FIELDS.map(([key, label, type]) => <label key={key}>
              <span>{label}</span>
              <input type={type} step={type === 'number' ? 'any' : undefined} min={type === 'number' ? 0 : undefined} value={quittance[key]} onChange={(event) => setQuittance(key, event.target.value)} />
              {message(key)}
            </label>)}
            <label className="flt-check is-wide"><input type="checkbox" checked={quittance.carte_verte} onChange={(event) => setQuittance('carte_verte', event.target.checked)} /> Carte verte</label>
            {quittance.carte_verte && <>
              <label><span>Carte verte : du *</span><input type="date" value={quittance.cv_du} onChange={(event) => setQuittance('cv_du', event.target.value)} />{message('cv_du')}</label>
              <label><span>Carte verte : au *</span><input type="date" value={quittance.cv_au} onChange={(event) => setQuittance('cv_au', event.target.value)} />{message('cv_au')}</label>
            </>}
            <label className="is-wide"><span>Observation</span><input value={quittance.observation} onChange={(event) => setQuittance('observation', event.target.value)} />{message('observation')}</label>
          </div>
        </>}
        {step === 5 && <>
          <label className="flt-check"><input type="checkbox" checked={form.withClaim} onChange={(event) => patch({ withClaim: event.target.checked })} /> Ce véhicule a un sinistre à déclarer</label>
          <p className="flt-hint">Un sinistre a besoin de la police enregistrée : son formulaire s’ouvrira après l’enregistrement de la police flotte, avec le véhicule et son client déjà remplis.</p>
        </>}
        {error && <p className="client-records-message is-error flt-error" role="alert">{error}</p>}
      </div>
      <footer><span>Étape {step} sur 5</span><div className="client-footer-actions">
        {step === 1 ? <button className="client-secondary-button" type="button" onClick={onClose}>Annuler</button> : <button className="client-secondary-button" type="button" onClick={back}>← Précédent</button>}
        <button className="client-primary-button" type="button" disabled={busy} onClick={next}>{step === 5 ? (draft ? 'Enregistrer' : 'Ajouter à la flotte') : 'Suivant →'}</button>
      </div></footer>
    </section>
  </div>, document.body);
}
