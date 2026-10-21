import { useEffect, useRef, useState } from "react";
import "./PolicyForm.css";
import ClientPolicesModal from "./ClientPolicesModal";
import { useAuth } from "../../auth/AuthContext";

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

const toTimestamp = (value) =>
    !value ? null : value.length === 10 ? `${value}T00:00:00` : value;

const asDate = (value) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value ?? "";
const asText = (value) => (value == null ? "" : String(value));
const asFlag = (value) => value === "O" || value === true;
const asTime = (value) => {
    const match = typeof value === "string" ? value.match(/(\d{2}):(\d{2})/) : null;
    return match ? `${match[1]}:${match[2]}` : "00:00";
};

const RECEIPT_COLUMNS = [
    ["num_quittance", "N° quittance"], ["date_saisie", "Date saisie", "date"], ["date_emission", "Émission", "date"],
    ["echeance", "Échéance", "date"], ["periode", "Période"], ["prime_net", "P. nette", "money"],
    ["prime_total", "P. totale", "money"], ["montant_quittance", "Montant", "money"], ["solde_quittance", "Solde", "money"]
];

function formatCell(value, kind) {
    if (value == null || value === "") return "—";
    if (kind === "date") return String(value).slice(0, 10).split("-").reverse().join("/");
    if (kind === "money") return Number(value).toLocaleString("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    return String(value);
}

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
        observation: asText(p.obser ?? q.observation)
    };
}

export default function PolicyForm({ clientCode = "" }) {
    const { accessToken } = useAuth();
    // Opened from a client file: a new policy (then its receipt) is entered for that client.
    const isCreate = Boolean(clientCode);
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const loadedRef = useRef({ num: "", client: "" });
    const [quittances, setQuittances] = useState([]);
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
                    readOnly={name === "code_client" && Boolean(clientCode)}
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

    const loadedExisting = loadedRef.current.num !== "" && loadedRef.current.num === values.num_police;

    function goToReceipt() {
        setError("");
        if (!/^\d{12}$/.test(values.num_police)) {
            setError("Le numéro doit contenir 12 chiffres : année + branche + 5 chiffres.");
            return;
        }
        if (values.num_police.slice(4, 7) !== values.code_branche) {
            setError("Le code branche ne correspond pas au numéro de police.");
            return;
        }
        if (!values.code_compagnie) {
            setError("Veuillez sélectionner la compagnie.");
            return;
        }
        setStep(2);
    }

    async function save(e) {
        e.preventDefault();
        if (!isCreate || step !== 2 || saved) return;
        setError("");
        setMessage("");

        const police = {};
        const quittance = {};

        for (const [key, value] of Object.entries(values)) {
            if (key === "heure_effet") continue;

            let converted = value === "" ? null : value;
            if (DATE_FIELDS.includes(key)) converted = toTimestamp(value);
            if (MONEY_FIELDS.includes(key) && value !== "") converted = Number(value);
            if (["code_compagnie", "duree"].includes(key) && value !== "") converted = Number(value);

            if (POLICE_FIELDS.includes(key)) police[key] = converted;
            else quittance[key] = converted;
        }

        if (values.effet) police.heure_effet = `${values.effet}T${values.heure_effet}:00`;
        quittance.observation = values.observation || "";

        setSaving(true);
        try {
            const response = await fetch(`${API_URL}/api/polices`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ police, quittance })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(
                    typeof result.detail === "string" ? result.detail : JSON.stringify(result.detail || result)
                );
            }
            setSaved(true);
            setMessage(`Police ${result.num_police} enregistrée. Quittance : ${result.num_quittance}`);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    // Fallback built on /client/{code} or /search and the client's receipts (needs a signed-in token).
    const legacyLookup = async (params, signal) => {
        const url = params.code_client
            ? `${API_URL}/api/polices/client/${encodeURIComponent(params.code_client)}`
            : `${API_URL}/api/polices/search?numero=${encodeURIComponent(params.num_police)}`;
        const response = await fetch(url, { credentials: 'include', signal });
        const rows = await response.json().catch(() => []);
        if (!response.ok || !Array.isArray(rows)) {
            throw new Error(typeof rows.detail === 'string' ? rows.detail : 'Recherche impossible');
        }
        if (rows.length === 0) throw new Error('Aucune police trouvée');

        const police = rows[0];
        let receipts = [];
        if (accessToken && police.code_client) {
            try {
                const receiptsResponse = await fetch(
                    `${API_URL}/api/clients/${encodeURIComponent(String(police.code_client).trim())}/receipts?limit=1000`,
                    { headers: { Authorization: `Bearer ${accessToken}` }, signal }
                );
                const body = await receiptsResponse.json().catch(() => ({}));
                const items = receiptsResponse.ok && Array.isArray(body.items) ? body.items : [];
                receipts = items.filter(item => String(item.num_int).trim() === String(police.num_int).trim());
            } catch (err) {
                if (err.name === 'AbortError') throw err;
            }
        }
        return {
            police,
            quittance: receipts[0] || null,
            quittances: receipts,
            nom_branche: police.nom_branche,
            matches: rows.length
        };
    };

    // Fetches a policy (with its receipts) by number or by client code and fills the form.
    const lookup = async (params, signal) => {
        setLoading(true);
        setError('');
        setMessage('');
        try {
            const response = await fetch(`${API_URL}/api/polices/detail?${new URLSearchParams(params)}`, {
                credentials: 'include',
                signal
            });
            let data = await response.json().catch(() => ({}));
            // Older backend without /detail: rebuild what we can from the existing endpoints.
            if (response.status === 405 || (response.status === 404 && data.detail === 'Not Found')) {
                data = await legacyLookup(params, signal);
            } else if (!response.ok) {
                throw new Error(typeof data.detail === 'string' ? data.detail : 'Recherche impossible');
            }
            const loaded = fromDetail(data);
            loadedRef.current = { num: loaded.num_police, client: loaded.code_client };
            setValues(prev => ({ ...prev, ...loaded }));
            setNomBranche(data.nom_branche || '');
            setQuittances(Array.isArray(data.quittances) ? data.quittances : []);
            if (params.code_client && data.matches > 1) {
                setMessage(`${data.matches} polices pour ce client — la plus récente est affichée.`);
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                setQuittances([]);
                setError(err.message);
            }
        } finally {
            if (!signal.aborted) setLoading(false);
        }
    };

    // Policy number (12 digits) -> that policy and its receipts.
    useEffect(() => {
        const number = values.num_police;
        if (number.length !== 12 || number === loadedRef.current.num) return undefined;
        const controller = new AbortController();
        const timer = setTimeout(() => lookup({ num_police: number }, controller.signal), 400);
        return () => { controller.abort(); clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [values.num_police]);

    // Client code -> the client's most recent policy and its receipts.
    useEffect(() => {
        const client = values.code_client.trim();
        if (isCreate || !client || client === loadedRef.current.client) return undefined;
        const controller = new AbortController();
        const timer = setTimeout(() => lookup({ code_client: client }, controller.signal), 400);
        return () => { controller.abort(); clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [values.code_client]);


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

            {!(isCreate && step === 2) && (
            <section className="pf-section pf-identification">
                <h3>Identification de la police</h3>
                <div className="pf-grid pf-grid-identification">
                    <label className="pf-field pf-field-wide">
                        <span>Compagnie *</span>

                        <select
                            name="code_compagnie"
                            value={values.code_compagnie}
                            onChange={(e) => update("code_compagnie", e.target.value)}
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
                            onChange={(e) =>
                                update("code_branche", e.target.value.replace(/\D/g, "").slice(0, 3))
                            }
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
            )}

            {!(isCreate && step === 2) && (
            <section className={`pf-section pf-policy-info${isCreate ? " pf-span-full" : ""}`}>
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
            )}

            {isCreate && step === 2 && (
            <section className="pf-section pf-quittance-info pf-span-full">
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
            )}

            {!isCreate && (
            <section className="pf-section pf-quittance-info">
                <h3>Visualisation des quittances</h3>

                <div className="pf-receipts-wrap">
                    <table className="pf-receipts">
                        <thead>
                            <tr>
                                {RECEIPT_COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {quittances.length === 0 ? (
                                <tr><td colSpan={RECEIPT_COLUMNS.length} className="pf-receipts-empty">Aucune quittance à afficher</td></tr>
                            ) : quittances.map((row, index) => (
                                <tr key={`${row.num_quittance}-${index}`}>
                                    {RECEIPT_COLUMNS.map(([key, , kind]) => (
                                        <td key={key} className={kind === "money" ? "is-number" : undefined}>{formatCell(row[key], kind)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
            )}

            {(!isCreate || step === 2) && (
            <section className="pf-section pf-observation-section">
                <h3>Observation</h3>
                <textarea
                    className="pf-observation"
                    value={values.observation}
                    onChange={e => update("observation", e.target.value)}
                />
            </section>
            )}

            {error && <div className="pf-error">{error}</div>}
            {message && <div className="pf-success">{message}</div>}

            {loading && <div className="pf-success">Recherche en cours…</div>}
            {isCreate && !saved && loadedExisting && step === 1 && (
                <div className="pf-error">Cette police existe déjà : modification impossible ici.</div>
            )}

            {isCreate && (
                <footer className="pf-footer">
                    {step === 2 && !saved && (
                        <button type="button" onClick={() => setStep(1)}>← Précédent</button>
                    )}
                    {step === 1 ? (
                        <button type="button" className="pf-primary" onClick={goToReceipt} disabled={loadedExisting}>
                            Suivant : quittance →
                        </button>
                    ) : (
                        <button type="submit" className="pf-primary" disabled={saving || saved}>
                            {saving ? "Enregistrement..." : saved ? "Enregistré" : "Soumettre"}
                        </button>
                    )}
                </footer>
            )}
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
