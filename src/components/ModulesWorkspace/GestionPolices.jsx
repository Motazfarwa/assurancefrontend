
import React, { useState } from "react";
import { createPolice } from "../../services/policesApi";
import "./GestionPolices.css";
  
const initialPolice = {
  num_police: "",
  code_compagnie: "",
  code_client: "",
  code_branche: "",
  effet: "",
  expiration: "",
  echeance: "",
  duree: "",
  etat: "AN",
  renouvelable: true,
  participation: false,
  tous_risque: false,
  hors_taxe: false,
  risque: "",
  num_imat: "",
  marque: "",
  serie: "",
  puissance: "",
  garantie: "",
  franchise: "",
  capital: "",
  obser: "",
};

const initialQuittance = {
  date_emission: "",
  echeance: "",
  periode: "",
  prime_net: "",
  commission: "",
  prime_total: "",
  taxe: "",
  timbre: "",
  montant_quittance: "",
  solde_quittance: "",
  observation: "",
};

function Input({ label, value, onChange, type = "text" }) {
  return (
    <label className="police-field">
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

const optionalNumber = (value) =>
  value === "" || value === null ? null : Number(value);

const optionalDate = (value) => value || null;

export default function GestionPolices({ onClose }) {
  const [police, setPolice] = useState(initialPolice);
  const [quittance, setQuittance] = useState(initialQuittance);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const updatePolice = (name, value) =>
    setPolice((prev) => ({ ...prev, [name]: value }));

  const updateQuittance = (name, value) =>
    setQuittance((prev) => ({ ...prev, [name]: value }));

  const pField = (label, name, type = "text") => (
    <Input
      label={label}
      type={type}
      value={police[name]}
      onChange={(value) => updatePolice(name, value)}
    />
  );

  const qField = (label, name, type = "text") => (
    <Input
      label={label}
      type={type}
      value={quittance[name]}
      onChange={(value) => updateQuittance(name, value)}
    />
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const cleanedPolice = {
        ...police,
        num_police: police.num_police || null,
        code_compagnie: optionalNumber(police.code_compagnie),
        duree: optionalNumber(police.duree),
        puissance: optionalNumber(police.puissance),
        franchise: optionalNumber(police.franchise),
        capital: optionalNumber(police.capital),
        effet: optionalDate(police.effet),
        expiration: optionalDate(police.expiration),
      };

      const cleanedQuittance = {
        ...quittance,
        date_emission: optionalDate(quittance.date_emission),
        echeance: optionalDate(quittance.echeance),
        prime_net: optionalNumber(quittance.prime_net),
        commission: optionalNumber(quittance.commission),
        prime_total: optionalNumber(quittance.prime_total),
        taxe: optionalNumber(quittance.taxe),
        timbre: optionalNumber(quittance.timbre),
        montant_quittance: optionalNumber(
          quittance.montant_quittance
        ),
        solde_quittance: optionalNumber(
          quittance.solde_quittance
        ),
      };

      const result = await createPolice({
        police: cleanedPolice,
        quittance: cleanedQuittance,
      });

      setSuccess(
        `Police ${result.num_police} créée. ` +
        `Quittance ${result.num_quittance}.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="police-modal">
      <div className="police-dialog">
        <header className="police-header">
          <h2>Gestion des polices</h2>
          <button type="button" onClick={onClose}>✕</button>
        </header>

        <form onSubmit={handleSubmit}>
          <h3>Identification</h3>
          <div className="police-grid">
            {pField("Compagnie", "code_compagnie", "number")}
            {pField("Client *", "code_client")}
            {pField("Code branche *", "code_branche")}
            {pField("Numéro de police", "num_police")}
          </div>

          <h3>Informations police</h3>
          <div className="police-grid">
            {pField("Date d'effet", "effet", "datetime-local")}
            {pField("Expiration", "expiration", "datetime-local")}
            {pField("Échéance", "echeance")}
            {pField("Durée", "duree", "number")}
            {pField("État", "etat")}
            {pField("Risque", "risque")}
          </div>

          <div className="police-checks">
            {[
              ["renouvelable", "Renouvelable"],
              ["participation", "Participation"],
              ["tous_risque", "Tous risques"],
              ["hors_taxe", "Hors taxe"],
            ].map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={police[key]}
                  onChange={(e) =>
                    updatePolice(key, e.target.checked)
                  }
                />
                {label}
              </label>
            ))}
          </div>

          <h3>Véhicule et garanties</h3>
          <div className="police-grid">
            {pField("Immatriculation", "num_imat")}
            {pField("Marque", "marque")}
            {pField("Série", "serie")}
            {pField("Puissance", "puissance", "number")}
            {pField("Garantie", "garantie")}
            {pField("Franchise", "franchise", "number")}
            {pField("Capital", "capital", "number")}
          </div>

          <h3>Informations quittance</h3>
          <div className="police-grid">
            {qField("Date émission", "date_emission", "datetime-local")}
            {qField("Échéance quittance", "echeance", "datetime-local")}
            {qField("Période", "periode")}
            {qField("Prime nette (TND)", "prime_net", "number")}
            {qField("Commission (TND)", "commission", "number")}
            {qField("Prime totale (TND)", "prime_total", "number")}
            {qField("Taxe (TND)", "taxe", "number")}
            {qField("Timbre (TND)", "timbre", "number")}
            {qField("Montant quittance", "montant_quittance", "number")}
            {qField("Solde quittance", "solde_quittance", "number")}
          </div>

          <h3>Observation</h3>
          <textarea
            value={police.obser}
            onChange={(e) =>
              updatePolice("obser", e.target.value)
            }
            rows={3}
          />

          {error && <p role="alert" className="police-error">{error}</p>}
          {success && <p role="status" className="police-success">{success}</p>}

          <footer className="police-actions">
            <button type="button" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : "Enregistrer"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
