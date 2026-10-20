import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useClient } from '../../contexts/ClientContext';
import { navigate } from '../../navigation';
import { listClientRecords, updateClientRecord } from '../../services/clientRecordsApi';
import { downloadClientExcel } from '../../services/clientExcelExport';
import '../ClientManagement/ClientManagementPage.css';

function Detail({ label, value }) {
  return <div className="client-detail"><span>{label}</span><strong>{value || 'Non renseigné'}</strong></div>;
}

function DetailSection({ title, children }) {
  return <section className="client-detail-section"><h2>{title}</h2><div className="client-detail-grid">{children}</div></section>;
}

const POLICY_COLUMNS = [['num_int', 'N° dossier'], ['num_police', 'N° police'], ['code_branche', 'Branche'], ['effet', 'Date effet'], ['expiration', 'Expiration'], ['etat', 'État'], ['prime_total', 'Prime totale']];
const RECEIPT_COLUMNS = [['num_quittance', 'N° quittance'], ['num_int', 'N° dossier'], ['date_emission', 'Émission'], ['echeance', 'Échéance'], ['montant_quittance', 'Montant'], ['solde_quittance', 'Solde'], ['observation', 'Observation']];

// key = API field, column = key in the record returned by the API when it differs.
const POLICY_FIELDS = [
  { key: 'effet', label: 'Date effet', type: 'date' }, { key: 'expiration', label: 'Expiration', type: 'date' },
  { key: 'echeance', label: 'Échéance' }, { key: 'duree', label: 'Durée', type: 'number' },
  { key: 'etat', label: 'État' }, { key: 'risque', label: 'Risque' },
  { key: 'num_imat', label: 'Immatriculation' }, { key: 'marque', label: 'Marque' },
  { key: 'garantie', label: 'Garantie' }, { key: 'franchise', label: 'Franchise', type: 'number' },
  { key: 'capital', label: 'Capital', type: 'number' }, { key: 'prime_net', label: 'Prime nette', type: 'number' },
  { key: 'commission', label: 'Commission', type: 'number' }, { key: 'prime_total', label: 'Prime totale', type: 'number' },
  { key: 'obser', label: 'Observation' },
];
const RECEIPT_FIELDS = [
  { key: 'date_emission', label: 'Date émission', type: 'date' }, { key: 'echeance', label: 'Échéance', type: 'date' },
  { key: 'periode', column: 'Periode', label: 'Période' }, { key: 'prime_net', label: 'Prime nette', type: 'number' },
  { key: 'prime_total', label: 'Prime totale', type: 'number' }, { key: 'commission', label: 'Commission', type: 'number' },
  { key: 'montant_quittance', label: 'Montant quittance', type: 'number' }, { key: 'solde_quittance', label: 'Solde quittance', type: 'number' },
  { key: 'taxe', column: 'Taxe', label: 'Taxe', type: 'number' }, { key: 'timbre', label: 'Timbre', type: 'number' },
  { key: 'cout_attestation', label: 'Coût attestation', type: 'number' }, { key: 'observation', label: 'Observation' },
];

const CLAIM_COLUMNS = [['Num_Sinistre_Agence', 'N° sinistre'], ['Date_Sinistre', 'Date sinistre'], ['Lieu_Sinistre', 'Lieu'], ['Type_Sinistre', 'Type'], ['Garantie', 'Garantie'], ['Montant_Reglement', 'Règlement'], ['Regle', 'Réglé'], ['Cloture', 'Clôturé'], ['Observation', 'Observation']];

const formatValue = (value) => {
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (value == null || value === '') return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleDateString('fr-FR');
  return String(value);
};

const initialValue = (record, field) => {
  const value = record[field.column || field.key];
  if (value == null) return '';
  return field.type === 'date' ? String(value).slice(0, 10) : String(value);
};

function RecordsDialog({ kicker, title, columns: fixedColumns, records, loading, error, onClose, actions, nested = false }) {
  const columns = fixedColumns || Object.keys(records[0] || {}).map((key) => [key, key]);
  return <div className={`client-records-backdrop${nested ? ' is-nested' : ''}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="client-records-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <header><div><span>{kicker}</span><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></header>
      {loading ? <p className="client-records-message">Chargement des enregistrements…</p> : error ? <p className="client-records-message is-error">{error}</p> : records.length === 0 ? <p className="client-records-message">Aucun enregistrement trouvé.</p> : <div className="client-records-table-wrap"><table><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}{actions && <th />}</tr></thead><tbody>{records.map((record, index) => <tr key={`${record.num_quittance || record.num_int || record.num_police || ''}-${index}`}>{columns.map(([key]) => <td key={key}>{formatValue(record[key])}</td>)}{actions && <td><div className="client-row-actions">{actions(record)}</div></td>}</tr>)}</tbody></table></div>}
      <footer><span>{loading ? '' : `${records.length} résultat${records.length > 1 ? 's' : ''}`}</span><button className="client-secondary-button" type="button" onClick={onClose}>Fermer</button></footer>
    </section>
  </div>;
}

function EditRecordDialog({ title, kicker, fields, record, onSave, onClose }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((field) => [field.key, initialValue(record, field)])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const changes = {};
    fields.forEach((field) => {
      if (values[field.key] === initialValue(record, field)) return;
      const raw = values[field.key];
      changes[field.key] = raw === '' ? null : field.type === 'number' ? Number(raw) : raw;
    });
    if (Object.keys(changes).length === 0) { onClose(); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(changes);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return <div className="client-records-backdrop is-nested" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="client-records-dialog" style={{ width: 'min(100%, 640px)' }} onSubmit={submit} role="dialog" aria-modal="true" aria-label={title}>
      <header><div><span>{kicker}</span><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></header>
      <div className="client-edit-form">
        {fields.map((field) => <label key={field.key}><span>{field.label}</span><input type={field.type || 'text'} step={field.type === 'number' ? 'any' : undefined} value={values[field.key]} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} /></label>)}
        {error && <p className="client-records-message is-error" role="alert">{error}</p>}
      </div>
      <footer><span /><div className="client-footer-actions"><button className="client-secondary-button" type="button" onClick={onClose}>Annuler</button><button className="client-primary-button" type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button></div></footer>
    </form>
  </div>;
}

export default function ClientPreviewPage() {
  const { client } = useClient();
  const { accessToken } = useAuth();
  const [policiesOpen, setPoliciesOpen] = useState(false);
  const [policiesState, setPoliciesState] = useState({ loading: false, error: '', records: [] });
  const [receiptsPolicy, setReceiptsPolicy] = useState(null);
  const [receiptsState, setReceiptsState] = useState({ loading: false, error: '', records: [] });
  const [claimsPolicy, setClaimsPolicy] = useState(null);
  const [claimsState, setClaimsState] = useState({ loading: false, error: '', records: [] });
  const [editing, setEditing] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const fullName = [client.firstName, client.lastName].filter(Boolean).join(' ') || 'Nouveau client';

  async function loadPolicies() {
    setPoliciesState((current) => ({ ...current, loading: true, error: '' }));
    try {
      setPoliciesState({ loading: false, error: '', records: await listClientRecords(accessToken, 'policies', client.clientCode) });
    } catch (error) {
      setPoliciesState({ loading: false, error: error.message, records: [] });
    }
  }

  async function loadReceipts(policy) {
    setReceiptsState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const receipts = await listClientRecords(accessToken, 'receipts', client.clientCode);
      setReceiptsState({ loading: false, error: '', records: receipts.filter((receipt) => receipt.num_int === policy.num_int) });
    } catch (error) {
      setReceiptsState({ loading: false, error: error.message, records: [] });
    }
  }

  function showPolicies() {
    setPoliciesOpen(true);
    setPoliciesState({ loading: true, error: '', records: [] });
    loadPolicies();
  }

  async function showClaims(policy) {
    setClaimsPolicy(policy);
    setClaimsState({ loading: true, error: '', records: [] });
    try {
      setClaimsState({ loading: false, error: '', records: await listClientRecords(accessToken, 'claims', client.clientCode, { num_int: policy.num_int }) });
    } catch (error) {
      setClaimsState({ loading: false, error: error.message, records: [] });
    }
  }

  function showReceipts(policy) {
    setReceiptsPolicy(policy);
    setReceiptsState({ loading: true, error: '', records: [] });
    loadReceipts(policy);
  }

  async function saveEdit(changes) {
    const isPolicy = editing.kind === 'policies';
    await updateClientRecord(accessToken, editing.kind, isPolicy ? editing.record.num_int : editing.record.num_quittance, changes);
    setEditing(null);
    if (isPolicy) await loadPolicies();
    else await loadReceipts(receiptsPolicy);
  }

  async function exportExcel() {
    setExporting(true);
    setExportError('');
    try {
      const [policies, receipts] = await Promise.all([
        listClientRecords(accessToken, 'policies', client.clientCode),
        listClientRecords(accessToken, 'receipts', client.clientCode),
      ]);
      await downloadClientExcel({ client, policies, receipts });
    } catch (error) {
      setExportError(error.message || 'Impossible de générer le fichier Excel.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="preview-page">
      <div className="preview-navbar preview-print-hide" role="banner">
        <div className="preview-navbar-inner">
          <div className="preview-navbar-top">
            <div className="preview-navbar-brand">
              <a className="preview-navbar-mark" href="/workspace" aria-label="Retour aux modules">A</a>
              <div>
                <strong>Gestion Assurances</strong>
                <ol className="preview-breadcrumb" aria-label="Fil d’Ariane">
                  <li><button type="button" onClick={() => navigate('/workspace')}>Production</button></li>
                  <li><button type="button" onClick={() => navigate('/clients')}>Clients</button></li>
                  <li aria-current="page">Fiche {client.clientCode || 'client'}</li>
                </ol>
              </div>
            </div>
            <div className="preview-navbar-client" title={fullName}>
              <span className="preview-navbar-avatar">{fullName.charAt(0).toUpperCase()}</span>
              <span><strong>{fullName}</strong><small>Code client · {client.clientCode || '—'}</small></span>
            </div>
            <div className="preview-navbar-exports">
              <button className="client-secondary-button client-excel-button" type="button" onClick={exportExcel} disabled={exporting}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" /></svg>
                {exporting ? 'Export en cours…' : 'Télécharger Excel'}
              </button>
              <button className="client-primary-button client-pdf-button" type="button" onClick={() => window.print()}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" /></svg>
                Imprimer / Enregistrer en PDF
              </button>
            </div>
          </div>
          <nav className="preview-navbar-tabs" aria-label="Actions du dossier client">
            <button type="button" onClick={() => navigate('/clients')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m0 0l6-6m-6 6l6 6" /></svg>Retour à la fiche
            </button>
            <button type="button" onClick={showPolicies}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6" /></svg>Consulter les polices
            </button>
            <button type="button" onClick={() => navigate('/clients')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /></svg>Modifier le client
            </button>
          </nav>
          {exportError && <p className="client-records-message is-error" role="alert">{exportError}</p>}
        </div>
      </div>
      <article className="preview-paper">
        <header className="preview-document-header">
          <div className="preview-document-brand">GESTION ASSURANCES<small>Assurance Jemmali · Siège</small></div>
          <div className="preview-document-meta"><div>FICHE CLIENT</div><div>Module Production · 100</div><div>Code client : {client.clientCode || '—'}</div></div>
        </header>
        <div className="preview-document-title"><span>DOSSIER CLIENT</span><h1>Informations du client</h1><p>Fiche de renseignements</p></div>
        <section className="client-profile-card"><span className="client-profile-avatar">{fullName.charAt(0).toUpperCase()}</span><div><span className="client-profile-label">CLIENT</span><h2>{fullName}</h2><p>{client.profession || 'Profession non renseignée'} · {client.clientType || 'Particulier'}</p></div><span className="client-status-pill">Dossier client</span></section>
        <DetailSection title="Identité"><Detail label="Code client" value={client.clientCode} /><Detail label="Date de création" value={client.createdAt} /><Detail label="Nom" value={client.lastName} /><Detail label="Prénom" value={client.firstName} /><Detail label="Nationalité" value={client.nationality} /><Detail label="Pays" value={client.country} /><Detail label="Date de naissance" value={client.birthDate} /><Detail label="Lieu de naissance" value={client.birthPlace} /><Detail label="Profession" value={client.profession} /><Detail label="Situation familiale" value={client.civilStatus} /><Detail label="N° de pièce d’identité" value={client.identityNumber} /><Detail label="Lieu de délivrance" value={client.identityPlace} /><Detail label="N° de permis" value={client.licenseNumber} /></DetailSection>
        <DetailSection title="Coordonnées"><Detail label="Adresse du domicile" value={client.homeAddress} /><Detail label="Ville / code postal" value={[client.homeCity, client.homePostalCode].filter(Boolean).join(' · ')} /><Detail label="Téléphone domicile" value={client.homePhone} /><Detail label="Adresse du bureau" value={client.officeAddress} /><Detail label="Téléphone bureau" value={client.officePhone} /><Detail label="Email" value={client.email} /><Detail label="Adresse de correspondance" value={client.correspondence} /></DetailSection>
        <DetailSection title="Lien"><Detail label="Code de contact" value={client.referenceCode || client.relatedCode} /><Detail label="Nom du contact" value={client.relatedName} /><Detail label="Quérabilité" value={client.relationship} /></DetailSection>
        <DetailSection title="Informations du dossier"><Detail label="Type client" value={client.clientType} /><Detail label="Exonéré" value={client.taxExempt ? 'Oui' : 'Non'} /><Detail label="Observation" value={client.notes} /></DetailSection>
        <footer className="client-payment-footer"><div className="payment-method"><img src="/logos/attijari.svg" alt="Attijari Bank" /><strong>Virement à Attijari</strong></div><div className="payment-method"><strong>En espèces à </strong><img src="/logos/stb.svg" alt="STB Bank" /></div></footer>
      </article>
      {policiesOpen && <RecordsDialog kicker="DOSSIER CLIENT · MODULE 110" title="Polices du client" columns={POLICY_COLUMNS} {...policiesState} onClose={() => setPoliciesOpen(false)} actions={(policy) => <><button type="button" onClick={() => showReceipts(policy)}>Quittances</button><button type="button" onClick={() => showClaims(policy)}>Sinistres</button><button type="button" onClick={() => setEditing({ kind: 'policies', record: policy })}>Modifier</button></>} />}
      {claimsPolicy && <RecordsDialog nested kicker={`POLICE ${claimsPolicy.num_police || claimsPolicy.num_int} · SINISTRES`} title="Sinistres de la police" columns={CLAIM_COLUMNS} {...claimsState} onClose={() => setClaimsPolicy(null)} />}
      {receiptsPolicy && <RecordsDialog nested kicker={`POLICE ${receiptsPolicy.num_police || receiptsPolicy.num_int} · MODULE 130`} title="Quittances de la police" columns={RECEIPT_COLUMNS} {...receiptsState} onClose={() => setReceiptsPolicy(null)} actions={(receipt) => <button type="button" onClick={() => setEditing({ kind: 'receipts', record: receipt })}>Modifier</button>} />}
      {editing && <EditRecordDialog key={editing.record.num_quittance || editing.record.num_int} kicker={editing.kind === 'policies' ? 'MODULE 110' : 'MODULE 130'} title={editing.kind === 'policies' ? `Modifier la police ${editing.record.num_police || editing.record.num_int}` : `Modifier la quittance ${editing.record.num_quittance}`} fields={editing.kind === 'policies' ? POLICY_FIELDS : RECEIPT_FIELDS} record={editing.record} onSave={saveEdit} onClose={() => setEditing(null)} />}
    </main>
  );
}
