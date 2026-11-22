import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { isBordereauCompany, isTermeCompany, listCompanies } from '../../services/companyApi';
import { BORDEREAU_FIELDS, buildLines, looksLikeMillimes, readBordereauFile, scaleMillimes } from '../../services/bordereauParser';
import { currentMonth, deleteBordereau, getBordereau, getBordereauClients, listBordereaux, listQuittances, monthToPeriode, nextMonth, saveBordereau, setQuittancePeriode, updateQuittanceLine } from '../../services/bordereauApi';
import { money, printReport, shortDate } from '../../services/bordereauReport';
import BordereauConfrontationModal from './BordereauConfrontationModal';
import './BordereauModal.css';

// Terme: the head office's file for the coming due month. Comptant: always the quittances of TQuittance (tc 'C') without
// a period; the month chosen is the period a quittance gets when it is ticked « Valider ».
const KINDS = {
  T: { module: '530', title: 'Réception terme', label: 'Terme', importLabel: 'Importer Terme', month: nextMonth },
  // Comptant: the période de validation is the current month by default.
  C: { module: '535', title: 'Réception comptant', label: 'Comptant', importLabel: 'Importer Comptant', month: currentMonth, quittances: true },
};
const today = () => new Date().toISOString().slice(0, 10);
const cleanNumber = (value) => String(value ?? '').trim().replace(/\.0+$/, '');
// A line typed by hand: the amounts start at 0.
const emptyLine = () => ({ num_police: '', code_client: '', nom_client: '', echeance: '', num_quittance: '', prime_net: '0', commission: '0', prime_total: '0' });
const toAmount = (value) => (value === '' || value == null ? null : Number(value));
// A Prime Total not typed (empty or 0) is the P.Net+C.Q. of the line, so the line still comes off the Solde.
const withPrimeTotal = (line) => (Number(line.prime_total || 0) === 0 && Number(line.prime_net || 0) !== 0 ? { ...line, prime_total: line.prime_net } : line);
// A field of the line being entered: the Prime Total follows the P.Net+C.Q. typed, until a Prime Total of its own is typed.
function typeDraft(current, key, value) {
  const next = { ...current, [key]: value, ...(key === 'num_police' ? { lookup: '' } : {}) };
  const following = Number(current.prime_total || 0) === 0 || String(current.prime_total) === String(current.prime_net);
  if (key === 'prime_net' && following) next.prime_total = value;
  return next;
}
const GRID = [
  ['num_police', 'N° Police (num_int)'], ['code_client', 'Code Clt'], ['nom_client', 'Nom Client'], ['echeance', 'Échéance', 'date'],
  ['num_quittance', 'N° Quit.'], ['prime_net', 'P.Net+C.Q.', 'money'], ['commission', 'Com.', 'money'], ['prime_total', 'Prime Total', 'money'],
];

// Comptant: the N° quittance and the Prime Total are corrected in the grid; saved on Entrée or when leaving the cell,
// Échap gives the value back.
function EditableCell({ value, label, number, onSave }) {
  const [text, setText] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setText(value ?? ''); }, [value]);
  async function commit() {
    const next = String(text).trim();
    if (next === String(value ?? '').trim() || (number && Number(next) === Number(value))) { setText(value ?? ''); return; }
    if (!next || (number && !(Number(next) >= 0))) { setText(value ?? ''); return; }
    setSaving(true);
    const ok = await onSave(number ? Number(next) : next);
    setSaving(false);
    if (!ok) setText(value ?? '');
  }
  return (
    <input
      className={`bd-cell-input${number ? ' is-number' : ''}`}
      aria-label={label}
      type={number ? 'number' : 'text'}
      step={number ? 'any' : undefined}
      min={number ? '0' : undefined}
      value={text}
      disabled={saving}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
        if (event.key === 'Escape') { event.stopPropagation(); setText(value ?? ''); }
      }}
    />
  );
}
const EDITABLE = { num_quittance: false, prime_total: true }; // comptant (TQuittance): key -> numeric
const EDITABLE_TERME = { prime_total: true }; // terme (the lines of the file): the Prime Total, the Solde follows

const sumOf = (list) => list.reduce((sum, line) => sum + Number(line.prime_total || 0), 0);

// Terme: the Total / Solde at the top, typed as an amount (applied on leaving the field or on Entrée).
function AmountBox({ label, title, value, onChange }) {
  const [text, setText] = useState(null); // null: not being typed, the value is shown
  const apply = () => {
    if (text === null) return;
    const amount = Number(String(text).replace(/\s/g, '').replace(',', '.'));
    setText(null);
    if (Number.isFinite(amount) && Math.abs(amount - value) > 0.0005) onChange(amount);
  };
  return (
    <label className="bd-total bd-total-edit" title={title}>
      <span>{label}</span>
      <input aria-label={label} inputMode="decimal" value={text ?? money(value)}
        onFocus={() => setText(Number(value.toFixed(3)).toString())}
        onChange={(event) => setText(event.target.value)}
        onBlur={apply}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
    </label>
  );
}

// Several files imported: one at a time (‹ Précédent / Suivant ›, with its lines and its total), or all of them.
function FileStrip({ sources, at, lines, onShow }) {
  const of = (index) => lines.filter((line) => line.source === index);
  const shown = at >= 0 ? of(at) : lines;
  const sum = (list, key) => list.reduce((total, line) => total + Number(line[key] || 0), 0);
  return (
    <div className="bd-files" role="group" aria-label="Fichiers importés">
      <button type="button" className="bd-tool" onClick={() => onShow(at - 1)} disabled={at <= 0}>‹ Précédent</button>
      <strong>{at >= 0 ? `Fichier ${at + 1} / ${sources.length} : ${sources[at].name}` : `Tous les fichiers (${sources.length})`}</strong>
      <span>{shown.length} ligne(s) · Total {money(sum(shown, 'prime_total'))} · Com. {money(sum(shown, 'commission'))}</span>
      <button type="button" className="bd-tool" onClick={() => onShow(at + 1)} disabled={at < 0 || at >= sources.length - 1}>Suivant ›</button>
      <button type="button" className={`bd-tool${at < 0 ? ' is-active' : ''}`} onClick={() => onShow(at < 0 ? 0 : -1)}>{at < 0 ? 'Un fichier à la fois' : 'Tous les fichiers'}</button>
    </div>
  );
}

function fromApi(line) {
  return { ...line, echeance: line.echeance ? String(line.echeance).slice(0, 10) : null };
}

export default function BordereauReceptionModal({ onClose, tc = 'T' }) {
  const kind = KINDS[tc] || KINDS.T;
  const { accessToken } = useAuth();
  const fileInput = useRef(null);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState({ code_compagnie: '', tc, month: kind.month(), annee: String(new Date().getFullYear()), date_reception: today() });
  const [clients, setClients] = useState({}); // num_police -> { code_client, nom_client } from the agency's policies
  const requestedClients = useRef(new Set());
  const [lines, setLines] = useState([]);
  const [savedId, setSavedId] = useState(null);
  const [fromQuittances, setFromQuittances] = useState(false); // the lines are the quittances of TQuittance
  const [fichier, setFichier] = useState('');
  // The files imported ({ name, info }), each read with its own columns; sourceAt: the one shown (-1: all of them).
  const [sources, setSources] = useState([]);
  const [sourceAt, setSourceAt] = useState(-1);
  const mappedAt = sourceAt >= 0 ? sourceAt : 0; // the file whose columns are shown
  const imported = sources[mappedAt]?.info || null;
  const [dirty, setDirty] = useState(false);
  const [announced, setAnnounced] = useState(null); // terme: the Total typed at the top (null: the total of the lines)
  const [millimes, setMillimes] = useState(false);
  const skipLoad = useRef(false);
  const [selected, setSelected] = useState(-1);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null); // the line being typed at the bottom of the grid, with its client lookup
  const draftNumber = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [validating, setValidating] = useState(''); // num_quittance being validated
  const [search, setSearch] = useState(''); // code or name of the client
  const [confronting, setConfronting] = useState(false); // the confrontation of the company / period, over this window
  const periode = monthToPeriode(form.month);
  const loadPeriode = kind.quittances ? '' : periode; // comptant: the list never depends on the month
  const validated = lines.filter((line) => line.valide).length;
  const companyCodes = companies.map((company) => company.code_compagnie).join(',');
  const annee = /^\d{4}$/.test(form.annee) ? form.annee : '';
  const companyName = companies.find((company) => String(company.code_compagnie) === String(form.code_compagnie))?.nom_compagnie || '';
  // Lines shown with the agency's police and client: the file's « 1777 » is our « 001777 », and the name is the one of our
  // client file, not the company's spelling. The file's values stay only for a police unknown to the agency.
  const shownLines = useMemo(() => lines.map((line) => {
    const client = clients[cleanNumber(line.num_police)];
    return client ? {
      ...line,
      num_police: client.num_int || line.num_police,
      code_client: client.code_client || line.code_client || '',
      nom_client: client.nom_client || line.nom_client || '',
    } : line;
  }), [lines, clients]);
  // The lines of the client searched (code client starting with, or name containing, what is typed), with their index.
  const visibleLines = useMemo(() => {
    const term = search.trim().toLowerCase();
    const inFile = sources.length > 1 && sourceAt >= 0;
    const indexed = shownLines.map((line, index) => ({ line, index }))
      .filter(({ line }) => !inFile || line.source === undefined || line.source === sourceAt);
    if (!term) return indexed;
    return indexed.filter(({ line }) => String(line.code_client || '').trim().toLowerCase().startsWith(term)
      || String(line.nom_client || '').toLowerCase().includes(term));
  }, [shownLines, search, sources.length, sourceAt]);
  const linesTotal = useMemo(() => lines.reduce((sum, line) => sum + Number(line.prime_total || 0), 0), [lines]);
  // Terme, as the legacy: the Total is the company's (typed at the top, or the file's total when imported) and the Solde is
  // that Total less the Prime Total of the lines, each line entered takes its prime off the Solde (an imported file: 0).
  // Comptant: the total of the quittances, and the Solde what is due to the company (prime totale less the commissions).
  const total = !kind.quittances && announced !== null ? announced : linesTotal;
  const solde = useMemo(() => (kind.quittances
    ? lines.reduce((sum, line) => sum + Number(line.prime_total || 0) - Number(line.commission || 0), 0)
    : total - linesTotal), [kind.quittances, lines, total, linesTotal]);

  // Client code and name of the policies the lines name, asked once per policy number.
  useEffect(() => {
    const missing = [...new Set(lines.map((line) => cleanNumber(line.num_police)))]
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
      .then((result) => { if (active) setCompanies((Array.isArray(result) ? result : result.items || []).filter(kind.quittances ? isBordereauCompany : isTermeCompany)); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [accessToken, kind.quittances]);

  // The N° police typed in the new line -> the client of that police at the agency, once typing pauses.
  const draftPolice = cleanNumber(draft?.num_police).replace(/\s/g, '');
  useEffect(() => {
    if (!draftPolice) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      setDraft((current) => (current ? { ...current, lookup: 'loading' } : current));
      getBordereauClients(accessToken, [draftPolice])
        .then((found) => {
          if (!active) return;
          const client = found?.[draftPolice];
          setDraft((current) => (current ? { ...current, code_client: client?.code_client || '', nom_client: client?.nom_client || '', lookup: client ? 'found' : 'missing' } : current));
        })
        .catch(() => { if (active) setDraft((current) => (current ? { ...current, lookup: 'missing' } : current)); });
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [accessToken, draftPolice]);

  function startDraft() {
    setDraft(emptyLine());
    requestAnimationFrame(() => draftNumber.current?.focus());
  }

  // Adds the typed line and opens the next one, so several lines are entered one after the other.
  function addDraft() {
    const number = String(draft.num_police).replace(/\s/g, '');
    if (!number) { setError('Saisissez le N° de police de la ligne.'); draftNumber.current?.focus(); return; }
    setError('');
    const { lookup, ...values } = draft;
    setLines((current) => [...current, withPrimeTotal({ ...values, num_police: number, echeance: values.echeance || null, prime_net: toAmount(values.prime_net), commission: toAmount(values.commission), prime_total: toAmount(values.prime_total) })]);
    setDirty(true);
    setNotice('Ligne ajoutée. Saisissez la suivante, ou enregistrez le bordereau.');
    startDraft();
  }

  // Company / type / period -> the bordereau already stored for them, if any.
  useEffect(() => {
    if (skipLoad.current) { skipLoad.current = false; return undefined; } // the form was just filled from the imported file
    if (kind.quittances ? !companyCodes : !form.code_compagnie || !loadPeriode) return undefined;
    let active = true;
    setBusy(true);
    setError('');
    const stored = !kind.quittances && form.code_compagnie && loadPeriode
      ? listBordereaux(accessToken, { code_compagnie: form.code_compagnie, tc: form.tc, periode: loadPeriode }).then((found) => (found[0] ? getBordereau(accessToken, found[0].id_bordereau) : null))
      : Promise.resolve(null);
    stored
      .then(async (result) => {
        // Comptant: the quittances of TQuittance without a period, of the due year chosen (current year by default);
        // without a company: those of the companies listed.
        const quittances = !result && kind.quittances
          ? await listQuittances(accessToken, { tc: form.tc, periode: '', annee, code_compagnie: form.code_compagnie, compagnies: form.code_compagnie ? '' : companyCodes })
          : null;
        if (!active) return;
        setLines(result ? result.lignes.map(fromApi) : (quittances || []).map(fromApi));
        setAnnounced(result?.bordereau.total_annonce != null ? Number(result.bordereau.total_annonce) : null);
        setFromQuittances(Boolean(quittances));
        setSavedId(result ? result.bordereau.id_bordereau : null);
        setFichier(result?.bordereau.fichier || '');
        setSources([]);
        setSourceAt(-1);
        setDirty(false);
        setSelected(-1);
        if (result?.bordereau.date_reception) setForm((current) => ({ ...current, date_reception: String(result.bordereau.date_reception).slice(0, 10) }));
        setNotice(result ? `Bordereau enregistré : ${result.lignes.length} ligne(s).`
          : quittances ? `${quittances.length} quittance(s) comptant sans période${annee ? `, échéance ${annee}` : ''}${form.code_compagnie ? '' : ' (toutes compagnies)'}. Choisissez la période puis cochez « Valider ».` : '');
      })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [accessToken, form.code_compagnie, form.tc, loadPeriode, annee, companyCodes, kind.quittances]);

  // Terme: a Prime Total corrected in the grid (the Solde follows); saved with the bordereau.
  function editTermeCell(index, key, value) {
    setLines((current) => current.map((line, at) => (at === index ? { ...line, [key]: value } : line)));
    setDirty(true);
    return true;
  }

  // Comptant: a corrected N° quittance or Prime Total, saved in TQuittance (true when saved).
  async function saveCell(line, key, value) {
    setError('');
    try {
      const saved = await updateQuittanceLine(accessToken, {
        num_quittance: line.num_quittance, num_int: line.num_police,
        ...(key === 'num_quittance' ? { nouveau_numero: value } : { prime_total: value }),
      });
      setLines((current) => current.map((item) => (item.num_quittance === line.num_quittance && item.num_police === line.num_police
        ? { ...item, num_quittance: saved.num_quittance, prime_total: saved.prime_total } : item)));
      setNotice(key === 'num_quittance' ? `Quittance N° ${line.num_quittance} renumérotée ${saved.num_quittance}.` : `Prime totale de la quittance N° ${line.num_quittance} : ${money(saved.prime_total)}.`);
      return true;
    } catch (saveError) {
      setError(saveError.message);
      return false;
    }
  }

  // Comptant: ticking « Valider » gives the quittance the period chosen; unticking takes it back to no period.
  async function validateLine(line, checked) {
    setError('');
    if (checked && !periode) { setError('Choisissez d’abord la période (mois) dans laquelle valider la quittance.'); return; }
    const next = checked ? periode : '';
    setValidating(line.num_quittance);
    try {
      await setQuittancePeriode(accessToken, { num_quittance: line.num_quittance, num_int: line.num_police, periode: next, avant: line.valide || '' });
      setLines((current) => current.map((item) => (item.num_quittance === line.num_quittance && item.num_police === line.num_police ? { ...item, valide: next } : item)));
      setNotice(checked ? `Quittance N° ${line.num_quittance} validée dans la période ${next}.` : `Quittance N° ${line.num_quittance} remise sans période.`);
    } catch (validateError) {
      setError(validateError.message);
    } finally {
      setValidating('');
    }
  }

  function changeForm(patch) {
    if (dirty && lines.length && ('code_compagnie' in patch || 'tc' in patch || 'month' in patch)
      && !window.confirm('Les lignes importées ne sont pas enregistrées. Les abandonner ?')) return;
    setForm((current) => ({ ...current, ...patch }));
  }

  const makeLines = (info, scale, month) => {
    const lines = buildLines(info, { periodMonth: Number(month) || undefined });
    return scale ? scaleMillimes(lines) : lines;
  };

  // Several files at once (the head office may send a bordereau in several files): their lines follow each other.
  async function chooseFile(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (!files.length) return;
    setError('');
    setNotice('');
    try {
      const infos = [];
      for (const file of files) {
        try { infos.push(await readBordereauFile(file)); } catch (fileError) { throw new Error(`« ${file.name} » : ${fileError.message}`); }
      }
      const info = infos[0];
      const companiesOf = [...new Set(infos.map((item) => String(item.meta.code_compagnie || '')).filter(Boolean))];
      if (companiesOf.length > 1) throw new Error('Les fichiers choisis sont de compagnies différentes : importez-les séparément.');
      // The file may carry the company, the type and the period: use them to fill the form.
      const { meta } = info;
      const company = companies.find((item) => String(item.code_compagnie) === String(meta.code_compagnie));
      const nextMonth = /^\d{2}\/\d{4}$/.test(meta.periode || '') ? `${meta.periode.slice(3)}-${meta.periode.slice(0, 2)}` : form.month;
      const nextForm = { ...form, code_compagnie: company ? String(company.code_compagnie) : form.code_compagnie, month: nextMonth };
      const raw = infos.flatMap((item) => buildLines(item));
      const scale = looksLikeMillimes(raw);
      const read = infos.map((item, at) => ({ name: files[at].name, info: item }));
      const parsedLines = allLines(read, scale, nextMonth);
      if (!parsedLines.length) {
        setSources(read);
        setSourceAt(read.length > 1 ? 0 : -1);
        throw new Error('Aucune ligne avec un numéro de police n’a été trouvée. Choisissez la colonne du N° de police ci-dessous.');
      }
      if (nextForm.code_compagnie !== form.code_compagnie || nextForm.tc !== form.tc || nextForm.month !== form.month) {
        skipLoad.current = true;
        setForm(nextForm);
      }
      setMillimes(scale);
      setSources(read);
      setSourceAt(read.length > 1 ? 0 : -1); // several files: the first one shown, « Suivant » goes to the next
      setLines(parsedLines);
      setAnnounced(sumOf(parsedLines)); // the file's total: Solde 0
      setFromQuittances(false);
      const names = files.map((file) => file.name);
      setFichier(names.join(', ').slice(0, 200));
      setDirty(true);
      setSelected(-1);
      setNotice(`${parsedLines.length} ligne(s) lues dans ${names.length > 1 ? `${names.length} fichiers (${names.join(', ')})` : `« ${names[0]} »`}. Vérifiez puis enregistrez.`);
    } catch (readError) {
      setError(readError.message);
    }
  }

  // A column corrected for the file shown: only that file is read again with it (each file has its own layout).
  function changeMapping(key, value) {
    const mapping = { ...imported.mapping };
    if (value === '') delete mapping[key]; else mapping[key] = Number(value);
    const next = sources.map((source, at) => (at === mappedAt ? { ...source, info: { ...source.info, mapping } } : source));
    setSources(next);
    const read = allLines(next, millimes, form.month);
    setLines(read);
    setAnnounced(sumOf(read));
    setDirty(true);
  }

  // The lines of every file imported, one file after the other; each line knows its file (source).
  function allLines(list, scale, month) {
    return list.flatMap(({ info }, at) => makeLines(info, scale, month.slice(5)).map((line) => ({ ...line, source: at })));
  }

  function changeMillimes(checked) {
    setMillimes(checked);
    const read = allLines(sources, checked, form.month);
    setLines(read);
    setAnnounced(sumOf(read));
    setDirty(true);
  }

  async function save() {
    setError('');
    setNotice('');
    if (!form.code_compagnie) { setError('Choisissez la compagnie.'); return; }
    if (!periode) { setError('Choisissez la période (mois).'); return; }
    if (!lines.length) { setError('Importez le fichier du siège ou ajoutez des lignes.'); return; }
    setBusy(true);
    try {
      const payload = {
        code_compagnie: Number(form.code_compagnie), tc: form.tc, periode, date_reception: form.date_reception || null, fichier: fichier || null,
        total_annonce: kind.quittances ? null : Math.round(total * 1000) / 1000,
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
      setSources([]); // saved: one bordereau, its lines as stored
      setSourceAt(-1);
      setSavedId(result.id_bordereau);
      setFromQuittances(false);
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
      setLines([]); setSavedId(null); setSources([]); setSourceAt(-1); setDirty(false); setSelected(-1); setFichier(''); setAnnounced(null);
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
    const clean = withPrimeTotal({
      ...values,
      num_police: String(values.num_police).replace(/\s/g, ''),
      echeance: values.echeance || null,
      prime_net: values.prime_net === '' ? null : Number(values.prime_net),
      commission: values.commission === '' ? null : Number(values.commission),
      prime_total: values.prime_total === '' ? null : Number(values.prime_total),
    });
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
        columns: [{ label: 'N°', value: (row) => shownLines.indexOf(row) + 1 }, ...GRID.map(([key, label, type]) => ({ key, label, kind: type })),
          ...(fromQuittances ? [{ label: 'Validée', value: (row) => row.valide || '' }] : [])],
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
          <button type="button" className="bd-tool" onClick={startDraft} disabled={Boolean(draft)}>Ajouter une nouvelle ligne</button>
          <button type="button" className="bd-tool" disabled={selected < 0} onClick={() => editLine(selected)}>Modifier</button>
          <button type="button" className="bd-tool" disabled={selected < 0} onClick={removeLine}>Supprimer</button>
          <button type="button" className="bd-tool" disabled={!lines.length} onClick={preview}>Aperçu</button>
          <span className="bd-spacer" />
          <input ref={fileInput} type="file" accept=".xls,.xlsx,.csv,.txt" multiple hidden aria-label="Fichiers du siège" onChange={chooseFile} />
          <button type="button" className="bd-import" onClick={() => fileInput.current?.click()} disabled={busy} title="Un ou plusieurs fichiers du siège">{kind.importLabel}</button>
          {!kind.quittances && <button type="button" className="bd-import" onClick={() => setConfronting(true)} disabled={busy} title="Confronter le bordereau de la compagnie et de la période avec les quittances de l’agence">Confrontation</button>}
          {savedId && <button type="button" className="bd-danger" onClick={removeBordereau} disabled={busy}>Supprimer le bordereau</button>}
          <button type="button" className="bd-save" onClick={save} disabled={busy || !lines.length || (fromQuittances && !dirty)}>{busy ? 'Patientez…' : dirty ? 'Enregistrer le bordereau' : fromQuittances ? 'Quittances' : 'Enregistré'}</button>
        </div>

        <div className="bd-form">
          <label>Compagnie
            <select value={form.code_compagnie} onChange={(event) => changeForm({ code_compagnie: event.target.value })}>
              <option value="">Sélectionner</option>
              {companies.map((company) => <option key={company.code_compagnie} value={company.code_compagnie}>{company.nom_compagnie}</option>)}
            </select>
          </label>
          <label className="bd-search">Client<input type="search" value={search} placeholder="Code ou nom du client" onChange={(event) => setSearch(event.target.value)} /></label>
          <label>Date réception<input type="date" value={form.date_reception} readOnly title="Date de réception : le jour de l’enregistrement (celle du bordereau quand il est déjà reçu)" /></label>
          <label>TC
            <select value={form.tc} disabled><option value={form.tc}>{kind.label}</option></select>
          </label>
          <label title={kind.quittances ? 'Période donnée aux quittances cochées « Valider »' : undefined}>{kind.quittances ? 'Période de validation' : 'Période'}
            <span className="bd-period">
              <input type="month" value={form.month} onChange={(event) => changeForm({ month: event.target.value })} />
            </span>
          </label>
          {kind.quittances && (
            <label>Année échéance<input className="bd-year" type="number" min="1990" max="2100" value={form.annee} onChange={(event) => changeForm({ annee: event.target.value })} /></label>
          )}
          {kind.quittances ? (
            <>
              <div className="bd-total"><span>Total</span><strong>{money(total)}</strong></div>
              <div className="bd-total" title="Prime totale moins les commissions"><span>Solde</span><strong>{money(solde)}</strong></div>
            </>
          ) : (
            <>
              <AmountBox label="Total" title="Total du bordereau de la compagnie" value={total} onChange={(value) => { setAnnounced(value); setDirty(true); }} />
              <AmountBox label="Solde" title="Total moins la Prime Total des lignes saisies" value={solde} onChange={(value) => { setAnnounced(linesTotal + value); setDirty(true); }} />
            </>
          )}
          <div className="bd-total"><span>Lignes</span><strong>{lines.length}</strong></div>
          {fromQuittances && <div className="bd-total"><span>Validées</span><strong>{validated}</strong></div>}
          {search.trim() && <div className="bd-total"><span>Affichées</span><strong>{visibleLines.length}</strong></div>}
        </div>

        {error && <p className="bd-error" role="alert">{error}</p>}
        {notice && !error && <p className="bd-notice" role="status">{notice}</p>}

        {sources.length > 1 && <FileStrip sources={sources} at={sourceAt} lines={lines} onShow={setSourceAt} />}

        {imported && (
          <details className="bd-mapping">
            <summary>Colonnes détectées dans {sources.length > 1 ? `« ${sources[mappedAt].name} »` : 'le fichier'}{imported.titled ? '' : ' (aucune ligne de titres : ordre habituel supposé)'} — corrigez si besoin</summary>
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
            <thead><tr><th>N°</th>{GRID.map(([key, label]) => <th key={key}>{label}</th>)}{fromQuittances && <th className="bd-valider">Valider</th>}</tr></thead>
            <tbody>
              {lines.length === 0 && !draft ? (
                <tr><td colSpan={GRID.length + 2} className="bd-empty">{kind.quittances ? 'Aucune quittance comptant sans période.' : form.code_compagnie ? `Aucun bordereau pour cette période : cliquez sur « ${kind.importLabel} » et choisissez le fichier Excel reçu du siège.` : 'Choisissez la compagnie et la période, puis importez le fichier du siège.'}</td></tr>
              ) : search.trim() && !visibleLines.length && !draft ? (
                <tr><td colSpan={GRID.length + 2} className="bd-empty">Aucune ligne pour le client « {search.trim()} ».</td></tr>
              ) : visibleLines.map(({ line, index }) => (
                <tr key={`${line.id_ligne || 'new'}-${index}`} className={[selected === index && 'is-selected', line.valide && 'is-validated'].filter(Boolean).join(' ') || undefined} onClick={() => setSelected(index)} onDoubleClick={() => { setSelected(index); editLine(index); }}>
                  <td>{index + 1}</td>
                  {GRID.map(([key, label, kind]) => (
                    <td key={key} className={kind === 'money' ? 'is-number' : undefined}>
                      {fromQuittances && key in EDITABLE
                        ? <EditableCell value={line[key]} label={`${label} ${line.num_quittance}`} number={EDITABLE[key]} onSave={(value) => saveCell(line, key, value)} />
                        : !fromQuittances && key in EDITABLE_TERME
                        ? <EditableCell value={line[key]} label={`${label} ${line.num_police}`} number={EDITABLE_TERME[key]} onSave={(value) => editTermeCell(index, key, value)} />
                        : kind === 'money' ? money(line[key]) : kind === 'date' ? shortDate(line[key]) : line[key] ?? ''}
                    </td>
                  ))}
                  {fromQuittances && (
                    <td className="bd-valider" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
                      <label title={line.valide ? `Validée dans la période ${line.valide} — décocher pour la remettre sans période` : periode ? `Valider dans la période ${periode}` : 'Choisissez d’abord la période'}>
                        <input type="checkbox" checked={Boolean(line.valide)} disabled={Boolean(validating)} onChange={(event) => validateLine(line, event.target.checked)} />
                        {line.valide && <small>{line.valide}</small>}
                      </label>
                    </td>
                  )}
                </tr>
              ))}
              {draft && (
                <tr className="bd-draft" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addDraft(); } if (event.key === 'Escape') { event.stopPropagation(); setDraft(null); } }}>
                  <td>{lines.length + 1}</td>
                  {GRID.map(([key, label, type]) => (
                    <td key={key}>
                      {key === 'nom_client' && draft.lookup !== 'found' && !draft.nom_client
                        ? <input aria-label={label} value={draft.nom_client} placeholder={draft.lookup === 'loading' ? 'Recherche…' : draft.lookup === 'missing' ? 'Police introuvable' : 'Après le N° police'} onChange={(event) => setDraft((current) => ({ ...current, nom_client: event.target.value }))} />
                        : <input
                          ref={key === 'num_police' ? draftNumber : undefined}
                          aria-label={label}
                          type={type === 'date' ? 'date' : type === 'money' ? 'number' : 'text'}
                          step={type === 'money' ? 'any' : undefined}
                          className={type === 'money' ? 'is-number' : undefined}
                          value={draft[key] ?? ''}
                          onChange={(event) => setDraft((current) => typeDraft(current, key, event.target.value))}
                        />}
                    </td>
                  ))}
                  {fromQuittances && <td />}
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="bd-footer">
          {draft && <span className="bd-draft-actions"><button type="button" className="bd-save" onClick={addDraft}>Ajouter la ligne (Entrée)</button><button type="button" className="bd-tool" onClick={() => setDraft(null)}>Terminer la saisie</button></span>}
          <span>{savedId ? `Bordereau n° ${savedId}${fichier ? ` · ${fichier}` : ''}` : fichier ? `Fichier : ${fichier} (non enregistré)` : ''}</span>
          <div>
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
      {confronting && <BordereauConfrontationModal initial={{ code_compagnie: form.code_compagnie, tc: form.tc, month: form.month }} onClose={() => setConfronting(false)} />}
    </div>
  );
}
