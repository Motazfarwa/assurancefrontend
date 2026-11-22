import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { listTables, scanTable } from '../../services/controleTablesApi';
import './ControleTablesModal.css';

// Contrôle des tables (administrateur): every table of the database, scanned one by one or all together, and for the
// table chosen its anomalies: rows entered twice (doublons exacts), several rows with the same key (one of them often
// only an incomplete copy of the other), rows without key. Nothing is changed here: it is only read.
const VERDICTS = {
  identiques: ['Identiques', 'Les lignes sont la même information : une seule est à garder.'],
  incomplete: ['Une copie incomplète', 'Une ligne a toutes les informations ; l’autre n’en reprend qu’une partie (à supprimer).'],
  differentes: ['Informations différentes', 'Les lignes ont la même clé mais des informations différentes : à vérifier.'],
};
const STATES = { identique: 'Identique', incomplete: 'Incomplète', complete: 'Complète' };

const shown = (value) => (value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));
const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;

function anomalies(result) {
  if (!result) return null;
  return (result.doublons_exacts?.lignes_en_trop || 0) + (result.doublons_cle?.groupes || 0) + (result.cles_vides || 0);
}

function Summary({ result }) {
  const count = anomalies(result);
  if (result?.error) return <span className="ctm-badge is-error" title={result.error}>Erreur</span>;
  if (count === null) return null;
  return count ? <span className="ctm-badge is-bad">{count}</span> : <span className="ctm-badge is-ok">OK</span>;
}

export default function ControleTablesModal({ moduleId, onClose }) {
  const { accessToken } = useAuth();
  const [tables, setTables] = useState([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [onlyBad, setOnlyBad] = useState(false);
  const [summaries, setSummaries] = useState({}); // table -> counts of the scan (or { error })
  const [scanAll, setScanAll] = useState(null); // { done, total } while every table is scanned
  const [selected, setSelected] = useState('');
  const [keys, setKeys] = useState([]);
  const [detail, setDetail] = useState({ loading: false, error: '', data: null });

  useEffect(() => {
    let active = true;
    listTables(accessToken)
      .then((data) => { if (active) setTables(data.items || []); })
      .catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, [accessToken]);

  const table = tables.find((item) => item.table === selected);
  const shownTables = useMemo(() => tables.filter((item) => item.table.toLowerCase().includes(filter.trim().toLowerCase())
    && (!onlyBad || anomalies(summaries[item.table]) > 0)), [tables, filter, onlyBad, summaries]);

  async function analyse(name, chosenKeys) {
    setDetail({ loading: true, error: '', data: null });
    try {
      const data = await scanTable(accessToken, name, { cles: chosenKeys });
      setDetail({ loading: false, error: '', data });
      setSummaries((current) => ({ ...current, [name]: data }));
    } catch (scanError) {
      setDetail({ loading: false, error: scanError.message, data: null });
    }
  }

  function choose(name) {
    const item = tables.find((entry) => entry.table === name);
    setSelected(name);
    setKeys(item?.cle || []);
    analyse(name, item?.cle || []);
  }

  async function scanEverything() {
    setScanAll({ done: 0, total: tables.length });
    for (let at = 0; at < tables.length; at += 1) {
      const name = tables[at].table;
      try {
        // eslint-disable-next-line no-await-in-loop
        const data = await scanTable(accessToken, name, { resume: true });
        setSummaries((current) => ({ ...current, [name]: data }));
      } catch (scanError) {
        setSummaries((current) => ({ ...current, [name]: { error: scanError.message } }));
      }
      setScanAll({ done: at + 1, total: tables.length });
    }
    setScanAll(null);
    setOnlyBad(true);
  }

  const toggleKey = (column) => setKeys((current) => (current.includes(column) ? current.filter((key) => key !== column) : [...current, column]));
  const scanned = Object.values(summaries).filter((item) => !item.error);
  const withAnomalies = scanned.filter((item) => anomalies(item) > 0).length;
  const { data } = detail;

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !scanAll) onClose(); }}>
    <section className="unpaid-modal ctm-modal" role="dialog" aria-modal="true" aria-labelledby="ctm-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>PARAMÉTRAGE · MODULE {moduleId} · ADMINISTRATEUR</span><h2 id="ctm-title">Contrôle des tables</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer" disabled={Boolean(scanAll)}>×</button></header>
      <div className="ctm-body">
        <aside className="ctm-tables">
          <div className="ctm-tools">
            <input type="search" aria-label="Rechercher une table" placeholder="Rechercher une table" value={filter} onChange={(event) => setFilter(event.target.value)} data-keep-case />
            <button type="button" className="expert-submit" onClick={scanEverything} disabled={!tables.length || Boolean(scanAll)}>
              {scanAll ? `Analyse ${scanAll.done} / ${scanAll.total}…` : 'Analyser toutes les tables'}
            </button>
            <label className="ctm-only"><input type="checkbox" checked={onlyBad} onChange={(event) => setOnlyBad(event.target.checked)} /> Seulement les tables avec anomalies</label>
            {scanned.length > 0 && <p className="ctm-status" role="status">{plural(scanned.length, 'table')} analysée{scanned.length > 1 ? 's' : ''} · {plural(withAnomalies, 'table')} avec anomalies</p>}
          </div>
          {error && <div className="expert-error" role="alert">{error}</div>}
          <ul className="ctm-list" aria-label="Tables">
            {shownTables.map((item) => <li key={item.table}>
              <button type="button" className={item.table === selected ? 'is-selected' : ''} onClick={() => choose(item.table)}>
                <span><b>{item.table}</b><small>{summaries[item.table]?.lignes ?? item.lignes_estimees} lignes{item.cle.length ? ` · clé : ${item.cle.join(' + ')}` : ''}</small></span>
                <Summary result={summaries[item.table]} />
              </button>
            </li>)}
            {!shownTables.length && <li className="ctm-empty">{tables.length ? 'Aucune table.' : 'Chargement…'}</li>}
          </ul>
        </aside>

        <main className="ctm-detail">
          {!table && <p className="ctm-hint">Choisissez une table à gauche pour voir ses anomalies, ou « Analyser toutes les tables » pour savoir lesquelles en ont. Rien n’est modifié : la base est seulement lue.</p>}
          {table && <>
            <div className="ctm-keys">
              <span>Clé de <b>{table.table}</b> (les colonnes qui doivent être uniques) :</span>
              <div className="ctm-key-list">
                {table.colonnes.map((column) => <label key={column} className={keys.includes(column) ? 'is-on' : ''}>
                  <input type="checkbox" checked={keys.includes(column)} onChange={() => toggleKey(column)} />{column}
                </label>)}
              </div>
              <button type="button" className="expert-submit" onClick={() => analyse(table.table, keys)} disabled={detail.loading}>Analyser</button>
            </div>
            {detail.loading && <p className="ctm-hint" role="status">Analyse de {table.table}…</p>}
            {detail.error && <div className="expert-error" role="alert">{detail.error}</div>}
            {data && !detail.loading && <TableResult data={data} />}
          </>}
        </main>
      </div>
    </section>
  </div>;
}

function TableResult({ data }) {
  const keyColumns = data.cle;
  const nothing = !data.doublons_exacts.groupes && !data.doublons_cle?.groupes && !data.cles_vides;
  return <div className="ctm-result">
    <div className="ctm-cards">
      <div><b>{data.lignes}</b><span>lignes</span></div>
      <div className={data.doublons_exacts.groupes ? 'is-bad' : ''}><b>{data.doublons_exacts.lignes_en_trop}</b><span>lignes en double (identiques)</span></div>
      <div className={data.doublons_cle?.groupes ? 'is-bad' : ''}><b>{data.doublons_cle ? data.doublons_cle.groupes : '—'}</b><span>{data.doublons_cle ? `clés en double (${data.doublons_cle.lignes} lignes)` : 'clés en double (aucune clé choisie)'}</span></div>
      <div className={data.cles_vides ? 'is-bad' : ''}><b>{data.cles_vides ?? '—'}</b><span>lignes sans clé</span></div>
    </div>
    {nothing && <p className="ctm-ok" role="status">Aucune anomalie dans {data.table}{keyColumns.length ? '' : ' (sans clé choisie, seuls les doublons exacts sont cherchés)'}.</p>}

    {data.groupes?.length > 0 && <section className="ctm-section">
      <h3>Même clé sur plusieurs lignes ({data.doublons_cle.groupes}{data.doublons_cle.groupes > data.groupes.length ? `, les ${data.groupes.length} premières` : ''})</h3>
      {data.groupes.map((group) => <Group key={JSON.stringify(group.cle)} group={group} keyColumns={keyColumns} />)}
    </section>}

    {data.exacts?.length > 0 && <section className="ctm-section">
      <h3>Lignes identiques en double ({data.doublons_exacts.groupes})</h3>
      <div className="ctm-scroll"><table className="ctm-table">
        <thead><tr><th>Fois</th><th>Lignes (ctid)</th>{data.colonnes.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{data.exacts.map((row) => <tr key={row.ctids.join()}>
          <td className="is-bad">{row.fois}</td><td className="ctm-ctid">{row.ctids.join(' ')}</td>
          {data.colonnes.map((column) => <td key={column}>{shown(row.valeurs[column])}</td>)}
        </tr>)}</tbody>
      </table></div>
    </section>}

    {data.vides?.length > 0 && <section className="ctm-section">
      <h3>Lignes sans clé ({data.cles_vides})</h3>
      <div className="ctm-scroll"><table className="ctm-table">
        <thead><tr><th>Ligne (ctid)</th>{data.colonnes.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{data.vides.map((row) => <tr key={row.ctid}>
          <td className="ctm-ctid">{row.ctid}</td>{data.colonnes.map((column) => <td key={column} className={keyColumns.includes(column) && row.valeurs[column] == null ? 'is-missing' : ''}>{shown(row.valeurs[column])}</td>)}
        </tr>)}</tbody>
      </table></div>
    </section>}
  </div>;
}

// A group of rows with the same key: the key, the columns that differ, and each row (complete, incomplete, identical).
function Group({ group, keyColumns }) {
  const [label, hint] = VERDICTS[group.verdict] || [group.verdict, ''];
  const columns = [...keyColumns, ...group.colonnes_differentes.filter((column) => !keyColumns.includes(column))];
  return <article className={`ctm-group is-${group.verdict}`}>
    <header>
      <b>{keyColumns.map((key) => `${key} = ${group.cle[key]}`).join(' · ')}</b>
      <span>{group.nombre} lignes</span>
      <span className="ctm-verdict" title={hint}>{label}</span>
    </header>
    <p className="ctm-group-hint">{hint}{group.colonnes_differentes.length ? ` Colonnes différentes : ${group.colonnes_differentes.join(', ')}.` : ''}</p>
    <div className="ctm-scroll"><table className="ctm-table">
      <thead><tr><th>Ligne (ctid)</th><th>État</th><th>Remplies</th>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
      <tbody>{group.lignes.map((row) => <tr key={row.ctid} className={`is-${row.etat}`}>
        <td className="ctm-ctid">{row.ctid}</td><td><span className={`ctm-state is-${row.etat}`}>{STATES[row.etat] || row.etat}</span></td><td>{row.remplies}</td>
        {columns.map((column) => <td key={column} className={row.valeurs[column] == null && !keyColumns.includes(column) ? 'is-missing' : ''}>{shown(row.valeurs[column]) || '∅'}</td>)}
      </tr>)}</tbody>
    </table></div>
  </article>;
}
