import { useEffect, useState } from 'react';
import { getJournalPeriods } from '../../services/journalApi';

const fmt = (value) => Number(value || 0).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const shortDate = (value) => formatDate(value).slice(0, 5);
const stamp = (value) => (value ? `${formatDate(value)} à ${String(value).slice(11, 16)}` : '');
const PAGE = 12;

const NAMES = {
  encaissement: { title: 'Journal d’encaissement', what: 'quittance', whats: 'quittances', verb: 'déclarée', done: 'déclaré' },
  depense: { title: 'Journal de dépense', what: 'dépense', whats: 'dépenses', verb: 'comptabilisée', done: 'comptabilisé' },
};
const plural = (count, one, many) => `${count} ${count > 1 ? many : one}`;

// "Lister": one line per journal of the half months (the 15th, the last day of the month), from the one of the date back,
// and one per other day lines were declared on (the old software also declared on the 14th, the 30th...), as its JEQ:
// a journal holds what was declared on its own date. Journal d'encaissement: a quittance still to declare (unticked) is
// in every journal from its payment on, until it is ticked (declared): then only in the journal of that date.
// Each journal, as the legacy JEQ: what is declared on its date plus what is paid by then and still to declare, its total
// (the Total général of the legacy JEQ). No "Valider" here: the journals are validated with the feuille de caisse
// (module "Feuille de caisse", Aperçu · Valider).
export default function JournalPeriods({ kind, accessToken, date, compagnie, nature, companyName, reloadKey, onOpen }) {
  const names = NAMES[kind];
  const [count, setCount] = useState(PAGE);
  const [state, setState] = useState({ loading: true, error: '', items: [], older: null });

  useEffect(() => { setCount(PAGE); }, [date, compagnie, nature, reloadKey]);
  useEffect(() => {
    if (!date) return undefined;
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    getJournalPeriods(accessToken, { type: kind, date, compagnie, nature, nombre: count })
      .then((body) => { if (active) setState({ loading: false, error: '', items: body.items || [], older: body.anterieur || null }); })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, items: [], older: null }); });
    return () => { active = false; };
  }, [accessToken, kind, date, compagnie, nature, count, reloadKey]);

  return <section className="unpaid-results jrn-periods" aria-label="Journaux par quinzaine">
    <div className="unpaid-results-heading">
      <div><span>UN JOURNAL PAR QUINZAINE (LE 15 ET LE DERNIER JOUR DU MOIS) ET PAR AUTRE DATE DE DÉCLARATION · {companyName || 'TOUTES LES COMPAGNIES'}{kind === 'depense' && nature ? ` · ${nature === 'S' ? 'SINISTRES' : 'RISTOURNES'}` : ''}</span>
        <h3>{state.loading && !state.items.length ? 'Chargement…' : `${plural(state.items.length, 'journal', 'journaux')}`}</h3></div>
    </div>
    {state.error && <div className="expert-error unpaid-error" role="alert">{state.error}</div>}
    <div className="unpaid-table-scroll cqi-scroll jrn-scroll"><table className="unpaid-table jrn-table jrn-period-table">
      <thead><tr><th>Journal</th><th className="cqi-number">Lignes</th><th className="cqi-number">Total montant</th><th>État</th><th /></tr></thead>
      <tbody>{state.items.map((item) => {
        // only a validation recorded in the new system makes a journal "Validé"; one whose lines are all already
        // comptabilisées (by the old software) is still to validate
        const open = !item.validation;
        const pending = Number(item.a_declarer) > 0;
        return <tr key={item.jour} className={open ? 'is-open' : ''}>
          <td><button type="button" className="jrn-period-name" onClick={() => onOpen(item.jour)}>{names.title} du {formatDate(item.jour)}</button><small>{item.quinzaine === false ? `déclaré le ${shortDate(item.jour)}` : `du ${shortDate(item.debut)} au ${shortDate(item.jour)}`}</small></td>
          <td className="cqi-number">{item.lignes}</td>
          <td className="cqi-number"><b>{fmt(item.montant)}</b></td>
          <td>{item.validation ? <span className="jrn-period-state is-done">Validé le {stamp(item.validation.date_saisie)}{item.validation.utilisateur ? ` par ${item.validation.utilisateur}` : ''}</span>
            : <span className="jrn-period-state">À valider{pending ? '' : ` · tout est ${names.done}`}</span>}</td>
          <td className="jrn-period-actions">
            <button type="button" className="expert-cancel" onClick={() => onOpen(item.jour)}>Détails</button>
          </td>
        </tr>;
      })}</tbody>
    </table></div>
    {state.older && Number(state.older.a_declarer) > 0 && <p className="jrn-period-older">{plural(state.older.a_declarer, names.what, names.whats)} ({fmt(state.older.montant_a_declarer)} TND) réglée{state.older.a_declarer > 1 ? 's' : ''} avant le {formatDate(state.older.avant)} reste{state.older.a_declarer > 1 ? 'nt' : ''} à déclarer dans un journal plus ancien.</p>}
    <div className="jrn-period-more"><button type="button" className="expert-cancel" onClick={() => setCount((value) => value + PAGE)} disabled={state.loading}>{state.loading ? 'Chargement…' : 'Journaux plus anciens'}</button></div>

  </section>;
}
