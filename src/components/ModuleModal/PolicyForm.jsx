import { useEffect, useRef, useState } from "react";
import "./PolicyForm.css";
import ClientPolicesModal from "./ClientPolicesModal";
import { useAuth } from "../../auth/AuthContext";

// Default due date: the day after today, as "dd/mm" (how the policy table stores it).
const tomorrowEcheance = (() => {
    const day = new Date();
    day.setDate(day.getDate() + 1);
    return `${String(day.getDate()).padStart(2, "0")}/${String(day.getMonth() + 1).padStart(2, "0")}`;
})();

const initialValues = {
    // Police
    num_police: "",
    code_compagnie: "",
    code_client: "",
    code_branche: "",
    date_creation: new Date().toISOString().slice(0, 10),
    renouvelable: true,
    duree: "12",
    effet: "",
    heure_effet: "00:00",
    echeance: tomorrowEcheance,
    expiration: "",
    etat: "AN",
    date_mvt: "",
    risque: "",
    hors_taxe: false,
    tous_risque: false,
    participation: false,
    num_imat: "",
    obser: "",
    franchise: "0",
    neuf: "",
    venale: "",

    // Vehicle guarantees (screen only: the policy table has no matching columns)
    g_vol: "",
    g_incendie: "",
    g_bdg: "2000",
    g_personnes: "",
    g_ind_cond: "",
    g_remarquage: true, // "Remarquage": yes by default

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
    carte_verte: false,
    cv_du: "",
    cv_au: "",
    observation: ""
};

const API_URL = import.meta.env.VITE_API_URL || "https://assurancebackend.onrender.com";

const POLICE_FIELDS = [
    "num_police", "code_compagnie", "code_client",
    "code_branche", "date_creation", "renouvelable",
    "duree", "effet", "heure_effet", "echeance",
    "expiration", "etat", "date_mvt", "risque",
    "hors_taxe", "tous_risque", "participation",
    "num_imat", "obser", "franchise", "neuf", "venale"
];

const GARANTIES = [
    ["g_vol", "Vol"], ["g_incendie", "Incendie"], ["g_bdg", "BDG"],
    ["g_personnes", "Personnes transportées"], ["g_ind_cond", "IND conducteur"], ["g_remarquage", "Remorquage"]
];
const TERMS = [{ value: "1", label: "1 mois" }, { value: "3", label: "3 mois" }, { value: "6", label: "6 mois" }, { value: "12", label: "1 année" }];
const pad2 = (n) => String(n).padStart(2, "0");

// effet + months, keeping the day when the target month is shorter (31 Aug + 6 months -> 28/29 Feb).
function addMonths(iso, months) {
    const [y, m, d] = iso.split("-").map(Number);
    const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

// The policy table stores the due date as "dd/mm"; the form shows it as a real date.
function echeanceToDate(echeance, effet) {
    const match = /^(\d{1,2})\/(\d{1,2})$/.exec(echeance || "");
    if (!match) return /^\d{4}-\d{2}-\d{2}$/.test(echeance || "") ? echeance : "";
    let year = /^\d{4}/.test(effet || "") ? Number(effet.slice(0, 4)) : new Date().getFullYear();
    let iso = `${year}-${pad2(match[2])}-${pad2(match[1])}`;
    if (effet && iso < effet) { year += 1; iso = `${year}-${pad2(match[2])}-${pad2(match[1])}`; }
    return iso;
}
const dateToEcheance = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const termDates = (effet, duree) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effet || "")) return {};
    const months = Number(duree) || 12;
    return { expiration: addMonths(effet, months), echeance: dateToEcheance(addMonths(effet, Math.min(months, 12))) };
};

const MONEY_FIELDS = [
    "prime_net", "commission", "prime_total", "neuf", "venale",
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

// Same columns as the legacy receipts grid. Effet = receipt start (emission) date; Reg = settled (has a settlement date).
const RECEIPT_COLUMNS = [
    ["num_quittance", "N° quittance"], ["date_saisie", "Date Saisie", "date"], ["date_emission", "Effet", "date"],
    ["tc", "TC"], ["prime_net", "P. Net", "money"], ["reg", "Reg"], ["date_reglement", "Date Reg", "date"],
    ["commission", "MM. Comp", "money"], ["date_m", "Date Mvt", "date"], ["montant_quittance", "Mont. Quit.", "money"],
    ["solde_quittance", "Solde", "money"]
];

// Receipt rows come with mixed-case column names depending on the endpoint: use lower case and derive "Reg".
const normalizeReceipt = (row) => {
    const lower = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key.toLowerCase(), value]));
    return { ...lower, reg: lower.date_reglement ? "O" : "N" };
};

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
        hors_taxe: asFlag(p.horstaxe ?? p.hors_taxe),
        tous_risque: asFlag(p.tousrisque ?? p.tous_risque),
        participation: asFlag(p.participation),
        num_imat: asText(p.num_imat),
        franchise: asText(p.franchise ?? 0),
        neuf: asText(p.neuf),
        venale: asText(p.venale),
        observation: asText(p.obser ?? q.observation)
    };
}

// embedded: used as steps 3 and 4 of the "new client" flow. beforeSave runs first (it creates the client) and onSaved
// runs once the policy and its first receipt are stored.
export default function PolicyForm({ clientCode = "", prefill = null, onStepChange, onClose, initialClient = "", embedded = false, beforeSave, onSaved, finalLabel = "Soumettre" }) {
    const { accessToken } = useAuth();
    // Opened from a client file: a new policy (then its receipt) is entered for that client.
    const isCreate = Boolean(clientCode);
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (onStepChange) onStepChange(step);
    }, [step, onStepChange]);
    const loadedRef = useRef({ num: "", client: "" });
    const [quittances, setQuittances] = useState([]);
    const [nomClient, setNomClient] = useState("");
    const [values, setValues] = useState(
        clientCode ? { ...initialValues, ...(prefill || {}), code_client: clientCode } : initialClient ? { ...initialValues, code_client: initialClient } : initialValues
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

    // A first receipt must be filled in before a new client can be created.
    const carteVerteValid = !values.carte_verte || Boolean(values.cv_du && values.cv_au && values.cv_du <= values.cv_au);
    const quittanceComplete = Boolean(values.date_emission && values.prime_net !== "" && values.prime_total !== "" && values.montant_quittance !== "" && carteVerteValid);

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
            if (key === "heure_effet" || key === "carte_verte" || key.startsWith("g_") || key.startsWith("cv_")) continue;

            let converted = value === "" ? null : value;
            if (DATE_FIELDS.includes(key)) converted = toTimestamp(value);
            if (MONEY_FIELDS.includes(key) && value !== "") converted = Number(value);
            if (["code_compagnie", "duree"].includes(key) && value !== "") converted = Number(value);
            if (key === "franchise") converted = values.tous_risque && value !== "" ? Math.round(Number(value)) || 0 : null;

            if (POLICE_FIELDS.includes(key)) police[key] = converted;
            else quittance[key] = converted;
        }

        const amount = (value) => (value === "" ? null : Number(value));
        const garanties = {
            vol: amount(values.g_vol),
            incendie: amount(values.g_incendie),
            bdg: amount(values.g_bdg),
            personnes_transportees: amount(values.g_personnes),
            ind_conducteur: amount(values.g_ind_cond),
            remarquage: values.g_remarquage ? 1 : 0
        };
        const carte_verte = values.carte_verte ? { du: values.cv_du || null, au: values.cv_au || null } : null;
        if (values.effet) police.heure_effet = `${values.effet}T${values.heure_effet}:00`;
        quittance.observation = values.observation || "";

        setSaving(true);
        try {
            if (beforeSave) await beforeSave();
            const response = await fetch(`${API_URL}/api/polices`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ police, quittance, garanties, carte_verte })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(
                    typeof result.detail === "string" ? result.detail : JSON.stringify(result.detail || result)
                );
            }
            setSaved(true);
            setMessage(`Police ${result.num_police} enregistrée. Quittance : ${result.num_quittance}`);
            if (onSaved) onSaved(result);
        } catch (err) {
            setError(
                err instanceof TypeError
                    ? "Le serveur n'a pas répondu. Vérifiez la connexion puis réessayez."
                    : err.message
            );
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
            const g = data.garanties || {};
            const guarantees = {
                g_vol: asText(g.vol), g_incendie: asText(g.incendie), g_bdg: asText(g.bdg),
                g_personnes: asText(g.personnes_transportees), g_ind_cond: asText(g.ind_conducteur), g_remarquage: g.remarquage != null && Number(g.remarquage) !== 0
            };
            setValues(prev => ({ ...prev, ...loaded, ...guarantees }));
            setNomBranche(data.nom_branche || '');
            if (data.nom_client) setNomClient(data.nom_client);
            setQuittances(Array.isArray(data.quittances) ? data.quittances.map(normalizeReceipt) : []);
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

    // Client name for the typed client code.
    useEffect(() => {
        const code = values.code_client.trim();
        if (!code) { setNomClient(""); return undefined; }
        let active = true;
        const timer = setTimeout(async () => {
            try {
                const response = await fetch(`${API_URL}/api/clients/${encodeURIComponent(code)}`, {
                    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
                });
                const data = await response.json().catch(() => ({}));
                const name = response.ok
                    ? data.nom_client || [data.Nom, data.Prenom].filter(Boolean).join(" ")
                    : "";
                if (active) setNomClient(name || "");
            } catch {
                if (active) setNomClient("");
            }
        }, 350);
        return () => { active = false; clearTimeout(timer); };
    }, [values.code_client, accessToken]);

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
        <form className={`policy-legacy-form ${isCreate ? "is-create" : "is-view"}`} onSubmit={save}>
            <div className="pf-toolbar">
                <strong>{isCreate && step === 2 ? "GESTION DES QUITTANCES" : "GESTION DES POLICES"}</strong>
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

                    {!isCreate && (
                    <label className="pf-field pf-field-narrow">
                        <span>Code client</span>
                        <input
                            value={values.code_client}
                            readOnly={Boolean(clientCode)}
                            onChange={e => update("code_client", e.target.value)}
                        />
                    </label>
                    )}

                    {!isCreate && (
                    <label className="pf-field pf-field-wide">
                        <span>Nom client</span>
                        <input
                            value={nomClient}
                            readOnly
                            placeholder="Détecté automatiquement"
                        />
                    </label>
                    )}

                    <label className="pf-field pf-field-narrow">
                        <span>Date création</span>
                        <input
                            type="date"
                            value={values.date_creation}
                            onChange={e => update("date_creation", e.target.value)}
                        />
                    </label>
                    {field("Immatriculation", "num_imat")}
                </div>
            </section>
            )}

            {!(isCreate && step === 2) && (
            <div className="pf-info-row">
            <section className={`pf-section pf-policy-info${isCreate ? " pf-span-full" : ""}`}>
                <h3>Information Police</h3>

                <div className="pf-term-row">
                    <label className="pf-check">
                        <input
                            type="checkbox"
                            checked={values.renouvelable}
                            onChange={e => update("renouvelable", e.target.checked)}
                        />
                        Renouvelable
                    </label>
                    <label className="pf-check">
                        <input
                            type="checkbox"
                            checked={!values.renouvelable}
                            onChange={e => update("renouvelable", !e.target.checked)}
                        />
                        Fermé
                    </label>
                    <label className="pf-field">
                        <span>Durée</span>
                        <select
                            value={values.duree}
                            onChange={e => setValues(prev => ({ ...prev, duree: e.target.value, ...termDates(prev.effet, e.target.value) }))}
                        >
                            {!TERMS.some(t => t.value === String(values.duree)) && values.duree !== "" && (
                                <option value={values.duree}>{values.duree} mois</option>
                            )}
                            {TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </label>
                    <label className="pf-field">
                        <span>Échéance</span>
                        <input
                            type="date"
                            value={echeanceToDate(values.echeance, values.effet)}
                            onChange={e => update("echeance", dateToEcheance(e.target.value))}
                        />
                    </label>
                    <label className="pf-field">
                        <span>Date effet</span>
                        <input
                            type="date"
                            value={values.effet}
                            onChange={e => setValues(prev => ({ ...prev, effet: e.target.value, ...termDates(e.target.value, prev.duree) }))}
                        />
                    </label>
                    <label className="pf-field">
                        <span>Expiration</span>
                        <input
                            type="date"
                            value={values.expiration}
                            onChange={e => update("expiration", e.target.value)}
                        />
                    </label>
                </div>

                <div className="pf-check-row">
                    {check("Hors taxe", "hors_taxe")}
                    {check("Bonification", "participation")}
                </div>

                <div className="pf-grid">
                    {field("Heure effet", "heure_effet", "time")}
                    {field("État", "etat")}
                    {field("Date mouvement", "date_mvt", "date")}
                    {field("Risque", "risque")}
                </div>
            </section>
            {!isCreate && (
            <section className="pf-section pf-observation-section pf-observation-side">
                <h3>Observation</h3>
                <textarea
                    className="pf-observation"
                    value={values.observation}
                    onChange={e => update("observation", e.target.value)}
                />
            </section>
            )}
            </div>
            )}

            {!(isCreate && step === 2) && (
            <div className="pf-right-column">
            <div className="pf-tousrisque">
                {check("Tous risques", "tous_risque")}
                {values.tous_risque && (
                    <>
                        <label className="pf-franchise">
                            <span>Franchise</span>
                            <input type="number" min="0" step="any" value={values.franchise} onChange={e => update("franchise", e.target.value)} />
                            <b>%</b>
                        </label>
                        <label className="pf-franchise">
                            <span>Valeur à neuf</span>
                            <input type="number" min="0" step="any" value={values.neuf} onChange={e => update("neuf", e.target.value)} />
                        </label>
                        <label className="pf-franchise">
                            <span>Valeur vénale</span>
                            <input type="number" min="0" step="any" value={values.venale} onChange={e => { const value = e.target.value; setValues(prev => ({ ...prev, venale: value, g_vol: value, g_incendie: value })); }} />
                        </label>
                    </>
                )}
            </div>
            <section className="pf-section pf-garanties pf-span-full">
                <h3>Garanties véhicule</h3>
                <div className="pf-grid pf-grid-garanties">
                    {GARANTIES.map(([key, label]) => key === "g_remarquage" ? (
                        <div className="pf-field" key={key}>
                            <span>{label}</span>
                            <div className="pf-check-row pf-check-yesno-row">
                                <label className="pf-check pf-check-yesno">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(values.g_remarquage)}
                                        onChange={() => update("g_remarquage", true)}
                                    />
                                    Oui
                                </label>
                                <label className="pf-check pf-check-yesno">
                                    <input
                                        type="checkbox"
                                        checked={!values.g_remarquage}
                                        onChange={() => update("g_remarquage", false)}
                                    />
                                    Non
                                </label>
                            </div>
                        </div>
                    ) : (
                        <label className="pf-field" key={key}>
                            <span>{label}</span>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={values[key]}
                                onChange={e => {
                                    const value = e.target.value;
                                    // Vol and Incendie share the same value.
                                    setValues(prev => (key === "g_vol"
                                        ? { ...prev, g_vol: value, g_incendie: value }
                                        : { ...prev, [key]: value }));
                                }}
                            />
                        </label>
                    ))}
                </div>
            </section>
            </div>
            )}

            {isCreate && step === 2 && (
            <section className="pf-section pf-quittance-info pf-span-full">
                <h3>Informations Quittance</h3>

                <div className="pf-grid">
                    <label className="pf-field">
                        <span>N° Police</span>
                        <input value={values.num_police} readOnly />
                    </label>
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
                    <div className="pf-field">
                        <span>&nbsp;</span>
                        <div className="pf-check-row pf-check-yesno-row">
                            {check("Carte verte", "carte_verte")}
                        </div>
                    </div>
                    {values.carte_verte && (
                        <>
                            {field("Carte verte : du", "cv_du", "date")}
                            {field("Carte verte : au", "cv_au", "date")}
                        </>
                    )}
                </div>
            </section>
            )}

            {!isCreate && (
            <section className="pf-section pf-quittance-info pf-span-full">
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

            {isCreate && step === 2 && (
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
                    {step === 1 && onClose && (
                        <button type="button" onClick={onClose}>← Précédent</button>
                    )}
                    {step === 2 && !saved && (
                        <button type="button" onClick={() => setStep(1)}>← Précédent</button>
                    )}
                    {step === 1 ? (
                        <button type="button" className="pf-primary" onClick={goToReceipt} disabled={loadedExisting}>
                            Suivant : quittance →
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className="pf-primary"
                            disabled={saving || saved || (embedded && !quittanceComplete)}
                            title={embedded && !quittanceComplete ? "Renseignez la date d'émission, la prime nette, la prime totale et le montant de la quittance" : undefined}
                        >
                            {saving ? "Enregistrement..." : saved ? "Enregistré" : finalLabel}
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
