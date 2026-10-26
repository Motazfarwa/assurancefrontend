import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getClientOverview, listBanks } from '../../services/chequeApi';
import './RecetteModal.css';

const TYPES = ['Traite', 'Chèque', 'Virement', 'Espèces', 'Carte bancaire', 'Fictif'];
const today = () => new Date().toISOString().slice(0, 10);
const num = (value) => (value === '' || value == null ? 0 : Number(value) || 0);
const money = (value) => num(value).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const blankPiece = () => ({ typeReglement: 'Chèque', nump: '', acompte: '', montant: '', echeance: today(), code_banque: '', a_verser: true, en_instance: false });

export default function RecetteModal({ onClose }) {
  const { accessToken } = useAuth();
  const [banks, setBanks] = useState([]);
  const [code, setCode] = useState('');
  const [client, setClient] = useState(null);
  const [quittances, setQuittances] = useState([]);
  const [piece, setPiece] = useState(blankPiece);
  const [rows, setRows] = useState([]); // quittances added to the règlement
  const [selected, setSelected] = useState('');
  const [toPay, setToPay] = useState('');
  const [selectedRow, setSelectedRow] = useState('');
  const [error, setError] = useState('');

  const fictif = piece.typeReglement === 'Fictif';
  const noPiece = fictif || piece.typeReglement === 'Espèces';

  useEffect(() => {
    let active = true;
    listBanks(accessToken).then((list) => { if (active) setBanks(list); }).catch(() => {});
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    const value = code.trim();
    setRows([]); setSelected(''); setToPay(''); setSelectedRow('');
    if (!value) { setClient(null); setQuittances([]); return undefined; }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const overview = await getClientOverview(accessToken, value);
        if (!active) return;
        setClient(overview.client); setQuittances(overview.quittances); setError('');
      } catch (requestError) {
        if (!active) return;
        setClient(null); setQuittances([]); setError(requestError.message);
      }
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [accessToken, code]);

  const paid = useMemo(() => rows.reduce((sum, row) => sum + row.aRegler, 0), [rows]);
  const solde = num(piece.montant) - paid;
  // Quittances still unpaid and not yet added to this règlement.
  const available = quittances.filter((row) => !rows.some((added) => added.num_quittance === row.num_quittance));
  const current = quittances.find((row) => row.num_quittance === selected);
  const editedRow = rows.find((row) => row.num_quittance === selectedRow);
  const bankName = banks.find((bank) => bank.code_banque === piece.code_banque)?.nom_banque || '';
  const patch = (changes) => setPiece((value) => ({ ...value, ...changes }));

  // Picking a quittance fills its amounts; the amount to pay proposes what the règlement can cover.
  function pickQuittance(value) {
    setSelected(value); setSelectedRow(''); setError('');
    const row = quittances.find((item) => item.num_quittance === value);
    setToPay(row ? Math.max(0, Math.min(Number(row.solde), solde)).toFixed(3) : '');
  }

  function checkAmount(amount, quittanceSolde, room) {
    if (amount <= 0) return 'Le montant à régler doit être supérieur à zéro.';
    if (amount > quittanceSolde + 0.0005) return 'Le montant dépasse le solde de la quittance.';
    if (amount > room + 0.0005) return 'Le montant dépasse le solde du règlement.';
    return '';
  }

  function addQuittance() {
    if (!current) { setError('Choisissez une quittance.'); return; }
    const amount = num(toPay);
    const message = checkAmount(amount, Number(current.solde), solde);
    if (message) { setError(message); return; }
    setRows((list) => [...list, { num_quittance: current.num_quittance, montant: Number(current.solde), aRegler: amount }]);
    setSelected(''); setToPay(''); setError('');
  }

  function modifyRow() {
    if (!editedRow) { setError('Sélectionnez une ligne du tableau à modifier.'); return; }
    const amount = num(toPay);
    const message = checkAmount(amount, editedRow.montant, solde + editedRow.aRegler);
    if (message) { setError(message); return; }
    setRows((list) => list.map((row) => (row.num_quittance === selectedRow ? { ...row, aRegler: amount } : row)));
    setSelectedRow(''); setToPay(''); setError('');
  }

  function removeRow() {
    setRows((list) => list.filter((row) => row.num_quittance !== selectedRow));
    setSelectedRow(''); setToPay('');
  }

  function selectRow(row) {
    setSelected(''); setSelectedRow(row.num_quittance); setToPay(row.aRegler.toFixed(3)); setError('');
  }

  function leave() {
    if (rows.length && !window.confirm('Quitter la transaction ? Les quittances ajoutées seront perdues.')) return;
    onClose();
  }

  const shownMontant = editedRow ? editedRow.montant : current ? Number(current.solde) : null;

  return (
    <div className="rct-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) leave(); }}>
      <section className="rct-dialog" role="dialog" aria-modal="true" aria-labelledby="rct-title">
        <header className="rct-header">
          <div><span>COMPTABILITE · MODULE 570</span><h2 id="rct-title">Recette Technique</h2></div>
          <button type="button" onClick={leave} aria-label="Fermer">×</button>
        </header>

        <div className="rct-body">
          <fieldset className="rct-group">
            <legend>Saisie</legend>
            <label>N° Règlement<input value="Automatique" readOnly /></label>
            <label>Code client<input value={code} onChange={(event) => setCode(event.target.value)} maxLength={8} placeholder="Ex : 2973" /></label>
            <label className="rct-wide">Nom client<input value={client?.nom_client || ''} readOnly placeholder="Détecté automatiquement" /></label>
            <label>Date règlement<input type="date" value={today()} readOnly /></label>
          </fieldset>

          <fieldset className="rct-group">
            <legend>Règlement</legend>
            <label>Type règlement
              <select value={piece.typeReglement} onChange={(event) => patch({ typeReglement: event.target.value })}>
                {TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <label>N° pièce<input value={piece.nump} onChange={(event) => patch({ nump: event.target.value })} maxLength={20} disabled={fictif} /></label>
            <label>N° Acompte sans quit.<input value={piece.acompte} onChange={(event) => patch({ acompte: event.target.value })} /></label>
            <label>Montant règlement<input type="number" step="any" min="0" value={piece.montant} onChange={(event) => patch({ montant: event.target.value })} /></label>
            <label>Solde règlement<input value={money(solde)} readOnly className={solde < -0.0005 ? 'is-over' : ''} /></label>
          </fieldset>

          <div className="rct-row">
            <fieldset className="rct-group" disabled={noPiece}>
              <legend>Information pièce</legend>
              <label>Échéance<input type="date" value={piece.echeance} onChange={(event) => patch({ echeance: event.target.value })} /></label>
              <label>Cde banque
                <select value={piece.code_banque} onChange={(event) => patch({ code_banque: event.target.value })}>
                  <option value="">Aucun</option>
                  {banks.map((bank) => <option key={bank.code_banque} value={bank.code_banque}>{bank.code_banque}</option>)}
                </select>
              </label>
              <label className="rct-wide">Nom
                <select value={piece.code_banque} onChange={(event) => patch({ code_banque: event.target.value })} aria-label="Nom de la banque">
                  <option value="">Aucun</option>
                  {banks.map((bank) => <option key={bank.code_banque} value={bank.code_banque}>{bank.nom_banque}</option>)}
                </select>
              </label>
            </fieldset>
            <fieldset className="rct-group rct-flags" disabled={fictif}>
              <legend>Type et état de la pièce</legend>
              <label className="rct-check"><input type="checkbox" checked={piece.a_verser} onChange={(event) => patch({ a_verser: event.target.checked })} />À verser</label>
              <label className="rct-check"><input type="checkbox" checked={piece.en_instance} onChange={(event) => patch({ en_instance: event.target.checked })} />En instance</label>
              {bankName && <small>{bankName}</small>}
            </fieldset>
          </div>

          <fieldset className="rct-group rct-detail">
            <legend>Détail</legend>
            <div className="rct-detail-form">
              <label>N° quittance
                <select value={selected} onChange={(event) => pickQuittance(event.target.value)} disabled={!client}>
                  <option value="">{client ? (available.length ? '—' : 'Aucune quittance impayée') : 'Saisir un client'}</option>
                  {available.map((row) => <option key={row.num_quittance} value={row.num_quittance}>{row.num_quittance}</option>)}
                </select>
              </label>
              <label>Montant quittance<input value={shownMontant == null ? '' : money(shownMontant)} readOnly /></label>
              <label>Montant à régler<input type="number" step="any" min="0" value={toPay} onChange={(event) => setToPay(event.target.value)} disabled={shownMontant == null} /></label>
              <label>Reste quittance<input value={shownMontant == null ? '' : money(shownMontant - num(toPay))} readOnly /></label>
              <div className="rct-buttons">
                <button type="button" className="rct-tool" onClick={modifyRow} disabled={!editedRow}>Modifier</button>
                <button type="button" className="rct-add" onClick={addQuittance} disabled={!current} title="Ajouter la quittance au règlement" aria-label="Ajouter la quittance">›</button>
                <button type="button" className="rct-tool" onClick={removeRow} disabled={!editedRow}>Retirer</button>
              </div>
            </div>

            <div className="rct-table-wrap">
              <table className="rct-table">
                <thead><tr><th>N° Quittance</th><th>Montant quittance</th><th>Solde</th><th>Montant à régler</th><th>Reste</th><th>Type</th></tr></thead>
                <tbody>
                  {rows.length === 0 ? <tr><td colSpan={6} className="rct-empty">Aucune quittance ajoutée.</td></tr> : rows.map((row) => {
                    const reste = row.montant - row.aRegler;
                    return (
                      <tr key={row.num_quittance} className={`is-clickable${selectedRow === row.num_quittance ? ' is-selected' : ''}`} onClick={() => selectRow(row)}>
                        <td>{row.num_quittance}</td><td className="rct-number">{money(row.montant)}</td><td className="rct-number">{money(row.montant)}</td>
                        <td className="rct-number">{money(row.aRegler)}</td><td className="rct-number">{money(reste)}</td><td>{reste < 0.0005 ? 'P' : 'A'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </fieldset>

          {error && <p className="rct-error" role="alert">{error}</p>}
        </div>

        <footer className="rct-footer">
          <button type="button" className="rct-tool" onClick={() => patch({ typeReglement: 'Fictif' })} disabled={fictif}>Règlement fictif</button>
          <button type="button" className="rct-tool" onClick={leave}>Quitter transaction</button>
        </footer>
      </section>
    </div>
  );
}
