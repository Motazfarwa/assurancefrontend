import { useEffect, useRef, useState } from "react";
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

const API_URL = import.meta.env.VITE_API_URL || "https://assurancebackend.onrender.com";

const asDate = (value) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value ?? "";
const asText = (value) => (value == null ? "" : String(value));
const asFlag = (value) => value === "O" || value === true;
const asTime = (value) => {
    const match = typeof value === "string" ? value.match(/(\d{2}):(\d{2})/) : null;
    return match ? `${match[1]}:${match[2]}` : "00:00";
};

// Backend policy + receipt record -> form values.
function fromDetail({ police: p = {}, quittance: q = {} }) {
    q = q || {};
    return {
        num_police: asText(p.num_police).trim(),
        code_compagnie: asText(p.code_compagnie),
        code_client: asText(p.code_client).trim(),
        code_branche: asText(p.code_branche).trim(),
        date_creation: asDate(p.date_creation),
        renouvelable: asFlag(p.renouv_an),
        duree: asText(p.duree),
        effet: asDate(p.effet),
        heure_effet: asTime(p.heure_effet),
        echeance: asDate(p.echeance),
        expiration: asDate(p.expiration),
        etat: asText(p.etat),
        date_mvt: asDate(p.date_mvt),
        risque: asText(p.risque),
        hors_taxe: asFlag(p.hors_taxe),
        tous_risque: asFlag(p.tous_risque),
        participation: asFlag(p.participation),
        num_imat: asText(p.num_imat),
        date_saisie: asDate(q.date_saisie),
        date_emission: asDate(q.date_emission),
        periode: asText(q.periode),
        prime_net: asText(q.prime_net ?? p.prime_net),
        commission: asText(q.commission ?? p.commission),
        prime_total: asText(q.prime_total ?? p.prime_total),
        taxe: asText(q.taxe),
        timbre: asText(q.timbre),
        cout_attestation: asText(q.cout_attestation),
        montant_quittance: asText(q.montant_quittance),
        solde_quittance: asText(q.solde_quittance),
        num_attestation: asText(q.num_attestation),
        observation: asText(q.observation ?? p.obser)
    };
}

export default function PolicyForm({ clientCode = "" }) {
    const loadedKey = useRef("");
    const [values, setValues] = useState(
        clientCode ? { ...initialValues, code_client: clientCode } : initialValues
    );
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
                    "https://assurancebackend.onrender.com";

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
                    "https://assurancebackend.onrender.com";

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
                    readOnly={name !== "code_client" || Boolean(clientCode)}
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
                disabled
                readOnly
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

    // Typing a policy number (12 digits) or a client code loads the matching policy and its latest receipt.
    useEffect(() => {
        const number = values.num_police;
        const client = values.code_client.trim();
        const key = number.length === 12 ? `n:${number}` : client ? `c:${client}` : "";

        if (!key || key === loadedKey.current) return undefined;

        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setLoading(true);
            setError("");
            setMessage("");
            try {
                const params = new URLSearchParams(
                    key.startsWith("n:") ? { num_police: number } : { code_client: client }
                );
                const response = await fetch(`${API_URL}/api/polices/detail?${params}`, {
                    credentials: "include",
                    signal: controller.signal
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(
                        typeof data.detail === "string" ? data.detail : "Recherche impossible"
                    );
                }
                const loaded = fromDetail(data);
                loadedKey.current = `n:${loaded.num_police}`;
                setValues(prev => ({ ...prev, ...loaded }));
                setNomBranche(data.nom_branche || "");
                if (key.startsWith("c:") && data.matches > 1) {
                    setMessage(`${data.matches} polices pour ce client — la plus récente est affichée.`);
                }
            } catch (err) {
                if (err.name !== "AbortError") setError(err.message);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 400);

        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [values.num_police, values.code_client]);


    return (
         <>
        <form className="policy-legacy-form" onSubmit={e => e.preventDefault()}>
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
                <div className="pf-grid pf-grid-identification">
                    <label className="pf-field pf-field-wide">
                        <span>Compagnie *</span>

                        <select
                            name="code_compagnie"
                            value={values.code_compagnie}
                            disabled
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

                    <label className="pf-field pf-field-code-branche">
                        <span>Code branche *</span>
                        <input
                            type="text"
                            value={values.code_branche}
                            maxLength={3}
                            readOnly
                            placeholder="Ex : 011"
                        />
                    </label>

                    <label className="pf-field pf-field-branche-nom">
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

                    <label className="pf-field pf-field-wide">
                        <span>N° Police *</span>
                        <input
                            value={values.num_police}
                            maxLength={12}
                            onChange={e => handleNumberChange(e.target.value)}
                            placeholder="202601156895"
                        />
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
                    readOnly
                />
            </section>

            {error && <div className="pf-error">{error}</div>}
            {message && <div className="pf-success">{message}</div>}

            {loading && <div className="pf-success">Recherche en cours…</div>}
    </form>

    {showClientPolices && (
      <ClientPolicesModal
        codeClient={values.code_client.trim()}
        onClose={() => setShowClientPolices(false)}
        onSelect={(police) => {
          // Selecting a policy shows its details (the lookup effect loads them).
          update("num_police", String(police.num_police || "").trim());
          setShowClientPolices(false);
        }}
      />
    )}
  </>
);

}
