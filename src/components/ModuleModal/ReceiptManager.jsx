import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { listClientRecords, updateClientRecord } from "../../services/clientRecordsApi";
import "./ReceiptManager.css";

// Same columns as the legacy receipts grid. Effet = receipt start (emission) date; Reg = settled (has a settlement date).
const COLUMNS = [
  ["num_quittance", "N° quittance"], ["date_saisie", "Date Saisie", "date"], ["date_emission", "Effet", "date"],
  ["tc", "TC"], ["prime_net", "P. Net", "money"], ["reg", "Reg"], ["Date_Reglement", "Date Reg", "date"],
  ["commission", "MM. Comp", "money"], ["Date_M", "Date Mvt", "date"], ["montant_quittance", "Mont. Quit.", "money"],
  ["solde_quittance", "Solde", "money"]
];

// key = field of the receipt record, api = field accepted by the update endpoint.
const FIELDS = [
  { key: "date_saisie", api: "date_saisie", label: "Date Saisie", type: "date" },
  { key: "date_emission", api: "date_emission", label: "Effet", type: "date" },
  { key: "tc", api: "tc", label: "TC", type: "text" },
  { key: "prime_net", api: "prime_net", label: "P. Net", type: "number" },
  { key: "Date_Reglement", api: "date_reglement", label: "Date Reg", type: "date" },
  { key: "commission", api: "commission", label: "MM. Comp", type: "number" },
  { key: "Date_M", api: "date_m", label: "Date Mvt", type: "date" },
  { key: "montant_quittance", api: "montant_quittance", label: "Mont. Quit.", type: "number" },
  { key: "solde_quittance", api: "solde_quittance", label: "Solde", type: "number" }
];

const shortDate = (value) => (value ? String(value).slice(0, 10).split("-").reverse().join("/") : "");
const money = (value) => (value == null || value === "" ? "" : Number(value).toLocaleString("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
const initial = (row, field) => {
  const value = row?.[field.key];
  if (value == null) return "";
  return field.type === "date" ? String(value).slice(0, 10) : String(value).trim();
};

export default function ReceiptManager({ clientCode, onClose }) {
  const { accessToken } = useAuth();
  const [receipts, setReceipts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (keep) => {
    setLoading(true);
    setError("");
    try {
      const rows = await listClientRecords(accessToken, "receipts", clientCode, { limit: 1000 });
      setReceipts(rows);
      const again = keep ? rows.find((row) => row.num_quittance === keep) : null;
      setSelected(again || null);
      setValues(again ? Object.fromEntries(FIELDS.map((field) => [field.key, initial(again, field)])) : {});
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, clientCode]);

  useEffect(() => { load(null); }, [load]);

  function choose(row) {
    setSelected(row);
    setValues(Object.fromEntries(FIELDS.map((field) => [field.key, initial(row, field)])));
    setNotice("");
    setError("");
  }

  async function save(event) {
    event.preventDefault();
    if (!selected) return;
    const changes = {};
    FIELDS.forEach((field) => {
      if (values[field.key] === initial(selected, field)) return;
      const raw = values[field.key];
      changes[field.api] = raw === "" ? null : field.type === "number" ? Number(raw) : raw;
    });
    if (!Object.keys(changes).length) { setNotice("Aucune modification à enregistrer."); return; }
    setSaving(true);
    setError("");
    try {
      await updateClientRecord(accessToken, "receipts", selected.num_quittance, changes);
      setNotice(`Quittance ${selected.num_quittance} enregistrée.`);
      await load(selected.num_quittance);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  const rows = receipts.map((row) => ({ ...row, reg: row.Date_Reglement ? "O" : "N" }));
  const reg = values.Date_Reglement ? "O" : "N";

  return (
    <form className="rm-form" onSubmit={save}>
      <p className="module-modal-description">Quittances du client {clientCode} : sélectionnez une ligne pour consulter ou modifier ses champs.</p>

      <div className="rm-table-wrap">
        <table className="rm-table">
          <thead><tr>{COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={COLUMNS.length} className="rm-empty">Chargement des quittances…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} className="rm-empty">Aucune quittance pour ce client.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.num_quittance} className={selected?.num_quittance === row.num_quittance ? "is-selected" : undefined} onClick={() => choose(row)}>
                {COLUMNS.map(([key, , kind]) => (
                  <td key={key} className={kind === "money" ? "is-number" : undefined}>
                    {kind === "money" ? money(row[key]) : kind === "date" ? shortDate(row[key]) : row[key] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="rm-error" role="alert">{error}</p>}
      {notice && !error && <p className="rm-notice" role="status">{notice}</p>}

      {selected && (
        <fieldset className="rm-fields">
          <legend>Quittance {selected.num_quittance}</legend>
          <label><span>N° quittance</span><input value={selected.num_quittance} readOnly /></label>
          {FIELDS.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <input
                type={field.type}
                step={field.type === "number" ? "any" : undefined}
                maxLength={field.key === "tc" ? 1 : undefined}
                value={values[field.key] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
              />
            </label>
          ))}
          <label><span>Reg</span><input value={reg} readOnly /></label>
        </fieldset>
      )}

      <footer className="module-modal-actions">
        <button type="button" className="module-secondary-button" onClick={onClose}>Fermer</button>
        <button type="submit" className="module-primary-button" disabled={!selected || saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
      </footer>
    </form>
  );
}
