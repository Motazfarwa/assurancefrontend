import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_CLIENT, useClient } from '../../contexts/ClientContext';
import { useAuth } from '../../auth/AuthContext';
import { getClientByCode, getNextClientCode, saveClient, searchClients } from '../../services/clientApi';
import ModuleModal from '../../components/ModuleModal/ModuleModal';
import PolicyForm from '../../components/ModuleModal/PolicyForm';
import FicheImportModal from '../../components/FicheImportModal/FicheImportModal';
import { INSURANCE_MODULES, MODULE_CATEGORIES } from '../../data/insuranceModules';
import ClientListModal from '../ClientListModal/ClientListModal';
import UnpaidClientsModal from '../../components/UnpaidClientsModal/UnpaidClientsModal';
import { navigate } from '../../navigation';
import './ClientManagementPage.css';

function ClientField({ client, onChange, name, label, type = 'text', options, wide = false, required = false, maxLength, disabled = false, readOnly = false }) {
  const className = `client-field${wide ? ' client-field-wide' : ''}${readOnly ? ' client-field-readonly' : ''}`;
  return <label className={className}><span>{label}</span>{type === 'select' ? <select required={required} disabled={disabled} value={client[name]} onChange={(event) => onChange(name, event.target.value)}><option value="">Selectionner</option>{options.map((option) => <option key={option}>{option}</option>)}</select> : <input required={required} disabled={disabled} readOnly={readOnly} maxLength={maxLength} type={type} value={client[name] || ''} onChange={(event) => onChange(name, event.target.value)} />}</label>;
}

// Nom / Prénom input that looks for existing clients while typing, to avoid creating duplicates.
function NameAutocomplete({ client, onChange, name, label, accessToken, onPick }) {
  const [matches, setMatches] = useState([]);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const text = String(client[name] || '').trim();
  const checkable = !client._persisted && text.length >= 2;

  useEffect(() => {
    if (!checkable) { setMatches([]); setChecked(false); return undefined; }
    let active = true;
    setChecked(false);
    const timer = window.setTimeout(async () => {
      try {
        const found = await searchClients(accessToken, text, 20);
        const lower = text.toLowerCase();
        if (active) {
          setMatches(found.filter((item) => String(item[name] || '').toLowerCase().includes(lower)).slice(0, 8));
          setChecked(true);
        }
      } catch {
        if (active) { setMatches([]); setChecked(false); }
      }
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accessToken, checkable, name, text]);

  return <div className="client-field client-autocomplete">
    <label><span>{label}</span><input type="text" autoComplete="off" value={client[name] || ''} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)} onChange={(event) => { onChange(name, event.target.value); setOpen(true); }} /></label>
    {checkable && checked && <small className={matches.length ? 'client-autocomplete-warn' : 'client-autocomplete-ok'}>{matches.length ? `${matches.length} client(s) existant(s) — vérifiez avant de créer` : '✓ Aucun client existant'}</small>}
    {open && checkable && matches.length > 0 && <ul className="client-autocomplete-list" role="listbox">{matches.map((item) => <li key={item.clientCode}><button type="button" role="option" onMouseDown={(event) => { event.preventDefault(); onPick(item); setOpen(false); }}><strong>{[item.lastName, item.firstName].filter(Boolean).join(' ') || item.nom_client}</strong><span>Code {item.clientCode}</span></button></li>)}</ul>}
  </div>;
}

function FormSection({ title, children, className = '' }) {
  return <fieldset className={`client-section ${className}`}><legend>{title}</legend><div className="client-fields">{children}</div></fieldset>;
}

function ContactFields({ client, onChange, kind }) {
  const [activeLabel, setActiveLabel] = useState('');
  const phoneKey = `${kind}Phones`;
  const emailKey = `${kind}Emails`;
  function updateContact(key, index, property, value) {
    const contacts = [...(client[key] || [])];
    contacts[index] = { ...(contacts[index] || {}), [property]: value };
    onChange(key, contacts);
  }
  function renderContacts(key, count, label, type) {
    return Array.from({ length: count }, (_, index) => {
      const id = `${key}-${index}`;
      const contact = client[key]?.[index] || {};
      return <div className="client-contact-entry" key={id}>
        <label className="client-field"><span>{contact.label?.trim() || `${label} ${index + 1}`}</span><input type={type} value={contact.value || ''} onFocus={() => setActiveLabel(id)} onChange={(event) => updateContact(key, index, 'value', event.target.value)} /></label>
        {activeLabel === id && <label className="client-field client-contact-label"><span>Libellé</span><input type="text" maxLength={50} value={contact.label || ''} onChange={(event) => updateContact(key, index, 'label', event.target.value)} onBlur={() => setActiveLabel('')} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); setActiveLabel(''); } }} placeholder={`Libellé ${label.toLowerCase()} ${index + 1}`} /><button type="button" onClick={() => setActiveLabel('')} aria-label="Masquer le libellé">×</button></label>}
      </div>;
    });
  }
  return <div className="client-contact-fields client-field-wide">
    <div className="client-contact-group"><strong>Téléphones</strong><div>{renderContacts(phoneKey, 4, 'Téléphone', 'tel')}</div></div>
    <div className="client-contact-group"><strong>Emails</strong><div>{renderContacts(emailKey, 3, 'Email', 'email')}</div></div>
  </div>;
}

const CLIENT_ACTIONS = [
  { key: 'policy', label: 'Gestion police', module: INSURANCE_MODULES.find((item) => item.id === '110'), category: 'production' },
  { key: 'receipt', label: 'Gestion quittance', module: { id: '130', title: 'Gestion des quittances', description: 'Gerer les quittances du client.', form: 'receipt' }, category: 'production' },
  { key: 'claim', label: 'Gestion sinistre', module: INSURANCE_MODULES.find((item) => item.id === '620'), category: 'claims' },
];

export default function ClientManagementPage({ modal = false }) {
  const { client, setClient, clients, setClients } = useClient();
  const { accessToken } = useAuth();
  const [notice, setNotice] = useState('');
  const [successToast, setSuccessToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [showClientList, setShowClientList] = useState(false);
  const [showUnpaidClients, setShowUnpaidClients] = useState(false);
  const [step, setStep] = useState(1);
  const [activeAction, setActiveAction] = useState(null);
  const [ficheFile, setFicheFile] = useState(null);
  const [policyPrefill, setPolicyPrefill] = useState(null);
  // New client = one flow: identity (1), coordinates (2), then policy and first receipt (3, shown as steps 3 and 4).
  const [policyStep, setPolicyStep] = useState(1);
  const [jump, setJump] = useState(null);
  const [prefillKey, setPrefillKey] = useState(0);
  const [flowStarted, setFlowStarted] = useState(false);
  const clientSavedRef = useRef(false);
  const fileInputRef = useRef(null);
  const windowRef = useRef(null);

  // A new client gets the last client code + 1, shown read-only.
  useEffect(() => {
    if (client._persisted || client.clientCode) return undefined;
    let active = true;
    getNextClientCode(accessToken)
      .then((code) => { if (active) setClient((current) => (current._persisted || current.clientCode ? current : { ...current, clientCode: code })); })
      .catch(() => {});
    return () => { active = false; };
  }, [accessToken, client._persisted, client.clientCode, setClient]);

  // Typing a contact code fills the contact name and quérabilité from that client's record.
  useEffect(() => {
    const code = String(client.referenceCode ?? '').trim();
    if (!code) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const contact = await getClientByCode(accessToken, code);
        if (!active) return;
        const name = [contact.lastName, contact.firstName].filter(Boolean).join(' ') || contact.nom_client || '';
        setClient((current) => (String(current.referenceCode ?? '').trim() === code ? { ...current, relatedCode: code, relatedName: name, relationship: contact.title || contact.relationship || '' } : current));
      } catch { /* unknown code: keep what was typed */ }
    }, 400);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accessToken, client.referenceCode, setClient]);

  useEffect(() => {
    if (!successToast) return undefined;
    const timeout = window.setTimeout(() => {
      setSuccessToast('');
      navigate('/workspace');
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [successToast]);

  const newFlow = !client._persisted || flowStarted;
  const handlePolicyStep = useCallback((value) => setPolicyStep(value), []);

  function openAction(action) {
    if (newFlow && action.key === 'policy') { changeStep(3); setJump({ to: 1, at: Date.now() }); return; }
    if (newFlow && action.key === 'receipt') { changeStep(3); setJump({ to: 2, at: Date.now() }); return; }
    setActiveAction(action);
  }

  // Runs just before the policy is stored: the client has to exist first.
  async function createClientBeforePolicy() {
    if (clientSavedRef.current) return;
    if (!client.clientCode.trim()) throw new Error('Le code client est obligatoire.');
    if (client.homePostalCode === '' || !Number.isInteger(Number(client.homePostalCode))) {
      throw new Error('Le code postal du domicile (étape Coordonnées) est obligatoire et doit être un nombre.');
    }
    setFlowStarted(true);
    const saved = await saveClient(accessToken, client, false);
    const record = { ...saved, _persisted: true };
    clientSavedRef.current = true;
    setClient(record);
    setClients((current) => [...current.filter((item) => item.clientCode !== record.clientCode), record]);
  }

  function handlePolicySaved() {
    setSuccessToast('Client, police et quittance enregistrés avec succès.');
  }

  function changeStep(nextStep) {
    setStep(nextStep);
    windowRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goToNextStep() {
    if (step === 1 && !client.clientCode.trim()) {
      setNotice('Renseignez le code client et la date de création pour continuer.');
      return;
    }
    if (step === 2 && (client.homePostalCode === '' || !Number.isInteger(Number(client.homePostalCode)))) {
      setNotice('Le code postal du domicile est obligatoire et doit être un nombre.');
      return;
    }
    setNotice('');
    changeStep(step + 1);
  }

  function updateField(name, value) {
    setClient((current) => ({ ...current, [name]: value }));
    setNotice('');
  }

  // A company has a single "raison sociale" (kept in the Nom field) and no first name.
  function changeClientType(value) {
    setClient((current) => ({ ...current, clientType: value, firstName: value === 'Societe' ? '' : current.firstName }));
    setNotice('');
  }
  const isCompany = client.clientType === 'Societe';

  async function handleSubmit(event) {
    event.preventDefault();
    // A new client is created at the end of the flow (with its policy and first receipt), never alone.
    if (newFlow) { goToNextStep(); return; }
    if (!client.clientCode.trim()) { setNotice('Le code client est obligatoire.'); return; }
    if (client.homePostalCode === '' || !Number.isInteger(Number(client.homePostalCode))) { setNotice('Le code postal du domicile est obligatoire et doit être un nombre.'); return; }
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
    setNotice(`Fiche importée : ${Object.keys(clientPatch).length} champ(s) client remplis${Object.keys(policy).length ? `, ${Object.keys(policy).length} champ(s) police / quittance prêts dans « Gestion police »` : ''}.`);
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
      {successToast && <div className="client-success-toast" role="status"><span aria-hidden="true">✓</span>{successToast}</div>}
      <section ref={windowRef} className={`client-window${modal ? ' client-window-modal' : ''}`}>
        <header className="client-page-header"><a className="client-page-brand" href="/workspace"><span className="client-brand-mark">A</span><span>GESTION ASSURANCES<small>Assurance Jemmali · Siege</small></span></a><div className="client-page-heading"><span>PRODUCTION · MODULE 100</span><h1>Gestion des clients</h1></div><button type="button" className="client-close-button" onClick={() => navigate('/workspace')} aria-label="Fermer">×</button></header>
        <nav className="client-view-tabs" aria-label="Vue du dossier client"><button type="button" onClick={() => setShowClientList(true)}><span aria-hidden="true">◉</span> Rechercher</button><button type="button" className="is-current" aria-current="page"><span aria-hidden="true">✎</span> Modifier</button><button type="button" className="client-new-button" onClick={() => setShowUnpaidClients(true)}><span aria-hidden="true">◎</span> Visualiser</button></nav>
        <div className="client-action-bar" role="group" aria-label="Gestion du client">
          <button type="button" className="client-action-button client-import-button" onClick={() => fileInputRef.current?.click()} title="Importer une fiche scannée (français ou arabe) et remplir les champs">⬆ Importer une fiche</button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) setFicheFile(file); }} />
          <span>Gérer pour ce client</span>
          {CLIENT_ACTIONS.map((action) => <button key={action.key} type="button" className="client-action-button" disabled={!client.clientCode} title={client.clientCode ? `Code client ${client.clientCode}` : 'Code client en cours de chargement…'} onClick={() => openAction(action)}>{action.label}</button>)}
        </div>
        <div className="client-form-progress" aria-label={`Étape ${step === 3 ? 2 + policyStep : step} sur ${newFlow ? 4 : 2}`}><div className={step === 1 ? 'is-active' : 'is-complete'}><span>1</span><strong>Identité du client</strong></div><i /><div className={step === 2 ? 'is-active' : step > 2 ? 'is-complete' : ''}><span>2</span><strong>Coordonnées</strong></div>{newFlow && <><i /><div className={step === 3 && policyStep === 1 ? 'is-active' : step === 3 ? 'is-complete' : ''}><span>3</span><strong>Saisir police</strong></div><i /><div className={step === 3 && policyStep === 2 ? 'is-active' : ''}><span>4</span><strong>Saisir quittance</strong></div></>}</div>
        <div className="client-current-summary" aria-live="polite"><div><span>Code client</span><strong>{client.clientCode || '—'}</strong></div><i /><div><span>Nom du client</span><strong>{clientDisplayName}</strong></div></div>
        {step <= 2 && <form className={`client-record-form${step === 2 ? ' client-record-form-step-two' : ''}`} onSubmit={handleSubmit}>
          {step === 1 && <>
          <div className="client-record-options client-step-full client-type-row"><fieldset><legend>Type client</legend>{['Particulier', 'Societe'].map((value) => <label key={value}><input type="radio" name="clientType" checked={client.clientType === value} onChange={() => changeClientType(value)} />{value === 'Societe' ? 'Société' : value}</label>)}<label><input type="checkbox" checked={client.taxExempt} onChange={(event) => updateField('taxExempt', event.target.checked)} />Exonéré</label></fieldset></div>
          <FormSection title="Client" className="client-section-primary">
            <ClientField client={client} onChange={updateField} name="clientCode" label="Code client" required maxLength={8} readOnly />
            {isCompany
              ? <NameAutocomplete client={client} onChange={updateField} name="lastName" label="Raison sociale" accessToken={accessToken} onPick={pickExistingClient} />
              : <>
                <NameAutocomplete client={client} onChange={updateField} name="lastName" label="Nom" accessToken={accessToken} onPick={pickExistingClient} />
                <NameAutocomplete client={client} onChange={updateField} name="firstName" label="Prenom" accessToken={accessToken} onPick={pickExistingClient} />
              </>}
            <ClientField client={client} onChange={updateField} name="nationality" label="Nationalite" type="select" options={['Tunisienne', 'Italienne', 'Autre']} />
            {client.nationality === 'Autre' && <ClientField client={client} onChange={updateField} name="nationalityOther" label="Precisez la nationalite" />}
            <ClientField client={client} onChange={updateField} name="country" label="Pays" />
            <ClientField client={client} onChange={updateField} name="birthDate" label="Date de naissance" type="date" />
            <ClientField client={client} onChange={updateField} name="birthPlace" label="Lieu de naissance" />
            <ClientField client={client} onChange={updateField} name="profession" label={isCompany ? 'Secteur' : 'Profession'} />
            {!isCompany && <ClientField client={client} onChange={updateField} name="civilStatus" label="Situation familiale" type="select" options={['Celibataire', 'Marie(e)', 'Divorce(e)', 'Veuf / Veuve']} />}
            <ClientField client={client} onChange={updateField} name="title" label="Titre" type="select" options={['M.', 'Mme', 'Mlle', 'Soc.']} />
            <ClientField client={client} onChange={updateField} name="identityNumber" label={isCompany ? 'Matricule fiscale' : 'N° C.I.N.'} />
            {!isCompany && <>
              <ClientField client={client} onChange={updateField} name="identityDate" label="Date C.I.N." type="date" />
              <ClientField client={client} onChange={updateField} name="identityPlace" label="Lieu C.I.N." />
              <ClientField client={client} onChange={updateField} name="licenseNumber" label="N° permis" />
              <ClientField client={client} onChange={updateField} name="licenseDate" label="Date permis" type="date" />
              <ClientField client={client} onChange={updateField} name="licensePlace" label="Lieu permis" />
            </>}
          </FormSection>
          <FormSection title="Lien" className="client-link-section">
            <ClientField client={client} onChange={updateField} name="referenceCode" label="Code de contact" type="number" />
            <ClientField client={client} onChange={updateField} name="relatedName" label="Nom du contact" />
            <ClientField client={client} onChange={updateField} name="relationship" label="Quérabilité" />
          </FormSection>
          </>}
          {step === 2 && <>
          <FormSection title="Domicile">
            <ClientField client={client} onChange={updateField} name="homeAddress" label="Adresse" wide />
            <ClientField client={client} onChange={updateField} name="homeCity" label="Ville" />
            <ClientField client={client} onChange={updateField} name="homePostalCode" label="Code postal" type="number" required />
            <ClientField client={client} onChange={updateField} name="homeFax" label="Fax" type="tel" />
            <ContactFields client={client} onChange={updateField} kind="home" />
          </FormSection>

          <FormSection title="Bureau">
            <ClientField client={client} onChange={updateField} name="officeAddress" label="Adresse" wide />
            <ClientField client={client} onChange={updateField} name="officeCity" label="Ville" />
            <ClientField client={client} onChange={updateField} name="officePostalCode" label="Code postal" />
            <ClientField client={client} onChange={updateField} name="officeFax" label="Fax" type="tel" />
            <ContactFields client={client} onChange={updateField} kind="office" />
          </FormSection>
          </>}
          {step === 2 && <FormSection title="Observation" className="client-observation-section client-step-full"><label className="client-field client-field-wide"><span>Remarques sur le client</span><textarea rows={4} maxLength={500} value={client.notes || ''} placeholder="Saisir une observation (facultatif)" onChange={(event) => updateField('notes', event.target.value)} /><small className="client-observation-count">{(client.notes || '').length} / 500</small></label></FormSection>}
          {step === 2 && <div className="client-record-options client-step-full"><fieldset><legend>Adresse de correspondance</legend>{['Bureau', 'Domicile'].map((value) => <label key={value}><input type="radio" name="correspondence" checked={client.correspondence === value} onChange={() => updateField('correspondence', value)} />{value}</label>)}</fieldset></div>}
          {notice && <p className="client-save-notice" role="status">{notice}</p>}
          <div className="client-form-actions">{step === 1 ? <><button type="button" className="client-secondary-button" onClick={() => navigate('/workspace')}>Fermer</button><button type="button" className="client-primary-button" onClick={goToNextStep}>Suivant →</button></> : <><button type="button" className="client-secondary-button" onClick={() => changeStep(1)}>← Précédent</button>{newFlow ? <button type="button" className="client-primary-button" onClick={goToNextStep}>Suivant : police →</button> : <button type="submit" className="client-primary-button" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer les modifications'}</button>}</>}</div>
        </form>}
        {newFlow && client.clientCode && (
          <div className={`policy-modal-expanded client-policy-embedded${step === 3 ? '' : ' is-hidden'}`}>
            <PolicyForm
              key={prefillKey}
              embedded
              clientCode={client.clientCode}
              prefill={policyPrefill}
              onStepChange={handlePolicyStep}
              onClose={() => changeStep(2)}
              beforeSave={createClientBeforePolicy}
              onSaved={handlePolicySaved}
              finalLabel="Créer le client"
              jump={jump}
            />
          </div>
        )}
        <footer className="client-payment-footer"><div className="payment-method"><img src="/logos/attijari.svg" alt="Attijari Bank" /><strong>Virement &agrave; Attijari</strong></div><div className="payment-method"><strong>En esp&egrave;ces &agrave;</strong><img src="/logos/stb.svg" alt="STB Bank" /></div></footer>
      </section>
      {activeAction && <ModuleModal module={activeAction.module} category={MODULE_CATEGORIES.find((item) => item.id === activeAction.category)} clientCode={client.clientCode} prefill={policyPrefill} onClose={() => setActiveAction(null)} />}
      {ficheFile && <FicheImportModal file={ficheFile} accessToken={accessToken} onClose={() => setFicheFile(null)} onApply={applyFiche} />}
      {showUnpaidClients &&<UnpaidClientsModal accessToken={accessToken} onClose={() => setShowUnpaidClients(false)} />}
      {showClientList && <ClientListModal accessToken={accessToken} localClients={clients} onClose={() => setShowClientList(false)} onView={(record) => { setClient({ ...record, _persisted: true }); navigate('/clients/preview'); }} />}
    </main>
  );
}

