import { useEffect, useState } from 'react';
import './ModuleModal.css';
import PolicyForm from './PolicyForm';

const FORM_FIELDS = {
  client: [
    ['clientCode', 'Code client', 'text'], ['lastName', 'Nom', 'text', true], ['firstName', 'Prenom', 'text', true],
    ['nationality', 'Nationalite', 'text'], ['identity', 'Numero de piece d’identite', 'text'], ['birthDate', 'Date de naissance', 'date'],
    ['phone', 'Telephone', 'tel'], ['email', 'Email', 'email'], ['address', 'Adresse', 'text'],
  ],
  policy: [
    ['policyNumber', 'Numero de police', 'text', true], ['client', 'Client', 'text', true],
    ['insuranceType', 'Branche', 'select', true, ['Automobile', 'Habitation', 'Sante', 'Professionnelle']],
    ['startDate', 'Date de debut', 'date', true], ['endDate', 'Date de fin', 'date'], ['premium', 'Prime (TND)', 'number'],
  ],
  claim: [
    ['claimNumber', 'Reference du dossier', 'text'], ['policyNumber', 'Numero de police', 'text', true],
    ['claimType', 'Type de sinistre', 'select', true, ['Automobile', 'Habitation', 'Sante', 'Autre']],
    ['eventDate', 'Date du sinistre', 'date', true], ['location', 'Lieu', 'text'], ['description', 'Description', 'textarea', true],
  ],
  accounting: [
    ['reference', 'Reference', 'text', true], ['operationDate', 'Date de l’operation', 'date', true],
    ['operationType', 'Type d’operation', 'select', true, ['Reglement', 'Recette', 'Depense', 'Ristourne']],
    ['amount', 'Montant (TND)', 'number', true], ['paymentMethod', 'Mode de reglement', 'select', false, ['Virement', 'Cheque', 'Especes']],
    ['notes', 'Commentaire', 'textarea'],
  ],
  report: [
    ['startDate', 'Du', 'date', true], ['endDate', 'Au', 'date', true],
    ['agency', 'Agence', 'select', false, ['Toutes les agences', 'Siege', 'Agence centre', 'Agence nord']],
    ['format', 'Format', 'select', false, ['Apercu', 'Excel', 'PDF']],
  ],
  search: [
    ['reference', 'Reference ou mot-cle', 'search', true],
    ['status', 'Statut', 'select', false, ['Tous', 'En cours', 'Valide', 'En attente', 'Cloture']],
  ],
  user: [
    ['name', 'Nom complet', 'text', true], ['email', 'Adresse email', 'email', true],
    ['role', 'Role', 'select', true, ['Admin', 'Member']], ['agency', 'Agence', 'select', false, ['Siege', 'Agence centre', 'Agence nord']],
  ],
  agency: [
    ['code', 'Code', 'text', true], ['name', 'Nom', 'text', true], ['city', 'Ville', 'text', true],
    ['phone', 'Telephone', 'tel'], ['email', 'Email de contact', 'email'],
  ],
  receipt: [
    ['reference', 'Numero de quittance', 'text', true], ['client', 'Client', 'text', true],
    ['dueDate', 'Date d’echeance', 'date', true], ['amount', 'Montant (TND)', 'number', true],
    ['paymentStatus', 'Statut de paiement', 'select', false, ['En attente', 'Reglee', 'En retard']],
  ],
};

function Field({ field, lockedValue }) {
  const [name, label, type, required, options] = field;
  if (lockedValue !== undefined) return <label className="module-form-field"><span>{label}</span><input name={name} type="text" value={lockedValue} readOnly /></label>;
  if (type === 'textarea') return <label className="module-form-field module-form-wide"><span>{label}{required && ' *'}</span><textarea name={name} rows="4" required={required} placeholder="Saisir votre reponse..." /></label>;
  if (type === 'select') return <label className="module-form-field"><span>{label}{required && ' *'}</span><select name={name} required={required} defaultValue=""><option value="" disabled>Selectionner</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  return <label className="module-form-field"><span>{label}{required && ' *'}</span><input name={name} type={type} required={required} placeholder={type === 'number' ? '0.00' : undefined} /></label>;
}

export default function ModuleModal({ module, category, onClose, clientCode = '', prefill = null }) {
  const [submitted, setSubmitted] = useState(false);
  const [policyStep, setPolicyStep] = useState(1);
  const baseFields = FORM_FIELDS[module.form] || FORM_FIELDS.search;
  // With a client code the client field comes first and cannot be edited.
  const fields = clientCode && ['receipt', 'claim'].includes(module.form)
    ? [['client', 'Code client', 'text'], ...baseFields.filter((field) => field[0] !== 'client')]
    : baseFields;
  const isReport = module.form === 'report';
  const isPolicy = module.form === 'policy';
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleSubmit(event) {
    event.preventDefault();
    setSubmitted(true);
  }


return (
  <div
    className="module-modal-backdrop"
    onMouseDown={event =>
      event.target === event.currentTarget && onClose()
    }
  >
<section
  className={`module-modal ${isPolicy ? "policy-modal-expanded" : ""}`}
  role="dialog"
  aria-modal="true"
  aria-labelledby="module-modal-title"
>
      <header className="module-modal-header">
        <div>
          <span>
            {category.label} · Module {module.id}
          </span>
          <h2 id="module-modal-title">
            {isPolicy && clientCode && policyStep === 2 ? 'Gestion des quittances' : module.title}
          </h2>
        </div>
        <button
          type="button"
          className="module-modal-close"
          onClick={onClose}
          aria-label="Fermer"
        >
          ×
        </button>
      </header>

      {isPolicy ? (
        <PolicyForm clientCode={clientCode} prefill={prefill} onStepChange={setPolicyStep} />
      ) : submitted ? (
        <div className="module-form-success">
          <span className="success-mark">✓</span>
          <h3>
            {isReport
              ? "Votre apercu est pret"
              : "Demande enregistree"}
          </h3>
          <p>
            Cette interface est une maquette.
            Les donnees ne sont pas encore envoyees
            a un serveur.
          </p>
          <button
            type="button"
            className="module-primary-button"
            onClick={onClose}
          >
            Terminer
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <p className="module-modal-description">
            {module.description}
            {" "}Completez les informations ci-dessous.
          </p>

          <div className="module-form-grid">
            {fields.map(field => (
              <Field key={field[0]} field={field} lockedValue={clientCode && field[0] === 'client' ? clientCode : undefined} />
            ))}
          </div>

          <footer className="module-modal-actions">
            <button
              type="button"
              className="module-secondary-button"
              onClick={onClose}
            >
              Annuler
            </button>

            <button
              type="submit"
              className="module-primary-button"
            >
              {isReport
                ? "Generer le rapport"
                : module.form === "search"
                  ? "Rechercher"
                  : "Enregistrer"}
            </button>
          </footer>
        </form>
      )}
    </section>
  </div>
);

}
