import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { listHistory, listHistoryUsers } from '../../services/historiqueApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../CompanyManagementModal/CompanyManagementModal.css';
import './HistoriqueModal.css';

// The movements written in TMouchard (legacy wording, "Suppresion" included).
const MOVES = [['Ajout', 'Ajout'], ['Modification', 'Modification'], ['Suppresion', 'Suppression'], ['Tentative', 'Tentative'], ['Consultation', 'Consultation'], ['Impression', 'Impression'], ['Annulation', 'Annulation']];
const PAGE = 200;
const today = () => new Date().toISOString().slice(0, 10);
const frDate = (value) => (value ? value.split('-').reverse().join('/') : '');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Historique des actions (administrator): who did what and when, newest first.
export default function HistoriqueModal({ onClose }) {
  const { accessToken } = useAuth();
  const [filters, setFilters] = useState({ du: today(), au: today(), utilisateur: '', mvt: '', q: '' });
  const [applied, setApplied] = useState(filters);
  const [users, setUsers] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { listHistoryUsers(accessToken).then(setUsers).catch(() => setUsers([])); }, [accessToken]);

  const load = useCallback(async (criteria, offset = 0) => {
    setLoading(true); setError('');
    try {
      const result = await listHistory(accessToken, { ...criteria, offset, limit: PAGE });
      setRows((current) => (offset ? [...current, ...result.items] : result.items));
      setTotal(result.total);
    } catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [accessToken]);

  useEffect(() => { load(applied); }, [load, applied]);

  const change = (name, value) => setFilters((current) => ({ ...current, [name]: value }));
  function search(event) { event.preventDefault(); setApplied({ ...filters }); }

  function print() {
    const page = window.open('', '_blank');
    if (!page) { setError('Autorisez les fenêtres pop-up pour imprimer.'); return; }
    const body = rows.map((row) => `<tr><td>${frDate(row.date)}</td><td>${escapeHtml(row.heure)}</td><td>${escapeHtml(row.utilisateur)}</td><td>${escapeHtml(row.mvt)}</td><td>${escapeHtml(row.design)}</td></tr>`).join('');
    page.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Journal des événements</title><style>body{font:11px Arial,sans-serif;color:#1c3342;margin:22px}h1{font-size:16px;margin:0 0 4px}p{margin:0 0 12px;color:#5f7480}table{width:100%;border-collapse:collapse}th,td{border:1px solid #c9d6db;padding:4px 6px;text-align:left}th{background:#eef4f5}</style></head><body><h1>Journal des événements</h1><p>Du ${frDate(applied.du)} au ${frDate(applied.au)}${applied.utilisateur ? ` · ${escapeHtml(applied.utilisateur)}` : ''}${applied.mvt ? ` · ${escapeHtml(applied.mvt)}` : ''} · ${rows.length} action(s)</p><table><thead><tr><th>Date</th><th>Heure</th><th>Utilisateur</th><th>Mouvement</th><th>Désignation</th></tr></thead><tbody>${body}</tbody></table></body></html>`);
    page.document.close();
    page.focus();
    page.print();
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="catalog-modal his-modal" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali · Siège</small></span></div><div className="expert-title"><span>ADMINISTRATION</span><h2 id="history-title">Historique des actions</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <form className="his-filters" onSubmit={search}>
        <label><span>Du</span><input type="date" value={filters.du} onChange={(event) => change('du', event.target.value)} required /></label>
        <label><span>Au</span><input type="date" value={filters.au} min={filters.du} onChange={(event) => change('au', event.target.value)} required /></label>
        <label><span>Utilisateur</span><select value={filters.utilisateur} onChange={(event) => change('utilisateur', event.target.value)}><option value="">Tous</option>{users.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label><span>Mouvement</span><select value={filters.mvt} onChange={(event) => change('mvt', event.target.value)}><option value="">Tous</option>{MOVES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="his-search"><span>Désignation contient</span><input value={filters.q} onChange={(event) => change('q', event.target.value)} placeholder="Ex : Quittance N° 341175, client 4894…" maxLength={100} /></label>
        <button type="submit" className="expert-submit" disabled={loading}>Rechercher</button>
      </form>
      {error && <div className="expert-error catalog-message cmp-message" role="alert">{error}</div>}
      <div className="his-table-wrap">
        {!rows.length ? <p className="catalog-empty">{loading ? 'Chargement de l’historique…' : 'Aucune action sur cette période.'}</p> : <table>
          <thead><tr><th>Date</th><th>Heure</th><th>Utilisateur</th><th>Mouvement</th><th>Désignation</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.n}>
            <td>{frDate(row.date)}</td><td>{row.heure}</td><td><b>{row.utilisateur}</b></td>
            <td><span className={`his-move his-move-${row.code ?? 0}`}>{row.mvt === 'Suppresion' ? 'Suppression' : row.mvt}</span></td><td>{row.design}</td>
          </tr>)}</tbody>
        </table>}
      </div>
      <footer className="his-footer">
        <span>{rows.length} / {total} action(s)</span>
        <div>
          {rows.length < total && <button type="button" className="expert-cancel" onClick={() => load(applied, rows.length)} disabled={loading}>{loading ? 'Chargement…' : 'Afficher plus'}</button>}
          <button type="button" className="expert-cancel" onClick={print} disabled={!rows.length}>Imprimer</button>
          <button type="button" className="expert-submit" onClick={onClose}>Fermer</button>
        </div>
      </footer>
    </section>
  </div>;
}
