import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { listClientRecords, searchRecords } from "../../services/clientRecordsApi";
import "./ReceiptManager.css";

const shortDate = (value) => (value ? String(value).slice(0, 10).split("-").reverse().join("/") : "");
const money = (value) => (value == null || value === "" ? "" : Number(value).toLocaleString("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
const text = (value) => (value == null ? "" : String(value).trim());

// Read-only view of a client's receipts with the fields of the legacy receipts grid:
// pick the policy, then one of its receipts, and the related information is displayed.
export default function ReceiptManager({ clientCode }) {
  const { accessToken } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [policy, setPolicy] = useState("");
  const [receipts, setReceipts] = useState([]);
  const [receipt, setReceipt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    listClientRecords(accessToken, "policies", clientCode, { limit: 1000 })
      .then((rows) => {
        if (!active) return;
        setPolicies(rows);
        setPolicy(rows[0] ? text(rows[0].num_int) : "");
        if (!rows.length) setLoading(false);
      })
      .catch((requestError) => { if (active) { setError(requestError.message); setLoading(false); } });
    return () => { active = false; };
  }, [accessToken, clientCode]);

  useEffect(() => {
    if (!policy) return undefined;
    let active = true;
    setLoading(true);
    setError("");
    searchRecords(accessToken, "receipts", { num_int: policy })
      .then((rows) => {
        if (!active) return;
        setReceipts(rows);
        setReceipt(rows[0] ? text(rows[0].num_quittance) : "");
      })
      .catch((requestError) => { if (active) { setReceipts([]); setError(requestError.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, policy]);

  const current = useMemo(() => receipts.find((row) => text(row.num_quittance) === receipt) || null, [receipts, receipt]);
  const view = (value) => value ?? "";

  const readOnly = (label, value, extra = "") => (
    <label className={extra}><span>{label}</span><input value={value} readOnly /></label>
  );

  return (
    <div className="rm-form">
      <p className="module-modal-description">Quittances du client {clientCode} (consultation) : choisissez la police puis la quittance.</p>

      <div className="rm-fields">
        {readOnly("Code client", clientCode)}
        <label className="rm-span-2">
          <span>N° police</span>
          <select value={policy} onChange={(event) => setPolicy(event.target.value)}>
            {policies.length === 0 && <option value="">Aucune police pour ce client</option>}
            {policies.map((row) => (
              <option key={text(row.num_int)} value={text(row.num_int)}>{text(row.num_police)}{row.num_imat ? ` · ${text(row.num_imat)}` : ""}</option>
            ))}
          </select>
        </label>
        <label>
          <span>N° quittance</span>
          <select value={receipt} onChange={(event) => setReceipt(event.target.value)}>
            {receipts.length === 0 && <option value="">{loading ? "Chargement…" : "Aucune quittance"}</option>}
            {receipts.map((row) => <option key={text(row.num_quittance)} value={text(row.num_quittance)}>{text(row.num_quittance)}</option>)}
          </select>
        </label>

        {readOnly("Date Saisie", shortDate(current?.date_saisie))}
        {readOnly("Effet", shortDate(current?.date_emission))}
        {readOnly("Échéance", shortDate(current?.echeance))}
        {readOnly("TC", view(text(current?.tc)))}

        {readOnly("P. Net", money(current?.prime_net))}
        {readOnly("MM. Comp", money(current?.commission))}
        {readOnly("Mont. Quit.", money(current?.montant_quittance))}
        {readOnly("Solde", money(current?.solde_quittance))}

        {readOnly("Reg", current ? (current.Date_Reglement ? "O" : "N") : "")}
        {readOnly("Date Reg", shortDate(current?.Date_Reglement))}
        {readOnly("Date Mvt", shortDate(current?.Date_M))}
      </div>

      {error && <p className="rm-error" role="alert">{error}</p>}
    </div>
  );
}
