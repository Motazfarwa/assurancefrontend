import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { listCompanies } from '../../services/companyApi';
import { cancelFusion, currentMonth, fuseBordereau, getConfrontation, monthToPeriode } from '../../services/bordereauApi';
import { money, shortDate } from '../../services/bordereauReport';
import './BordereauModal.css';

export default function BordereauFusionModal({ onClose }) {
  const { accessToken } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState({ code_compagnie: '', tc: 'T', month: currentMonth() });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const periode = monthToPeriode(form.month);

  useEffect(() => {
    let active = true;
    listCompanies(accessToken)
      .then((rows) => { if (active) setCompanies(Array.isArray(rows) ? rows : rows.items || []); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [accessToken]);

  // Any change of the selection invalidates the displayed verification.
  function change(patch) {
    setForm((current) => ({ ...current, ...patch }));
    setResult(null);
    setNotice('');
  }

  async function verify() {
    setError('');
    setNotice('');
    if (!form.code_compagnie) { setError('Choisissez la compagnie.'); return; }
    if (!periode) { setError('Choisissez la période (mois).'); return; }
    setLoading(true);
    try {
      setResult(await getConfrontation(accessToken, { code_compagnie: form.code_compagnie, tc: form.tc, periode }));
    } catch (requestError) {
      setResult(null);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function fuse() {
    const { resume, bordereau } = result;
    const clean = resume.fusion;
    if (!clean && !window.confirm(`Le bordereau présente ${resume.nb_ecarts} écart(s), ${resume.nb_inconnues} police(s) inconnue(s) et ${resume.nb_non_parvenus} terme(s) non parvenu(s). Le fusionner quand même ?`)) return;
    setLoading(true);
    setError('');
    try {
      await fuseBordereau(accessToken, bordereau.id_bordereau, !clean);
      setNotice('Bordereau fusionné.');
      setResult(await getConfrontation(accessToken, { code_compagnie: form.code_compagnie, tc: form.tc, periode }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function unfuse() {
    if (!window.confirm('Annuler la fusion de ce bordereau ?')) return;
    setLoading(true);
    setError('');
    try {
      await cancelFusion(accessToken, result.bordereau.id_bordereau);
      setNotice('Fusion annulée.');
      setResult(await getConfrontation(accessToken, { code_compagnie: form.code_compagnie, tc: form.tc, periode }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  const anomalies = result ? result.lignes.filter((line) => line.statut !== 'ok') : [];
  const fused = Boolean(result?.resume.fusionne);

  return (
    <div className="bd-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
      <section className="bd-dialog" role="dialog" aria-modal="true" aria-labelledby="bd-fusion-title">
        <header className="bd-header">
          <div><span>COMPTABILITE · MODULE 550</span><h2 id="bd-fusion-title">Fusion bordereau</h2></div>
          <button type="button" onClick={onClose} aria-label="Fermer">×</button>
        </header>

        <div className="bd-form bd-form-confrontation">
          <label>Compagnie
            <select value={form.code_compagnie} onChange={(event) => change({ code_compagnie: event.target.value })}>
              <option value="">Sélectionner</option>
              {companies.map((company) => <option key={company.code_compagnie} value={company.code_compagnie}>{company.nom_compagnie}</option>)}
            </select>
          </label>
          <label>TC
            <select value={form.tc} onChange={(event) => change({ tc: event.target.value })}><option value="T">Terme</option><option value="C">Comptant</option></select>
          </label>
          <label>Période<input type="month" value={form.month} onChange={(event) => change({ month: event.target.value })} /></label>
          <button type="button" className="bd-tool" onClick={verify} disabled={loading}>{loading ? 'Vérification…' : 'Vérifier le bordereau'}</button>
        </div>

        {error && <p className="bd-error" role="alert">{error}</p>}
        {notice && !error && <p className="bd-notice" role="status">{notice}</p>}
        {!result && !error && <p className="bd-notice">Choisissez la compagnie et la période : le bordereau reçu est comparé avec vos polices et quittances, puis vous pouvez le fusionner. La fusion marque le bordereau comme traité ; vos polices et quittances ne sont pas modifiées.</p>}

        {result && (
          <div className="bd-report">
            <p className="bd-report-meta">
              <span>Bordereau n° {result.bordereau.id_bordereau} · {result.bordereau.nom_compagnie} · {result.bordereau.tc === 'T' ? 'Terme' : 'Comptant'} {result.bordereau.periode}</span>
              <span className={fused ? 'is-ok' : 'is-warn'}>
                {fused ? `Fusionné le ${shortDate(result.bordereau.date_fusion)}${result.bordereau.fusion_par ? ` par ${result.bordereau.fusion_par}` : ''}` : 'N\'est pas encore fusionné'}
              </span>
            </p>
            <div className="bd-summary">
              <div><strong>{result.resume.nb_lignes}</strong><span>lignes</span></div>
              <div className="is-ok"><strong>{result.resume.nb_ok}</strong><span>concordantes</span></div>
              <div className={result.resume.nb_ecarts ? 'is-warn' : ''}><strong>{result.resume.nb_ecarts}</strong><span>écarts</span></div>
              <div className={result.resume.nb_inconnues ? 'is-warn' : ''}><strong>{result.resume.nb_inconnues}</strong><span>polices inconnues</span></div>
              <div className={result.resume.nb_non_parvenus ? 'is-warn' : ''}><strong>{result.resume.nb_non_parvenus}</strong><span>termes non parvenus</span></div>
              <div><strong>{money(result.resume.total_prime_total)}</strong><span>total bordereau</span></div>
            </div>
            <h3>{anomalies.length ? `Anomalies (${anomalies.length})` : 'Aucune anomalie'}</h3>
            {anomalies.length > 0 && (
              <div className="bd-grid-wrap bd-report-table">
                <table className="bd-grid">
                  <thead><tr><th>Ligne</th><th>N° Police</th><th>Client</th><th>Motifs</th></tr></thead>
                  <tbody>{anomalies.slice(0, 100).map((line) => (
                    <tr key={line.id_ligne} className={line.statut === 'inconnue' ? 'is-unknown' : 'is-gap'}>
                      <td>{line.ligne}</td><td>{line.num_police}</td><td>{line.nom_client || line.nom_client_notre || ''}</td><td>{line.motifs.join(' ; ')}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {anomalies.length > 100 && <p className="bd-notice">Seules les 100 premières anomalies sont affichées : ouvrez « Confrontation bordereau » pour la liste complète.</p>}
          </div>
        )}

        <footer className="bd-footer">
          <span>{result && result.resume.nb_non_parvenus > 0 ? `${result.resume.nb_non_parvenus} terme(s) attendu(s) ne figurent pas dans le bordereau.` : ''}</span>
          <div>
            {result && !fused && <button type="button" className="bd-save" onClick={fuse} disabled={loading}>Fusionner le bordereau</button>}
            {result && fused && <button type="button" className="bd-danger" onClick={unfuse} disabled={loading}>Annuler la fusion</button>}
            <button type="button" className="bd-tool" onClick={onClose}>Fermer</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
