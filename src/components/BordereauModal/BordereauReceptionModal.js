import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { listCompanies } from '../../services/companyApi';
import { BORDEREAU_FIELDS, buildLines, looksLikeMillimes, readBordereauFile, scaleMillimes } from '../../services/bordereauParser';
import { currentMonth, deleteBordereau, getBordereau, getBordereauClients, listBordereaux, monthToPeriode, nextMonth, saveBordereau } from '../../services/bordereauApi';
import { money, printReport, shortDate } from '../../services/bordereauReport';
import './BordereauModal.css';

// Terme: the head office's file for the coming due month. Comptant: the receipts issued in the month.
const KINDS = {
  T: { module: '530', title: 'Réception terme', label: 'Terme', importLabel: 'Importer Terme', month: nextMonth },
  C: { module: '535', title: 'Réception comptant', label: 'Comptant', importLabel: 'Importer Comptant', month: currentMonth },
};
const today = () => new Date().toISOString().slice(0, 10);
const cleanNumber = (value) => String(value ?? '').trim().replace(/\.0+$/, '');
const emptyLine = () => ({ num_police: '', code_client: '', nom_client: '', echeance: '', num_quittance: '', prime_net: '', commission: '', prime_total: '' });
const GRID = [
  ['num_police', 'N° Police (num_int)'], ['code_client', 'Code Clt'], ['nom_client', 'Nom Client'], ['echeance', 'Échéance', 'date'],
  ['num_quittance', 'N° Quit.'], ['prime_net', 'P.Net+C.Q.', 'money'], ['commission', 'Com.', 'money'], ['prime_total', 'Prime Total', 'money'],
];

function fromApi(line) {
  return { ...line, echeance: line.echeance ? String(line.echeance).slice(0, 10) : null };
}

export default function BordereauReceptionModal({ onClose, tc = 'T' }) {
  const kind = KINDS[tc] || KINDS.T;
  const { accessToken } = useAuth();
  const fileInput = useRef(null);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState({ code_compagnie: '', tc, month: kind.month(), date_reception: today() });
  const [clients, setClients] = useState({}); // num_police -> { code_client, nom_client } from the agency's policies
  const requestedClients = useRef(new Set());
  const [lines, setLines] = useState([]);
  const [savedId, setSavedId] = useState(null);
  const [fichier, setFichier] = useState('');
  const [imported, setImported] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [millimes, setMillimes] = useState(false);
  const skipLoad = useRef(false);
  const [selected, setSelected] = useState(-1);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const periode = monthToPeriode(form.month);
  const companyName = companies.find((company) => String(company.code_compagnie) === String(form.code_compagnie))?.nom_compagnie || '';
  // Lines with the client filled from the agency's policy when the file does not give it.
  const shownLines = useMemo(() => lines.map((line) => {
    const client = clients[cleanNumber(line.num_police)];
    return client ? { ...line, code_client: line.code_client || client.code_client || '', nom_client: line.nom_client || client.nom_client || '' } : line;
  }), [lines, clients]);
  const total = useMemo(() => lines.reduce((sum, line) => sum + Number(line.prime_total || 0), 0), [lines]);
  // Solde: what is due to the company, prime totale less the agency's commissions.
  const solde = useMemo(() => lines.reduce((sum, line) => sum + Number(line.prime_total || 0) - Number(line.commission || 0), 0), [lines]);

  // Client code and name of the policies the lines name, asked once per policy number.
  useEffect(() => {
    const missing = [...new Set(lines.filter((line) => !(line.code_client && line.nom_client)).map((line) => cleanNumber(line.num_police)))]
      .filter((number) => number && !requestedClients.current.has(number));
    if (!missing.length) return;
    missing.forEach((number) => requestedClients.current.add(number));
    getBordereauClients(accessToken, missing)
      .then((found) => setClients((current) => ({ ...current, ...found })))
      .catch(() => missing.forEach((number) => requestedClients.current.delete(number)));
  }, [accessToken, lines]);

  useEffect(() => {
    let active = true;
    listCompanies(accessToken)
      .then((result) => { if (active) setCompanies(Array.isArray(result) ? result : result.items || []); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [accessToken]);

  // Company / type / period -> the bordereau already stored for them, if any.
  useEffect(() => {
    if (skipLoad.current) { skipLoad.current = false; return undefined; } // the form was just filled from the imported file
    if (!form.code_compagnie || !periode) return undefined;
    let active = true;
    setBusy(true);
    setError('');
    listBordereaux(accessToken, { code_compagnie: form.code_compagnie, tc: form.tc, periode })
      .then((found) => (found[0] ? getBordereau(accessToken, found[0].id_bordereau) : null))
      .then((result) => {
        if (!active) return;
        setLines(result ? result.lignes.map(fromApi) : []);
        setSavedId(result ? result.bordereau.id_bordereau : null);
        setFichier(result?.bordereau.fichier || '');
        setImported(null);
        setDirty(false);
        setSelected(-1);
        if (result?.bordereau.date_reception) setForm((current) => ({ ...current, date_reception: String(result.bordereau.date_reception).slice(0, 10) }));
        setNotice(result ? `Bordereau enregistré : ${result.lignes.length} ligne(s).` : '');
      })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [accessToken, form.code_compagnie, form.tc, periode]);

  function changeForm(patch) {
    if (dirty && lines.length && ('code_compagnie' in patch || 'tc' in patch || 'month' in patch)
      && !window.confirm('Les lignes importées ne sont pas enregistrées. Les abandonner ?')) return;
    setForm((current) => ({ ...current, ...patch }));
  }

  const makeLines = (info, scale, month) => {
    const lines = buildLines(info, { periodMonth: Number(month) || undefined });
    return scale ? scaleMillimes(lines) : lines;
  };

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    try {
      const info = await readBordereauFile(file);
      // The file may carry the company, the type and the period: use them to fill the form.
      const { meta } = info;
      const company = companies.find((item) => String(item.code_compagnie) === String(meta.code_compagnie));
      const nextMonth = /^\d{2}\/\d{4}$/.test(meta.periode || '') ? `${meta.periode.slice(3)}-${meta.periode.slice(0, 2)}` : form.month;
      const nextForm = { ...form, code_compagnie: company ? String(company.code_compagnie) : form.code_compagnie, month: nextMonth };
      const raw = buildLines(info);
      const scale = looksLikeMillimes(raw);
      const parsedLines = makeLines(info, scale, nextMonth.slice(5));
      if (!parsedLines.length) {
        setImported(info);
        throw new Error('Aucune ligne avec un numéro de police n’a été trouvée. Choisissez la colonne du N° de police ci-dessous.');
      }
      if (nextForm.code_compagnie !== form.code_compagnie || nextForm.tc !== form.tc || nextForm.month !== form.month) {
        skipLoad.current = true;
        setForm(nextForm);
      }
      setMillimes(scale);
      setImported(info);
      setLines(parsedLines);
      setFichier(file.name);
      setDirty(true);
      setSelected(-1);
      setNotice(`${parsedLines.length} ligne(s) lues dans « ${file.name} ». Vérifiez puis enregistrez.`);
    } catch (readError) {
      setError(readError.message);
    }
  }

  function changeMapping(key, value) {
    const mapping = { ...imported.mapping };
    if (value === '') delete mapping[key]; else mapping[key] = Number(value);
    const next = { ...imported, mapping };
    setImported(next);
    setLines(makeLines(next, millimes, form.month.slice(5)));
    setDirty(true);
  }

  function changeMillimes(checked) {
    setMillimes(checked);
    setLines(makeLines(imported, checked, form.month.slice(5)));
    setDirty(true);
  }

  async function save() {
    setError('');
    setNotice('');
    if (!form.code_compagnie) { setError('Choisissez la compagnie.'); return; }
    if (!periode) { setError('Choisissez la période (mois).'); return; }
    if (!lines.length) { setError('Importez d’abord le fichier du siège.'); return; }
    setBusy(true);
    try {
      const payload = {
        code_compagnie: Number(form.code_compagnie), tc: form.tc, periode, date_reception: form.date_reception || null, fichier: fichier || null,
        lignes: shownLines.map((line) => ({
          num_police: String(line.num_police), code_client: line.code_client || null, nom_client: line.nom_client || null,
          echeance: line.echeance || null, num_quittance: line.num_quittance || null,
          prime_net: line.prime_net === '' ? null : line.prime_net ?? null, commission: line.commission === '' ? null : line.commission ?? null,
          prime_total: line.prime_total === '' ? null : line.prime_total ?? null,
        })),
      };
      const result = await saveBordereau(accessToken, payload);
      const stored = await getBordereau(accessToken, result.id_bordereau);
      setLines(stored.lignes.map(fromApi));
      setSavedId(result.id_bordereau);
      setDirty(false);
      setNotice(`Bordereau enregistré : ${result.nb_lignes} ligne(s). Vous pouvez lancer la confrontation.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeBordereau() {
    if (!savedId || !window.confirm('Supprimer ce bordereau enregistré ?')) return;
    setBusy(true);
    try {
      await deleteBordereau(accessToken, savedId);
      setLines([]); setSavedId(null); setImported(null); setDirty(false); setSelected(-1); setFichier('');
      setNotice('Bordereau supprimé.');
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusy(false);
    }
  }

  function submitLine(event) {
    event.preventDefault();
    const values = editing.values;
    if (!String(values.num_police).trim()) return;
    const clean = {
      ...values,
      num_police: String(values.num_police).replace(/\s/g, ''),
      echeance: values.echeance || null,
      prime_net: values.prime_net === '' ? null : Number(values.prime_net),
      commission: values.commission === '' ? null : Number(values.commission),
      prime_total: values.prime_total === '' ? null : Number(values.prime_total),
    };
    setLines((current) => (editing.index < 0 ? [...current, clean] : current.map((line, index) => (index === editing.index ? clean : line))));
    setDirty(true);
    setEditing(null);
  }

  function editLine(index) {
    const line = shownLines[index];
    setEditing({ index, values: { ...emptyLine(), ...line, echeance: line.echeance || '', prime_net: line.prime_net ?? '', commission: line.commission ?? '', prime_total: line.prime_total ?? '' } });
  }

  function removeLine() {
    if (selected < 0) return;
    setLines((current) => current.filter((_, index) => index !== selected));
    setSelected(-1);
    setDirty(true);
  }

  function preview() {
    printReport({
      title: kind.title,
      lines: [`Compagnie : ${companyName}    TC : ${kind.label}    Période : ${periode}    Total : ${money(total)}    Solde : ${money(solde)}`],
      sections: [{
        title: `${lines.length} ligne(s)`,
        columns: [{ label: 'N°', value: (row) => shownLines.indexOf(row) + 1 }, ...GRID.map(([key, label, type]) => ({ key, label, kind: type }))],
        rows: shownLines,
      }],
    });
  }

  return (
    <div className="bd-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="bd-dialog" role="dialog" aria-modal="true" aria-labelledby="bd-reception-title">
        <header className="bd-header">
          <div><span>COMPTABILITE · MODULE {kind.module}</span><h2 id="bd-reception-title">{kind.title}</h2></div>
          <button type="button" onClick={onClose} aria-label="Fermer">×</button>
        </header>

        <div className="bd-toolbar">
          <button type="button" className="bd-tool" onClick={() => { setEditing({ index: -1, values: emptyLine() }); }}>Ajouter</button>
          <button type="button" className="bd-tool" disabled={selected < 0} onClick={() => editLine(selected)}>Modifier</button>
          <button type="button" className="bd-tool" disabled={selected < 0} onClick={removeLine}>Supprimer</button>
          <button type="button" className="bd-tool" disabled={!lines.length} onClick={preview}>Aperçu</button>
          <span className="bd-spacer" />
          <input ref={fileInput} type="file" accept=".xls,.xlsx,.csv,.txt" hidden onChange={chooseFile} />
          <button type="button" className="bd-import" onClick={() => fileInput.current?.click()} disabled={busy}>{kind.importLabel}</button>
          <button type="button" className="bd-save" onClick={save} disabled={busy || !lines.length}>{busy ? 'Patientez…' : dirty ? 'Enregistrer le bordereau' : 'Enregistré'}</button>
        </div>

        <div className="bd-form">
          <label>Compagnie
            <select value={form.code_compagnie} onChange={(event) => changeForm({ code_compagnie: event.target.value })}>
              <option value="">Sélectionner</option>
              {companies.map((company) => <option key={company.code_compagnie} value={company.code_compagnie}>{company.nom_compagnie}</option>)}
            </select>
          </label>
          <label>Date réception<input type="date" value={form.date_reception} onChange={(event) => setForm((current) => ({ ...current, date_reception: event.target.value }))} /></label>
          <label>TC
            <select value={form.tc} disabled><option value={form.tc}>{kind.label}</option></select>
          </label>
          <label>Période<input type="month" value={form.month} onChange={(event) => changeForm({ month: event.target.value })} /></label>
          <div className="bd-total"><span>Total</span><strong>{money(total)}</strong></div>
          <div className="bd-total" title="Prime totale moins les commissions"><span>Solde</span><strong>{money(solde)}</strong></div>
          <div className="bd-total"><span>Lignes</span><strong>{lines.length}</strong></div>
        </div>

        {error && <p className="bd-error" role="alert">{error}</p>}
        {notice && !error && <p className="bd-notice" role="status">{notice}</p>}

        {imported && (
          <details className="bd-mapping">
            <summary>Colonnes détectées dans le fichier{imported.titled ? '' : ' (aucune ligne de titres : ordre habituel supposé)'} — corrigez si besoin</summary>
            <label className="bd-millimes"><input type="checkbox" checked={millimes} onChange={(event) => changeMillimes(event.target.checked)} /> Montants en millimes (726050 = 726,050) — diviser par 1000</label>
            <div className="bd-mapping-grid">
              {BORDEREAU_FIELDS.map((field) => (
                <label key={field.key}>{field.label}{field.required ? ' *' : ''}
                  <select value={imported.mapping[field.key] ?? ''} onChange={(event) => changeMapping(field.key, event.target.value)}>
                    <option value="">— non fournie —</option>
                    {imported.headers.map((header, index) => <option key={index} value={index}>{header}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </details>
        )}

        <div className="bd-grid-wrap">
          <table className="bd-grid">
            <thead><tr><th>N°</th>{GRID.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={GRID.length + 1} className="bd-empty">{form.code_compagnie ? `Aucun bordereau pour cette période : cliquez sur « ${kind.importLabel} » et choisissez le fichier Excel reçu du siège.` : 'Choisissez la compagnie et la période, puis importez le fichier du siège.'}</td></tr>
              ) : shownLines.map((line, index) => (
                <tr key={`${line.id_ligne || 'new'}-${index}`} className={selected === index ? 'is-selected' : undefined} onClick={() => setSelected(index)} onDoubleClick={() => { setSelected(index); editLine(index); }}>
                  <td>{index + 1}</td>
                  {GRID.map(([key, , kind]) => <td key={key} className={kind === 'money' ? 'is-number' : undefined}>{kind === 'money' ? money(line[key]) : kind === 'date' ? shortDate(line[key]) : line[key] ?? ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="bd-footer">
          <span>{savedId ? `Bordereau n° ${savedId}${fichier ? ` · ${fichier}` : ''}` : fichier ? `Fichier : ${fichier} (non enregistré)` : ''}</span>
          <div>
            {savedId && <button type="button" className="bd-danger" onClick={removeBordereau} disabled={busy}>Supprimer le bordereau</button>}
            <button type="button" className="bd-tool" onClick={onClose}>Fermer</button>
          </div>
        </footer>
      </section>

      {editing && (
        <div className="bd-nested" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
          <form className="bd-edit" onSubmit={submitLine}>
            <h3>{editing.index < 0 ? 'Ajouter une ligne' : 'Modifier la ligne'}</h3>
            <div className="bd-edit-grid">
              {BORDEREAU_FIELDS.map((field) => (
                <label key={field.key}>{field.label}
                  <input
                    type={field.key === 'echeance' ? 'date' : ['prime_net', 'commission', 'prime_total'].includes(field.key) ? 'number' : 'text'}
                    step="any"
                    required={field.required}
                    value={editing.values[field.key] ?? ''}
                    onChange={(event) => setEditing((current) => ({ ...current, values: { ...current.values, [field.key]: event.target.value } }))}
                  />
                </label>
              ))}
            </div>
            <div className="bd-edit-actions"><button type="button" className="bd-tool" onClick={() => setEditing(null)}>Annuler</button><button type="submit" className="bd-save">Valider</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
