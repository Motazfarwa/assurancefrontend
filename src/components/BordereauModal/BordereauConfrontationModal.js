import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { listCompanies } from '../../services/companyApi';
import { currentMonth, getConfrontation, monthToPeriode } from '../../services/bordereauApi';
import { exportReportExcel, money, printReport, shortDate } from '../../services/bordereauReport';
import './BordereauModal.css';

const STATUS_LABELS = { ok: 'Concordant', ecart: 'Écart', inconnue: 'Police inconnue' };
const nameOf = (code, name) => [code, name].filter(Boolean).join(' ');

const COLUMNS = {
  notReceived: [
    { key: 'num_police', label: 'N° Police' },
    { label: 'Code et Nom Client', value: (row) => nameOf(row.code_client, row.nom_client) },
    { key: 'echeance', label: 'Échéance' }, { key: 'unite', label: 'Unité' }, { key: 'duree', label: 'Durée' },
    { key: 'etat', label: 'État' }, { key: 'observation', label: 'Observation' },
  ],
  anomalies: [
    { key: 'ligne', label: 'Ligne' }, { key: 'num_police', label: 'N° Police' },
    { label: 'Client (bordereau)', value: (row) => nameOf(row.code_client, row.nom_client) },
    { label: 'Client (chez nous)', value: (row) => nameOf(row.code_client_notre, row.nom_client_notre) },
    { key: 'echeance', label: 'Échéance', kind: 'date' }, { key: 'prime_total', label: 'Prime totale', kind: 'money' },
    { label: 'Statut', value: (row) => STATUS_LABELS[row.statut] || row.statut },
    { key: 'motifs', label: 'Motifs' },
  ],
  bordereau: [
    { key: 'ligne', label: 'Ligne' }, { key: 'num_quittance', label: 'N° Quittance' }, { key: 'num_police', label: 'N° Police' },
    { key: 'code_client', label: 'C. Client' }, { key: 'echeance', label: 'Échéance', kind: 'date' },
    { key: 'prime_net', label: 'P. Net + C.Q.', kind: 'money' }, { key: 'prime_total', label: 'Prime Total', kind: 'money' },
    { key: 'commission', label: 'Commission', kind: 'money' },
    { label: 'Statut', value: (row) => STATUS_LABELS[row.statut] || row.statut },
  ],
  branches: [
    { key: 'code_branche', label: 'Code branche' }, { key: 'nom_branche', label: 'Nom branche' },
    { key: 'nb_bordereau', label: 'Lignes bordereau' }, { key: 'prime_net', label: 'Prime nette', kind: 'money' },
    { key: 'commission', label: 'Commission', kind: 'money' }, { key: 'prime_total', label: 'Prime totale', kind: 'money' },
    { key: 'nb_attendues', label: 'Attendues chez nous' }, { key: 'nb_non_parvenues', label: 'Non parvenues' },
  ],
};

function Table({ columns, rows, empty, rowClass }) {
  return (
    <div className="bd-grid-wrap bd-report-table">
      <table className="bd-grid">
        <thead><tr>{columns.map((column) => <th key={column.label}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={columns.length} className="bd-empty">{empty}</td></tr> : rows.map((row, index) => (
            <tr key={`${row.num_police || row.code_branche}-${index}`} className={rowClass?.(row)}>
              {columns.map((column) => {
                const value = typeof column.value === 'function' ? column.value(row) : row[column.key];
                return <td key={column.label} className={column.kind === 'money' ? 'is-number' : undefined}>{column.kind === 'money' ? money(value) : column.kind === 'date' ? shortDate(value) : Array.isArray(value) ? value.join(' ; ') : value ?? ''}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BordereauConfrontationModal({ onClose }) {
  const { accessToken } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState({ code_compagnie: '', tc: 'T', month: currentMonth() });
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState('confrontation');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const periode = monthToPeriode(form.month);
  const companyName = companies.find((company) => String(company.code_compagnie) === String(form.code_compagnie))?.nom_compagnie || '';

  useEffect(() => {
    let active = true;
    listCompanies(accessToken)
      .then((rows) => { if (active) setCompanies(Array.isArray(rows) ? rows : rows.items || []); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [accessToken]);

  const anomalies = useMemo(() => (result ? result.lignes.filter((line) => line.statut !== 'ok') : []), [result]);
  const branchTotals = useMemo(() => {
    if (!result) return [];
    const total = result.branches.reduce((sum, row) => ({
      code_branche: 'TOTAL', nom_branche: '', nb_bordereau: sum.nb_bordereau + row.nb_bordereau, prime_net: sum.prime_net + row.prime_net,
      commission: sum.commission + row.commission, prime_total: sum.prime_total + row.prime_total,
      nb_attendues: sum.nb_attendues + row.nb_attendues, nb_non_parvenues: sum.nb_non_parvenues + row.nb_non_parvenues,
    }), { nb_bordereau: 0, prime_net: 0, commission: 0, prime_total: 0, nb_attendues: 0, nb_non_parvenues: 0 });
    return [...result.branches, total];
  }, [result]);

  async function run(nextTab) {
    setError('');
    if (!form.code_compagnie) { setError('Choisissez la compagnie.'); return; }
    if (!periode) { setError('Choisissez la période (mois).'); return; }
    setLoading(true);
    try {
      setResult(await getConfrontation(accessToken, { code_compagnie: form.code_compagnie, tc: form.tc, periode }));
      setTab(nextTab);
    } catch (requestError) {
      setResult(null);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  const heading = `Nom Compagnie : ${companyName}    TC : ${form.tc === 'T' ? 'Terme' : 'Comptant'}    Période : ${periode}`;
  const fusionText = result?.resume.fusion ? 'Bordereau fusionné (aucun écart)' : 'Bordereau N\'est Pas Encore Fusionné';
  const sections = {
    confrontation: [
      { title: 'Terme non parvenu', columns: COLUMNS.notReceived, rows: result?.non_parvenus || [] },
      { title: 'Écarts et anomalies du bordereau', columns: COLUMNS.anomalies, rows: anomalies },
    ],
    bordereau: [{ title: 'État de bordereau', columns: COLUMNS.bordereau, rows: result?.lignes || [] }],
    branches: [{ title: 'Totaux par code branche', columns: COLUMNS.branches, rows: branchTotals }],
  };
  const titles = { confrontation: 'État de confrontation', bordereau: 'État de bordereau', branches: 'Liste des totaux par code branche' };

  return (
    <div className="bd-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
      <section className="bd-dialog bd-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="bd-confrontation-title">
        <header className="bd-header">
          <div><span>COMPTABILITE · MODULE 540</span><h2 id="bd-confrontation-title">Confrontation / Liste des totaux par code branche</h2></div>
          <button type="button" onClick={onClose} aria-label="Fermer">×</button>
        </header>

        <div className="bd-form bd-form-confrontation">
          <label>Compagnie
            <select value={form.code_compagnie} onChange={(event) => setForm((current) => ({ ...current, code_compagnie: event.target.value }))}>
              <option value="">Sélectionner</option>
              {companies.map((company) => <option key={company.code_compagnie} value={company.code_compagnie}>{company.nom_compagnie}</option>)}
            </select>
          </label>
          <label>TC
            <select value={form.tc} onChange={(event) => setForm((current) => ({ ...current, tc: event.target.value }))}><option value="T">Terme</option><option value="C">Comptant</option></select>
          </label>
          <label>Période<input type="month" value={form.month} onChange={(event) => setForm((current) => ({ ...current, month: event.target.value }))} /></label>
          <button type="button" className="bd-save" onClick={() => run('confrontation')} disabled={loading}>{loading ? 'Comparaison…' : 'Confrontation'}</button>
          <button type="button" className="bd-tool" onClick={() => run('branches')} disabled={loading}>Liste des totaux par code branche</button>
        </div>

        {error && <p className="bd-error" role="alert">{error}</p>}

        {!result && !error && <p className="bd-notice">Choisissez la compagnie, le type et la période, puis cliquez sur « Confrontation » : le bordereau reçu du siège est comparé avec vos polices et quittances.</p>}

        {result && (
          <>
            <div className="bd-summary">
              <div><strong>{result.resume.nb_lignes}</strong><span>lignes bordereau</span></div>
              <div className="is-ok"><strong>{result.resume.nb_ok}</strong><span>concordantes</span></div>
              <div className={result.resume.nb_ecarts ? 'is-warn' : ''}><strong>{result.resume.nb_ecarts}</strong><span>écarts</span></div>
              <div className={result.resume.nb_inconnues ? 'is-warn' : ''}><strong>{result.resume.nb_inconnues}</strong><span>polices inconnues</span></div>
              <div className={result.resume.nb_non_parvenus ? 'is-warn' : ''}><strong>{result.resume.nb_non_parvenus}</strong><span>termes non parvenus (sur {result.resume.nb_attendues})</span></div>
              <div><strong>{money(result.resume.total_prime_total)}</strong><span>total bordereau</span></div>
            </div>

            <div className="bd-tabs" role="tablist">
              {Object.entries(titles).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : undefined} onClick={() => setTab(key)}>{label}</button>)}
              <span className="bd-spacer" />
              <button type="button" className="bd-tool" onClick={() => printReport({ title: titles[tab], lines: [heading, `Fusion : ${fusionText}`], sections: sections[tab] })}>Imprimer</button>
              <button type="button" className="bd-tool" onClick={() => exportReportExcel(`${titles[tab].replace(/\s+/g, '_')}_${periode.replace('/', '-')}.xlsx`, sections[tab])}>Exporter Excel</button>
            </div>

            <div className="bd-report">
              <p className="bd-report-meta"><span>{heading}</span><span className={result.resume.fusion ? 'is-ok' : 'is-warn'}>Fusion : {fusionText}</span></p>
              {tab === 'confrontation' && (
                <>
                  <h3>Terme non parvenu <small>({result.non_parvenus.length})</small></h3>
                  <Table columns={COLUMNS.notReceived} rows={result.non_parvenus} empty="Tous les termes attendus figurent dans le bordereau." />
                  <h3>Écarts et anomalies du bordereau <small>({anomalies.length})</small></h3>
                  <Table columns={COLUMNS.anomalies} rows={anomalies} empty="Aucun écart : toutes les lignes du bordereau concordent." rowClass={(row) => (row.statut === 'inconnue' ? 'is-unknown' : 'is-gap')} />
                </>
              )}
              {tab === 'bordereau' && <Table columns={COLUMNS.bordereau} rows={result.lignes} empty="Bordereau vide." rowClass={(row) => (row.statut === 'ok' ? undefined : row.statut === 'inconnue' ? 'is-unknown' : 'is-gap')} />}
              {tab === 'branches' && <Table columns={COLUMNS.branches} rows={branchTotals} empty="Aucune donnée." rowClass={(row) => (row.code_branche === 'TOTAL' ? 'is-total' : undefined)} />}
            </div>
          </>
        )}

        <footer className="bd-footer"><span /><div><button type="button" className="bd-tool" onClick={onClose}>Fermer</button></div></footer>
      </section>
    </div>
  );
}
