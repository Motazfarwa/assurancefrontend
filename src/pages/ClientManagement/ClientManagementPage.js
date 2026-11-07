import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_CLIENT, useClient } from '../../contexts/ClientContext';
import { useAuth } from '../../auth/AuthContext';
import { getClientByCode, getNextClientCode, saveClient } from '../../services/clientApi';
import ModuleModal from '../../components/ModuleModal/ModuleModal';
import PolicyForm from '../../components/ModuleModal/PolicyForm';
import FicheImportModal from '../../components/FicheImportModal/FicheImportModal';
import SinistreModal from '../../components/SinistreModal/SinistreModal';
import { INSURANCE_MODULES, MODULE_CATEGORIES } from '../../data/insuranceModules';
import ClientListModal from '../ClientListModal/ClientListModal';
import ClientListerModal from '../ClientListModal/ClientListerModal';
import { navigate } from '../../navigation';
import { showToast } from '../../services/toast';
import { CoordinatesFields, FieldErrors, IdentityFields } from './ClientFormFields';
import { clientStepErrors } from './clientValidation';
import './ClientManagementPage.css';

const CLIENT_ACTIONS = [
  { key: 'policy', label: 'Gestion police', module: INSURANCE_MODULES.find((item) => item.id === '110'), category: 'production' },
  { key: 'receipt', label: 'Gestion quittance', module: { id: '130', title: 'Gestion des quittances', description: 'Gerer les quittances du client.', form: 'receipt' }, category: 'production' },
  { key: 'claim', label: 'Gestion sinistre', module: INSURANCE_MODULES.find((item) => item.id === '620'), category: 'claims' },
];

export default function ClientManagementPage({ modal = false }) {
  const { client, setClient, clients, setClients } = useClient();
  const { accessToken } = useAuth();
  const [notice, setNotice] = useState('');
  const [triedSteps, setTriedSteps] = useState({}); // a step whose "Suivant" was clicked shows its input errors
  const [successToast, setSuccessToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [showClientList, setShowClientList] = useState(false);
  const [showLister, setShowLister] = useState(false); // "Lister": every client, filtered by nom / code, dates and type
  const [step, setStep] = useState(1);
  const [activeAction, setActiveAction] = useState(null);
  const [ficheFile, setFicheFile] = useState(null);
  const [policyPrefill, setPolicyPrefill] = useState(null);
  // New client = one flow: identity (1), coordinates (2), then policy and first receipt (3, shown as steps 3 and 4).
  const [policyStep, setPolicyStep] = useState(1);
  // Step 5 "Saisir sinistre" (step === 4), where the whole flow is stored: the police once stored, and whether its claim form is open.
  const policySaveRef = useRef(null);
  const fleetRetryRef = useRef(null);
  const [claimQueue, setClaimQueue] = useState([]); // the vehicles of a flotte with a claim to declare, one form after the other
  const [savedPolicy, setSavedPolicy] = useState(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const claimNumber = useRef('');
  const [prefillKey, setPrefillKey] = useState(0);
  const [flowStarted, setFlowStarted] = useState(false);
  const clientSavedRef = useRef(false);
  const createdHereRef = useRef(false); // the client was created by this flow (not an existing one being modified)
  const fileInputRef = useRef(null);
  const windowRef = useRef(null);

  // Modifying an existing client starts from the database, not from a copy kept in the browser: saving a stale copy
  // would write its old values back (once, when the screen opens; later edits are the user's).
  useEffect(() => {
    const code = String(client.clientCode || '').trim();
    if (!client._persisted || !code) return undefined;
    let active = true;
    getClientByCode(accessToken, code)
      .then((fresh) => { if (active) setClient((current) => (String(current.clientCode).trim() === code ? { ...fresh, _persisted: true } : current)); })
      .catch(() => { /* offline or deleted: keep what is shown */ });
    return () => { active = false; };
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new client gets the last client code + 1, shown read-only.
  useEffect(() => {
    if (client._persisted || client.clientCode) return undefined;
    let active = true;
    getNextClientCode(accessToken)
      .then((code) => { if (active) setClient((current) => (current._persisted || current.clientCode ? current : { ...current, clientCode: code })); })
      .catch(() => {});
    return () => { active = false; };
  }, [accessToken, client._persisted, client.clientCode, setClient]);

  // Typing a contact code (TClient.code_locuteur) fills the contact name from that client's record. Only on typing:
  // opening a client must never invent a link (TClient.code, a legacy value shared by many clients, is not one).
  const contactTypedRef = useRef(false);
  useEffect(() => {
    const code = String(client.relatedCode ?? '').trim();
    if (!code || !contactTypedRef.current) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const contact = await getClientByCode(accessToken, code);
        if (!active) return;
        const name = [contact.lastName, contact.firstName].filter(Boolean).join(' ') || contact.nom_client || '';
        setClient((current) => (String(current.relatedCode ?? '').trim() === code ? { ...current, relatedName: name } : current));
      } catch { /* unknown code: keep what was typed */ }
    }, 400);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accessToken, client.relatedCode, setClient]);

  useEffect(() => {
    if (!successToast) return undefined;
    showToast(successToast); // the app toast, with this page's message
    const timeout = window.setTimeout(() => {
      setSuccessToast('');
      navigate('/workspace');
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [successToast]);

  const newFlow = !client._persisted || flowStarted;
  // Modifier goes through the same four steps; it may also stop at Coordonnées and save only the client.
  const editingClient = Boolean(client._persisted) && !createdHereRef.current;
  const handlePolicyStep = useCallback((value) => setPolicyStep(value), []);

  // Runs just before the policy is stored: the client has to exist first.
  async function createClientBeforePolicy() {
    if (clientSavedRef.current) return;
    if (!client.clientCode.trim()) throw new Error('Le code client est obligatoire.');
    if (client.homePostalCode === '' || !Number.isInteger(Number(client.homePostalCode))) {
      throw new Error('Le code postal du domicile (étape Coordonnées) est obligatoire et doit être un nombre.');
    }
    setFlowStarted(true);
    if (!client._persisted) createdHereRef.current = true;
    const saved = await saveClient(accessToken, client, Boolean(client._persisted)); // Modifier: the changes are saved, the client is not created again
    const record = { ...saved, _persisted: true };
    clientSavedRef.current = true;
    setClient(record);
    setClients((current) => [...current.filter((item) => item.clientCode !== record.clientCode), record]);
  }

  // Last step: stores the client, its police and quittance. The claim form needs the stored police, so it opens afterwards.
  async function saveWholeFlow(withClaim) {
    setSaving(true);
    const result = await policySaveRef.current?.();
    setSaving(false);
    if (!result) { changeStep(3); return; } // the error is shown on the receipt form
    setSavedPolicy(result);
    if (result.fleetRefused?.length) return; // shown on this step, with "Réessayer"
    if (result.fleetClaims?.length) { setClaimQueue(result.fleetClaims); return; }
    if (withClaim) setClaimOpen(true);
    else finishFlow();
  }

  async function retryFleet() {
    setSaving(true);
    const { refused, claims, stored } = await fleetRetryRef.current();
    setSaving(false);
    setSavedPolicy((current) => ({ ...current, fleetRefused: refused, fleetCount: (current.fleetCount || 0) + stored, fleetClaims: claims }));
    if (claims.length) setClaimQueue(claims);
  }

  function finishFlow(numeroSinistre = '') {
    const done = editingClient ? 'Client modifié, police et quittance enregistrées' : 'Client, police et quittance enregistrés';
    setSuccessToast(`${done}${numeroSinistre ? `, sinistre N° ${numeroSinistre} créé` : ''} avec succès.`);
  }

  function changeStep(nextStep) {
    setStep(nextStep);
    windowRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // False, with the messages shown and the first wrong field focused, when the current step has an input error.
  function checkStep() {
    const count = Object.keys(clientStepErrors(client, step)).length;
    if (!count) return true;
    setTriedSteps((current) => ({ ...current, [step]: true }));
    setNotice(`Corrigez ${count > 1 ? `les ${count} champs signalés` : 'le champ signalé'} pour continuer.`);
    requestAnimationFrame(() => windowRef.current?.querySelector('.client-field-error')?.parentElement?.querySelector('input, select, textarea')?.focus());
    return false;
  }

  function goToNextStep() {
    if (step === 1 && !client.clientCode.trim()) {
      setNotice('Le code client est en cours de chargement : réessayez dans un instant.');
      return;
    }
    if (!checkStep()) return;
    setNotice('');
    changeStep(step + 1);
  }

  function updateField(name, value) {
    if (name === 'relatedCode') contactTypedRef.current = true;
    setClient((current) => ({ ...current, [name]: value }));
    setNotice('');
  }

  // A company has a single "raison sociale" (kept in the Nom field) and no first name.
  function changeClientType(value) {
    setClient((current) => ({ ...current, clientType: value, firstName: value === 'Societe' ? '' : current.firstName }));
    setNotice('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    // A new client is created at the end of the flow (with its policy and first receipt), never alone.
    if (newFlow || step === 1) { goToNextStep(); return; } // Modifier too goes through Coordonnées before saving
    if (!client.clientCode.trim()) { setNotice('Le code client est obligatoire.'); return; }
    if (!checkStep()) return;
    setSaving(true);
    setNotice('');
    try {
      const saved = await saveClient(accessToken, client, Boolean(client._persisted));
      const record = { ...saved, _persisted: true };
      setClient(record);
      setClients((current) => [...current.filter((item) => item.clientCode !== record.clientCode), record]);
      setNotice('');
      setSuccessToast(client._persisted ? 'Modifications enregistrées avec succès.' : 'Client ajouté avec succès.');
    } catch (error) {
      setNotice(error.message || 'Une erreur est survenue pendant l’enregistrement.');
    } finally {
      setSaving(false);
    }
  }
  // Picking a suggestion only fills Nom and Prénom; the code and every other field stay as they are.
  // Confirmed OCR values: the client part fills this form, the police / quittance part is kept for Gestion police.
  function applyFiche({ client: clientPatch, policy }) {
    setClient((current) => ({ ...current, ...clientPatch }));
    setPolicyPrefill(Object.keys(policy).length ? policy : null);
    setPrefillKey((current) => current + 1);
    setFicheFile(null);
    setNotice(`Contrat importé : ${Object.keys(clientPatch).length} champ(s) client remplis${Object.keys(policy).length ? `, ${Object.keys(policy).length} champ(s) police / quittance prêts dans « Gestion police »` : ''}.`);
  }

  function pickExistingClient(record) {
    let lastName = record.lastName || '';
    let firstName = record.firstName || '';
    if (!lastName && !firstName) {
      const [first = '', ...others] = String(record.nom_client || '').trim().split(/\s+/);
      lastName = first;
      firstName = others.join(' ');
    }
    setClient((current) => ({ ...current, lastName, firstName }));
    setNotice('');
  }

  function startNewClient() {
    setClient({ ...EMPTY_CLIENT, createdAt: new Date().toISOString().slice(0, 10) });
    setStep(1);
    setNotice('Nouvelle fiche client prête à être renseignée.');
    setSuccessToast('');
  }

  const clientDisplayName = [client.lastName, client.firstName].filter(Boolean).join(' ') || 'Nom non renseigné';

  return (
    <main className={`client-page${modal ? ' client-page-modal' : ''}`}>
      <section ref={windowRef} className={`client-window${modal ? ' client-window-modal' : ''}`}>
        <header className="client-page-header"><a className="client-page-brand" href="/workspace"><span className="client-brand-mark">A</span><span>GESTION ASSURANCES<small>Assurance Jemmali · Siege</small></span></a><div className="client-page-heading"><span>PRODUCTION · MODULE 100</span><h1>Gestion des clients</h1></div><button type="button" className="client-close-button" onClick={() => navigate('/workspace')} aria-label="Fermer">×</button></header>
        <nav className="client-view-tabs" aria-label="Vue du dossier client"><button type="button" onClick={() => setShowClientList(true)}><span aria-hidden="true">◉</span> Rechercher</button><button type="button" className="is-current" aria-current="page"><span aria-hidden="true">✎</span> Modifier</button><button type="button" onClick={() => setShowLister(true)}><span aria-hidden="true">☰</span> Lister</button></nav>
        <div className="client-action-bar" role="group" aria-label="Gestion du client">
          <button type="button" className="client-action-button client-import-button" onClick={() => fileInputRef.current?.click()} title="Importer un contrat scanné (français ou arabe) et remplir les champs">⬆ Importer un contrat</button>
          <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) setFicheFile(file); }} />
          <span>Gérer pour ce client</span>
          {CLIENT_ACTIONS.map((action) => <button key={action.key} type="button" className="client-action-button" disabled={!client.clientCode} title={client.clientCode ? `Code client ${client.clientCode}` : 'Code client en cours de chargement…'} onClick={() => setActiveAction(action)}>{action.label}</button>)}
        </div>
        <div className="client-form-progress" aria-label={`Étape ${step === 4 ? 5 : step === 3 ? 2 + policyStep : step} sur 5`}><div className={step === 1 ? 'is-active' : 'is-complete'}><span>1</span><strong>Identité du client</strong></div><i /><div className={step === 2 ? 'is-active' : step > 2 ? 'is-complete' : ''}><span>2</span><strong>Coordonnées</strong></div><><i /><div className={step === 3 && policyStep === 1 ? 'is-active' : step >= 3 ? 'is-complete' : ''}><span>3</span><strong>Saisir police</strong></div><i /><div className={step === 3 && policyStep === 2 ? 'is-active' : step === 4 ? 'is-complete' : ''}><span>4</span><strong>Saisir quittance</strong></div><i /><div className={step === 4 ? 'is-active' : ''}><span>5</span><strong>Saisir sinistre</strong></div></></div>
        <div className="client-current-summary" aria-live="polite"><div><span>Code client</span><strong>{client.clientCode || '—'}</strong></div><i /><div><span>Nom du client</span><strong>{clientDisplayName}</strong></div></div>
        {step <= 2 && <FieldErrors.Provider value={triedSteps[step] ? clientStepErrors(client, step) : {}}><form noValidate className={`client-record-form${step === 2 ? ' client-record-form-step-two' : ''}`} onSubmit={handleSubmit}>
          {step === 1 && <IdentityFields client={client} updateField={updateField} changeClientType={changeClientType} accessToken={accessToken} pickExistingClient={pickExistingClient} />}
          {step === 2 && <CoordinatesFields client={client} updateField={updateField} />}
          {notice && <p className="client-save-notice" role="status">{notice}</p>}
          {/* Distinct keys: React must not turn the clicked "Suivant" into the step-2 submit button (that submitted the form on the same click). */}
          <div className="client-form-actions">{step === 1 ? <><button key="close" type="button" className="client-secondary-button" onClick={() => navigate('/workspace')}>Fermer</button><button key="next" type="button" className="client-primary-button" onClick={goToNextStep}>Suivant →</button></> : <><button key="back" type="button" className="client-secondary-button" onClick={() => changeStep(1)}>← Précédent</button>{!newFlow && <button key="save" type="submit" className="client-secondary-button" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer les modifications'}</button>}<button key="next-policy" type="button" className="client-primary-button" onClick={goToNextStep} disabled={saving}>Suivant : police →</button></>}</div>
        </form></FieldErrors.Provider>}
        {client.clientCode && (
          <div className={`policy-modal-expanded client-policy-embedded${step === 3 ? '' : ' is-hidden'}`}>
            <PolicyForm
              key={prefillKey}
              embedded
              clientCode={client.clientCode}
              prefill={policyPrefill}
              onStepChange={handlePolicyStep}
              onClose={() => changeStep(2)}
              beforeSave={createClientBeforePolicy}
              saveRef={policySaveRef}
              fleetRetryRef={fleetRetryRef}
              onReceiptReady={() => changeStep(4)}
              finalLabel="Suivant : sinistre →"
              clientName={clientDisplayName}
            />
          </div>
        )}
        {step === 4 && <div className="client-claim-step">
          <h3>Saisir sinistre</h3>
          {savedPolicy ? <>
            <p>Police <b>{savedPolicy.num_police || savedPolicy.num_int || '—'}</b>{savedPolicy.num_quittance ? <> et quittance <b>{savedPolicy.num_quittance}</b></> : null} enregistrées pour le client <b>{client.clientCode}</b>{savedPolicy.fleetCount ? <>, avec <b>{savedPolicy.fleetCount}</b> police(s) fictive(s)</> : null}.</p>
            {savedPolicy.fleetRefused?.length > 0 && <p className="client-save-notice" role="alert">Polices fictives non enregistrées : {savedPolicy.fleetRefused.map((item) => `${item.num_imat} (${item.message})`).join(', ')}. <button type="button" className="client-secondary-button" disabled={saving} onClick={retryFleet}>{saving ? 'Enregistrement…' : 'Réessayer'}</button></p>}
            <p>Le client a-t-il un sinistre à déclarer sur cette police ? Le formulaire s’ouvre avec la police, le client et la compagnie déjà remplis.</p>
            <div className="client-form-actions">
              <button type="button" className="client-secondary-button" onClick={() => finishFlow()}>Terminer sans sinistre</button>
              <button type="button" className="client-primary-button" onClick={() => setClaimOpen(true)}>Saisir le sinistre →</button>
            </div>
          </> : <>
            <p>Dernière étape : le client <b>{client.clientCode}</b>, sa police et sa quittance ne sont pas encore enregistrés.</p>
            <p>Le client a-t-il un sinistre à déclarer sur cette police ? Après l’enregistrement, le formulaire s’ouvre avec la police, le client et la compagnie déjà remplis.</p>
            <div className="client-form-actions">
              <button type="button" className="client-secondary-button" disabled={saving} onClick={() => changeStep(3)}>← Précédent</button>
              <button type="button" className="client-secondary-button" disabled={saving} onClick={() => saveWholeFlow(false)}>{saving ? 'Enregistrement…' : 'Enregistrer sans sinistre'}</button>
              <button type="button" className="client-primary-button" disabled={saving} onClick={() => saveWholeFlow(true)}>{saving ? 'Enregistrement…' : 'Enregistrer et saisir le sinistre →'}</button>
            </div>
          </>}
        </div>}
      </section>
      {claimQueue[0] && <SinistreModal key={claimQueue[0].num_imat} mode="new" moduleId="620" clientCode={claimQueue[0].code_client} policyNumber={savedPolicy?.num_int || savedPolicy?.num_police || ''} vehicle={claimQueue[0]}
        onClose={() => setClaimQueue((current) => current.slice(1))} />}
      {claimOpen && <SinistreModal mode="new" moduleId="620" clientCode={client.clientCode} policyNumber={savedPolicy?.num_int || savedPolicy?.num_police || ''}
        onSaved={(numero) => { claimNumber.current = numero; }}
        onClose={() => { setClaimOpen(false); if (claimNumber.current) finishFlow(claimNumber.current); }} />}
      {/* Gestion sinistre: the claims module, its list on the client's claims */}
      {activeAction?.key === 'claim' && <SinistreModal moduleId={activeAction.module.id} clientCode={client.clientCode} onClose={() => setActiveAction(null)} />}
      {activeAction && activeAction.key !== 'claim' && <ModuleModal module={activeAction.module} category={MODULE_CATEGORIES.find((item) => item.id === activeAction.category)} clientCode={client.clientCode} prefill={policyPrefill} onClose={() => setActiveAction(null)} />}
      {ficheFile && <FicheImportModal file={ficheFile} accessToken={accessToken} onClose={() => setFicheFile(null)} onApply={applyFiche} />}
      {showLister && <ClientListerModal accessToken={accessToken} onClose={() => setShowLister(false)} onView={(record) => { setShowLister(false); setClient({ ...record, _persisted: true }); navigate('/clients/preview'); }} />}
      {showClientList && <ClientListModal accessToken={accessToken} localClients={clients} onClose={() => setShowClientList(false)} onView={(record) => { setClient({ ...record, _persisted: true }); navigate('/clients/preview'); }} />}
    </main>
  );
}

