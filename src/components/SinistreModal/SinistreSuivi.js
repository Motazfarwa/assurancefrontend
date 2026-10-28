import { useEffect, useState } from 'react';
import { getSinistreSuivi, sinistreAppels, sinistreEtapes } from '../../services/sinistreApi';

const today = () => new Date().toISOString().slice(0, 10);
// The current local date and time, as a datetime-local input wants it.
const now = () => { const value = new Date(); value.setMinutes(value.getMinutes() - value.getTimezoneOffset()); return value.toISOString().slice(0, 16); };
const shortDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const shortDateTime = (value) => (value ? `${shortDate(value)} ${String(value).slice(11, 16)}` : '');

const blankEtape = () => ({ cmp: null, Code_Etape: '', Date_Etape: today(), Description: '' });
const blankAppel = () => ({ cmp: null, Date_Appel: now(), Description: '', Urgence: 'Non Urgent' });

// "Suivi" tab of a stored claim: its steps (étapes) with their date and observation, then the calls and letters sent or received.
// A row clicked in a table is loaded in the fields above it to be modified or deleted.
export default function SinistreSuivi({ accessToken, numero, etapes, urgences }) {
  const [data, setData] = useState(null); // { etapes, appels }
  const [etape, setEtape] = useState(blankEtape);
  const [appel, setAppel] = useState(blankAppel);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { kind: 'error' | 'info', text }

  useEffect(() => {
    let active = true;
    setData(null); setEtape(blankEtape()); setAppel(blankAppel()); setMessage(null);
    getSinistreSuivi(accessToken, numero)
      .then((result) => { if (active) setData(result); })
      .catch((requestError) => { if (active) { setData({ etapes: [], appels: [] }); setMessage({ kind: 'error', text: requestError.message }); } });
    return () => { active = false; };
  }, [accessToken, numero]);

  async function run(action, done, text) {
    setBusy(true); setMessage(null);
    try {
      await action();
      setData(await getSinistreSuivi(accessToken, numero));
      done();
      setMessage({ kind: 'info', text });
    } catch (requestError) {
      setMessage({ kind: 'error', text: requestError.message });
    } finally {
      setBusy(false);
    }
  }

  function saveEtape() {
    if (!etape.Code_Etape) { setMessage({ kind: 'error', text: 'Choisissez une étape.' }); return; }
    const payload = { Code_Etape: Number(etape.Code_Etape), Date_Etape: etape.Date_Etape ? `${etape.Date_Etape}T00:00:00` : null, Description: etape.Description };
    run(
      () => (etape.cmp ? sinistreEtapes.update(accessToken, numero, etape.cmp, payload) : sinistreEtapes.add(accessToken, numero, payload)),
      () => setEtape(blankEtape()),
      etape.cmp ? 'Étape modifiée.' : 'Étape ajoutée.',
    );
  }

  function removeEtape() {
    if (!etape.cmp || !window.confirm('Supprimer cette étape du suivi ?')) return;
    run(() => sinistreEtapes.remove(accessToken, numero, etape.cmp), () => setEtape(blankEtape()), 'Étape supprimée.');
  }

  function saveAppel() {
    if (!appel.Date_Appel) { setMessage({ kind: 'error', text: 'Indiquez la date de l’appel ou du courrier.' }); return; }
    if (!appel.Description.trim()) { setMessage({ kind: 'error', text: 'Décrivez l’appel ou le courrier.' }); return; }
    const payload = { Date_Appel: `${appel.Date_Appel}:00`, Description: appel.Description, Urgence: appel.Urgence };
    run(
      () => (appel.cmp ? sinistreAppels.update(accessToken, numero, appel.cmp, payload) : sinistreAppels.add(accessToken, numero, payload)),
      () => setAppel(blankAppel()),
      appel.cmp ? 'Appel / courrier modifié.' : 'Appel / courrier ajouté.',
    );
  }

  function removeAppel() {
    if (!appel.cmp || !window.confirm('Supprimer cet appel / courrier ?')) return;
    run(() => sinistreAppels.remove(accessToken, numero, appel.cmp), () => setAppel(blankAppel()), 'Appel / courrier supprimé.');
  }

  const onEnter = (save) => (event) => { if (event.key === 'Enter') { event.preventDefault(); save(); } };
  const urgent = (value) => value && value !== 'Non Urgent';

  return (
    <div className="snr-suivi">
      {message && <p className={`snr-message is-${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}

      <fieldset className="snr-group snr-suivi-group" disabled={busy || !data}>
        <legend>Étapes sinistre</legend>
        <div className="snr-suivi-form">
          <label className="snr-suivi-etape"><span>Étape</span>
            <select value={etape.Code_Etape} onChange={(event) => setEtape((value) => ({ ...value, Code_Etape: event.target.value }))}>
              <option value="">(Aucun)</option>
              {etapes.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label><span>Date étape</span><input type="date" value={etape.Date_Etape} onChange={(event) => setEtape((value) => ({ ...value, Date_Etape: event.target.value }))} /></label>
          <label className="snr-suivi-text"><span>Observation</span>
            <input value={etape.Description} maxLength={200} onChange={(event) => setEtape((value) => ({ ...value, Description: event.target.value }))} onKeyDown={onEnter(saveEtape)} />
          </label>
          <div className="snr-suivi-actions">
            <button type="button" className="snr-tool snr-primary" onClick={saveEtape}>{etape.cmp ? 'Modifier' : 'Ajouter'}</button>
            {etape.cmp && <button type="button" className="snr-tool" onClick={removeEtape}>Supprimer</button>}
            {etape.cmp && <button type="button" className="snr-tool" onClick={() => setEtape(blankEtape())}>Annuler</button>}
          </div>
        </div>
        <div className="snr-table-wrap snr-suivi-table">
          <table className="snr-table">
            <thead><tr><th>Étape</th><th>Date</th><th>Observation</th></tr></thead>
            <tbody>
              {!data ? <tr><td colSpan={3} className="snr-empty">Chargement…</td></tr>
                : data.etapes.length === 0 ? <tr><td colSpan={3} className="snr-empty">Aucune étape enregistrée.</td></tr>
                : data.etapes.map((row) => (
                  <tr key={row.Cmp} className={`is-clickable${etape.cmp === row.Cmp ? ' is-selected' : ''}`}
                    onClick={() => setEtape({ cmp: row.Cmp, Code_Etape: String(row.Code_Etape), Date_Etape: row.Date_Etape ? String(row.Date_Etape).slice(0, 10) : '', Description: row.Description || '' })}>
                    <td>{row.Libelle_Etape || `Étape ${row.Code_Etape}`}</td><td>{shortDate(row.Date_Etape)}</td><td title={row.Description || ''}>{row.Description}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </fieldset>

      <fieldset className="snr-group snr-suivi-group" disabled={busy || !data}>
        <legend>Appel ou courrier envoyé ou reçu (entre client, agence et compagnie)</legend>
        <div className="snr-suivi-form">
          <label><span>Date</span><input type="datetime-local" value={appel.Date_Appel} onChange={(event) => setAppel((value) => ({ ...value, Date_Appel: event.target.value }))} /></label>
          <label className="snr-suivi-text"><span>Observation</span>
            <input value={appel.Description} maxLength={200} onChange={(event) => setAppel((value) => ({ ...value, Description: event.target.value }))} onKeyDown={onEnter(saveAppel)} placeholder="Ex : appel du client, relance de la compagnie…" />
          </label>
          <label><span>Urgence</span>
            <select value={appel.Urgence} onChange={(event) => setAppel((value) => ({ ...value, Urgence: event.target.value }))}>
              {[...new Set([...urgences, appel.Urgence])].map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <div className="snr-suivi-actions">
            <button type="button" className="snr-tool snr-primary" onClick={saveAppel}>{appel.cmp ? 'Modifier' : 'Ajouter'}</button>
            {appel.cmp && <button type="button" className="snr-tool" onClick={removeAppel}>Supprimer</button>}
            {appel.cmp && <button type="button" className="snr-tool" onClick={() => setAppel(blankAppel())}>Annuler</button>}
          </div>
        </div>
        <div className="snr-table-wrap snr-suivi-table">
          <table className="snr-table">
            <thead><tr><th>Date</th><th>Observation</th><th>Urgence</th></tr></thead>
            <tbody>
              {!data ? <tr><td colSpan={3} className="snr-empty">Chargement…</td></tr>
                : data.appels.length === 0 ? <tr><td colSpan={3} className="snr-empty">Aucun appel ni courrier enregistré.</td></tr>
                : data.appels.map((row) => (
                  <tr key={row.Cmp} className={`is-clickable${appel.cmp === row.Cmp ? ' is-selected' : ''}`}
                    onClick={() => setAppel({ cmp: row.Cmp, Date_Appel: String(row.Date_Appel).slice(0, 16), Description: row.Description || '', Urgence: row.Urgence || 'Non Urgent' })}>
                    <td>{shortDateTime(row.Date_Appel)}</td><td title={row.Description || ''}>{row.Description}</td>
                    <td><span className={`snr-urgence${urgent(row.Urgence) ? ' is-urgent' : ''}`}>{row.Urgence || 'Non Urgent'}</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </fieldset>
    </div>
  );
}
