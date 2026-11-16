import { useState } from 'react';
import { createPortal } from 'react-dom';
import './CarteVerteDialog.css';

const DAY = 24 * 60 * 60 * 1000;
const parse = (value) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`) : null);
const days = (count) => `${count} jour${count > 1 ? 's' : ''}`;
// Période consommée: the days the carte verte covers (du to au, both included); solde jusqu'à l'échéance: the days left after
// it until the échéance (expiration) of the police. Suggested from the dates; the user may write something else.
export function carteVerteSuggestion(du, au, echeance) {
  const start = parse(du);
  const end = parse(au);
  const due = parse(echeance);
  if (!start || !end || end < start) return { periode_consommee: '', solde_echeance: '' };
  const used = Math.round((end - start) / DAY) + 1;
  const left = due ? Math.max(0, Math.round((due - end) / DAY)) : null;
  return { periode_consommee: days(used), solde_echeance: left == null ? '' : days(left) };
}

export const EMPTY_CARTE_VERTE = { cv_du: '', cv_au: '', cv_periode: '', cv_solde: '', cv_observations: '' };

// The popup of "Carte verte": its dates (du, au), the période consommée, the solde until the échéance and remarks.
// value / onSave use the form keys cv_du, cv_au, cv_periode, cv_solde, cv_observations.
export default function CarteVerteDialog({ value, echeance, onSave, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_CARTE_VERTE, ...value });
  const [typed, setTyped] = useState({ cv_periode: Boolean(value?.cv_periode), cv_solde: Boolean(value?.cv_solde) });
  const [tried, setTried] = useState(false);

  // A date changed: the two durations follow, unless the user wrote them.
  function setDate(key, date) {
    setForm((current) => {
      const next = { ...current, [key]: date };
      const suggestion = carteVerteSuggestion(next.cv_du, next.cv_au, echeance);
      if (!typed.cv_periode) next.cv_periode = suggestion.periode_consommee;
      if (!typed.cv_solde) next.cv_solde = suggestion.solde_echeance;
      return next;
    });
  }
  const setText = (key, text) => { setTyped((current) => ({ ...current, [key]: true })); setForm((current) => ({ ...current, [key]: text })); };

  const errors = {};
  if (!form.cv_du) errors.cv_du = 'Ce champ est obligatoire.';
  if (!form.cv_au) errors.cv_au = 'Ce champ est obligatoire.';
  else if (form.cv_du && form.cv_au < form.cv_du) errors.cv_au = 'La date de fin doit suivre la date de début.';
  const message = (key) => (tried && errors[key] ? <small className="cvd-error" role="alert">{errors[key]}</small> : null);

  function save(event) {
    event.preventDefault();
    if (Object.keys(errors).length) { setTried(true); return; }
    onSave({ ...form, cv_observations: form.cv_observations.slice(0, 200) });
  }

  return createPortal(<div className="cvd-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <form className="cvd-dialog" role="dialog" aria-modal="true" aria-labelledby="cvd-title" onSubmit={save} noValidate>
      <header><h3 id="cvd-title">Carte verte</h3><button type="button" onClick={onCancel} aria-label="Fermer">×</button></header>
      <div className="cvd-grid">
        <label><span>Carte verte du *</span><input type="date" value={form.cv_du} onChange={(event) => setDate('cv_du', event.target.value)} autoFocus />{message('cv_du')}</label>
        <label><span>Carte verte au *</span><input type="date" value={form.cv_au} min={form.cv_du || undefined} onChange={(event) => setDate('cv_au', event.target.value)} />{message('cv_au')}</label>
        <label><span>Période consommée</span><input value={form.cv_periode} maxLength={50} onChange={(event) => setText('cv_periode', event.target.value)} placeholder="Calculée depuis les dates" /></label>
        <label><span>Solde jusqu’à l’échéance</span><input value={form.cv_solde} maxLength={50} onChange={(event) => setText('cv_solde', event.target.value)} placeholder={echeance ? 'Calculé jusqu’à l’échéance' : 'Échéance de la police inconnue'} /></label>
        <label className="cvd-wide"><span>Observations</span><textarea rows={3} maxLength={200} value={form.cv_observations} onChange={(event) => setForm((current) => ({ ...current, cv_observations: event.target.value }))} /></label>
      </div>
      <p className="cvd-hint">Période consommée : jours couverts par la carte verte (du → au). Solde : jours restants ensuite jusqu’à l’échéance de la police{echeance ? ` (${String(echeance).slice(0, 10).split('-').reverse().join('/')})` : ''}. Modifiables.</p>
      <footer><button type="button" className="cvd-cancel" onClick={onCancel}>Annuler</button><button type="submit" className="cvd-ok">Valider</button></footer>
    </form>
  </div>, document.body);
}

// The line shown under the "Carte verte" box once filled in, with "Modifier".
export function CarteVerteSummary({ values, onEdit }) {
  const date = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '…');
  return <p className="cvd-summary">Carte verte du <b>{date(values.cv_du)}</b> au <b>{date(values.cv_au)}</b>
    {values.cv_periode && <> · consommée : {values.cv_periode}</>}{values.cv_solde && <> · solde : {values.cv_solde}</>}
    {' '}<button type="button" onClick={onEdit}>Modifier</button></p>;
}
