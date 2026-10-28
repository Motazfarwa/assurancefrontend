import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getClientReglements, getReglement } from '../../services/reglementClientApi';
import '../RecetteModal/RecetteModal.css';
import './ReglementClientModal.css';

const num = (value) => (value === '' || value == null ? 0 : Number(value) || 0);
const money = (value) => (value == null || value === '' ? '' : num(value).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
const shortDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');

// Consultation of a client's règlements (TRegCli): typing the client code lists them, the most recent one is shown with the
// quittances it paid; typing a N° règlement opens that one and its client.
export default function ReglementClientModal({ onClose, moduleId = '575' }) {
  const { accessToken } = useAuth();
  const [code, setCode] = useState('');
  const [numero, setNumero] = useState(''); // N° règlement field
  const [client, setClient] = useState(null);
  const [reglements, setReglements] = useState([]);
  const [total, setTotal] = useState(null);
  const [opened, setOpened] = useState(null); // { reglement, details }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const wanted = useRef(null); // règlement to show once the client's list is loaded (opened by its number)

  async function show(numReg) {
    setError('');
    try {
      const result = await getReglement(accessToken, numReg);
      setOpened(result); setNumero(String(result.reglement.num_reg_cli));
      return result;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    }
  }

  useEffect(() => {
    const value = code.trim();
    setReglements([]); setTotal(null); setOpened(null);
    if (!value) { setClient(null); setError(''); return undefined; }
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await getClientReglements(accessToken, value);
        if (!active) return;
        setClient(result.client); setReglements(result.reglements); setTotal(result.total); setError('');
        const first = wanted.current ?? result.reglements[0]?.num_reg_cli;
        wanted.current = null;
        if (first != null) show(first); else setNumero('');
      } catch (requestError) {
        if (!active) return;
        wanted.current = null;
        setClient(null); setNumero(''); setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    }, 400);
    return () => { active = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, code]);

  // A number typed in "N° règlement": that règlement is opened, with its client and the client's other règlements.
  async function openByNumber() {
    const value = numero.trim();
    if (!value || String(opened?.reglement.num_reg_cli) === value) return;
    if (!/^\d+$/.test(value)) { setError('Le N° règlement est un nombre.'); return; }
    const inList = reglements.some((row) => String(row.num_reg_cli) === value);
    if (inList) { show(value); return; }
    const result = await show(value);
    const owner = result?.reglement.code_client || '';
    if (result && owner && owner !== code.trim()) { wanted.current = result.reglement.num_reg_cli; setCode(owner); }
  }

  const reglement = opened?.reglement;
  const details = opened?.details || [];
  const affecte = details.reduce((sum, row) => sum + num(row.montant), 0);

  return (
    <div className="rct-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="rct-dialog rgc-dialog" role="dialog" aria-modal="true" aria-labelledby="rgc-title">
        <header className="rct-header">
          <div><span>COMPTABILITE · MODULE {moduleId}</span><h2 id="rgc-title">Règlement client</h2></div>
          <div className="rct-header-actions">
            <button type="button" className="rct-close" onClick={onClose} aria-label="Fermer">×</button>
          </div>
        </header>

        <div className="rct-body">
          <fieldset className="rct-group">
            <legend>Saisie</legend>
            <label>N° Règlement
              <input value={numero} onChange={(event) => setNumero(event.target.value)} onBlur={openByNumber} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); openByNumber(); } }}
                list="rgc-numbers" inputMode="numeric" placeholder="Ex : 41802" className="rgc-search" />
            </label>
            <datalist id="rgc-numbers">{reglements.map((row) => <option key={row.num_reg_cli} value={row.num_reg_cli}>{`${shortDate(row.date_reg_cli)} · ${money(row.mont_reg_cli)}`}</option>)}</datalist>
            <label>Code client<input value={code} onChange={(event) => setCode(event.target.value)} maxLength={8} placeholder="Ex : 4717" autoFocus className="rgc-search" /></label>
            <label className="rct-wide">Nom client<input value={client?.nom_client || ''} readOnly placeholder={loading ? 'Recherche…' : 'Détecté automatiquement'} /></label>
            <label>Date règlement<input value={shortDate(reglement?.date_reg_cli)} readOnly /></label>
          </fieldset>

          <fieldset className="rct-group">
            <legend>Règlement</legend>
            <label>Type règlement<input value={reglement ? reglement.type_libelle : ''} readOnly /></label>
            <label>N° pièce<input value={reglement?.num_piece || ''} readOnly /></label>
            <label>Montant règlement<input value={money(reglement?.mont_reg_cli)} readOnly className="rgc-number" /></label>
            <label className="rct-wide">Banque<input value={reglement ? [reglement.code_banque, reglement.nom_banque].filter(Boolean).join(' · ') : ''} readOnly /></label>
            <label>Montant affecté<input value={reglement ? money(affecte) : ''} readOnly className="rgc-number" title="Total payé sur les quittances" /></label>
            <label className="rct-check"><input type="checkbox" checked={Boolean(reglement?.fictif)} readOnly disabled />Fictif</label>
          </fieldset>

          <div className="rgc-row">
            <fieldset className="rct-group rgc-list">
              <legend>Règlements du client{total ? ` · ${total.nombre} · ${money(total.montant)} DT` : ''}</legend>
              <div className="rct-table-wrap">
                <table className="rct-table">
                  <thead><tr><th>N° Règl.</th><th>Date</th><th>Type</th><th>N° pièce</th><th className="rct-number">Montant</th></tr></thead>
                  <tbody>
                    {!client ? <tr><td colSpan={5} className="rct-empty">{loading ? 'Chargement…' : 'Saisissez un code client.'}</td></tr>
                      : reglements.length === 0 ? <tr><td colSpan={5} className="rct-empty">Aucun règlement pour ce client.</td></tr>
                      : reglements.map((row) => (
                        <tr key={row.num_reg_cli} className={`is-clickable${reglement?.num_reg_cli === row.num_reg_cli ? ' is-selected' : ''}`} onClick={() => show(row.num_reg_cli)}>
                          <td>{row.num_reg_cli}</td><td>{shortDate(row.date_reg_cli)}</td><td>{row.type_libelle}{row.fictif ? ' (fictif)' : ''}</td>
                          <td title={row.num_piece || ''}>{row.num_piece}</td><td className="rct-number">{money(row.mont_reg_cli)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </fieldset>

            <fieldset className="rct-group rgc-detail">
              <legend>Détail{reglement ? ` du règlement n° ${reglement.num_reg_cli}` : ''}</legend>
              <div className="rct-table-wrap">
                <table className="rct-table">
                  <thead><tr><th>N° Quittance</th><th>N° police</th><th className="rct-number">Montant quittance</th><th className="rct-number">Montant réglé</th><th className="rct-number">Solde</th><th>Type</th></tr></thead>
                  <tbody>
                    {!reglement ? <tr><td colSpan={6} className="rct-empty">Choisissez un règlement.</td></tr>
                      : details.length === 0 ? <tr><td colSpan={6} className="rct-empty">Aucune quittance affectée à ce règlement.</td></tr>
                      : details.map((row) => (
                        <tr key={row.num_recu ?? row.num_quittance}>
                          <td>{row.num_quittance}</td><td>{row.num_int}</td><td className="rct-number">{money(row.montant_quittance)}</td>
                          <td className="rct-number">{money(row.montant)}</td><td className="rct-number">{money(row.solde_quittance)}</td>
                          <td title={row.acompte_solde === 'A' ? 'Acompte' : row.acompte_solde === 'S' ? 'Soldée' : ''}>{row.acompte_solde === 'A' ? 'Acompte' : row.acompte_solde === 'S' ? 'Soldée' : row.acompte_solde}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </fieldset>
          </div>

          {error && <p className="rct-error" role="alert">{error}</p>}
        </div>

        <footer className="rct-footer">
          <button type="button" className="rct-tool" onClick={onClose}>Fermer</button>
        </footer>
      </section>
    </div>
  );
}
