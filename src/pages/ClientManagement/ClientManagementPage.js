import { useEffect, useRef, useState } from 'react';
import { EMPTY_CLIENT, useClient } from '../../contexts/ClientContext';
import { useAuth } from '../../auth/AuthContext';
import { saveClient } from '../../services/clientApi';
import ClientListModal from '../ClientListModal/ClientListModal';
import UnpaidClientsModal from '../../components/UnpaidClientsModal/UnpaidClientsModal';
import { navigate } from '../../navigation';
import './ClientManagementPage.css';

function ClientField({ client, onChange, name, label, type = 'text', options, wide = false, required = false, maxLength, disabled = false }) {
  const className = `client-field${wide ? ' client-field-wide' : ''}`;
  return <label className={className}><span>{label}</span>{type === 'select' ? <select required={required} disabled={disabled} value={client[name]} onChange={(event) => onChange(name, event.target.value)}><option value="">Selectionner</option>{options.map((option) => <option key={option}>{option}</option>)}</select> : <input required={required} disabled={disabled} maxLength={maxLength} type={type} value={client[name] || ''} onChange={(event) => onChange(name, event.target.value)} />}</label>;
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
        <label className="client-field"><span>{label} {index + 1}</span><input type={type} value={contact.value || ''} onFocus={() => setActiveLabel(id)} onChange={(event) => updateContact(key, index, 'value', event.target.value)} /></label>
        {activeLabel === id && <label className="client-field client-contact-label"><span>Libellé</span><input type="text" maxLength={50} value={contact.label || ''} onChange={(event) => updateContact(key, index, 'label', event.target.value)} placeholder={`Libellé ${label.toLowerCase()} ${index + 1}`} /><button type="button" onClick={() => setActiveLabel('')} aria-label="Masquer le libellé">×</button></label>}
      </div>;
    });
  }
  return <div className="client-contact-fields client-field-wide">
    <div className="client-contact-group"><strong>Téléphones</strong><div>{renderContacts(phoneKey, 4, 'Téléphone', 'tel')}</div></div>
    <div className="client-contact-group"><strong>Emails</strong><div>{renderContacts(emailKey, 3, 'Email', 'email')}</div></div>
  </div>;
}

export default function ClientManagementPage({ modal = false }) {
  const { client, setClient, clients, setClients } = useClient();
  const { accessToken } = useAuth();
  const [notice, setNotice] = useState('');
  const [successToast, setSuccessToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [showClientList, setShowClientList] = useState(false);
  const [showUnpaidClients, setShowUnpaidClients] = useState(false);
  const [step, setStep] = useState(1);
  const windowRef = useRef(null);

  useEffect(() => {
    if (!successToast) return undefined;
    const timeout = window.setTimeout(() => {
      setSuccessToast('');
      navigate('/workspace');
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [successToast]);

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

  async function handleSubmit(event) {
    event.preventDefault();
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
        <nav className="client-view-tabs" aria-label="Vue du dossier client"><button type="button" onClick={() => setShowClientList(true)}><span aria-hidden="true">◉</span> Aper&ccedil;u</button><button type="button" className="is-current" aria-current="page"><span aria-hidden="true">✎</span> Modifier</button><button type="button" className="client-new-button" onClick={() => setShowUnpaidClients(true)}><span aria-hidden="true">◎</span> Visualiser</button></nav>
        <div className="client-form-progress" aria-label={`Étape ${step} sur 2`}><div className={step === 1 ? 'is-active' : 'is-complete'}><span>1</span><strong>Identité du client</strong></div><i /><div className={step === 2 ? 'is-active' : ''}><span>2</span><strong>Coordonnées</strong></div></div>
        <div className="client-current-summary" aria-live="polite"><div><span>Code client</span><strong>{client.clientCode || '—'}</strong></div><i /><div><span>Nom du client</span><strong>{clientDisplayName}</strong></div></div>
        <form className={`client-record-form${step === 2 ? ' client-record-form-step-two' : ''}`} onSubmit={handleSubmit}>
          {step === 1 && <>
          <FormSection title="Client" className="client-section-primary">
            <ClientField client={client} onChange={updateField} name="clientCode" label="Code client" required maxLength={8} />
            <ClientField client={client} onChange={updateField} name="lastName" label="Nom" />
            <ClientField client={client} onChange={updateField} name="firstName" label="Prenom" />
            <ClientField client={client} onChange={updateField} name="nationality" label="Nationalite" type="select" options={['Tunisienne', 'Italienne', 'Autre']} />
            {client.nationality === 'Autre' && <ClientField client={client} onChange={updateField} name="nationalityOther" label="Precisez la nationalite" />}
            <ClientField client={client} onChange={updateField} name="country" label="Pays" />
            <ClientField client={client} onChange={updateField} name="birthDate" label="Date de naissance" type="date" />
            <ClientField client={client} onChange={updateField} name="birthPlace" label="Lieu de naissance" />
            <ClientField client={client} onChange={updateField} name="profession" label="Profession" />
            <ClientField client={client} onChange={updateField} name="civilStatus" label="Situation familiale" type="select" options={['Celibataire', 'Marie(e)', 'Divorce(e)', 'Veuf / Veuve']} />
            <ClientField client={client} onChange={updateField} name="title" label="Titre" type="select" options={['M.', 'Mme', 'Mlle', 'Soc.']} />
            <ClientField client={client} onChange={updateField} name="identityNumber" label="N° C.I.N." />
            <ClientField client={client} onChange={updateField} name="identityDate" label="Date C.I.N." type="date" />
            <ClientField client={client} onChange={updateField} name="identityPlace" label="Lieu C.I.N." />
            <ClientField client={client} onChange={updateField} name="licenseNumber" label="N° permis" />
            <ClientField client={client} onChange={updateField} name="licenseDate" label="Date permis" type="date" />
            <ClientField client={client} onChange={updateField} name="licensePlace" label="Lieu permis" />
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
          {step === 2 && <div className="client-record-options client-step-full"><fieldset><legend>Adresse de correspondance</legend>{['Bureau', 'Domicile'].map((value) => <label key={value}><input type="radio" name="correspondence" checked={client.correspondence === value} onChange={() => updateField('correspondence', value)} />{value}</label>)}</fieldset><fieldset><legend>Type client</legend>{['Societe', 'Particulier'].map((value) => <label key={value}><input type="radio" name="clientType" checked={client.clientType === value} onChange={() => updateField('clientType', value)} />{value}</label>)}<label><input type="checkbox" checked={client.taxExempt} onChange={(event) => updateField('taxExempt', event.target.checked)} />Exonere</label></fieldset></div>}
          {notice && <p className="client-save-notice" role="status">{notice}</p>}
          <div className="client-form-actions">{step === 1 ? <><button type="button" className="client-secondary-button" onClick={() => navigate('/workspace')}>Fermer</button><button type="button" className="client-primary-button" onClick={goToNextStep}>Suivant →</button></> : <><button type="button" className="client-secondary-button" onClick={() => changeStep(1)}>← Précédent</button><button type="submit" className="client-primary-button" disabled={saving}>{saving ? 'Enregistrement…' : client._persisted ? 'Enregistrer les modifications' : 'Créer le client'}</button></>}</div>
        </form>
        <footer className="client-payment-footer"><div className="payment-method"><img src="/logos/attijari.svg" alt="Attijari Bank" /><strong>Virement &agrave; Attijari</strong></div><div className="payment-method"><strong>En esp&egrave;ces &agrave;</strong><img src="/logos/stb.svg" alt="STB Bank" /></div></footer>
      </section>
      {showUnpaidClients && <UnpaidClientsModal accessToken={accessToken} onClose={() => setShowUnpaidClients(false)} />}
      {showClientList && <ClientListModal accessToken={accessToken} localClients={clients} onClose={() => setShowClientList(false)} onView={(record) => { setClient({ ...record, _persisted: true }); navigate('/clients/preview'); }} />}
    </main>
  );
}

