import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { listCompanies } from '../../services/companyApi';
import { listReturns, setReturn } from '../../services/journalApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import '../AcompteModal/AcompteModal.css';
import '../ChequeInstanceModal/ChequeInstanceModal.css';
import './JournalModal.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => money.format(Number(value || 0));
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
// The month before the current one ("2026-10" in November 2026): the period usually returned.
const previousMonth = () => {
  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
};
const toPeriode = (month) => (/^\d{4}-\d{2}$/.test(month) ? `${month.slice(5)}/${month.slice(0, 4)}` : '');

// Module "Retour": the quittances of a company, type and period; ticking « Retour » gives the quittance back to the
// company (its return date is saved), unticking takes the return back.
export default function RetourQuittancesModal({ moduleId, onClose }) {
  const { accessToken } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState('');
  const [tc, setTc] = useState('C');
  const [month, setMonth] = useState(previousMonth);
  const [onlyReturned, setOnlyReturned] = useState(false);
  const [state, setState] = useState({ loading: false, error: '', items: [] });
  const [saving, setSaving] = useState('');
  const [notice, setNotice] = useState('');
  const periode = toPeriode(month);

  useEffect(() => {
    let active = true;
    listCompanies(accessToken)
      .then((result) => { if (active) setCompanies(Array.isArray(result) ? result : result.items || []); })
      .catch((requestError) => { if (active) setState((current) => ({ ...current, error: requestError.message })); });
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    if (!company || !periode) { setState({ loading: false, error: '', items: [] }); return undefined; }
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    listReturns(accessToken, { code_compagnie: company, tc, periode, retournees: onlyReturned })
      .then((data) => { if (active) setState({ loading: false, error: '', items: data.items || [] }); })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, items: [] }); });
    return () => { active = false; };
  }, [accessToken, company, tc, periode, onlyReturned]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function toggle(row, retour) {
    const paid = Number(row.prime_total || 0) - Number(row.solde_quittance || 0);
    if (retour && paid > 0.0005
      && !window.confirm(`La quittance N° ${row.num_quittance} a déjà reçu ${fmt(paid)} TND de règlement. La retourner quand même à la compagnie ?`)) return;
    setSaving(row.num_quittance);
    setNotice('');
    try {
      const body = await setReturn(accessToken, { num_quittance: row.num_quittance, num_police: row.num_police, retour });
      setState((current) => ({
        ...current,
        error: '',
        items: current.items.map((item) => (item.num_quittance === row.num_quittance && item.num_police === row.num_police ? { ...item, date_retour: body.date_retour } : item)),
      }));
      setNotice(retour ? `Quittance N° ${row.num_quittance} retournée à la compagnie.` : `Retour de la quittance N° ${row.num_quittance} annulé.`);
    } catch (requestError) {
      setState((current) => ({ ...current, error: requestError.message }));
    } finally {
      setSaving('');
    }
  }

  const returned = state.items.filter((row) => row.date_retour);
  const total = returned.reduce((sum, row) => sum + Number(row.prime_total || 0), 0);
  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="unpaid-modal jrn-modal" role="dialog" aria-modal="true" aria-labelledby="retour-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>PRODUCTION · MODULE {moduleId}</span><h2 id="retour-title">Retour</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form acompte-filters">
          <label className="acompte-field jrn-company"><span>Compagnie</span>
            <select value={company} onChange={(event) => setCompany(event.target.value)} autoFocus>
              <option value="">Choisir…</option>
              {companies.map((item) => <option key={item.code_compagnie} value={item.code_compagnie}>{item.nom_compagnie}</option>)}
            </select>
          </label>
          <label className="acompte-field jrn-date"><span>TC</span>
            <select value={tc} onChange={(event) => setTc(event.target.value)}><option value="C">Comptant</option><option value="T">Terme</option></select>
          </label>
          <label className="acompte-field jrn-date"><span>Période</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
          <label className="jrn-check"><input type="checkbox" checked={onlyReturned} onChange={(event) => setOnlyReturned(event.target.checked)} />Retournées seulement</label>
        </div>

        {state.error && <div className="expert-error unpaid-error" role="alert">{state.error}</div>}
        {notice && <div className="cqi-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Masquer">×</button></div>}
        <section className="unpaid-results">
          <div className="unpaid-results-heading">
            <div><span>QUITTANCES {tc === 'C' ? 'COMPTANT' : 'TERME'} DE LA PÉRIODE {periode} · COCHEZ « RETOUR » POUR LES RETOURNER À LA COMPAGNIE</span>
              <h3>{state.loading ? 'Chargement…' : company ? `${state.items.length} quittance${state.items.length > 1 ? 's' : ''} · ${returned.length} retournée${returned.length > 1 ? 's' : ''}` : 'Choisissez la compagnie'}</h3></div>
            <div className="unpaid-total"><small>Total retourné</small><strong>{fmt(total)} TND</strong></div>
          </div>
          {company && !state.loading && state.items.length === 0 ? <div className="unpaid-empty">Aucune quittance {onlyReturned ? 'retournée ' : ''}pour cette compagnie et cette période.</div>
            : company && <div className="unpaid-table-scroll cqi-scroll jrn-scroll"><table className="unpaid-table jrn-table jrn-return-table">
              <thead><tr><th>N° Police</th><th>Code Clt</th><th>Nom Client</th><th>Echéance</th><th>N° Quit.</th><th className="cqi-number">P.Net</th><th className="cqi-number">Com.</th><th className="cqi-number">P.Total</th><th className="cqi-number">Solde</th><th className="cqi-verser">Retour</th></tr></thead>
              <tbody>{state.items.map((row) => <tr key={`${row.num_police}-${row.num_quittance}`} className={row.date_retour ? 'is-returned' : undefined}>
                <td>{row.num_police}</td><td>{row.code_client}</td><td>{row.nom_client}</td><td>{formatDate(row.echeance)}</td><td>{row.num_quittance}</td>
                <td className="cqi-number">{fmt(row.prime_net)}</td><td className="cqi-number">{fmt(row.commission)}</td><td className="cqi-number">{fmt(row.prime_total)}</td><td className="cqi-number">{fmt(row.solde_quittance)}</td>
                <td className="cqi-verser"><input type="checkbox" aria-label={`Retour de la quittance ${row.num_quittance}`} checked={Boolean(row.date_retour)} disabled={Boolean(saving)} onChange={(event) => toggle(row, event.target.checked)} />
                  {row.date_retour && <small>{formatDate(row.date_retour)}</small>}</td>
              </tr>)}</tbody>
            </table></div>}
        </section>
      </div>
    </section>
  </div>;
}
