import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { searchRecords } from "../../services/clientRecordsApi";
import "./ReceiptManager.css";

const shortDate = (value) => (value ? String(value).slice(0, 10).split("-").reverse().join("/") : "");
const money = (value) => (value == null || value === "" ? "" : Number(value).toLocaleString("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
const text = (value) => (value == null ? "" : String(value).trim());
const amount = (value) => Number(value || 0);
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const LIMIT = 2000;
// What a client owes, as the Etat des impayés counts it: primes (type P) that are not cancelled. Type C (legacy
// software) and R (ristourne) quittances keep a solde_quittance, but it is not owed by the client.
const isDue = (row) => text(row.type_quittance) === "P" && text(row.annule) !== "O";
const TYPE_LABELS = { P: "Prime", C: "Type C (ancien logiciel, non dû)", R: "Ristourne" };

// Read-only table of receipts with the columns of the legacy receipts grid. Opened from a client file it lists that
// client's receipts; the code, the name and, once "Entre deux dates" is ticked, the échéance narrow the list.
export default function ReceiptManager({ clientCode }) {
  const { accessToken } = useAuth();
  const [filters, setFilters] = useState({ code_client: clientCode || "", nom_client: "", byDate: false, date_min: yearStart(), date_max: today() });
  const [state, setState] = useState({ loading: true, error: "", rows: [] });

  // The list follows the filters as they are typed.
  useEffect(() => {
    const code = filters.code_client.trim();
    const nom = filters.nom_client.trim();
    if (!code && nom.length < 2 && !filters.byDate) { setState({ loading: false, error: "", rows: [] }); return undefined; }
    let active = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    const timer = setTimeout(() => {
      searchRecords(accessToken, "receipts", {
        code_client: code, nom_client: nom, limit: LIMIT,
        date_min: filters.byDate ? filters.date_min : "", date_max: filters.byDate ? filters.date_max : "",
      })
        .then((rows) => { if (active) setState({ loading: false, error: "", rows }); })
        .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, rows: [] }); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [accessToken, filters]);

  const update = (event) => {
    const { name, value, type, checked } = event.target;
    setFilters((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  };
  const { rows } = state;
  const totals = rows.reduce((sum, row) => ({ montant: sum.montant + amount(row.montant_quittance), solde: sum.solde + (isDue(row) ? amount(row.solde_quittance) : 0) }), { montant: 0, solde: 0 });
  const ready = filters.code_client.trim() || filters.nom_client.trim().length >= 2 || filters.byDate;

  return (
    <div className="rm-form">
      <div className="rm-filters">
        <label><span>Code client</span><input name="code_client" value={filters.code_client} onChange={update} maxLength={8} placeholder="Tous" /></label>
        <label className="rm-wide"><span>Nom client</span><input name="nom_client" value={filters.nom_client} onChange={update} maxLength={60} placeholder="Rechercher par nom" /></label>
        <fieldset className="rm-dates">
          <legend><label><input type="checkbox" name="byDate" checked={filters.byDate} onChange={update} /> Entre deux dates (échéance)</label></legend>
          <label><span>Du</span><input type="date" name="date_min" value={filters.date_min} onChange={update} disabled={!filters.byDate} /></label>
          <label><span>Au</span><input type="date" name="date_max" value={filters.date_max} min={filters.date_min} onChange={update} disabled={!filters.byDate} /></label>
        </fieldset>
        <button type="button" className="rm-clear" onClick={() => setFilters({ code_client: clientCode || "", nom_client: "", byDate: false, date_min: yearStart(), date_max: today() })}>Effacer</button>
      </div>

      {state.error && <p className="rm-error" role="alert">{state.error}</p>}
      <div className="rm-summary">
        <strong>{state.loading ? "Chargement…" : `${rows.length} quittance${rows.length > 1 ? "s" : ""}`}</strong>
        <span>Montant <b>{money(totals.montant)}</b> · Solde impayé <b className="rm-balance" title="Primes (type P) non annulées, comme l’état des impayés">{money(totals.solde)}</b> TND</span>
      </div>
      <div className="rm-table-wrap">
        <table className="rm-table">
          <thead><tr>
            <th>N° quittance</th><th>N° police</th><th>Client</th><th>Date saisie</th><th>Effet</th><th>Échéance</th><th>TC</th><th>Type</th>
            <th className="rm-number">P. Net</th><th className="rm-number">MM. Comp</th><th className="rm-number">Mont. Quit.</th><th className="rm-number">Solde</th>
            <th>Reg</th><th>Date Reg</th><th>Date Mvt</th>
          </tr></thead>
          <tbody>
            {!state.loading && rows.length === 0 ? <tr><td colSpan={15} className="rm-empty">{ready ? "Aucune quittance à afficher" : "Saisissez un code client, un nom ou des dates."}</td></tr>
              : rows.map((row, index) => (
                <tr key={`${text(row.num_quittance)}-${index}`}>
                  <td><strong>{text(row.num_quittance)}</strong></td><td>{text(row.num_police)}</td>
                  <td title={text(row.nom_client)}>{text(row.code_client)} {text(row.nom_client)}</td>
                  <td>{shortDate(row.date_saisie)}</td><td>{shortDate(row.date_emission)}</td><td>{shortDate(row.echeance)}</td><td>{text(row.tc)}</td>
                  <td title={TYPE_LABELS[text(row.type_quittance)] || ""}>{text(row.type_quittance)}{text(row.annule) === "O" ? " (annulée)" : ""}</td>
                  <td className="rm-number">{money(row.prime_net)}</td><td className="rm-number">{money(row.commission)}</td>
                  <td className="rm-number">{money(row.montant_quittance)}</td>
                  <td className={`rm-number${amount(row.solde_quittance) > 0.0005 ? (isDue(row) ? " rm-balance" : " rm-not-due") : ""}`} title={isDue(row) ? "" : "Non compté dans le solde impayé"}>{money(row.solde_quittance)}</td>
                  <td>{row.Date_Reglement ? "O" : "N"}</td><td>{shortDate(row.Date_Reglement)}</td><td>{shortDate(row.Date_M)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!state.loading && rows.length >= LIMIT && <p className="rm-notice" role="status">Résultats limités à {LIMIT} quittances : précisez les critères.</p>}
    </div>
  );
}
