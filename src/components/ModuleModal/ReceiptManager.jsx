import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { listClientRecords, searchRecords } from "../../services/clientRecordsApi";
import "./ReceiptManager.css";

const shortDate = (value) => (value ? String(value).slice(0, 10).split("-").reverse().join("/") : "");
const money = (value) => (value == null || value === "" ? "" : Number(value).toLocaleString("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
const text = (value) => (value == null ? "" : String(value).trim());

// Read-only view of receipts with the fields of the legacy receipts grid. The N° police and N° quittance boxes are
// search boxes: typing a number fills the related information (like Gestion des polices); the client's own policies and
// receipts are offered as suggestions.
export default function ReceiptManager({ clientCode }) {
  const { accessToken } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [policyText, setPolicyText] = useState("");
  const [receipts, setReceipts] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const [receiptText, setReceiptText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const wantedReceipt = useRef("");

  // The client's policies: suggestions, and the first one is shown.
  useEffect(() => {
    let active = true;
    listClientRecords(accessToken, "policies", clientCode, { limit: 1000 })
      .then((rows) => {
        if (!active) return;
        setPolicies(rows);
        if (rows[0]) { setPolicy(rows[0]); setPolicyText(text(rows[0].num_police)); } else setLoading(false);
      })
      .catch((requestError) => { if (active) { setError(requestError.message); setLoading(false); } });
    return () => { active = false; };
  }, [accessToken, clientCode]);

  // Receipts of the selected policy (the one asked for by a receipt search, otherwise the first).
  useEffect(() => {
    if (!policy) return undefined;
    let active = true;
    setLoading(true);
    setError("");
    searchRecords(accessToken, "receipts", { num_int: text(policy.num_int) })
      .then((rows) => {
        if (!active) return;
        const wanted = rows.find((row) => text(row.num_quittance) === wantedReceipt.current) || rows[0] || null;
        wantedReceipt.current = "";
        setReceipts(rows);
        setReceipt(wanted);
        setReceiptText(wanted ? text(wanted.num_quittance) : "");
      })
      .catch((requestError) => { if (active) { setReceipts([]); setReceipt(null); setError(requestError.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, policy]);

  // Typing a policy number.
  useEffect(() => {
    const value = policyText.trim();
    if (!value || (policy && value === text(policy.num_police))) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      const known = policies.find((row) => [text(row.num_police), text(row.num_int)].includes(value));
      if (known) { setPolicy(known); setNotice(""); return; }
      if (value.length < 4) return;
      try {
        const rows = await searchRecords(accessToken, "policies", { num_police: value });
        if (!active) return;
        const found = rows.find((row) => [text(row.num_police), text(row.num_int)].includes(value)) || (rows.length === 1 ? rows[0] : null);
        if (found) { setPolicy(found); setNotice(""); } else setNotice(rows.length ? `${rows.length} polices correspondent : précisez le numéro.` : "Aucune police trouvée.");
      } catch (requestError) {
        if (active) setError(requestError.message);
      }
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [policyText, policy, policies, accessToken]);

  // Typing a receipt number: also selects its policy when it belongs to another one.
  useEffect(() => {
    const value = receiptText.trim();
    if (!value || (receipt && value === text(receipt.num_quittance))) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      const known = receipts.find((row) => text(row.num_quittance) === value);
      if (known) { setReceipt(known); setNotice(""); return; }
      if (value.length < 4) return;
      try {
        const rows = await searchRecords(accessToken, "receipts", { num_quittance: value });
        if (!active) return;
        const found = rows.find((row) => text(row.num_quittance) === value) || (rows.length === 1 ? rows[0] : null);
        if (!found) { setNotice(rows.length ? `${rows.length} quittances correspondent : précisez le numéro.` : "Aucune quittance trouvée."); return; }
        setNotice("");
        if (policy && text(found.num_int) === text(policy.num_int)) { setReceipt(found); return; }
        wantedReceipt.current = text(found.num_quittance);
        setPolicyText(text(found.num_police));
        setPolicy({ num_int: found.num_int, num_police: found.num_police, code_client: found.code_client });
      } catch (requestError) {
        if (active) setError(requestError.message);
      }
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [receiptText, receipt, receipts, policy, accessToken]);

  const readOnly = (label, value) => (
    <label><span>{label}</span><input value={value} readOnly /></label>
  );

  return (
    <div className="rm-form">
      <p className="module-modal-description">Consultation des quittances : saisissez un N° police ou un N° quittance, ou choisissez dans la liste du client {clientCode}.</p>

      <div className="rm-fields">
        {readOnly("Code client", policy ? text(policy.code_client) || clientCode : clientCode)}
        <label className="rm-span-2">
          <span>N° police</span>
          <input list="rm-policies" value={policyText} onChange={(event) => { setPolicyText(event.target.value); setNotice(""); }} placeholder="Saisir ou choisir un N° police" />
          <datalist id="rm-policies">{policies.map((row) => <option key={text(row.num_int)} value={text(row.num_police)} />)}</datalist>
        </label>
        <label>
          <span>N° quittance</span>
          <input list="rm-receipts" value={receiptText} onChange={(event) => { setReceiptText(event.target.value); setNotice(""); }} placeholder={loading ? "Chargement…" : "Saisir ou choisir"} />
          <datalist id="rm-receipts">{receipts.map((row) => <option key={text(row.num_quittance)} value={text(row.num_quittance)} />)}</datalist>
        </label>

        {readOnly("Date Saisie", shortDate(receipt?.date_saisie))}
        {readOnly("Effet", shortDate(receipt?.date_emission))}
        {readOnly("Échéance", shortDate(receipt?.echeance))}
        {readOnly("TC", text(receipt?.tc))}

        {readOnly("P. Net", money(receipt?.prime_net))}
        {readOnly("MM. Comp", money(receipt?.commission))}
        {readOnly("Mont. Quit.", money(receipt?.montant_quittance))}
        {readOnly("Solde", money(receipt?.solde_quittance))}

        {readOnly("Reg", receipt ? (receipt.Date_Reglement ? "O" : "N") : "")}
        {readOnly("Date Reg", shortDate(receipt?.Date_Reglement))}
        {readOnly("Date Mvt", shortDate(receipt?.Date_M))}
      </div>

      {notice && !error && <p className="rm-notice" role="status">{notice}</p>}
      {error && <p className="rm-error" role="alert">{error}</p>}
      {policy && !loading && receipts.length === 0 && !error && <p className="rm-notice" role="status">Aucune quittance pour cette police.</p>}
    </div>
  );
}
