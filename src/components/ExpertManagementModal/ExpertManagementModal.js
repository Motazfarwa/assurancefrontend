import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { createPrestataire, getPrestataireLookups } from '../../services/prestataireApi';
import './ExpertManagementModal.css';

const initialForm = {
  Code_Prestataire: '', Nom_Prestataire: '', Code_Famille: '', Matricule_Fiscal: '',
  Adresse_Prof: '', Adresse_Residence: '', Tel1: '', Tel2: '', Fax: '', Code_Region: '',
  Adresse_EMail: '', Taux_RS: '0', Observation: '', Note: '2 (Normal)', Compagnies: [], Branches: [],
};

const fieldGroups = [
  [
    { name: 'Code_Prestataire', label: 'Code prestataire', type: 'number', required: true },
    { name: 'Code_Famille', label: 'Famille', type: 'select', lookup: 'families', required: true },
    { name: 'Code_Region', label: 'Région', type: 'select', lookup: 'regions', required: true },
    { name: 'Nom_Prestataire', label: 'Nom du prestataire', maxLength: 60, required: true, wide: true },
    { name: 'Matricule_Fiscal', label: 'Matricule fiscal', maxLength: 30, required: true },
    { name: 'Adresse_Prof', label: 'Adresse professionnelle', maxLength: 50 },
    { name: 'Adresse_Residence', label: 'Adresse de résidence', maxLength: 50, required: true },
    { name: 'Tel1', label: 'Téléphone 1', maxLength: 30, required: true },
    { name: 'Tel2', label: 'Téléphone 2', maxLength: 30 },
    { name: 'Fax', label: 'Fax', maxLength: 30 },
    { name: 'Adresse_EMail', label: 'Adresse e-mail', type: 'email', maxLength: 100, required: true },
    { name: 'Taux_RS', label: 'Taux RS (%)', type: 'number', step: '0.001', min: '0', required: true },
    { name: 'Note', label: 'Note', type: 'select', lookup: 'notes', required: true },
    { name: 'Observation', label: 'Observation', maxLength: 100, wide: true, required: true },
  ],
];

function SelectField({ field, value, options, onChange }) {
  const items = field.lookup === 'notes' ? [
    { id: '2 (Normal)', label: '2 (Normal)' },
    ...options.filter((item) => item.value !== '2 (Normal)').map((item) => ({ id: item.value, label: item.label })),
  ] : options;
  return <select name={field.name} value={value} onChange={onChange} required={field.required}>
    <option value="">{field.lookup === 'notes' ? 'Choisir une note' : 'Sélectionner'}</option>
    {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
  </select>;
}

function SelectionList({ title, name, items, selected, onToggle, loading }) {
  return <fieldset className="expert-selection">
    <legend>{title} <b>*</b><span>{selected.length} sélectionné{selected.length > 1 ? 's' : ''}</span></legend>
    {loading ? <p className="expert-list-hint">Chargement…</p> : items.length ? <div className="expert-selection-list">
      {items.map((item) => <label className="expert-check-option" key={item.id}>
        <input type="checkbox" name={name} checked={selected.includes(Number(item.id))} onChange={() => onToggle(name, Number(item.id))} />
        <span>{item.label}</span>
      </label>)}
    </div> : <p className="expert-list-hint">Aucune option disponible.</p>}
  </fieldset>;
}

export default function ExpertManagementModal({ onClose }) {
  const { accessToken } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [lookups, setLookups] = useState({ families: [], regions: [], companies: [], branches: [], notes: [] });
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    getPrestataireLookups(accessToken)
      .then((data) => { if (active) setLookups(data); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoadingLookups(false); });
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape' && !saving && !success) onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving, success]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (error) setError('');
  }

  function toggleSelection(name, id) {
    setForm((current) => ({ ...current, [name]: current[name].includes(id) ? current[name].filter((value) => value !== id) : [...current[name], id] }));
  }

  async function submit(event) {
    event.preventDefault();
    if (form.Compagnies.length === 0 || form.Branches.length === 0) {
      setError('Sélectionnez au moins une compagnie et une branche.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      Code_Prestataire: Number(form.Code_Prestataire),
      Code_Famille: Number(form.Code_Famille),
      Code_Region: form.Code_Region ? Number(form.Code_Region) : null,
      Taux_RS: form.Taux_RS === '' ? null : Number(form.Taux_RS),
      Matricule_Fiscal: form.Matricule_Fiscal || null,
      Adresse_Prof: form.Adresse_Prof || null,
      Adresse_Residence: form.Adresse_Residence || null,
      Tel1: form.Tel1 || null,
      Tel2: form.Tel2 || null,
      Fax: form.Fax || null,
      Adresse_EMail: form.Adresse_EMail || null,
      Observation: form.Observation || null,
      Note: form.Note || null,
    };
    try {
      await createPrestataire(accessToken, payload);
      setSuccess(true);
      window.setTimeout(onClose, 1100);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving && !success) onClose(); }}>
    <section className="expert-modal" role="dialog" aria-modal="true" aria-labelledby="expert-title">
      <header className="expert-modal-header">
        <div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali · Siège</small></span></div>
        <div className="expert-title"><span>PRODUCTION · MODULE 135</span><h2 id="expert-title">Saisie expert</h2></div>
        <button className="expert-close" type="button" onClick={onClose} aria-label="Fermer">×</button>
      </header>
      {success ? <div className="expert-success" role="status"><span>✓</span><h3>Prestataire ajouté avec succès</h3><p>Le prestataire et ses rattachements ont été enregistrés.</p></div> : <form onSubmit={submit}>
        <div className="expert-modal-intro"><div><h3>Nouveau prestataire</h3><p>Renseignez ses coordonnées et sélectionnez les compagnies et branches concernées.</p></div><span className="expert-required-note">* Champs obligatoires</span></div>
        <div className="expert-form-body">
          <div className="expert-fields-grid">
            {fieldGroups.flat().map((field) => <label className={`expert-field ${field.wide ? 'expert-field-wide' : ''}`} key={field.name}>
              <span>{field.label}{field.required && <b> *</b>}</span>
              {field.type === 'select' ? <SelectField field={field} value={form[field.name]} options={lookups[field.lookup] || []} onChange={updateField} /> : <input name={field.name} type={field.type || 'text'} value={form[field.name]} onChange={updateField} required={field.required} maxLength={field.maxLength} step={field.step} min={field.min} />}
            </label>)}
          </div>
          <div className="expert-relations">
            <SelectionList title="Compagnies rattachées" name="Compagnies" items={lookups.companies} selected={form.Compagnies} onToggle={toggleSelection} loading={loadingLookups} />
            <SelectionList title="Branches d’assurance" name="Branches" items={lookups.branches} selected={form.Branches} onToggle={toggleSelection} loading={loadingLookups} />
          </div>
        </div>
        {error && <div className="expert-error" role="alert">{error}</div>}
        <footer className="expert-modal-actions"><button className="expert-cancel" type="button" onClick={onClose} disabled={saving}>Annuler</button><button className="expert-submit" type="submit" disabled={saving || loadingLookups}>{saving ? 'Enregistrement…' : 'Enregistrer le prestataire'}</button></footer>
      </form>}
    </section>
  </div>;
}
