import { useEffect, useState } from "react";
import "./PolicyForm.css";
import ClientPolicesModal from "./ClientPolicesModal";

const initialValues = {
    // Police
    num_police: "",
    code_compagnie: "",
    code_client: "",
    code_branche: "",
    date_creation: new Date().toISOString().slice(0, 10),
    renouvelable: true,
    duree: "1",
    effet: "",
    heure_effet: "00:00",
    echeance: "",
    expiration: "",
    etat: "AN",
    date_mvt: "",
    risque: "",
    hors_taxe: false,
    tous_risque: false,
    participation: false,
    num_imat: "",
    obser: "",

    // Quittance
    date_saisie: new Date().toISOString().slice(0, 10),
    date_emission: "",
    periode: "",
    prime_net: "",
    commission: "",
    prime_total: "",
    taxe: "",
    timbre: "",
    cout_attestation: "",
    montant_quittance: "",
    solde_quittance: "",
    num_attestation: "",
    observation: ""
};

const POLICE_FIELDS = [
    "num_police", "code_compagnie", "code_client",
    "code_branche", "date_creation", "renouvelable",
    "duree", "effet", "heure_effet", "echeance",
    "expiration", "etat", "date_mvt", "risque",
    "hors_taxe", "tous_risque", "participation",
    "num_imat", "obser"
];

const MONEY_FIELDS = [
    "prime_net", "commission", "prime_total",
    "taxe", "timbre", "cout_attestation",
    "montant_quittance", "solde_quittance"
];

const DATE_FIELDS = [
    "date_creation", "effet", "expiration",
    "date_mvt", "date_saisie", "date_emission"
];

function toTimestamp(value) {
    if (!value) return null;
    return value.length === 10
        ? `${value}T00:00:00`
        : value;
}

export default function PolicyForm({ onClose }) {
    const [values, setValues] = useState(initialValues);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [compagnies, setCompagnies] = useState([]);
    const [compagniesError, setCompagniesError] = useState("");
    const [nomBranche, setNomBranche] = useState("");
    const [loadingBranche, setLoadingBranche] = useState(false);
    const [brancheError, setBrancheError] = useState("");
    const [showClientPolices, setShowClientPolices] = useState(false);
    const update = (key, value) => {
        setValues(prev => ({ ...prev, [key]: value }));
    };


    useEffect(() => {
        const controller = new AbortController();

        const loadCompagnies = async () => {
            try {
                const API_URL =
                    import.meta.env.VITE_API_URL ||
                    "http://https://assurancebackend.onrender.com";

                const response = await fetch(
                    `${API_URL}/api/polices/compagnies`,
                    {
                        credentials: "include",
                        signal: controller.signal
                    }
                );

                if (!response.ok) {
                    throw new Error(
                        `Erreur chargement compagnies (${response.status})`
                    );
                }

                const data = await response.json();

                if (!controller.signal.aborted) {
                    setCompagnies(data);
                }
            } catch (error) {
                if (error.name !== "AbortError") {
                    setCompagniesError(error.message);
                }
            }
        };

        loadCompagnies();

        return () => controller.abort();
    }, []);

    useEffect(() => {
        const compagnie = values.code_compagnie;
        const branche = values.code_branche;

        setNomBranche("");
        setBrancheError("");

        if (!compagnie || !/^\d{3}$/.test(branche || "")) {
            setLoadingBranche(false);
            return;
        }

        const controller = new AbortController();

        const loadBranche = async () => {
            setLoadingBranche(true);

            try {
                const API_URL =
                    import.meta.env.VITE_API_URL ||
                    "http://https://assurancebackend.onrender.com";

                const params = new URLSearchParams({
                    code_compagnie: String(compagnie),
                    code_branche: branche
                });

                const response = await fetch(
                    `${API_URL}/api/polices/branche?${params}`,
                    {
                        credentials: "include",
                        signal: controller.signal
                    }
                );

                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error(
                            "Branche introuvable pour cette compagnie"
                        );
                    }

                    throw new Error(
                        "Erreur lors de la recherche de la branche"
                    );
                }

                const data = await response.json();

                if (!controller.signal.aborted) {
                    setNomBranche(data.nom_branche || "");
                }

            } catch (error) {
                if (!controller.signal.aborted) {
                    setBrancheError(error.message);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoadingBranche(false);
                }
            }
        };

        loadBranche();

        return () => controller.abort();

    }, [values.code_compagnie, values.code_branche]);

    const field = (
        label, name, type = "text", options = null
    ) => (
        <label className="pf-field" key={name}>
            <span>{label}</span>
            {options ? (
                <select
                    value={values[name]}
                    onChange={e => update(name, e.target.value)}
                >
                    <option value="">Sélectionner</option>
                    {options.map(o => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
            ) : (
                <input
                    type={type}
                    step={type === "number" ? "any" : undefined}
                    value={values[name]}
                    onChange={e => update(name, e.target.value)}
                />
            )}
        </label>
    );

    const check = (label, name) => (
        <label className="pf-check">
            <input
                type="checkbox"
                checked={values[name]}
                onChange={e => update(name, e.target.checked)}
            />
            {label}
        </label>
    );

    const handleNumberChange = (value) => {
        const clean = value.replace(/\D/g, "").slice(0, 12);

        setValues(prev => ({
            ...prev,
            num_police: clean,
            code_branche:
                clean.length >= 7
                    ? clean.substring(4, 7)
                    : prev.code_branche
        }));
    };

    async function save(e) {
        e.preventDefault();
        setError("");
        setMessage("");

        const v = values;

        if (!/^\d{12}$/.test(v.num_police)) {
            setError(
                "Le numéro doit contenir 12 chiffres : année + branche + 5 chiffres."
            );
            return;
        }

        if (v.num_police.slice(4, 7) !== v.code_branche) {
            setError("Le code branche ne correspond pas au numéro de police.");
            return;
        }

        if (!v.code_client.trim()) {
            setError("Veuillez renseigner le client.");
            return;
        }

        const police = {};
        const quittance = {};

        for (const [key, value] of Object.entries(v)) {
            if (key === "heure_effet") continue;

            let converted = value;

            if (value === "") converted = null;
            if (DATE_FIELDS.includes(key)) {
                converted = toTimestamp(value);
            }
            if (MONEY_FIELDS.includes(key) && value !== "") {
                converted = Number(value);
            }
            if (
                ["code_compagnie", "duree"].includes(key) &&
                value !== ""
            ) {
                converted = Number(value);
            }

            if (POLICE_FIELDS.includes(key)) {
                police[key] = converted;
            } else {
                quittance[key] = converted;
            }
        }

        if (v.effet) {
            police.heure_effet = `${v.effet}T${v.heure_effet}:00`;
        }

        // The existing schema uses observation on the receipt,
        // and obser on the policy.
        quittance.observation = v.observation || "";

        setLoading(true);

        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL || "http://https://assurancebackend.onrender.com"}/api/polices`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ police, quittance })
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    typeof result.detail === "string"
                        ? result.detail
                        : JSON.stringify(result.detail || result)
                );
            }

            setMessage(
                `Police ${result.num_police} enregistrée. ` +
                `Quittance : ${result.num_quittance}`
            );
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }


    return (
         <>
        <form className="policy-legacy-form" onSubmit={save}>
            <div className="pf-toolbar">
                <strong>GESTION DES POLICES</strong>
                <div className="pf-toolbar-actions">
           <button
               type="button"
               className="pf-view-client-button"
               onClick={() => {
               setShowClientPolices(true);
                }}
             >
             Vis. Pol. Client
                  </button>
               
                </div>
            </div>

            <section className="pf-section pf-identification">
                <h3>Identification de la police</h3>
                <div className="pf-grid">
                    <label className="pf-field">
                        <span>Compagnie *</span>

                        <select
                            name="code_compagnie"
                            value={values.code_compagnie}
                            onChange={(e) => update("code_compagnie", e.target.value)}
                            required
                        >
                            <option value="">Sélectionner une compagnie</option>

                            {compagnies.map((compagnie) => (
                                <option
                                    key={compagnie.code_compagnie}
                                    value={compagnie.code_compagnie}
                                >
                                    {compagnie.nom_compagnie}
                                </option>
                            ))}
                        </select>
                        {compagniesError && (
                            <small className="pf-error">{compagniesError}</small>
                        )}
                    </label>

                    <label className="pf-field">
                        <span>Code branche *</span>
                        <input
                            type="text"
                            value={values.code_branche}
                            maxLength={3}
                            onChange={(e) =>
                                update(
                                    "code_branche",
                                    e.target.value.replace(/\D/g, "").slice(0, 3)
                                )
                            }
                            placeholder="Ex : 011"
                            required
                        />
                    </label>

                    <label className="pf-field">
                        <span>N° Police *</span>
                        <input
                            value={values.num_police}
                            maxLength={12}
                            onChange={e => handleNumberChange(e.target.value)}
                            placeholder="202601156895"
                        />
                    </label>

                    <label className="pf-field">
                        <span>Nom branche</span>
                        <input
                            type="text"
                            value={
                                loadingBranche
                                    ? "Recherche..."
                                    : nomBranche
                            }
                            placeholder="Détecté automatiquement"
                            readOnly
                        />
                        {brancheError && (
                            <small className="pf-branch-error">
                                {brancheError}
                            </small>
                        )}
                    </label>

                    {field("Code client", "code_client")}

                    {field("Date création", "date_creation", "date")}
                    {field("Immatriculation", "num_imat")}
                </div>
            </section>

            <section className="pf-section pf-policy-info">
                <h3>Information Police</h3>

                <div className="pf-check-row">
                    {check("Renouvelable", "renouvelable")}
                    {check("Hors taxe", "hors_taxe")}
                    {check("Tous risques", "tous_risque")}
                    {check("Participation", "participation")}
                </div>

                <div className="pf-grid">
                    {field("Durée", "duree", "number")}
                    {field("Date effet", "effet", "date")}
                    {field("Heure effet", "heure_effet", "time")}
                    {field("Échéance", "echeance")}
                    {field("Expiration", "expiration", "date")}
                    {field("État", "etat")}
                    {field("Date mouvement", "date_mvt", "date")}
                    {field("Risque", "risque")}
                </div>
            </section>

            <section className="pf-section pf-quittance-info">
                <h3>Informations Quittance</h3>

                <div className="pf-grid">
                    {field("Date saisie", "date_saisie", "date")}
                    {field("Date émission", "date_emission", "date")}
                    {field("Période", "periode")}
                    {field("Prime nette", "prime_net", "number")}
                    {field("Commission", "commission", "number")}
                    {field("Prime totale", "prime_total", "number")}
                    {field("Taxe", "taxe", "number")}
                    {field("Timbre", "timbre", "number")}
                    {field("Coût attestation", "cout_attestation", "number")}
                    {field("Montant quittance", "montant_quittance", "number")}
                    {field("Solde quittance", "solde_quittance", "number")}
                    {field("N° Attestation", "num_attestation")}
                </div>
            </section>

            <section className="pf-section pf-observation-section">
                <h3>Observation</h3>
                <textarea
                    className="pf-observation"
                    value={values.observation}
                    onChange={e => update("observation", e.target.value)}
                />
            </section>

            {error && <div className="pf-error">{error}</div>}
            {message && <div className="pf-success">{message}</div>}

            <footer className="pf-footer">
                <button type="button" onClick={onClose}>
                    Annuler
                </button>
                <button type="submit" disabled={loading}>
                    {loading ? "Enregistrement..." : "Enregistrer"}
                </button>
            </footer>
    </form>

    {showClientPolices && (
      <ClientPolicesModal
        codeClient={values.code_client.trim()}
        onClose={() => setShowClientPolices(false)}
        onSelect={(police) => {
          // For now: only select and close.
          // Loading a saved policy for editing requires
          // a complete policy detail endpoint.
          console.log("Police sélectionnée :", police);
          setShowClientPolices(false);
        }}
      />
    )}
  </>
);

}
