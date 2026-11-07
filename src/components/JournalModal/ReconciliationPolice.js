import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { changePoliceClient, findClient, findPolice, renameNumber } from '../../services/reconciliationApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import '../AcompteModal/AcompteModal.css';
import '../ChequeInstanceModal/ChequeInstanceModal.css';
import './JournalModal.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => money.format(Number(value || 0));
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const RENAMES = [['police', 'Police', 'N° Police'], ['quittance', 'Quittance', 'N° Quittance'], ['attestation', 'Attestation', 'N° Attestation']];
const TABLE_COUNT = (tables) => Object.entries(tables || {}).map(([table, count]) => `${table} : ${count}`).join(' · ');

// "Mise à jour Police Quittance Attestation": an old number replaced by the new one, wherever it is used.
function RenameDialog({ initialPolice, onDone, onClose }) {
  const { accessToken } = useAuth();
  const [values, setValues] = useState({ police: [initialPolice || '', ''], quittance: ['', ''], attestation: ['', ''] });
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState({ error: '', notice: '' });

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const set = (kind, index, value) => setValues((current) => ({ ...current, [kind]: index ? [current[kind][0], value] : [value, current[kind][1]] }));

  async function apply(kind, label) {
    const [ancien, nouveau] = values[kind].map((value) => value.trim());
    if (!window.confirm(`Remplacer le N° ${label.toLowerCase()} ${ancien} par ${nouveau} partout où il est utilisé ?`)) return;
    setSaving(kind); setMessage({ error: '', notice: '' });
    try {
      const result = await renameNumber(accessToken, kind, ancien, nouveau);
      setMessage({ error: '', notice: `N° ${label.toLowerCase()} ${ancien} remplacé par ${nouveau} (${TABLE_COUNT(result.tables)}).` });
      setValues((current) => ({ ...current, [kind]: ['', ''] }));
      onDone(kind, ancien, nouveau);
    } catch (requestError) {
      setMessage({ error: requestError.message, notice: '' });
    } finally {
      setSaving('');
    }
  }

  return <div className="jrn-sheet-backdrop rcn-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="unpaid-modal rcn-rename" role="dialog" aria-modal="true" aria-labelledby="rcn-rename-title">
      <header className="expert-modal-header"><div className="expert-title"><span>RECODIFICATION DE CLIENT</span><h2 id="rcn-rename-title">Rectification N° Police / N° Quittance / N° Attestation</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        {message.error && <div className="expert-error unpaid-error" role="alert">{message.error}</div>}
        {message.notice && <div className="cqi-notice" role="status">{message.notice}<button type="button" onClick={() => setMessage({ error: '', notice: '' })} aria-label="Masquer">×</button></div>}
        <div className="rcn-rename-grid">
          {RENAMES.map(([kind, label]) => <div key={kind} className="rcn-rename-row">
            <label className="acompte-field"><span>Ancienne {label}</span><input value={values[kind][0]} onChange={(event) => set(kind, 0, event.target.value)} maxLength={30} /></label>
            <span className="rcn-arrow" aria-hidden="true">→</span>
            <label className="acompte-field"><span>Nouvelle {label}</span><input value={values[kind][1]} onChange={(event) => set(kind, 1, event.target.value)} maxLength={30} /></label>
          </div>)}
        </div>
        <div className="rcn-rename-actions">
          {RENAMES.map(([kind, label, number]) => <button key={kind} type="button" className="expert-submit" onClick={() => apply(kind, label)}
            disabled={Boolean(saving) || !values[kind][0].trim() || !values[kind][1].trim()}>{saving === kind ? 'Mise à jour…' : `Mise à jour ${number}`}</button>)}
          <button type="button" className="expert-cancel" onClick={onClose}>Quitter</button>
        </div>
        <p className="jrn-hint">Le nouveau numéro remplace l’ancien dans la police ou la quittance et dans tout ce qui s’y rattache (règlements, pièces, dépenses, attestations, sinistres, bordereaux). Un numéro déjà utilisé est refusé.</p>
      </div>
    </section>
  </div>;
}

// Module "Recodification de client": a police goes to another client with all its quittances; "Mise à jour Police Quittance Attestation" corrects a wrong number.
export default function ReconciliationPoliceModal({ moduleId, onClose }) {
  const { accessToken } = useAuth();
  const [numero, setNumero] = useState('');
  const [polices, setPolices] = useState([]);
  const [selected, setSelected] = useState(0);
  const [newCode, setNewCode] = useState('');
  const [newClient, setNewClient] = useState({ loading: false, error: '', client: null });
  const [state, setState] = useState({ loading: false, error: '', notice: '', searched: '' });
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const police = polices[selected] || null;

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !renaming) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, renaming]);

  // The new client's name, read as the code is typed.
  useEffect(() => {
    const code = newCode.trim();
    if (!code) { setNewClient({ loading: false, error: '', client: null }); return undefined; }
    let active = true;
    setNewClient({ loading: true, error: '', client: null });
    const timer = setTimeout(() => {
      findClient(accessToken, code)
        .then((client) => { if (active) setNewClient({ loading: false, error: '', client }); })
        .catch((requestError) => { if (active) setNewClient({ loading: false, error: requestError.message, client: null }); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [accessToken, newCode]);

  // Only the answer to the latest search is shown (the N° police is searched as it is typed).
  const searchId = useRef(0);

  async function search(number = numero, notice = '') {
    const value = number.trim();
    const id = ++searchId.current;
    if (!value) { setPolices([]); setState({ loading: false, error: '', notice: '', searched: '' }); return; }
    setState({ loading: true, error: '', notice, searched: value });
    try {
      const { items = [] } = await findPolice(accessToken, value);
      if (id !== searchId.current) return;
      setPolices(items);
      setSelected(0);
      setState({ loading: false, error: items.length ? '' : `Aucune police N° ${value}.`, notice, searched: value });
    } catch (requestError) {
      if (id !== searchId.current) return;
      setPolices([]);
      setState({ loading: false, error: requestError.message, notice: '', searched: value });
    }
  }

  // The police and its client show as the N° is typed (a short pause after the last key).
  const typingTimer = useRef(null);
  useEffect(() => () => clearTimeout(typingTimer.current), []);
  function typeNumero(value) {
    setNumero(value);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => search(value), 350);
  }

  const quittances = police?.quittances || [];
  const sameClient = Boolean(police && newClient.client && newClient.client.code_client === police.code_client);
  const canValidate = Boolean(police && newClient.client && !sameClient && !saving);

  async function validate() {
    const count = quittances.length;
    const message = `Passer la police N° ${police.num_police} du client ${police.code_client} (${police.nom_client || ''}) au client ${newClient.client.code_client} (${newClient.client.nom_client || ''}), avec ${count > 1 ? `ses ${count} quittances` : count ? 'sa quittance' : 'aucune quittance'}, ses sinistres et les règlements qui ne paient que cette police ?`;
    if (!window.confirm(message)) return;
    setSaving(true);
    try {
      const result = await changePoliceClient(accessToken, { num_int: police.num_int, code_client: newClient.client.code_client });
      setNewCode('');
      await search(state.searched || numero, `Police N° ${result.numero} passée au client ${result.code_client} : ${result.quittances} quittance(s), ${result.sinistres} sinistre(s), ${result.reglements} règlement(s).${result.reglements_restes ? ` ${result.reglements_restes} règlement(s) restent chez l’ancien client : ils paient aussi une autre police ou leur N° de pièce existe déjà chez le nouveau client.` : ''}`);
    } catch (requestError) {
      setState((current) => ({ ...current, error: requestError.message, notice: '' }));
    } finally {
      setSaving(false);
    }
  }

  // After a correction in the popup, the police shown is read again (under its new number when it was renamed).
  function renamed(kind, ancien, nouveau) {
    if (!state.searched) return;
    if (kind === 'police' && state.searched === ancien) { setNumero(nouveau); search(nouveau); } else search(state.searched);
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !renaming) onClose(); }}>
    <section className="unpaid-modal jrn-modal" role="dialog" aria-modal="true" aria-labelledby="rcn-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>PRODUCTION · MODULE {moduleId}</span><h2 id="rcn-title">Recodification de client</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="rcn-top"><button type="button" className="expert-cancel" onClick={() => setRenaming(true)}>Mise à jour Police Quittance Attestation</button></div>

        <h4 className="rcn-section">Information police</h4>
        <form className="unpaid-filter-form acompte-filters" onSubmit={(event) => { event.preventDefault(); clearTimeout(typingTimer.current); search(); }}>
          <label className="acompte-field jrn-company"><span>N° Police{state.loading ? ' · recherche…' : ''}</span><input value={numero} onChange={(event) => typeNumero(event.target.value)} maxLength={30} autoFocus /></label>
          {polices.length > 1 && <label className="acompte-field jrn-company"><span>{polices.length} polices portent ce N°</span>
            <select value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
              {polices.map((item, index) => <option key={item.num_int} value={index}>{item.num_police} · {item.nom_compagnie || '—'} · client {item.code_client}</option>)}
            </select>
          </label>}
          <label className="acompte-field jrn-date"><span>Code client</span><input value={police?.code_client || ''} readOnly /></label>
          <label className="acompte-field"><span>Nom client</span><input value={police?.nom_client || ''} readOnly /></label>
        </form>
        {police && <p className="jrn-hint rcn-police-info">Compagnie : <b>{police.nom_compagnie || '—'}</b> · N° interne : <b>{police.num_int}</b> · Etat : <b>{police.etat || '—'}</b> · Effet : <b>{formatDate(police.effet)}</b></p>}

        <h4 className="rcn-section">Nouveau code client</h4>
        <div className="unpaid-filter-form acompte-filters">
          <label className="acompte-field jrn-date"><span>Code client</span><input value={newCode} onChange={(event) => setNewCode(event.target.value)} maxLength={8} disabled={!police} /></label>
          <label className="acompte-field"><span>Nom client</span><input value={newClient.loading ? 'Recherche…' : newClient.client?.nom_client || ''} readOnly /></label>
          <button type="button" className="expert-submit jrn-open" onClick={validate} disabled={!canValidate}>{saving ? 'Validation…' : 'Valider'}</button>
        </div>
        {newClient.error && <div className="expert-error unpaid-error" role="alert">{newClient.error}</div>}
        {sameClient && <div className="expert-error unpaid-error" role="alert">La police appartient déjà à ce client.</div>}
        {state.error && <div className="expert-error unpaid-error" role="alert">{state.error}</div>}
        {state.notice && <div className="cqi-notice" role="status">{state.notice}<button type="button" onClick={() => setState((current) => ({ ...current, notice: '' }))} aria-label="Masquer">×</button></div>}

        <section className="unpaid-results">
          <div className="unpaid-results-heading"><div><span>LISTE DES QUITTANCES · TOUTES PASSENT AU NOUVEAU CLIENT</span>
            <h3>{police ? `${quittances.length} quittance${quittances.length > 1 ? 's' : ''}` : 'Saisissez le N° police'}</h3></div></div>
          {police && (quittances.length === 0 ? <div className="unpaid-empty">Aucune quittance pour cette police : seule la police changera de client.</div>
            : <div className="unpaid-table-scroll cqi-scroll jrn-scroll"><table className="unpaid-table jrn-table">
              <thead><tr><th>Nom client</th><th>N° Quittance</th><th>Date saisie</th><th>Echéance</th><th>TC</th><th className="cqi-number">P.Net</th><th className="cqi-number">P.Total</th><th className="cqi-number">Solde quit.</th><th>Comptabilisée</th></tr></thead>
              <tbody>{quittances.map((row) => <tr key={row.num_quittance}>
                <td>{row.nom_client}</td><td><strong>{row.num_quittance}</strong></td><td>{formatDate(row.date_saisie)}</td><td>{formatDate(row.echeance)}</td><td>{row.tc}</td>
                <td className="cqi-number">{fmt(row.prime_net)}</td><td className="cqi-number">{fmt(row.prime_total)}</td><td className="cqi-number">{fmt(row.solde_quittance)}</td>
                <td>{row.comptabilise ? 'Oui' : 'Non'}</td>
              </tr>)}</tbody>
            </table></div>)}
        </section>
      </div>
    </section>
    {renaming && <RenameDialog initialPolice={police?.num_police || ''} onDone={renamed} onClose={() => setRenaming(false)} />}
  </div>;
}
