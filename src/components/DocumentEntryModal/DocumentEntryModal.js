import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { listCompanies } from '../../services/companyApi';
import { createDocument, listDocuments } from '../../services/documentApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import './DocumentEntryModal.css';

const initialForm = { Code_Document: '', Code_Compagnie: '', Type_Document: '', Num_Document: '', Etat: '' };

export default function DocumentEntryModal({ onClose }) {
  const { accessToken } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [companies, setCompanies] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const companyNames = useMemo(() => new Map(companies.map((company) => [String(company.code_compagnie), company.nom_compagnie || ''])), [companies]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [companyResult, documentResult] = await Promise.all([listCompanies(accessToken), listDocuments(accessToken)]);
      const companyItems = Array.isArray(companyResult) ? companyResult : companyResult.items || [];
      setCompanies(companyItems);
      setDocuments(Array.isArray(documentResult) ? documentResult : documentResult.items || []);
      setForm((current) => ({ ...current, Code_Compagnie: current.Code_Compagnie || (companyItems.length ? String(companyItems[0].code_compagnie) : '') }));
    } catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [accessToken]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape' && !saving && !success) onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving, success]);

  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); if (error) setError(''); }

  async function submit(event) {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await createDocument(accessToken, { ...form, Code_Compagnie: Number(form.Code_Compagnie) });
      setSuccess(true);
      window.setTimeout(onClose, 1100);
    } catch (submitError) { setError(submitError.message); }
    finally { setSaving(false); }
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving && !success) onClose(); }}>
    <section className="document-modal" role="dialog" aria-modal="true" aria-labelledby="document-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali Â· SiÃ¨ge</small></span></div><div className="expert-title"><span>PRODUCTION Â· MODULE 250</span><h2 id="document-title">Saisie documents</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">Ã—</button></header>
      {success ? <div className="expert-success" role="status"><span>âœ“</span><h3>Document enregistrÃ©</h3><p>Le document a Ã©tÃ© ajoutÃ© avec succÃ¨s.</p></div> : <div className="document-modal-content">
        <form className="document-form" onSubmit={submit}>
          <div className="document-heading"><span className="document-kicker">NOUVEAU DOCUMENT</span><h3>Informations du document</h3><p>ComplÃ©tez les rÃ©fÃ©rences et sÃ©lectionnez la compagnie concernÃ©e.</p></div>
          <div className="document-fields">
            <label className="catalog-field"><span>Code document </span><input name="Code_Document" value={form.Code_Document} onChange={change} maxLength={50} required /></label>
            <label className="catalog-field"><span>Compagnie </span><select name="Code_Compagnie" value={form.Code_Compagnie} onChange={change} required disabled={loading}><option value="">SÃ©lectionner une compagnie</option>{companies.map((company) => <option key={company.code_compagnie} value={company.code_compagnie}>{company.code_compagnie} Â· {company.nom_compagnie}</option>)}</select></label>
            <label className="catalog-field"><span>Type de document </span><select name="Type_Document" value={form.Type_Document} onChange={change} required><option value="">Sélectionner un type</option><option value="Police">Police</option><option value="Quittance">Quittance</option><option value="Attestation">Attestation</option></select></label>
            <label className="catalog-field"><span>Numéro du carnet</span><input name="Num_Document" value={form.Num_Document} onChange={change} maxLength={50} required /></label>
            <label className="catalog-field document-field-wide"><span>Etat</span><input name="Etat" value={form.Etat} onChange={change} maxLength={50} required placeholder="Ex. Valide, en attenteâ€¦" /></label>
          </div>
          {error && <div className="expert-error" role="alert">{error}</div>}
          <footer className="expert-modal-actions document-actions"><button type="button" className="expert-cancel" onClick={onClose} disabled={saving}>Fermer</button><button type="submit" className="expert-submit" disabled={saving || loading || companies.length === 0}>{saving ? 'Enregistrementâ€¦' : 'Enregistrer le document'}</button></footer>
        </form>
        <aside className="document-list-panel"><div className="document-list-heading"><div><span className="document-kicker">REGISTRE</span><h3>Documents enregistrÃ©s</h3></div><span className="document-count">{documents.length}</span></div>
          {loading ? <p className="document-empty">Chargement des documentsâ€¦</p> : documents.length ? <div className="document-record-list">{documents.map((document, index) => <article className="document-record" key={`${document.Code_Document}-${index}`}><div><strong>{document.Code_Document || 'Sans code'}</strong><span>{document.Type_Document || 'Type non prÃ©cisÃ©'} Â· {document.Num_Document || 'NÂ° non prÃ©cisÃ©'}</span></div><div className="document-record-meta"><span>{companyNames.get(String(document.Code_Compagnie)) || `Compagnie ${document.Code_Compagnie ?? 'â€”'}`}</span><small>{document.Etat || 'Ã‰tat non prÃ©cisÃ©'}</small></div></article>)}</div> : <p className="document-empty">Aucun document enregistrÃ© pour le moment.</p>}
        </aside>
      </div>}
    </section>
  </div>;
}

