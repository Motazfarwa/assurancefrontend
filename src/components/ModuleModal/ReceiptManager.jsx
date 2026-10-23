import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { createQuittance, listClientRecords } from "../../services/clientRecordsApi";
import "./ReceiptManager.css";

const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({
  num_police: "", num_quittance: "", tc: "T", date_saisie: today(), date_emission: "", echeance: "", date_m: today(),
  prime_net: "", commission: "", montant_quittance: "", solde_quittance: "", date_reglement: ""
});

// Entry form for a client's receipt, with the fields of the legacy receipts grid.
export default function ReceiptManager({ clientCode, onClose }) {
  const { accessToken } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [values, setValues] = useState(blank);
  const [soldeTouched, setSoldeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    listClientRecords(accessToken, "policies", clientCode, { limit: 1000 })
      .then((rows) => { if (active) setPolicies(rows); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [accessToken, clientCode]);

  function update(key, value) {
    setValues((current) => {
      const next = { ...current, [key]: value };
      // The balance follows the amount (and is zero once settled) until it is typed by hand.
      if (!soldeTouched && ["montant_quittance", "date_reglement"].includes(key)) {
        next.solde_quittance = next.date_reglement ? "0" : next.montant_quittance;
      }
      return next;
    });
    setNotice("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    const policy = policies.find((row) => String(row.num_int).trim() === values.num_police);
    if (!policy) { setError("Choisissez la police de cette quittance."); return; }
    const number = (value) => (value === "" ? null : Number(value));
    setSaving(true);
    try {
      const result = await createQuittance(accessToken, {
        num_int: String(policy.num_int).trim(),
        code_client: clientCode,
        num_quittance: values.num_quittance.trim() || null,
        tc: values.tc || null,
        date_saisie: values.date_saisie || null,
        date_emission: values.date_emission || null,
        echeance: values.echeance || null,
        date_m: values.date_m || null,
        date_reglement: values.date_reglement || null,
        prime_net: number(values.prime_net),
        commission: number(values.commission),
        montant_quittance: number(values.montant_quittance),
        solde_quittance: number(values.solde_quittance),
      });
      setNotice(`Quittance ${result.num_quittance} enregistrée.`);
      setValues((current) => ({ ...blank(), num_police: current.num_police, tc: current.tc }));
      setSoldeTouched(false);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  const field = (key, label, type = "text", extra = {}) => (
    <label>
      <span>{label}</span>
      <input type={type} step={type === "number" ? "any" : undefined} value={values[key]} onChange={(event) => update(key, event.target.value)} {...extra} />
    </label>
  );

  return (
    <form className="rm-form" onSubmit={submit}>
      <p className="module-modal-description">Saisie d’une quittance pour le client {clientCode}.</p>

      <div className="rm-fields">
        <label><span>Code client</span><input value={clientCode} readOnly /></label>
        <label className="rm-span-2">
          <span>N° police *</span>
          <select value={values.num_police} onChange={(event) => update("num_police", event.target.value)} required>
            <option value="">{policies.length ? "Sélectionner la police" : "Aucune police pour ce client"}</option>
            {policies.map((row) => (
              <option key={row.num_int} value={String(row.num_int).trim()}>{String(row.num_police).trim()}{row.num_imat ? ` · ${String(row.num_imat).trim()}` : ""}</option>
            ))}
          </select>
        </label>
        {field("num_quittance", "N° quittance", "text", { maxLength: 15, placeholder: "Automatique si vide" })}

        {field("date_saisie", "Date Saisie", "date")}
        {field("date_emission", "Effet", "date")}
        {field("echeance", "Échéance", "date")}
        <label>
          <span>TC</span>
          <select value={values.tc} onChange={(event) => update("tc", event.target.value)}><option value="T">T — Terme</option><option value="C">C — Comptant</option></select>
        </label>

        {field("prime_net", "P. Net", "number")}
        {field("commission", "MM. Comp", "number")}
        {field("montant_quittance", "Mont. Quit.", "number")}
        <label>
          <span>Solde</span>
          <input type="number" step="any" value={values.solde_quittance} onChange={(event) => { setSoldeTouched(true); setValues((current) => ({ ...current, solde_quittance: event.target.value })); }} />
        </label>

        <label><span>Reg</span><input value={values.date_reglement ? "O" : "N"} readOnly /></label>
        {field("date_reglement", "Date Reg", "date")}
        {field("date_m", "Date Mvt", "date")}
      </div>

      {error && <p className="rm-error" role="alert">{error}</p>}
      {notice && !error && <p className="rm-notice" role="status">{notice}</p>}

      <footer className="module-modal-actions">
        <button type="button" className="module-secondary-button" onClick={onClose}>Fermer</button>
        <button type="submit" className="module-primary-button" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
      </footer>
    </form>
  );
}
