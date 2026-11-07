import { createContext, useContext, useEffect, useState } from 'react';
import { searchClients } from '../../services/clientApi';
import { REQUIRED_CLIENT_FIELDS } from './clientValidation';
import './ClientManagementPage.css';

// The fields of a client file, used by Gestion des clients and by each police fictive of a police flotte.
// The messages of the current step, read by each field.
export const FieldErrors = createContext({});
const FieldError = ({ name }) => {
  const message = useContext(FieldErrors)[name];
  return message ? <small className="client-field-error" role="alert">{message}</small> : null;
};

export function ClientField({ client, onChange, name, label, type = 'text', options, wide = false, required = false, maxLength, disabled = false, readOnly = false }) {
  const className = `client-field${wide ? ' client-field-wide' : ''}${readOnly ? ' client-field-readonly' : ''}`;
  return <label className={className}><span>{label}{REQUIRED_CLIENT_FIELDS.has(name) ? ' *' : ''}</span>{type === 'select' ? <select required={required} disabled={disabled} value={client[name]} onChange={(event) => onChange(name, event.target.value)}><option value="">Selectionner</option>{options.map((option) => <option key={option}>{option}</option>)}</select> : <input required={required} disabled={disabled} readOnly={readOnly} maxLength={maxLength} type={type} value={client[name] || ''} onChange={(event) => onChange(name, event.target.value)} />}<FieldError name={name} /></label>;
}

// Nom / Prénom input that looks for existing clients while typing, to avoid creating duplicates.
export function NameAutocomplete({ client, onChange, name, label, accessToken, onPick }) {
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
    <label><span>{label} *</span><input type="text" autoComplete="off" value={client[name] || ''} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)} onChange={(event) => { onChange(name, event.target.value); setOpen(true); }} /><FieldError name={name} /></label>
    {checkable && checked && <small className={matches.length ? 'client-autocomplete-warn' : 'client-autocomplete-ok'}>{matches.length ? `${matches.length} client(s) existant(s) — vérifiez avant de créer` : '✓ Aucun client existant'}</small>}
    {open && checkable && matches.length > 0 && <ul className="client-autocomplete-list" role="listbox">{matches.map((item) => <li key={item.clientCode}><button type="button" role="option" onMouseDown={(event) => { event.preventDefault(); onPick(item); setOpen(false); }}><strong>{[item.lastName, item.firstName].filter(Boolean).join(' ') || item.nom_client}</strong><span>Code {item.clientCode}</span></button></li>)}</ul>}
  </div>;
}

export function FormSection({ title, children, className = '' }) {
  return <fieldset className={`client-section ${className}`}><legend>{title}</legend><div className="client-fields">{children}</div></fieldset>;
}

export function ContactFields({ client, onChange, kind }) {
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
        <label className="client-field"><span>{contact.label?.trim() || `${label} ${index + 1}`}</span><input type={type} value={contact.value || ''} onFocus={() => setActiveLabel(id)} onChange={(event) => updateContact(key, index, 'value', event.target.value)} /><FieldError name={`${key}.${index}`} /></label>
        {activeLabel === id && <label className="client-field client-contact-label"><span>Libellé</span><input type="text" maxLength={50} value={contact.label || ''} onChange={(event) => updateContact(key, index, 'label', event.target.value)} onBlur={() => setActiveLabel('')} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); setActiveLabel(''); } }} placeholder={`Libellé ${label.toLowerCase()} ${index + 1}`} /><button type="button" onClick={() => setActiveLabel('')} aria-label="Masquer le libellé">×</button></label>}
      </div>;
    });
  }
  return <div className="client-contact-fields client-field-wide">
    <div className="client-contact-group"><strong>Téléphones{kind === 'home' ? ' *' : ''}</strong><div>{renderContacts(phoneKey, 4, 'Téléphone', 'tel')}</div></div>
    <div className="client-contact-group"><strong>Emails</strong><div>{renderContacts(emailKey, 3, 'Email', 'email')}</div></div>
  </div>;
}

export function IdentityFields({ client, updateField, changeClientType, accessToken, pickExistingClient }) {
  const isCompany = client.clientType === 'Societe';
  return <>
          <div className="client-record-options client-step-full client-type-row"><fieldset><legend>Type client</legend>{['Particulier', 'Societe'].map((value) => <label key={value}><input type="radio" name="clientType" checked={client.clientType === value} onChange={() => changeClientType(value)} />{value === 'Societe' ? 'Société' : value}</label>)}</fieldset></div>
          <FormSection title="Client" className="client-section-primary">
            {isCompany
              ? <NameAutocomplete client={client} onChange={updateField} name="lastName" label="Raison sociale" accessToken={accessToken} onPick={pickExistingClient} />
              : <>
                <NameAutocomplete client={client} onChange={updateField} name="lastName" label="Nom" accessToken={accessToken} onPick={pickExistingClient} />
                <NameAutocomplete client={client} onChange={updateField} name="firstName" label="Prenom" accessToken={accessToken} onPick={pickExistingClient} />
              </>}
            <ClientField client={client} onChange={updateField} name="nationality" label="Nationalite" type="select" options={['Tunisienne', 'Italienne', 'Française', 'Autre']} />
            {client.nationality === 'Autre' && <ClientField client={client} onChange={updateField} name="nationalityOther" label="Precisez la nationalite" />}
            <ClientField client={client} onChange={updateField} name="country" label="Pays" />
            <ClientField client={client} onChange={updateField} name="birthDate" label="Date de naissance" type="date" />
            <ClientField client={client} onChange={updateField} name="birthPlace" label="Pays de naissance" />
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
            <ClientField client={client} onChange={updateField} name="relatedCode" label="Code de contact" type="number" />
            <ClientField client={client} onChange={updateField} name="relatedName" label="Nom du contact" />
            <ClientField client={client} onChange={updateField} name="relationship" label="Quérabilité" />
          </FormSection>
  </>;
}

export function CoordinatesFields({ client, updateField }) {
  return <>
          <FormSection title="Domicile">
            <ClientField client={client} onChange={updateField} name="homeAddress" label="Adresse" wide />
            <ClientField client={client} onChange={updateField} name="homeCity" label="Ville" />
            <ClientField client={client} onChange={updateField} name="homePostalCode" label="Code postal" type="number" required />
            <ContactFields client={client} onChange={updateField} kind="home" />
          </FormSection>

          <FormSection title="Bureau">
            <ClientField client={client} onChange={updateField} name="officeAddress" label="Adresse" wide />
            <ClientField client={client} onChange={updateField} name="officeCity" label="Ville" />
            <ClientField client={client} onChange={updateField} name="officePostalCode" label="Code postal" />
            <ContactFields client={client} onChange={updateField} kind="office" />
          </FormSection>
          <FormSection title="Observation" className="client-observation-section client-step-full"><label className="client-field client-field-wide"><span>Remarques sur le client</span><textarea rows={4} maxLength={500} value={client.notes || ''} placeholder="Saisir une observation (facultatif)" onChange={(event) => updateField('notes', event.target.value)} /><small className="client-observation-count">{(client.notes || '').length} / 500</small></label></FormSection>
          <div className="client-record-options client-step-full"><fieldset><legend>Adresse de correspondance</legend>{['Bureau', 'Domicile'].map((value) => <label key={value}><input type="radio" name="correspondence" checked={client.correspondence === value} onChange={() => updateField('correspondence', value)} />{value}</label>)}</fieldset></div>
  </>;
}
