import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { API_BASE_URL } from '../../services/apiBase';
import { createQuittance } from '../../services/clientRecordsApi';
import { ClientPickDialog } from '../ModuleLinks/ModuleLinks';

const today = () => new Date().toISOString().slice(0, 10);
const num = (value) => (value === '' || value == null ? null : Number(value));
const at = (day) => (day ? `${day}T00:00:00` : null);
// A police en vigueur: état AN (affaire nouvelle) or RV (remise en vigueur), and not expired (as in Gestion des polices).
export const inForce = (police) => ['AN', 'RV'].includes(String(police.etat || '').trim().toUpperCase())
  && (!police.expiration || String(police.expiration).slice(0, 10) >= today());

// "Nouvelle quittance" (Gestion des quittances): the client, one of its polices, then the quittance. Its montant and its
// solde are the prime totale (nothing paid yet); the number is given by the server when left empty.
export default function NewQuittanceDialog({ moduleId, onSaved, onClose }) {
  const { accessToken } = useAuth();
  const [client, setClient] = useState(null);
  const [polices, setPolices] = useState(null);
  const [allPolices, setAllPolices] = useState(false); // also the polices not in force
  const [values, setValues] = useState({ num_int: '', num_quittance: '', date_emission: today(), echeance: today(), tc: 'C', prime_net: '', prime_total: '', commission: '' });
  const [state, setState] = useState({ busy: false, error: '' });
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!client) return undefined;
    let active = true;
    setPolices(null);
    fetch(`${API_BASE_URL}/api/polices/client/${encodeURIComponent(client.code)}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` } })
      .then((response) => response.json().then((body) => (response.ok && Array.isArray(body) ? body : [])))
      .catch(() => [])
      .then((rows) => {
        if (!active) return;
        setPolices(rows);
        // the first police en vigueur is chosen
        const first = rows.find(inForce);
        setValues((current) => ({ ...current, num_int: first ? String(first.num_int).trim() : '' }));
      });
    return () => { active = false; };
  }, [accessToken, client]);

  // The quittance is for a police en vigueur; the others only when asked for.
  const shownPolices = (polices || []).filter((police) => allPolices || inForce(police) || String(police.num_int).trim() === values.num_int);
  const label = (police) => `${police.num_police || police.num_int} · ${police.nom_compagnie || ''}${police.risque ? ` · ${police.risque}` : ''}${inForce(police) ? '' : ` · ${String(police.etat || '').trim() || '?'}${police.expiration ? `, expirée le ${String(police.expiration).slice(0, 10).split('-').reverse().join('/')}` : ''}`}`;

  if (!client) return <ClientPickDialog kicker={`MODULE ${moduleId} · NOUVELLE QUITTANCE`} title="Pour quel client ?" onPick={setClient} onClose={onClose} />;

  async function submit(event) {
    event.preventDefault();
    if (!values.num_int) { setState({ busy: false, error: 'Choisissez la police de la quittance.' }); return; }
    if (num(values.prime_total) == null) { setState({ busy: false, error: 'La prime totale est obligatoire.' }); return; }
    setState({ busy: true, error: '' });
    try {
      const total = num(values.prime_total);
      const result = await createQuittance(accessToken, {
        num_int: values.num_int, code_client: client.code, num_quittance: values.num_quittance.trim() || null,
        date_saisie: at(today()), date_emission: at(values.date_emission), echeance: at(values.echeance), tc: values.tc,
        prime_net: num(values.prime_net), prime_total: total, commission: num(values.commission), montant_quittance: total, solde_quittance: total,
      });
      onSaved(result.num_quittance, client);
    } catch (error) {
      setState({ busy: false, error: error.message });
    }
  }

  return <div className="module-links-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !state.busy) onClose(); }}>
    <form className="module-links-dialog" role="dialog" aria-modal="true" aria-labelledby="new-quittance-title" onSubmit={submit} noValidate>
      <header><div><span>MODULE {moduleId} · NOUVELLE QUITTANCE</span><h3 id="new-quittance-title">Client {client.code} {client.nom}</h3></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></header>
      {polices === null ? <p className="module-links-hint">Chargement des polices du client…</p>
        : !polices.length ? <p className="module-links-error">Ce client n’a aucune police : saisissez d’abord sa police (Gestion des polices · Nouvelle police).</p>
          : <>
            <label className="module-links-field"><span>Police * <small>· {polices.filter(inForce).length} en vigueur sur {polices.length}</small></span>
              <select value={values.num_int} onChange={(event) => set('num_int', event.target.value)}>
                {!values.num_int && <option value="">{shownPolices.length ? 'Choisir une police…' : 'Aucune police en vigueur'}</option>}
                {shownPolices.map((police) => <option key={police.num_int} value={String(police.num_int).trim()}>{label(police)}</option>)}
              </select></label>
            {polices.some((police) => !inForce(police)) && <label className="module-links-check"><input type="checkbox" checked={allPolices} onChange={(event) => setAllPolices(event.target.checked)} /> Voir aussi les polices non en vigueur</label>}
            <div className="module-links-grid">
              <label className="module-links-field"><span>N° quittance</span><input value={values.num_quittance} maxLength={15} onChange={(event) => set('num_quittance', event.target.value)} placeholder="Automatique si vide" /></label>
              <label className="module-links-field"><span>TC</span><select value={values.tc} onChange={(event) => set('tc', event.target.value)}><option value="C">C · comptant</option><option value="T">T · terme</option></select></label>
              <label className="module-links-field"><span>Date émission</span><input type="date" value={values.date_emission} onChange={(event) => set('date_emission', event.target.value)} /></label>
              <label className="module-links-field"><span>Échéance</span><input type="date" value={values.echeance} onChange={(event) => set('echeance', event.target.value)} /></label>
              <label className="module-links-field"><span>Prime nette</span><input type="number" step="0.001" value={values.prime_net} onChange={(event) => set('prime_net', event.target.value)} /></label>
              <label className="module-links-field"><span>Prime totale *</span><input type="number" step="0.001" value={values.prime_total} onChange={(event) => set('prime_total', event.target.value)} /></label>
              <label className="module-links-field"><span>Commission</span><input type="number" step="0.001" value={values.commission} onChange={(event) => set('commission', event.target.value)} /></label>
            </div>
          </>}
      {state.error && <p className="module-links-error" role="alert">{state.error}</p>}
      <footer className="module-links-footer">
        <button type="button" className="module-links-action" onClick={() => setClient(null)} disabled={state.busy}>← Autre client</button>
        <button type="submit" className="module-links-action is-primary" disabled={state.busy || !polices?.length}>{state.busy ? 'Enregistrement…' : 'Enregistrer la quittance'}</button>
      </footer>
    </form>
  </div>;
}
