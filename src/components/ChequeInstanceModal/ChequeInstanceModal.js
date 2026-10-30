import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { listAccounts, listPiecesToPayIn, payInPiece } from '../../services/chequeApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import '../AcompteModal/AcompteModal.css';
import './ChequeInstanceModal.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const amount = (value) => Number(value || 0);
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—');
const TYPES = { C: 'Chèque', T: 'Traite', V: 'Virement', E: 'Espèce', B: 'Carte bancaire' };
const today = () => new Date().toISOString().slice(0, 10);
const SEARCH_FIELDS = { nom: 'Nom client', piece: 'N° pièce', echeance: 'Échéance' };

// Chèques et traites en instance: the pieces not paid into the bank yet. Ticking "Verser" asks for the agency account the
// piece is paid into; the piece then becomes a client settlement and leaves the list.
export default function ChequeInstanceModal({ onClose, moduleId = '565' }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', items: [] });
  const [accounts, setAccounts] = useState([]);
  const [echeance, setEcheance] = useState('tous'); // tous | echus | non_echus
  const [field, setField] = useState('nom');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(null); // the piece being paid in: { row, compte, saving, error }
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([listPiecesToPayIn(accessToken), listAccounts(accessToken)])
      .then(([items, comptes]) => { if (active) { setState({ loading: false, error: '', items: items || [] }); setAccounts(comptes || []); } })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, items: [] }); });
    return () => { active = false; };
  }, [accessToken]);

  // Escape closes the account choice first, then the module.
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') { if (pending) { if (!pending.saving) setPending(null); } else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, onClose]);

  const shown = useMemo(() => {
    const day = today();
    const text = search.trim().toLocaleLowerCase();
    return state.items.filter((row) => {
      const due = String(row.datep || '').slice(0, 10);
      if (echeance === 'echus' && !(due && due <= day)) return false;
      if (echeance === 'non_echus' && !(due > day)) return false;
      if (!text) return true;
      const value = field === 'nom' ? `${row.nom_client || ''} ${row.code_client || ''}` : field === 'piece' ? row.nump : formatDate(row.datep);
      return String(value || '').toLocaleLowerCase().includes(text);
    });
  }, [state.items, echeance, field, search]);
  const total = shown.reduce((sum, row) => sum + amount(row.montant), 0);

  async function confirm() {
    if (!pending.compte) { setPending({ ...pending, error: 'Choisissez le compte de versement.' }); return; }
    setPending({ ...pending, saving: true, error: '' });
    const { row, compte } = pending;
    try {
      const body = await payInPiece(accessToken, { nump: row.nump, code_client: row.code_client, compte_versement: compte });
      setState((current) => ({ ...current, items: current.items.filter((item) => !(item.nump === row.nump && item.code_client === row.code_client)) }));
      const name = accounts.find((account) => account.code_banque === compte)?.nom_banque || compte;
      setNotice(`${TYPES[row.typep] || 'Pièce'} ${row.nump} (${money.format(amount(row.montant))} TND) versé sur ${name}${body?.num_reg_cli ? ` · règlement n° ${body.num_reg_cli}` : ''}.`);
      setPending(null);
    } catch (requestError) {
      setPending((current) => current && { ...current, saving: false, error: requestError.message });
    }
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <section className="unpaid-modal" role="dialog" aria-modal="true" aria-labelledby="cheque-instance-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>RECOUVREMENT · MODULE {moduleId}</span><h2 id="cheque-instance-title">Recette Technique</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form acompte-filters">
          <fieldset className="unpaid-filter-set unpaid-choice"><legend>Échéance</legend>
            <label><input type="radio" name="cqi-echeance" checked={echeance === 'tous'} onChange={() => setEcheance('tous')} /> Toutes</label>
            <label><input type="radio" name="cqi-echeance" checked={echeance === 'echus'} onChange={() => setEcheance('echus')} /> Échus</label>
            <label><input type="radio" name="cqi-echeance" checked={echeance === 'non_echus'} onChange={() => setEcheance('non_echus')} /> Non échus</label>
          </fieldset>
          <fieldset className="unpaid-filter-set unpaid-choice"><legend>Rechercher par</legend>
            {Object.entries(SEARCH_FIELDS).map(([key, label]) => <label key={key}><input type="radio" name="cqi-field" checked={field === key} onChange={() => setField(key)} /> {label}</label>)}
          </fieldset>
          <label className="acompte-field"><span>{SEARCH_FIELDS[field]}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={field === 'echeance' ? 'jj/mm/aaaa' : 'Rechercher…'} /></label>
          <button type="button" className="expert-cancel" onClick={() => { setSearch(''); setEcheance('tous'); }} disabled={!search && echeance === 'tous'}>Effacer</button>
        </div>

        {state.error && <div className="expert-error unpaid-error" role="alert">{state.error}</div>}
        {notice && <div className="cqi-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Masquer">×</button></div>}
        <section className="unpaid-results">
          <div className="unpaid-results-heading">
            <div><span>PIÈCES NON VERSÉES · COCHEZ « VERSER » POUR LES DÉPOSER SUR UN COMPTE DE L’AGENCE</span><h3>{state.loading ? 'Chargement…' : `${shown.length} pièce${shown.length > 1 ? 's' : ''}`}</h3></div>
            <div className="unpaid-total"><small>Total</small><strong>{money.format(total)} TND</strong></div>
          </div>
          {!state.loading && shown.length === 0 ? <div className="unpaid-empty">Aucune pièce en instance ne correspond aux critères.</div> : <div className="unpaid-table-scroll cqi-scroll"><table className="unpaid-table cqi-table">
            <thead><tr><th>Échéance</th><th>N° pièce</th><th>Client</th><th>Date saisie</th><th className="cqi-number">Montant</th><th>Type</th><th>Banque</th><th className="cqi-verser">Verser</th></tr></thead>
            <tbody>{shown.map((row) => {
              const due = String(row.datep || '').slice(0, 10);
              return <tr key={`${row.code_client}-${row.nump}`} className={due && due <= today() ? 'is-due' : ''}>
                <td>{formatDate(row.datep)}</td><td><strong>{row.nump}</strong></td>
                <td><strong>{row.nom_client || 'Client non renseigné'}</strong><small>{row.code_client}</small></td>
                <td>{formatDate(row.dates)}</td><td className="cqi-number">{money.format(amount(row.montant))}</td>
                <td>{TYPES[row.typep] || row.typep}</td><td>{row.nom_banque || '—'}</td>
                <td className="cqi-verser"><input type="checkbox" aria-label={`Verser la pièce ${row.nump}`} checked={pending?.row === row}
                  onChange={() => setPending({ row, compte: accounts.length === 1 ? accounts[0].code_banque : '', saving: false, error: '' })} /></td>
              </tr>;
            })}</tbody>
          </table></div>}
        </section>
      </div>
    </section>

    {pending && <div className="cqi-popup-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending.saving) setPending(null); }}>
      <section className="cqi-popup" role="dialog" aria-modal="true" aria-labelledby="cqi-popup-title">
        <h3 id="cqi-popup-title">Verser la pièce</h3>
        <dl>
          <dt>Pièce</dt><dd>{TYPES[pending.row.typep] || pending.row.typep} <b>{pending.row.nump}</b></dd>
          <dt>Client</dt><dd>{pending.row.nom_client} ({pending.row.code_client})</dd>
          <dt>Montant</dt><dd><b>{money.format(amount(pending.row.montant))} TND</b></dd>
          <dt>Échéance</dt><dd>{formatDate(pending.row.datep)}</dd>
        </dl>
        <label className="acompte-field"><span>Compte de versement (banque de l’agence)</span>
          <select value={pending.compte} onChange={(event) => setPending({ ...pending, compte: event.target.value, error: '' })} disabled={pending.saving} autoFocus>
            <option value="">Choisir le compte…</option>
            {accounts.map((account) => <option key={account.code_banque} value={account.code_banque}>{account.nom_banque} ({account.code_banque})</option>)}
          </select>
        </label>
        {pending.error && <div className="expert-error" role="alert">{pending.error}</div>}
        <footer>
          <button type="button" className="expert-cancel" onClick={() => setPending(null)} disabled={pending.saving}>Annuler</button>
          <button type="button" className="expert-submit" onClick={confirm} disabled={pending.saving}>{pending.saving ? 'Versement…' : 'Verser'}</button>
        </footer>
      </section>
    </div>}
  </div>;
}
