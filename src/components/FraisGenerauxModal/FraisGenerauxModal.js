import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { createFrais, deleteFrais, getFraisOptions, listFrais } from '../../services/fraisApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../CompanyManagementModal/CompanyManagementModal.css';
import '../RistourneModal/RistourneModal.css';
import './FraisGenerauxModal.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => money.format(Number(value || 0));
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;

const entry = (nature = 'D', banque = '') => ({ nature, code_type: '', mode: 'C', date_dep: today(), num_piece: '', code_banque: banque, montant: '', observation: '' });

// Module "Saisie frais généraux": the agency's expenses (salaires, loyers, téléphone…), entered by nature and type,
// with the frais of the period below to check them (and delete one entered by mistake, while not comptabilisé).
export default function FraisGenerauxModal({ moduleId, onClose }) {
  const { accessToken } = useAuth();
  const [options, setOptions] = useState(null);
  const [form, setForm] = useState(entry);
  const [period, setPeriod] = useState({ debut: monthStart(), fin: today() });
  const [list, setList] = useState({ items: [], total: 0, loading: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const typeRef = useRef(null);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  useEffect(() => {
    let active = true;
    getFraisOptions(accessToken)
      .then((body) => { if (!active) return; setOptions(body); setForm((values) => ({ ...values, code_banque: body.banque_par_nature?.[values.nature] || '' })); })
      .catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, [accessToken]);

  const load = useCallback(async () => {
    if (!period.debut || !period.fin || period.fin < period.debut) return;
    setList((current) => ({ ...current, loading: true }));
    try { const body = await listFrais(accessToken, { nature: form.nature, ...period }); setList({ ...body, loading: false }); }
    catch (loadError) { setList({ items: [], total: 0, loading: false }); setError(loadError.message); }
  }, [accessToken, form.nature, period]);

  useEffect(() => { load(); }, [load]);

  const nature = options?.natures.find((item) => item.code === form.nature);
  const typeLabel = (code) => options?.natures.flatMap((item) => item.types).find((type) => type.code_type === code)?.libelle || code;
  const modeLabel = (code) => options?.modes.find((mode) => mode.code === code)?.libelle || code;

  function change(event) {
    const { name, value } = event.target;
    if (name === 'nature') setForm(entry(value, options?.banque_par_nature?.[value] || ''));
    else setForm((values) => ({ ...values, [name]: value }));
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await createFrais(accessToken, { ...form, montant: Math.round(Number(form.montant) * 1000) / 1000, date_piece: null });
      setNotice(`Frais n° ${saved.num_dep} enregistré : ${typeLabel(form.code_type)}, ${fmt(form.montant)} DT.`);
      setForm((values) => ({ ...entry(values.nature, values.code_banque), mode: values.mode, date_dep: values.date_dep }));
      typeRef.current?.focus();
      await load();
    } catch (saveError) { setError(saveError.message); }
    finally { setBusy(false); }
  }

  async function remove(item) {
    if (!window.confirm(`Supprimer le frais n° ${item.num_dep} (${item.libelle || item.code_type}, ${fmt(item.montant)} DT) ?`)) return;
    setBusy(true); setError(''); setNotice('');
    try { await deleteFrais(accessToken, form.nature, item.num_dep); setNotice(`Frais n° ${item.num_dep} supprimé.`); await load(); }
    catch (deleteError) { setError(deleteError.message); }
    finally { setBusy(false); }
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="catalog-modal frg-modal" role="dialog" aria-modal="true" aria-labelledby="frg-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>COMPTABILITÉ · MODULE {moduleId}</span><h2 id="frg-title">Saisie frais généraux</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="catalog-body">
        <form className="catalog-section" onSubmit={save}>
          <div className="frg-grid">
            <label className="catalog-field"><span>Nature frais</span>
              <select name="nature" value={form.nature} onChange={change} disabled={!options}>{options?.natures.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}</select>
            </label>
            <label className="catalog-field frg-type"><span>Type frais</span>
              <select ref={typeRef} name="code_type" value={form.code_type} onChange={change} required disabled={!options} autoFocus>
                <option value="">Choisir le type de frais…</option>
                {nature?.types.map((type) => <option key={type.code_type} value={type.code_type}>{type.libelle}</option>)}
              </select>
            </label>
            <label className="catalog-field"><span>Mode paiement</span>
              <select name="mode" value={form.mode} onChange={change} disabled={!options}>{options?.modes.map((mode) => <option key={mode.code} value={mode.code}>{mode.libelle}</option>)}</select>
            </label>
            <label className="catalog-field"><span>N° pièce</span><input name="num_piece" value={form.num_piece} onChange={change} maxLength={20} autoComplete="off" /></label>
            <label className="catalog-field"><span>Date</span><input type="date" name="date_dep" value={form.date_dep} onChange={change} required /></label>
            <label className="catalog-field"><span>Compte (banque)</span>
              <select name="code_banque" value={form.code_banque} onChange={change} disabled={!options}>
                <option value="">—</option>
                {options?.banques.map((bank) => <option key={bank.code_banque} value={bank.code_banque}>{bank.code_banque}{bank.nom_banque && bank.nom_banque !== bank.code_banque ? ` · ${bank.nom_banque}` : ''}</option>)}
              </select>
            </label>
            <label className="catalog-field"><span>Montant (DT)</span><input type="number" name="montant" value={form.montant} onChange={change} step="0.001" min="0.001" required /></label>
            <label className="catalog-field frg-obs"><span>Observation</span><input name="observation" value={form.observation} onChange={change} maxLength={50} placeholder="Ex. SALAIRE 10/2026, FACTURE STEG…" /></label>
          </div>
          <div className="frg-actions"><button type="submit" className="expert-submit" disabled={busy || !options}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>
        </form>

        {error && <div className="expert-error catalog-message rst-message" role="alert">{error}</div>}
        {notice && <div className="catalog-notice" role="status">{notice}</div>}

        <div className="catalog-section frg-list">
          <div className="frg-list-head">
            <strong>{nature?.libelle || 'Frais'} saisis</strong>
            <label className="catalog-field"><span>Du</span><input type="date" value={period.debut} onChange={(event) => setPeriod((value) => ({ ...value, debut: event.target.value }))} /></label>
            <label className="catalog-field"><span>Au</span><input type="date" value={period.fin} min={period.debut} onChange={(event) => setPeriod((value) => ({ ...value, fin: event.target.value }))} /></label>
            <span className="frg-total">{list.items.length} frais · {fmt(list.total)} DT</span>
          </div>
          <div className="rst-search-list frg-table">
            {!list.items.length ? <p className="rst-empty">{list.loading ? 'Chargement…' : 'Aucun frais sur la période.'}</p> : <table>
              <thead><tr><th>N°</th><th>Date</th><th>Type frais</th><th>Mode</th><th>N° pièce</th><th>Compte</th><th>Observation</th><th className="num">Montant</th><th aria-label="Actions" /></tr></thead>
              <tbody>{list.items.map((item) => <tr key={item.num_dep}>
                <td>{item.num_dep}</td><td>{formatDate(item.date_dep)}</td><td>{item.libelle || item.code_type}</td><td>{modeLabel(item.mode)}</td><td>{item.num_piece}</td><td>{item.code_banque}</td><td>{item.observation}</td><td className="num">{fmt(item.montant)}</td>
                <td>{item.comptabilise ? <span className="frg-done">Comptabilisé</span> : <button type="button" className="frg-delete" onClick={() => remove(item)} disabled={busy} aria-label={`Supprimer le frais ${item.num_dep}`}>Supprimer</button>}</td>
              </tr>)}</tbody>
            </table>}
          </div>
        </div>
        <div className="rst-spacer" />
      </div>
    </section>
  </div>;
}
