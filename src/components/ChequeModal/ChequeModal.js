import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { createPiece, deletePiece, getClientOverview, getPiece, listAccounts, listBanks, listPieces, updatePiece } from '../../services/chequeApi';
import { listClients, normalizeClientRecord, rankClients } from '../../services/clientApi';
import { spreadImported } from '../../services/importedPayment';
import { scanPayment } from '../../services/paymentScan';
import DocumentImportDialog from '../DocumentImportDialog/DocumentImportDialog';
import './ChequeModal.css';

const TYPES = [['T', 'Traite'], ['C', 'Chèque'], ['V', 'Virement'], ['E', 'Espèce'], ['B', 'Carte bancaire']];
const TYPE_CODES = { Traite: 'T', Chèque: 'C', Virement: 'V', Espèces: 'E', 'Carte bancaire': 'B' };
const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => (value == null || value === '' ? '' : Number(value).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
const shortDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const num = (value) => (value === '' || value == null ? 0 : Number(value) || 0);
const blankForm = () => ({ nump: '', typep: 'C', datep: today(), montant: '', code_banque: '', a_verser: false, en_instance: false, compte_versement: '' });
// A piece stored in TPiece is "en instance" until settled; ticking "À verser" then pays it in (it becomes a règlement in TRegCli).
const storedStatus = (piece) => ({ a_verser: false, en_instance: piece.regle !== 'O', compte_versement: '' });

// Several cheques scanned at once: the state of each one in the strip.
const BATCH_STATES = { attente: 'En attente', lecture: 'Lecture…', lu: 'À vérifier', erreur: 'Illisible', ajoute: 'Enregistré' };

// Unpaid quittances paid by an imported document: amount per quittance.
function importedAlloc(list, request) {
  const parts = spreadImported(list, request, (row) => Number(row.solde) - Number(row.instance));
  return Object.fromEntries(parts.map((part) => [part.row.num_quittance, part.amount.toFixed(3)]));
}

export default function ChequeModal({ onClose }) {
  const { accessToken } = useAuth();
  const importInput = useRef(null);
  const skipCode = useRef(''); // a client opened from the list is loaded there, not by the typing effect
  const [banks, setBanks] = useState([]);
  const [accounts, setAccounts] = useState([]); // agency accounts a piece "à verser" is paid into
  const [code, setCode] = useState('');
  const [client, setClient] = useState(null);
  const [quittances, setQuittances] = useState([]);
  const [due, setDue] = useState('toutes'); // quittances shown: toutes, échues (échéance passed) or non échues
  const [pieces, setPieces] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [alloc, setAlloc] = useState({});
  const [editing, setEditing] = useState(false); // the typed piece number is a piece already stored
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [list, setList] = useState(null);
  const [importFile, setImportFile] = useState(null); // the document being read in the import window
  const pendingImport = useRef(null); // quittances read from a document, spread once the client is loaded
  // Several cheques scanned at once: { items: [{ id, file, name, status, values, found, error }], current }. They are read one
  // after the other; the current one fills the form, and once it is added the next one is loaded.
  const [batch, setBatchState] = useState(null);
  const batchRef = useRef(null);
  const scanning = useRef(false);
  const appliedId = useRef(null);
  const fillRef = useRef(null);
  const [nameQuery, setNameQuery] = useState(null); // text typed in "Nom client", null while it shows the loaded client
  const [allClients, setAllClients] = useState(null); // loaded the first time a name is typed

  useEffect(() => {
    let active = true;
    listBanks(accessToken).then((rows) => { if (active) setBanks(rows); }).catch(() => {});
    listAccounts(accessToken).then((rows) => { if (active) setAccounts(rows); }).catch(() => {});
    return () => { active = false; };
  }, [accessToken]);

  function typeCode(value) {
    setNameQuery(null);
    setCode(value);
  }

  function typeName(value) {
    setNameQuery(value);
    if (allClients) return;
    setAllClients([]);
    listClients(accessToken)
      .then((rows) => setAllClients(rows.map(normalizeClientRecord)))
      .catch((requestError) => { setAllClients(null); setError(requestError.message); });
  }

  function pickClient(record) {
    setNameQuery(null);
    setCode(String(record.clientCode));
  }

  const nameMatches = nameQuery?.trim() && allClients ? rankClients(allClients.filter((record) => record.clientCode), nameQuery).slice(0, 12) : [];

  // The client typed in "Code client": name, unpaid receipts and recorded pieces.
  async function loadClient(clientCode, excludeNump = '') {
    const overview = await getClientOverview(accessToken, clientCode, excludeNump);
    setClient(overview.client);
    setQuittances(overview.quittances);
    setPieces(overview.pieces);
    return overview;
  }

  useEffect(() => {
    const value = code.trim();
    if (skipCode.current && skipCode.current === value) { skipCode.current = ''; return undefined; }
    if (!value) { setClient(null); setQuittances([]); setPieces([]); return undefined; }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        setError('');
        const overview = await getClientOverview(accessToken, value);
        if (!active) return;
        setClient(overview.client);
        setQuittances(overview.quittances);
        setPieces(overview.pieces);
        setAlloc(pendingImport.current ? importedAlloc(overview.quittances, pendingImport.current) : {});
        pendingImport.current = null;
        setEditing(false);
      } catch (requestError) {
        if (!active) return;
        setClient(null); setQuittances([]); setPieces([]);
        pendingImport.current = null;
        setError(requestError.message);
      }
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [accessToken, code]);

  const allocated = useMemo(() => Object.values(alloc).reduce((sum, value) => sum + num(value), 0), [alloc]);
  const solde = Math.max(0, num(form.montant) - allocated);
  const bankName = banks.find((bank) => bank.code_banque === form.code_banque)?.nom_banque || '';
  // A quittance is échue once its échéance is today or past.
  const shown = useMemo(() => {
    if (due === 'toutes') return quittances;
    const day = today();
    return quittances.filter((row) => (String(row.echeance || '').slice(0, 10) <= day) === (due === 'echues'));
  }, [quittances, due]);
  // Amounts typed on quittances the filter hides still go with the piece.
  const hiddenAllocated = allocated - shown.reduce((sum, row) => sum + num(alloc[row.num_quittance]), 0);
  const totals = useMemo(() => shown.reduce((sum, row) => ({
    solde: sum.solde + Number(row.solde), instance: sum.instance + Number(row.instance), montant: sum.montant + num(alloc[row.num_quittance]),
  }), { solde: 0, instance: 0, montant: 0 }), [shown, alloc]);

  function change(patch) {
    setForm((current) => ({ ...current, ...patch }));
    setNotice('');
  }

  // Typing a piece number: a stored piece is loaded for modification, anything else starts a new piece.
  async function changePiece(value) {
    change({ nump: value });
    const known = pieces.find((piece) => piece.nump === value.trim());
    if (!known || !client) { setEditing(false); return; }
    try {
      const result = await getPiece(accessToken, client.code_client, known.nump);
      const piece = result.piece;
      setForm({
        nump: piece.nump, typep: piece.typep || 'C', datep: String(piece.datep || today()).slice(0, 10), montant: String(piece.montant ?? ''),
        ...storedStatus(piece),
      });
      await loadClient(client.code_client, piece.nump);
      setAlloc(Object.fromEntries(result.allocations.map((item) => [item.num_quittance, String(item.montant)])));
      setEditing(true);
      setNotice(piece.regle === 'O' ? 'Pièce déjà réglée : consultation seulement.' : 'Pièce existante : vous pouvez la modifier ou la supprimer.');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function chooseType(typep) {
    // Cash has no number of its own: the legacy convention ESP + date is proposed.
    const proposal = typep === 'E' && !form.nump ? `ESP${new Date().toLocaleDateString('fr-FR').replace(/\//g, '')}` : form.nump;
    change({ typep, nump: proposal });
  }

  // Spreads the amount over the oldest receipts shown first.
  function autoSpread() {
    let left = num(form.montant);
    const next = {};
    shown.forEach((row) => {
      const available = Number(row.solde) - Number(row.instance);
      const part = Math.max(0, Math.min(left, available));
      if (part > 0) next[row.num_quittance] = part.toFixed(3);
      left -= part;
    });
    setAlloc(next);
  }

  function payload() {
    return {
      code_client: client.code_client, nump: form.nump.trim(), typep: form.typep, datep: form.datep || null, montant: num(form.montant),
      code_banque: form.code_banque || null, a_verser: form.a_verser, en_instance: form.en_instance, compte_versement: form.a_verser ? form.compte_versement : null,
      allocations: Object.entries(alloc).filter(([, value]) => num(value) > 0).map(([num_quittance, value]) => ({ num_quittance, montant: num(value) })),
    };
  }

  function problem() {
    if (!code.trim()) return 'Le code client est obligatoire.';
    if (!client || !client.nom_client) return 'Choisissez un client existant : code client et nom client sont obligatoires.';
    if (!form.nump.trim()) return 'Le numéro de pièce est obligatoire.';
    if (!form.a_verser && !form.en_instance) return 'Le statut est obligatoire : cochez « À verser » ou « En instance ».';
    if (form.a_verser && !form.compte_versement) return 'Choisissez le compte de versement de l’agence.';
    if (num(form.montant) <= 0) return 'Le montant doit être supérieur à zéro.';
    if (allocated > num(form.montant) + 0.001) return 'Le total réparti dépasse le montant de la pièce.';
    const tooMuch = quittances.find((row) => num(alloc[row.num_quittance]) > Number(row.solde) - Number(row.instance) + 0.001);
    return tooMuch ? `Montant trop élevé pour la quittance ${tooMuch.num_quittance}.` : '';
  }

  async function run(action, doneMessage) {
    const message = problem();
    if (message && action !== 'delete') { setError(message); return; }
    setBusy(true);
    setError('');
    try {
      let result = null;
      if (action === 'create') result = await createPiece(accessToken, payload());
      if (action === 'update') result = await updatePiece(accessToken, form.nump.trim(), payload());
      if (action === 'delete') await deletePiece(accessToken, form.nump.trim(), client.code_client);
      // The statut of a batch of cheques is kept for the next one.
      setForm((current) => (batchRef.current && action === 'create' ? { ...blankForm(), a_verser: current.a_verser, en_instance: current.en_instance, compte_versement: current.compte_versement } : blankForm()));
      setAlloc({});
      setEditing(false);
      await loadClient(client.code_client);
      // "À verser": the piece was recorded as a client règlement (TRegCli) and the quittances it pays are settled.
      const done = result?.num_reg_cli ? `Pièce versée : règlement n° ${result.num_reg_cli} enregistré, quittances réglées.` : doneMessage;
      setNotice(done);
      if (action === 'create' && batchRef.current && !advanceBatch()) setNotice(`${done} Tous les chèques scannés sont enregistrés.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePiece() {
    if (!editing || !window.confirm(`Supprimer la pièce ${form.nump} ?`)) return;
    await run('delete', 'Pièce supprimée.');
  }

  async function openList() {
    setError('');
    try {
      setList(await listPieces(accessToken, { code_client: client?.code_client || '', instance: true }));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function pickFromList(row) {
    setList(null);
    skipCode.current = row.code_client;
    setCode(row.code_client);
    try {
      const result = await getPiece(accessToken, row.code_client, row.nump);
      const piece = result.piece;
      setForm({ nump: piece.nump, typep: piece.typep || 'C', datep: String(piece.datep || today()).slice(0, 10), montant: String(piece.montant ?? ''), code_banque: piece.code_banque || '', ...storedStatus(piece) });
      await loadClient(row.code_client, piece.nump);
      setAlloc(Object.fromEntries(result.allocations.map((item) => [item.num_quittance, String(item.montant)])));
      setEditing(true);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function chooseImport(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setError(''); setNotice('');
    // One document: the import window; several (or more while a batch is open): the cheques are scanned one by one.
    if (files.length === 1 && !batchRef.current) setImportFile(files[0]);
    else addToBatch(files);
  }

  function commitBatch(next) {
    batchRef.current = next;
    setBatchState(next);
  }

  function updateBatchItem(id, patch) {
    const current = batchRef.current;
    if (!current) return;
    commitBatch({ ...current, items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  }

  function addToBatch(files) {
    const current = batchRef.current || { items: [], current: 0 };
    const start = Date.now();
    const items = files.map((file, index) => ({ id: `${start}-${index}-${file.name}`, file, name: file.name, status: 'attente' }));
    const open = current.items.some((item) => item.status !== 'ajoute');
    commitBatch({ items: [...current.items, ...items], current: open ? current.current : current.items.length });
    readBatch();
  }

  // The cheques are read one after the other (the OCR server and the browser read one document at a time).
  async function readBatch() {
    if (scanning.current) return;
    scanning.current = true;
    try {
      for (;;) {
        const next = batchRef.current?.items.find((item) => item.status === 'attente');
        if (!next) break;
        updateBatchItem(next.id, { status: 'lecture' });
        try {
          const { values, found, warnings } = await scanPayment(next.file, { accessToken, banks });
          updateBatchItem(next.id, { status: found.length ? 'lu' : 'erreur', values, found, warnings: warnings || [], error: found.length ? '' : 'Aucune information lisible.' });
        } catch (scanError) {
          updateBatchItem(next.id, { status: 'erreur', error: scanError.message });
        }
      }
    } finally {
      scanning.current = false;
    }
  }

  // The cheque shown in the form; an unreadable one starts an empty piece to type by hand.
  function showBatchItem(index) {
    const current = batchRef.current;
    if (!current || !current.items[index] || current.items[index].status === 'ajoute') return;
    appliedId.current = null;
    commitBatch({ ...current, current: index });
  }

  // After "Ajouter": the cheque is recorded, the next one waiting is loaded.
  function advanceBatch() {
    const current = batchRef.current;
    if (!current) return false;
    const items = current.items.map((item, index) => (index === current.current ? { ...item, status: 'ajoute' } : item));
    const after = items.findIndex((item, index) => index > current.current && item.status !== 'ajoute');
    const next = after >= 0 ? after : items.findIndex((item) => item.status !== 'ajoute');
    commitBatch({ items, current: next >= 0 ? next : current.current });
    return next >= 0;
  }

  function closeBatch() {
    const left = batchRef.current?.items.filter((item) => item.status !== 'ajoute').length || 0;
    if (left && !window.confirm(`${left} chèque(s) scanné(s) ne sont pas encore enregistrés. Fermer la liste ?`)) return;
    appliedId.current = null;
    commitBatch(null);
  }

  // The current cheque of the batch fills the form once it is read.
  fillRef.current = (item) => {
    setForm((current) => ({ ...blankForm(), a_verser: current.a_verser, en_instance: current.en_instance, compte_versement: current.compte_versement }));
    setAlloc({});
    setEditing(false);
    const position = `${batchRef.current.current + 1} / ${batchRef.current.items.length}`;
    if (item.status === 'erreur') { setNotice(`Chèque ${position} illisible (${item.error}) : saisissez-le à la main.`); return; }
    fillFromScan(item.values, true);
    setNotice(`Chèque ${position} chargé : vérifiez puis cliquez « Ajouter ».`);
  };
  useEffect(() => {
    const item = batch?.items[batch.current];
    if (!item || !['lu', 'erreur'].includes(item.status) || appliedId.current === item.id) return;
    appliedId.current = item.id;
    fillRef.current(item);
  }, [batch]);

  // Once the import window has read the cheque / traite / bordereau: the piece and its quittances are filled.
  function applyImport({ values, found }) {
    setImportFile(null);
    if (!found.length) { setNotice('Aucune information lisible : renseignez les champs à la main.'); return; }
    fillFromScan(values);
  }

  function fillFromScan(values, fresh = false) {
    setForm((current) => ({
      ...current,
      typep: TYPE_CODES[values.typeReglement] || current.typep,
      nump: values.nump || current.nump,
      montant: values.montant ? String(Number(values.montant)) : current.montant,
      datep: values.echeance || current.datep,
      code_banque: values.code_banque || current.code_banque,
      a_verser: values.aVerser ?? current.a_verser,
      en_instance: values.enInstance ?? current.en_instance,
    }));
    setEditing(false);
    const request = { numbers: values.quittances, montant: values.montant || (fresh ? 0 : form.montant) };
    // A new client code reloads the client: its unpaid quittances are paid once they are loaded.
    if (values.code && values.code !== code.trim()) pendingImport.current = request;
    else if (client) setAlloc(importedAlloc(quittances, request));
    if (values.code) setCode(values.code);
  }

  return (
    <div className="chq-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="chq-dialog" role="dialog" aria-modal="true" aria-labelledby="chq-title">
        <header className="chq-header">
          <div><span>COMPTABILITE · MODULE 560</span><h2 id="chq-title">Saisir les pièces de règlement</h2></div>
          <button type="button" onClick={onClose} aria-label="Fermer">×</button>
        </header>

        <div className="chq-toolbar">
          <button type="button" className="chq-tool" disabled={busy || editing} onClick={() => run('create', 'Pièce ajoutée.')}>Ajouter</button>
          <button type="button" className="chq-tool" disabled={busy || !editing} onClick={() => run('update', 'Pièce modifiée.')}>Modifier</button>
          <button type="button" className="chq-tool" disabled={busy || !editing} onClick={removePiece}>Supprimer</button>
          <button type="button" className="chq-tool" disabled={busy} onClick={openList}>Lister</button>
          <span className="chq-spacer" />
          <input ref={importInput} type="file" accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf" multiple hidden onChange={chooseImport} />
          <button type="button" className="chq-import" disabled={busy} onClick={() => importInput.current?.click()} title="Scanner un ou plusieurs chèques (images ou PDF) : ils remplissent le formulaire un par un">{batch ? 'Ajouter des chèques' : 'Importer'}</button>
          <button type="button" className="chq-tool" onClick={onClose}>Fermer</button>
        </div>

        {batch && <BatchStrip batch={batch} onShow={showBatchItem} onClose={closeBatch} />}

        <div className="chq-body">
          <fieldset className="chq-group">
            <legend>Donnée client</legend>
            <label>Code client <span className="chq-required">*</span><input value={code} onChange={(event) => typeCode(event.target.value)} maxLength={8} placeholder="Ex : 2973" required /></label>
            <div className="chq-wide chq-name">
              <label>Nom client <span className="chq-required">*</span>
                <input
                  value={nameQuery ?? (client?.nom_client || '')}
                  onChange={(event) => typeName(event.target.value)}
                  onBlur={() => setTimeout(() => setNameQuery(null), 150)}
                  placeholder="Saisir un nom ou un prénom"
                  autoComplete="off"
                  required
                />
              </label>
              {nameQuery?.trim() && (
                <ul className="chq-suggest" role="listbox">
                  {!allClients?.length ? <li><small>Chargement…</small></li>
                    : nameMatches.length === 0 ? <li><small>Aucun client trouvé.</small></li>
                    : nameMatches.map((record) => (
                      <li key={record.clientCode}>
                        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => pickClient(record)}>
                          <span>{[record.lastName, record.firstName].filter(Boolean).join(' ') || record.relatedName || 'Client sans nom'}</span>
                          <small>Code {record.clientCode}</small>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </fieldset>

          <fieldset className="chq-group">
            <legend>Donnée pièce</legend>
            <label>N° pièce <span className="chq-required">*</span>
              <input required value={form.nump} onChange={(event) => changePiece(event.target.value)} maxLength={20} placeholder="Nouveau n° de pièce" autoComplete="off" disabled={!client} />
            </label>
            <label>Date échéance<input type="date" value={form.datep} onChange={(event) => change({ datep: event.target.value })} /></label>
            <label>Date saisie<input value={shortDate(today())} readOnly /></label>
            <label>Montant<input type="number" step="any" min="0" value={form.montant} onChange={(event) => change({ montant: event.target.value })} /></label>
            <label>Solde<input value={money(solde)} readOnly /></label>
          </fieldset>

          <div className="chq-row">
            <fieldset className="chq-group chq-bank">
              <legend>Donnée banque</legend>
              <div className="chq-types" role="radiogroup" aria-label="Type de pièce">
                {TYPES.map(([value, label]) => (
                  <label key={value} className="chq-check"><input type="radio" name="chq-type" checked={form.typep === value} onChange={() => chooseType(value)} />{label}</label>
                ))}
              </div>
              <label>Code banque
                <select value={form.code_banque} onChange={(event) => change({ code_banque: event.target.value })}>
                  <option value="">—</option>
                  {banks.map((bank) => <option key={bank.code_banque} value={bank.code_banque}>{bank.code_banque}</option>)}
                </select>
              </label>
              <label>Nom banque
                <select value={form.code_banque} onChange={(event) => change({ code_banque: event.target.value })} aria-label="Nom de la banque">
                  <option value="">—</option>
                  {banks.map((bank) => <option key={bank.code_banque} value={bank.code_banque}>{bank.nom_banque}</option>)}
                </select>
              </label>
            </fieldset>
            <fieldset className="chq-group chq-flags">
              <legend>Statut <span className="chq-required">*</span></legend>
              {/* One status only: "À verser" records a règlement (TRegCli), "En instance" keeps the piece in TPiece. */}
              <label className="chq-check" title="Enregistrer la pièce comme règlement du client : les quittances choisies sont réglées">
                <input type="checkbox" checked={form.a_verser} onChange={(event) => change({ a_verser: event.target.checked, ...(event.target.checked ? { en_instance: false } : {}) })} />À verser
              </label>
              <label className="chq-check" title="Garder la pièce en instance : les montants sont seulement réservés sur les quittances">
                <input type="checkbox" checked={form.en_instance} onChange={(event) => change({ en_instance: event.target.checked, ...(event.target.checked ? { a_verser: false } : {}) })} />En instance
              </label>
              {form.a_verser && (
                <label className="chq-account">Compte de versement <span className="chq-required">*</span>
                  <select value={form.compte_versement} onChange={(event) => change({ compte_versement: event.target.value })}>
                    <option value="">—</option>
                    {accounts.map((account) => <option key={account.code_banque} value={account.code_banque}>{account.code_banque} · {account.nom_banque}</option>)}
                  </select>
                </label>
              )}
              {bankName && <small>{bankName}</small>}
            </fieldset>
          </div>

          {error && <p className="chq-error" role="alert">{error}</p>}
          {notice && !error && <p className="chq-notice" role="status">{notice}</p>}
          <div className="chq-table-head">
            <strong>QUITTANCES</strong>
            <div className="chq-due" role="radiogroup" aria-label="Quittances affichées">
              {[['toutes', 'Toutes'], ['echues', 'Échues'], ['non-echues', 'Non échues']].map(([value, label]) => (
                <label key={value}><input type="radio" name="chq-due" checked={due === value} onChange={() => setDue(value)} />{label}</label>
              ))}
            </div>
            {hiddenAllocated > 0.0005 && <span className="chq-due-note">{money(hiddenAllocated)} réparti sur des quittances masquées</span>}
            <button type="button" className="chq-tool" onClick={autoSpread} disabled={!client || num(form.montant) <= 0 || !shown.length}>Répartir automatiquement</button>
          </div>
          <div className="chq-table-wrap">
            <table className="chq-table">
              <thead><tr><th>N° Police</th><th>Échéance</th><th>N° Quittance</th><th>Solde Quittance</th><th>Traite/Chèque</th><th>Reste à régler</th><th>Montant</th></tr></thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr><td colSpan={7} className="chq-empty">{!client ? 'Saisissez un code client pour afficher ses quittances impayées.' : quittances.length ? `Aucune quittance impayée ${due === 'echues' ? 'échue' : 'non échue'} pour ce client.` : 'Aucune quittance impayée pour ce client.'}</td></tr>
                ) : shown.map((row) => {
                  const reste = Number(row.solde) - Number(row.instance) - num(alloc[row.num_quittance]);
                  return (
                    <tr key={row.num_quittance}>
                      <td>{row.num_police || row.num_int}</td>
                      <td>{shortDate(row.echeance)}</td>
                      <td>{row.num_quittance}</td>
                      <td className="chq-number">{money(row.solde)}</td>
                      <td className="chq-number">{money(row.instance)}</td>
                      <td className={`chq-number${reste < -0.0005 ? ' is-over' : ''}`}>{money(reste)}</td>
                      <td><input className="chq-amount" type="number" step="any" min="0" value={alloc[row.num_quittance] ?? ''} onChange={(event) => setAlloc((current) => ({ ...current, [row.num_quittance]: event.target.value }))} /></td>
                    </tr>
                  );
                })}
                {shown.length > 0 && (
                  <tr className="chq-totals"><td colSpan={3}>TOTAUX</td><td className="chq-number">{money(totals.solde)}</td><td className="chq-number">{money(totals.instance)}</td><td className="chq-number">{money(totals.solde - totals.instance - totals.montant)}</td><td className="chq-number">{money(totals.montant)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {list && (
        <div className="chq-nested" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setList(null); }}>
          <section className="chq-list" role="dialog" aria-modal="true" aria-label="Pièces en instance">
            <header><h3>Pièces en instance{client ? ` — client ${client.code_client}` : ''}</h3><button type="button" onClick={() => setList(null)} aria-label="Fermer">×</button></header>
            <div className="chq-table-wrap">
              <table className="chq-table">
                <thead><tr><th>N° pièce</th><th>Client</th><th>Type</th><th>Banque</th><th>Échéance</th><th>Saisie</th><th>Montant</th><th>À verser</th></tr></thead>
                <tbody>
                  {list.length === 0 ? <tr><td colSpan={8} className="chq-empty">Aucune pièce en instance.</td></tr> : list.map((row) => (
                    <tr key={`${row.nump}-${row.code_client}`} onClick={() => pickFromList(row)} className="is-clickable">
                      <td>{row.nump}</td><td>{row.code_client} {row.nom_client}</td><td>{(TYPES.find(([value]) => value === row.typep) || [])[1] || row.typep}</td>
                      <td>{row.nom_banque || row.code_banque}</td><td>{shortDate(row.datep)}</td><td>{shortDate(row.dates)}</td><td className="chq-number">{money(row.montant)}</td><td>{row.verser === 'N' ? 'Oui' : 'Non'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer><span>{list.length} pièce(s) — cliquez une ligne pour l'ouvrir</span><button type="button" className="chq-tool" onClick={() => setList(null)}>Fermer</button></footer>
          </section>
        </div>
      )}
      {importFile && <DocumentImportDialog file={importFile} kicker="RECOUVREMENT · PIÈCES · IMPORT" title="Importer une pièce (chèque, traite, bordereau)" read={(onProgress) => scanPayment(importFile, { accessToken, banks, onProgress })} summarize={({ found, warnings }) => ({ rows: found.map((item) => [item.label, item.value]), warnings, empty: "Aucune information lisible : renseignez les champs à la main." })} applyLabel="Appliquer à la pièce" onApply={applyImport} onClose={() => setImportFile(null)} />}
    </div>
  );
}

// The cheques scanned at once: one button per cheque (number, amount, state); the current one is in the form.
function BatchStrip({ batch, onShow, onClose }) {
  const { items, current } = batch;
  const saved = items.filter((item) => item.status === 'ajoute').length;
  const reading = items.findIndex((item) => item.status === 'lecture');
  const item = items[current];
  const nextOpen = (step) => {
    for (let index = current + step; index >= 0 && index < items.length; index += step) if (items[index].status !== 'ajoute') return index;
    return -1;
  };
  const previous = nextOpen(-1);
  const following = nextOpen(1);
  return (
    <section className="chq-batch" aria-label="Chèques scannés">
      <div className="chq-batch-head">
        <strong>Chèques scannés · {saved} / {items.length} enregistré{saved > 1 ? 's' : ''}</strong>
        {reading >= 0 && <span className="chq-batch-reading">Lecture du chèque {reading + 1} sur {items.length}…</span>}
        <span className="chq-spacer" />
        <button type="button" className="chq-tool" disabled={previous < 0} onClick={() => onShow(previous)}>‹ Précédent</button>
        <button type="button" className="chq-tool" disabled={following < 0} onClick={() => onShow(following)}>Suivant ›</button>
        <button type="button" className="chq-tool" onClick={onClose}>{saved === items.length ? 'Terminer' : 'Fermer la liste'}</button>
      </div>
      <ol className="chq-batch-list">
        {items.map((entry, index) => (
          <li key={entry.id}>
            <button type="button" className={`chq-batch-item is-${entry.status}${index === current ? ' is-current' : ''}`} disabled={entry.status === 'ajoute'} onClick={() => onShow(index)} aria-current={index === current ? 'true' : undefined} title={entry.name}>
              <b>{index + 1}</b>
              <span>{entry.values?.nump || entry.name}</span>
              <small>{entry.values?.montant && entry.status !== 'erreur' ? `${money(entry.values.montant)} · ${BATCH_STATES[entry.status]}` : BATCH_STATES[entry.status]}{entry.status === 'lu' && entry.warnings?.length ? ' · ⚠' : ''}</small>
            </button>
          </li>
        ))}
      </ol>
      {item?.status === 'lu' && <p className="chq-batch-found"><b>Lu sur le chèque {current + 1} :</b> {item.found.map((field) => `${field.label} ${field.value}`).join(' · ')}</p>}
      {item?.status === 'lu' && item.warnings?.length > 0 && <ul className="chq-batch-warnings">{item.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      {item && ['attente', 'lecture'].includes(item.status) && <p className="chq-batch-found">Chèque {current + 1} en cours de lecture : le formulaire se remplit dès qu’il est lu.</p>}
    </section>
  );
}
