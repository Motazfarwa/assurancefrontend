import { useEffect, useRef, useState } from "react";
import "./PolicyForm.css";
import ClientPolicesModal from "./ClientPolicesModal";
import { useAuth } from "../../auth/AuthContext";
import { API_BASE_URL as API_URL } from "../../services/apiBase";
import { isOfferedCompany } from "../../services/companyApi";
import { listClients, normalizeClientRecord, rankClients } from "../../services/clientApi";
import FlotteDialog from "../FlotteDialog/FlotteDialog";
import PoliceFictiveWizard, { storeDraft } from "../FlotteDialog/PoliceFictiveWizard";
import { policeErrors, quittanceErrors, REQUIRED_POLICY_FIELDS } from "./policyValidation";

// A new policy takes effect the day after today, for one year: expiration one year later, due date (day and
// month only, "dd/mm" as the policy table stores it) on the same day.
const tomorrowIso = (() => {
    const day = new Date();
    day.setDate(day.getDate() + 1);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
})();
const tomorrowEcheance = `${tomorrowIso.slice(8, 10)}/${tomorrowIso.slice(5, 7)}`;
// The choice of the N° police list that switches to typing a new number.
const NEW_POLICE = "__nouvelle__";

// "Dommages cumulés" cover: each guarantee is ticked, then given an amount.
const DC_GUARANTEES = [
    ["collision", "Dommages collision"],
    ["acc_conducteur", "Accident corporel conducteur"],
    ["securite_passager", "Sécurité passager"],
    ["incendie_emeutes", "Incendie émeutes / mouvements populaires"],
    ["force_nature", "Force de la nature"],
    ["autre", "Autre"]
];

const initialValues = {
    // Police
    num_police: "",
    code_compagnie: "",
    code_client: "",
    code_branche: "",
    date_creation: new Date().toISOString().slice(0, 10),
    renouvelable: true,
    duree: "12",
    effet: tomorrowIso,
    heure_effet: "00:00",
    echeance: tomorrowEcheance,
    expiration: addMonths(tomorrowIso, 12),
    etat: "AN",
    date_mvt: "",
    risque: "",
    hors_taxe: false,
    tous_risque: false,
    participation: false,
    flotte: false, // fleet contract: its vehicles are entered after saving (Véhicules de la flotte)

    // Revalorisation and "Dommages cumulés" (screen + their own payload: no policy table columns)
    revalorisation: false,
    date_revalorisation: "",
    date_envoi: "",
    dommages_cumules: false,
    ...Object.fromEntries(DC_GUARANTEES.flatMap(([key]) => [[`dc_${key}`, false], [`dc_${key}_montant`, ""]])),
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
    date_emission: new Date().toISOString().slice(0, 10),
    with_periode: false, // the Période is entered only once this box is ticked
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

// Companies not offered in the list (STAR, SALIM, EUROP ASSISTANCE, MAE, EL AMANA TAKAFUL), by company code.
const HIDDEN_COMPANIES = new Set([1, 7, 8, 11, 13]);


const POLICE_FIELDS = [
    "num_police", "code_compagnie", "code_client",
    "code_branche", "date_creation", "renouvelable",
    "duree", "effet", "heure_effet", "echeance",
    "expiration", "etat", "date_mvt", "risque",
    "hors_taxe", "tous_risque", "participation",
    "num_imat", "obser", "franchise", "neuf", "venale", "flotte"
];

const GARANTIES = [
    ["g_vol", "Vol"], ["g_incendie", "Incendie"], ["g_bdg", "BDG"],
    ["g_personnes", "Personnes transportées"], ["g_ind_cond", "IND conducteur"], ["g_remarquage", "Remorquage"]
];
const TERMS = [{ value: "1", label: "1 mois" }, { value: "3", label: "3 mois" }, { value: "6", label: "6 mois" }, { value: "12", label: "1 année" }];

// effet + months, keeping the day when the target month is shorter (31 Aug + 6 months -> 28/29 Feb).
function addMonths(iso, months) {
    const [y, m, d] = iso.split("-").map(Number);
    const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

// The policy table stores the due date as "dd/mm" (day and month only), which is what the form shows.
const dateToEcheance = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const echeanceText = (echeance) => (/^\d{4}-\d{2}-\d{2}/.test(echeance || "") ? dateToEcheance(echeance) : echeance || "");
// Typing "2810" gives "28/10".
const maskEcheance = (text) => {
    const digits = text.replace(/\D/g, "").slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
};
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

// A policy in force, as in "Liste des polices" (same rule as the API): état AN (affaire nouvelle) or RV (remise en
// vigueur), not expired.
export const isInForce = (item) => ["AN", "RV"].includes(String(item?.etat || "").trim().toUpperCase())
    && (!item.expiration || String(item.expiration).slice(0, 10) >= new Date().toLocaleDateString("sv-SE"));

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

// embedded: used as steps 3 and 4 of the "new client" flow. "Suivant" on the receipt calls onReceiptReady without storing
// anything; the last step stores everything through saveRef. beforeSave runs first (it creates the client). saveRef.current()
// resolves to the stored result, with `fleet` when a fleet window opened, or to null with the error shown on the receipt.
export default function PolicyForm({ clientCode = "", prefill = null, onStepChange, onClose, initialClient = "", embedded = false, beforeSave, onReceiptReady, saveRef, fleetRetryRef, finalLabel = "Soumettre", clientName = "" }) {
    const { accessToken, user } = useAuth();
    // Opened from a client file: a new policy (then its receipt) is entered for that client.
    const isCreate = Boolean(clientCode);
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [fleetNumInt, setFleetNumInt] = useState(""); // fleet contract saved
    const [fleetOpen, setFleetOpen] = useState(false); // its "Véhicules de la flotte" window
    const [fleetDrafts, setFleetDrafts] = useState([]); // polices fictives entered with the police flotte, stored just after it
    const storedNumInt = useRef(""); // the police flotte once stored
    const [fleetEditor, setFleetEditor] = useState(null); // their window: { index } (-1: a new one)
    const [triedSteps, setTriedSteps] = useState({}); // a step whose "Suivant" was clicked shows its input errors
    const formRef = useRef(null);

    useEffect(() => {
        if (onStepChange) onStepChange(step);
    }, [step, onStepChange]);
    const loadedRef = useRef({ num: "", client: "" });
    const [quittances, setQuittances] = useState([]);
    const [nomClient, setNomClient] = useState("");
    const [nameQuery, setNameQuery] = useState(null); // text typed in "Nom client", null while it shows the client of the code
    const [allClients, setAllClients] = useState(null); // loaded the first time a name is typed
    const [values, setValues] = useState(
        clientCode ? { ...initialValues, ...(prefill || {}), code_client: clientCode } : initialClient ? { ...initialValues, code_client: initialClient } : initialValues
    );
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [compagnies, setCompagnies] = useState([]);
    const [compagniesError, setCompagniesError] = useState("");
    const [nomBranche, setNomBranche] = useState(""); // the branch name the database gives with a loaded police
    const [branchCandidates, setBranchCandidates] = useState(null); // companies / branches the N° police can belong to
    const [clientPolices, setClientPolices] = useState(null); // the client's polices, the latest first
    const [allPolices, setAllPolices] = useState(false); // "Gestion des polices": the polices not in force are offered too
    const [editing, setEditing] = useState(null); // "Modifier": the values before the change (null: the police is only shown)
    const [newPolice, setNewPolice] = useState(false); // a client with polices: a new number is being typed instead
    const [showClientPolices, setShowClientPolices] = useState(false);
    const update = (key, value) => {
        setValues(prev => ({ ...prev, [key]: value }));
    };
    // A code branche has the company's Nbr_Chiffre_Code characters (GAT 3, BIAT 4, MAGHREBIA 2).
    const branchLength = Number(compagnies.find(item => String(item.code_compagnie) === String(values.code_compagnie))?.nbr_chiffre_code) || 3;
    const commissionOf = (primeNette) => (primeNette === "" || tauxComm == null ? "" : String(Math.round(Number(primeNette) * tauxComm * 1000) / 1000));
    // Prime totale is also the montant and the solde of the quittance; commission = prime nette × taux de la branche.
    const updateLinked = (key, value) => setValues(prev => {
        const next = { ...prev, [key]: value };
        if (key === "prime_total") { next.montant_quittance = value; next.solde_quittance = value; }
        if (key === "prime_net" && tauxComm != null) next.commission = commissionOf(value);
        return next;
    });


    useEffect(() => {
        const controller = new AbortController();

        const loadCompagnies = async () => {
            try {

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

    // N° police -> the companies and branches it can belong to: read from the number (year + code branche + digits, or the
    // older code branche + year + digits) and checked against the branches of each company. Nothing is typed for it.
    useEffect(() => {
        const number = values.num_police;
        setBranchCandidates(null);
        if (number.length < 6) return undefined;
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const response = await fetch(`${API_URL}/api/polices/numero-branche?${new URLSearchParams({ num_police: number })}`, { credentials: "include", signal: controller.signal });
                const data = await response.json().catch(() => ({}));
                if (!controller.signal.aborted) setBranchCandidates(response.ok && Array.isArray(data.candidates) ? data.candidates : []);
            } catch (err) {
                if (err.name !== "AbortError") setBranchCandidates([]);
            }
        }, 350);
        return () => { controller.abort(); clearTimeout(timer); };
    }, [values.num_police]);

    const err = (name) => (triedSteps[step] && stepErrors[name] ? <small className="pf-field-error" role="alert">{stepErrors[name]}</small> : null);

    // Shows the messages of the step and goes to its first wrong field.
    function showStepErrors() {
        setTriedSteps(prev => ({ ...prev, [step]: true }));
        requestAnimationFrame(() => formRef.current?.querySelector(".pf-field-error")?.parentElement?.querySelector("input, select, textarea")?.focus());
    }

    const field = (
        label, name, type = "text", options = null
    ) => (
        <label className="pf-field" key={name}>
            <span>{label}{isCreate && REQUIRED_POLICY_FIELDS.has(name) ? " *" : ""}</span>
            {options ? (
                <select
                    value={values[name]}
                    disabled={locked}
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
                    readOnly={(name === "code_client" && Boolean(clientCode)) || locked}
                    onChange={e => updateLinked(name, e.target.value)}
                />
            )}
            {err(name)}
        </label>
    );

    const check = (label, name, frozen = false) => (
        <label className="pf-check">
            <input
                type="checkbox"
                checked={values[name]}
                disabled={locked || frozen}
                onChange={e => update(name, e.target.checked)}
            />
            {label}
        </label>
    );

    // N° police: the year, the code branche, then any number of digits (15 characters in all). The company and the branch
    // are read from it (see branchCandidates).
    const handleNumberChange = (value) => {
        const clean = value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 15);
        setValues(prev => ({ ...prev, num_police: clean }));
    };

    const loadedExisting = loadedRef.current.num !== "" && loadedRef.current.num === values.num_police;
    // "Gestion des polices": the police is shown locked; "Modifier" (administrator) opens its fields, "Enregistrer" stores them.
    const locked = !isCreate && !editing;
    const fixed = !isCreate; // parts stored elsewhere (garanties, dommages cumulés, revalorisation, flotte): not changed here
    const canModify = !isCreate && Boolean(user?.isAdmin) && loadedExisting && Boolean(loadedRef.current.numInt);
    const numberOrNull = (value) => (value === "" || value == null ? null : Number(value));
    const policeChanges = (form) => ({
        date_creation: toTimestamp(form.date_creation),
        num_imat: form.num_imat || null,
        renouvelable: Boolean(form.renouvelable),
        duree: numberOrNull(form.duree),
        echeance: form.echeance || null,
        effet: toTimestamp(form.effet),
        expiration: toTimestamp(form.expiration),
        hors_taxe: Boolean(form.hors_taxe),
        participation: Boolean(form.participation),
        heure_effet: form.effet ? `${form.effet}T${form.heure_effet || "00:00"}:00` : null,
        etat: form.etat ? form.etat.trim().toUpperCase() : null,
        date_mvt: toTimestamp(form.date_mvt),
        risque: form.risque || null,
        obser: form.observation || null,
        tous_risque: Boolean(form.tous_risque),
        franchise: form.franchise === "" ? null : Math.round(Number(form.franchise)) || 0,
        neuf: numberOrNull(form.neuf),
        venale: numberOrNull(form.venale)
    });
    const startEditing = () => { setMessage(""); setError(""); setEditing(values); };
    const cancelEditing = () => { setValues(editing); setEditing(null); setError(""); };
    async function saveChanges() {
        const before = policeChanges(editing);
        const after = policeChanges(values);
        const changed = Object.fromEntries(Object.entries(after).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key])));
        if (!Object.keys(changed).length) { setEditing(null); setMessage("Aucune modification."); return; }
        if (changed.etat !== undefined && changed.etat !== null && changed.etat.length !== 2) { setError("L’état est un code de 2 lettres (AN, RE, SS, RV)."); return; }
        setSaving(true);
        setError("");
        try {
            const response = await fetch(`${API_URL}/api/polices/${encodeURIComponent(loadedRef.current.numInt)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
                credentials: "include",
                body: JSON.stringify(changed)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Impossible d’enregistrer les modifications.");
            setEditing(null);
            await lookup({ num_police: values.num_police }, new AbortController().signal);
            setMessage(`Police ${values.num_police} modifiée.`);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    // The branch of the chosen company written in the number. A new number is the year then the code branche; a police
    // already stored keeps its own code when it has one (older numbers start with the code branche).
    const offeredCompany = (code) => {
        const company = compagnies.find(item => String(item.code_compagnie) === String(code));
        return Boolean(company) && isOfferedCompany(company) && !HIDDEN_COMPANIES.has(Number(company.code_compagnie));
    };
    const storedBranch = loadedExisting ? String(values.code_branche || "").trim() : "";
    const companyCandidates = (branchCandidates || []).filter(item => String(item.code_compagnie) === String(values.code_compagnie));
    const branch = companyCandidates.find(item => storedBranch && item.code_branche === storedBranch)
        || companyCandidates.find(item => item.forme === "annee")
        || (loadedExisting ? companyCandidates[0] : null)
        || null;
    const tauxComm = branch?.taux_comm == null ? null : Number(branch.taux_comm); // commission rate (0.1 = 10 %)
    const nomBrancheShown = branch?.nom_branche || (loadedExisting ? nomBranche : "");
    const branchMissing = Boolean(values.code_compagnie) && branchCandidates !== null && values.num_police.length >= 6 && !branch && !(loadedExisting && nomBranche);

    // No company chosen yet: the number names only one of the offered companies -> that company.
    useEffect(() => {
        if (values.code_compagnie || !branchCandidates?.length) return;
        const companies = [...new Set(branchCandidates
            .filter(item => offeredCompany(item.code_compagnie) && (item.forme === "annee" || loadedExisting))
            .map(item => String(item.code_compagnie)))];
        if (companies.length === 1) update("code_compagnie", companies[0]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [branchCandidates, compagnies]);

    // The client's polices: one goes straight into N° police (which loads it), several are offered in a list.
    useEffect(() => {
        const code = values.code_client.trim();
        setClientPolices(null);
        setNewPolice(false);
        if (!code) return undefined;
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const response = await fetch(`${API_URL}/api/polices/client/${encodeURIComponent(code)}`, { credentials: "include", signal: controller.signal });
                const rows = await response.json().catch(() => []);
                if (controller.signal.aborted) return;
                const list = response.ok && Array.isArray(rows)
                    ? rows.map(row => ({ ...row, num_police: String(row.num_police || "").trim() })).filter(row => row.num_police)
                    : [];
                setClientPolices(list);
                if (isCreate) {
                    if (list.length) setValues(prev => (prev.num_police ? prev : { ...prev, num_police: list[0].num_police }));
                    return;
                }
                // "Gestion des polices": a police typed (of this client) stays shown, even out of force; otherwise the
                // client's latest police in force is shown.
                if (!list.length) { setAllPolices(false); lookup({ code_client: code }, controller.signal); return; }
                const typed = list.find(item => item.num_police === loadedRef.current.num && loadedRef.current.client === code);
                setAllPolices(Boolean(typed) && !isInForce(typed));
                if (typed) return;
                const shown = list.find(isInForce);
                if (shown) { setValues(prev => ({ ...prev, num_police: shown.num_police })); return; }
                loadedRef.current = { num: "", client: code, numInt: "" };
                setValues(prev => ({ ...initialValues, code_client: prev.code_client, num_police: "" }));
                setQuittances([]);
                setNomBranche("");
                setMessage(`Aucune police en vigueur pour ce client : ${list.length} police${list.length > 1 ? "s" : ""} expirée${list.length > 1 ? "s" : ""}, suspendue${list.length > 1 ? "s" : ""} ou résiliée${list.length > 1 ? "s" : ""} (« voir toutes »).`);
            } catch (err) {
                if (err.name !== "AbortError") setClientPolices([]);
            }
        }, 300);
        return () => { controller.abort(); clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [values.code_client]);

    // A client with polices, in the "Saisir police" step: leave them for a new number, or come back to them.
    const startNewPolice = () => {
        setNewPolice(true);
        loadedRef.current = { num: "", client: "" };
        setValues({ ...initialValues, ...(prefill || {}), code_client: clientCode, num_police: "" });
        setQuittances([]);
        setNomBranche("");
        setMessage("");
        setError("");
    };
    const backToClientPolices = () => {
        setNewPolice(false);
        if (clientPolices?.length) handleNumberChange(clientPolices[0].num_police);
    };
    // "Gestion des polices" offers the polices in force ("voir toutes": every police of the client).
    const inForce = (clientPolices || []).filter(isInForce);
    const shownPolices = isCreate || allPolices ? clientPolices || [] : inForce;
    const policeLabel = (item) => [
        item.num_police,
        item.nom_compagnie,
        item.nom_branche || item.risque,
        item.etat && `état ${String(item.etat).trim()}`,
        item.effet && `effet ${String(item.effet).slice(0, 10).split("-").reverse().join("/")}`
    ].filter(Boolean).join(" · ");

    // The input errors of the step (shown once its "Suivant" was clicked); the code branche is the one read from the number.
    const stepErrors = !isCreate ? {} : step === 1
        ? policeErrors({ ...values, code_branche: branch?.code_branche || "", echeance: echeanceText(values.echeance) }, DC_GUARANTEES.map(([key]) => key), branchLength)
        : quittanceErrors(values);
    const errorCount = triedSteps[step] ? Object.keys(stepErrors).length : 0;

    function goToReceipt() {
        setError("");
        if (Object.keys(stepErrors).length) { showStepErrors(); return; }
        // A flotte has no quittance of its own: each police fictive has its own, paid by its client.
        if (values.flotte) {
            if (!fleetDrafts.length) { setError("Ajoutez au moins une police fictive à cette police flotte."); return; }
            if (onReceiptReady) onReceiptReady();
            else save();
            return;
        }
        setStep(2);
    }

    async function save(e) {
        e?.preventDefault();
        if (!isCreate || (step !== 2 && !values.flotte) || saved) return null;
        setError("");
        setMessage("");

        const police = {};
        const quittance = {};

        for (const [key, value] of Object.entries(values)) {
            if (key === "heure_effet" || key === "carte_verte" || key.startsWith("g_") || key.startsWith("cv_") || key.startsWith("dc_")) continue;
            if (["revalorisation", "date_revalorisation", "date_envoi", "dommages_cumules", "with_periode"].includes(key)) continue;

            let converted = value === "" ? null : value;
            if (DATE_FIELDS.includes(key)) converted = toTimestamp(value);
            if (MONEY_FIELDS.includes(key) && value !== "") converted = Number(value);
            if (["code_compagnie", "duree"].includes(key) && value !== "") converted = Number(value);
            if (key === "franchise") converted = (values.tous_risque || values.dommages_cumules) && value !== "" ? Math.round(Number(value)) || 0 : null;

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
        // Ticked guarantees with their amounts (shown under Tous risques and Dommages cumulés).
        const dommages_cumules = values.tous_risque || values.dommages_cumules
            ? Object.fromEntries(DC_GUARANTEES.filter(([key]) => values[`dc_${key}`]).map(([key]) => [key, amount(values[`dc_${key}_montant`])]))
            : null;
        const revalorisation = values.revalorisation
            ? { date_revalorisation: values.date_revalorisation || null, date_envoi: values.date_envoi || null }
            : null;
        police.code_branche = branch?.code_branche || null;
        if (values.effet) police.heure_effet = `${values.effet}T${values.heure_effet}:00`;
        quittance.observation = values.observation || "";
        if (!values.with_periode) quittance.periode = null;

        setSaving(true);
        try {
            if (beforeSave) await beforeSave();
            const response = await fetch(`${API_URL}/api/polices`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ police, quittance: values.flotte ? null : quittance, garanties, carte_verte: values.flotte ? null : carte_verte, dommages_cumules, revalorisation })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(
                    typeof result.detail === "string" ? result.detail : JSON.stringify(result.detail || result)
                );
            }
            setSaved(true);
            setMessage(result.num_quittance ? `Police ${result.num_police} enregistrée. Quittance : ${result.num_quittance}` : `Police flotte ${result.num_police} enregistrée.`);
            // The polices fictives follow their police. A refused one never undoes it: it stays in the list, to try again.
            if (!values.flotte || !result.num_int) return result;
            setFleetNumInt(String(result.num_int));
            storedNumInt.current = String(result.num_int);
            const { refused, claims, stored } = await storeFleet(String(result.num_int), fleetDrafts);
            return { ...result, fleetRefused: refused, fleetClaims: claims, fleetCount: stored };
        } catch (err) {
            setError(
                err instanceof TypeError
                    ? "Le serveur n'a pas répondu. Vérifiez la connexion puis réessayez."
                    : err.message
            );
            return null;
        } finally {
            setSaving(false);
        }
    }
    if (saveRef) saveRef.current = save;

    if (fleetRetryRef) fleetRetryRef.current = () => storeFleet(storedNumInt.current, fleetDrafts);

    // One after the other: a new client takes the next code. Those refused stay in the list, ready to try again.
    async function storeFleet(numInt, drafts) {
        const refused = [];
        const remaining = [];
        const claims = [];
        for (const draft of drafts) {
            try {
                const code = await storeDraft(accessToken, numInt, draft);
                if (draft.form.withClaim) claims.push({ num_imat: draft.num_imat, code_client: code, nom_client: draft.nom_client });
            } catch (fleetError) {
                refused.push({ num_imat: draft.num_imat, message: fleetError.message });
                remaining.push(fleetError.draft || draft);
            }
        }
        setFleetDrafts(remaining);
        if (refused.length) setMessage(current => `${current} · Polices fictives refusées : ${refused.map(item => `${item.num_imat} (${item.message})`).join(", ")}`);
        return { refused, claims, stored: drafts.length - refused.length };
    }

    async function retryFleet() {
        setSaving(true);
        await storeFleet(storedNumInt.current, fleetDrafts);
        setSaving(false);
    }

    function storeFleetDraft(draft) {
        const { index } = fleetEditor;
        setFleetDrafts(current => (index < 0 ? [...current, draft] : current.map((item, position) => (position === index ? draft : item))));
        setFleetEditor(null);
    }

    function submitForm(e) {
        e.preventDefault();
        if (!isCreate || step !== 2 || saved) return;
        setError("");
        if (Object.keys(stepErrors).length) { showStepErrors(); return; }
        if (onReceiptReady) onReceiptReady();
        else save();
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
            loadedRef.current = { num: loaded.num_police, client: loaded.code_client, numInt: String(data.police?.num_int || "").trim() };
            const g = data.garanties || {};
            const guarantees = {
                g_vol: asText(g.vol), g_incendie: asText(g.incendie), g_bdg: asText(g.bdg),
                g_personnes: asText(g.personnes_transportees), g_ind_cond: asText(g.ind_conducteur), g_remarquage: g.remarquage != null && Number(g.remarquage) !== 0
            };
            const dc = data.dommages_cumules || null;
            const reval = data.revalorisation || null;
            const extras = {
                // A Tous risques policy also stores its guarantees here: keep the two boxes exclusive.
                dommages_cumules: Boolean(dc) && !loaded.tous_risque,
                ...Object.fromEntries(DC_GUARANTEES.flatMap(([key]) => [[`dc_${key}`, Boolean(dc && key in dc)], [`dc_${key}_montant`, asText(dc?.[key])]])),
                revalorisation: Boolean(reval),
                date_revalorisation: asDate(reval?.date_revalorisation),
                date_envoi: asDate(reval?.date_envoi)
            };
            // Within a client's file the client never changes: an existing police is only shown, and refused.
            setValues(prev => ({ ...prev, ...loaded, ...guarantees, ...extras, ...(isCreate ? { code_client: clientCode } : {}) }));
            setNomBranche(data.nom_branche || '');
            if (data.nom_client) setNomClient(data.nom_client);
            setQuittances(Array.isArray(data.quittances) ? data.quittances.map(normalizeReceipt) : []);
            if (params.code_client && data.matches > 1) {
                setMessage(`${data.matches} polices pour ce client — la plus récente est affichée.`);
            }
            if (!isCreate && !isInForce({ etat: loaded.etat, expiration: loaded.expiration })) {
                setMessage("Cette police n’est pas en vigueur (expirée, suspendue ou résiliée).");
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                setQuittances([]);
                // A new police: its number is not found yet, which is expected.
                if (!(isCreate && params.num_police)) setError(err.message);
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

    // Policy number (year + code branche + at least one digit) -> that policy and its receipts, once typing pauses.
    useEffect(() => {
        const number = values.num_police;
        if (number.length < 4 + branchLength + 1 || number === loadedRef.current.num) return undefined;
        const controller = new AbortController();
        const timer = setTimeout(() => lookup({ num_police: number }, controller.signal), 600);
        return () => { controller.abort(); clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [values.num_police]);

    // Client code -> its polices (above): the latest police in force is shown, with its receipts.


    // "Nom client": a typed name proposes the matching clients; picking one fills the code, which loads its policy.
    const typeName = (value) => {
        setNameQuery(value);
        if (allClients) return;
        setAllClients([]);
        listClients(accessToken)
            .then(rows => setAllClients(rows.map(normalizeClientRecord)))
            .catch(() => setAllClients(null));
    };
    const pickClient = (record) => {
        setNameQuery(null);
        update("code_client", String(record.clientCode));
    };
    const nameMatches = nameQuery?.trim() && allClients
        ? rankClients(allClients.filter(record => record.clientCode), nameQuery).slice(0, 12)
        : [];

    return (
         <>
        <form ref={formRef} noValidate className={`policy-legacy-form ${isCreate ? "is-create" : "is-view"}`} onSubmit={submitForm}>
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
                    {canModify && !editing && <button type="button" className="pf-view-client-button pf-modify-button" onClick={startEditing}>Modifier</button>}
                    {editing && <>
                        <button type="button" className="pf-view-client-button" onClick={cancelEditing} disabled={saving}>Annuler</button>
                        <button type="button" className="pf-view-client-button pf-modify-button" onClick={saveChanges} disabled={saving}>{saving ? "Enregistrement..." : "Enregistrer"}</button>
                    </>}
               
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

                            {compagnies
                                // a hidden company stays visible when the loaded policy belongs to it
                                .filter((compagnie) => (isOfferedCompany(compagnie) && !HIDDEN_COMPANIES.has(Number(compagnie.code_compagnie))) || String(compagnie.code_compagnie) === String(values.code_compagnie))
                                .map((compagnie) => (
                                <option
                                    key={compagnie.code_compagnie}
                                    value={compagnie.code_compagnie}
                                >
                                    {compagnie.nom_compagnie}
                                </option>
                            ))}
                        </select>
                        {err("code_compagnie")}
                        {compagniesError && (
                            <small className="pf-error">{compagniesError}</small>
                        )}
                    </label>

                    <div className="pf-field pf-field-wide pf-num-police">
                        <span>N° Police *{clientPolices?.length > 0 && (isCreate
                            ? <small className="pf-num-count"> · {clientPolices.length} police{clientPolices.length > 1 ? "s" : ""} pour ce client</small>
                            : <small className="pf-num-count"> · {inForce.length} en vigueur sur {clientPolices.length}{inForce.length < clientPolices.length && <> · <button type="button" className="pf-link-button" disabled={Boolean(editing)} onClick={() => setAllPolices(!allPolices)}>{allPolices ? "en vigueur seulement" : "voir toutes"}</button></>}</small>)}</span>
                        {(isCreate ? clientPolices?.length > 1 : clientPolices?.length > 0 && (shownPolices.length !== 1 || shownPolices.length !== clientPolices.length)) && !newPolice ? (
                            <select
                                aria-label="N° Police"
                                disabled={Boolean(editing)}
                                value={shownPolices.some(item => item.num_police === values.num_police) ? values.num_police : ""}
                                onChange={e => (e.target.value === NEW_POLICE ? startNewPolice() : handleNumberChange(e.target.value))}
                            >
                                <option value="" disabled>{isCreate || shownPolices.length ? "Choisir une police du client…" : "Aucune police en vigueur"}</option>
                                {shownPolices.map(item => <option key={item.num_int || item.num_police} value={item.num_police}>{policeLabel(item)}</option>)}
                                {isCreate && <option value={NEW_POLICE}>＋ Nouvelle police (saisir le numéro)</option>}
                            </select>
                        ) : (
                            <input
                                aria-label="N° Police"
                                readOnly={Boolean(editing)}
                                value={values.num_police}
                                maxLength={15}
                                onChange={e => handleNumberChange(e.target.value)}
                                placeholder={`${new Date().getFullYear()} + code branche + chiffres`}
                            />
                        )}
                        {isCreate && clientPolices?.length > 0 && (newPolice
                            ? <button type="button" className="pf-link-button pf-num-switch" onClick={backToClientPolices}>← Polices du client</button>
                            : clientPolices.length === 1 && <button type="button" className="pf-link-button pf-num-switch" onClick={startNewPolice}>＋ Nouvelle police</button>)}
                        {err("num_police")}
                    </div>

                    <label className="pf-field pf-field-branche-nom">
                        <span>Nom branche</span>
                        <input
                            type="text"
                            value={nomBrancheShown || (values.num_police.length >= 6 && branchCandidates === null ? "Recherche..." : "")}
                            placeholder="Déduit du N° police"
                            readOnly
                        />
                        {branchMissing && (
                            <small className="pf-branch-error">Aucune branche de cette compagnie ne correspond à ce numéro.</small>
                        )}
                    </label>

                    {!isCreate && (
                    <label className="pf-field pf-field-narrow">
                        <span>Code client</span>
                        <input
                            value={values.code_client}
                            readOnly={Boolean(clientCode) || Boolean(editing)}
                            onChange={e => { setNameQuery(null); update("code_client", e.target.value); }}
                        />
                    </label>
                    )}

                    {!isCreate && (
                    <div className="pf-field pf-field-wide pf-client-name">
                        <span>Nom client</span>
                        <input
                            value={nameQuery ?? nomClient}
                            readOnly={Boolean(clientCode) || Boolean(editing)}
                            onChange={e => typeName(e.target.value)}
                            onBlur={() => setTimeout(() => setNameQuery(null), 150)}
                            placeholder="Saisir un nom ou un prénom"
                            autoComplete="off"
                        />
                        {nameQuery?.trim() && (
                            <ul className="pf-suggest" role="listbox">
                                {!allClients?.length ? <li><small>Chargement…</small></li>
                                    : nameMatches.length === 0 ? <li><small>Aucun client trouvé.</small></li>
                                    : nameMatches.map(record => (
                                        <li key={record.clientCode}>
                                            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pickClient(record)}>
                                                <span>{[record.lastName, record.firstName].filter(Boolean).join(" ") || record.relatedName || "Client sans nom"}</span>
                                                <small>Code {record.clientCode}</small>
                                            </button>
                                        </li>
                                    ))}
                            </ul>
                        )}
                    </div>
                    )}

                    <label className="pf-field pf-field-narrow">
                        <span>Date création{isCreate ? " *" : ""}</span>
                        <input
                            type="date"
                            readOnly={locked}
                            value={values.date_creation}
                            onChange={e => update("date_creation", e.target.value)}
                        />
                        {err("date_creation")}
                    </label>
                    {field("Immatriculation", "num_imat")}
                </div>
            </section>
            )}

            {!(isCreate && step === 2) && (
            <fieldset className="pf-info-row pf-lockable" disabled={locked}>
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
                        Ferme
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
                        <span>Échéance{isCreate ? " *" : ""}</span>
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder="jj/mm"
                            maxLength={5}
                            value={echeanceText(values.echeance)}
                            onChange={e => update("echeance", maskEcheance(e.target.value))}
                        />
                        {err("echeance")}
                    </label>
                    <label className="pf-field">
                        <span>Date effet{isCreate ? " *" : ""}</span>
                        <input
                            type="date"
                            value={values.effet}
                            onChange={e => setValues(prev => ({ ...prev, effet: e.target.value, ...termDates(e.target.value, prev.duree) }))}
                        />
                        {err("effet")}
                    </label>
                    <label className="pf-field">
                        <span>Expiration{isCreate ? " *" : ""}</span>
                        <input
                            type="date"
                            value={values.expiration}
                            onChange={e => update("expiration", e.target.value)}
                        />
                        {err("expiration")}
                    </label>
                </div>

                <div className="pf-check-row">
                    {check("Hors taxe", "hors_taxe")}
                    {check("Bonification", "participation")}
                    {check("Police flotte", "flotte", fixed)}
                    {check("Revalorisation", "revalorisation", fixed)}
                    {values.revalorisation && (
                        <>
                            <label className="pf-franchise pf-inline-date">
                                <span>Date de revalorisation</span>
                                <input type="date" disabled={fixed} value={values.date_revalorisation} onChange={e => update("date_revalorisation", e.target.value)} />
                                {err("date_revalorisation")}
                            </label>
                            <label className="pf-franchise pf-inline-date">
                                <span>Date d'envoi de décharge</span>
                                <input type="date" disabled={fixed} value={values.date_envoi} onChange={e => update("date_envoi", e.target.value)} />
                            </label>
                        </>
                    )}
                </div>

                {isCreate && step === 1 && values.flotte && (
                <div className="pf-flotte-section">
                    <h4>Police flotte</h4>
                    <div className="pf-flotte-head">
                        {fleetDrafts.length > 0 && <p>{`${fleetDrafts.length} police${fleetDrafts.length > 1 ? "s" : ""} fictive${fleetDrafts.length > 1 ? "s" : ""} · prime totale ${fleetDrafts.reduce((sum, item) => sum + Number(item.prime_total || 0), 0).toFixed(3)}`}</p>}
                        <button type="button" className="pf-view-client-button" onClick={() => setFleetEditor({ index: -1 })}>+ Ajouter une police fictive</button>
                    </div>
                    {fleetDrafts.length > 0 && (
                    <div className="pf-receipts-wrap">
                        <table className="pf-receipts">
                            <thead><tr><th>N°</th><th>Immatriculation</th><th>Marque</th><th>Client</th><th>Entrée</th><th className="is-number">Prime totale</th><th>Sinistre</th><th /></tr></thead>
                            <tbody>
                                {fleetDrafts.map((item, index) => (
                                    <tr key={item.num_imat}>
                                        <td>{index + 1}</td>
                                        <td><b>{item.num_imat}</b></td>
                                        <td>{item.marque || "—"}</td>
                                        <td>{item.code_client || "Nouveau"} {item.nom_client}</td>
                                        <td>{item.effet ? item.effet.split("-").reverse().join("/") : "—"}</td>
                                        <td className="is-number">{item.prime_total != null ? Number(item.prime_total).toFixed(3) : "—"}</td>
                                    <td>{item.form.withClaim ? "À déclarer" : "—"}</td>
                                        <td className="pf-flotte-actions">
                                            <button type="button" className="pf-link-button" onClick={() => setFleetEditor({ index })}>Modifier</button>
                                            <button type="button" className="pf-link-button" onClick={() => setFleetDrafts(current => current.filter((_, position) => position !== index))}>Supprimer</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    )}
                </div>
                )}

                <div className="pf-grid">
                    {field("Heure effet", "heure_effet", "time")}
                    {/* TPolice.etat holds a 2-letter code (AN, RE, SS, RV) */}
                    <label className="pf-field" key="etat">
                        <span>État{isCreate ? " *" : ""}</span>
                        <input type="text" maxLength={2} value={values.etat} onChange={e => update("etat", e.target.value.toUpperCase())} />
                        {err("etat")}
                    </label>
                    {field("Date mouvement", "date_mvt", "date")}
                    <label className="pf-field pf-risque">
                        <span>Risque</span>
                        <textarea rows={3} maxLength={isCreate ? undefined : 50} value={values.risque} onChange={e => update("risque", e.target.value)} />
                        {err("risque")}
                    </label>
                </div>
            </section>
            {!isCreate && (
            <section className="pf-section pf-observation-section pf-observation-side">
                <h3>Observation</h3>
                <textarea
                    className="pf-observation"
                    value={values.observation}
                    onChange={e => update("observation", e.target.value)}
                    maxLength={500}
                />
            </section>
            )}
            </fieldset>
            )}

            {!(isCreate && step === 2) && (
            <fieldset className="pf-right-column pf-lockable" disabled={locked}>
            <div className="pf-tousrisque">
                {/* Tous risques and Dommages cumulés are two kinds of cover: one or the other. */}
                <label className="pf-check">
                    <input type="checkbox" checked={values.tous_risque} onChange={e => { const on = e.target.checked; setValues(prev => ({ ...prev, tous_risque: on, dommages_cumules: on ? false : prev.dommages_cumules })); }} />
                    Tous risques
                </label>
                <label className="pf-check">
                    <input type="checkbox" checked={values.dommages_cumules} disabled={fixed} onChange={e => { const on = e.target.checked; setValues(prev => ({ ...prev, dommages_cumules: on, tous_risque: on ? false : prev.tous_risque })); }} />
                    Dommages cumulés
                </label>
                {(values.tous_risque || values.dommages_cumules) && (
                    <>
                        <label className="pf-franchise">
                            <span>Franchise</span>
                            <input type="number" min="0" step="any" value={values.franchise} onChange={e => update("franchise", e.target.value)} />
                            {err("franchise")}
                            <b>%</b>
                        </label>
                        <label className="pf-franchise">
                            <span>Valeur à neuf</span>
                            <input type="number" min="0" step="any" value={values.neuf} onChange={e => update("neuf", e.target.value)} />
                            {err("neuf")}
                        </label>
                        <label className="pf-franchise">
                            <span>Valeur vénale</span>
                            <input type="number" min="0" step="any" value={values.venale} onChange={e => { const value = e.target.value; setValues(prev => ({ ...prev, venale: value, g_vol: value, g_incendie: value })); }} />
                            {err("venale")}
                        </label>
                    </>
                )}
                {(values.tous_risque || values.dommages_cumules) && (
                    <div className="pf-dc-list">
                        {DC_GUARANTEES.map(([key, label]) => (
                            <div className="pf-dc-item" key={key}>
                                {check(label, `dc_${key}`, fixed)}
                                {values[`dc_${key}`] && (
                                    <label className="pf-franchise">
                                        <span>Montant</span>
                                        <input type="number" min="0" step="any" disabled={fixed} value={values[`dc_${key}_montant`]} onChange={e => update(`dc_${key}_montant`, e.target.value)} />
                                        {err(`dc_${key}_montant`)}
                                    </label>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <section className="pf-section pf-garanties pf-span-full">
                <h3>Garanties véhicule</h3>
                <fieldset className="pf-lockable pf-lock-contents" disabled={fixed}>
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
                            {err(key)}
                        </label>
                    ))}
                </div>
                </fieldset>
            </section>
            </fieldset>
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
                    {/* Période: its label from the start; the box opens the input beside it */}
                    <div className="pf-field pf-periode-field">
                        <span>Période{values.with_periode ? " *" : ""}</span>
                        <div className="pf-periode-row">
                            <input type="checkbox" aria-label="Saisir la période" checked={values.with_periode} onChange={e => update("with_periode", e.target.checked)} />
                            {values.with_periode
                                ? <input aria-label="Période" value={values.periode} placeholder="mm/aaaa" onChange={e => update("periode", e.target.value)} />
                                : <small>Cochez pour saisir</small>}
                        </div>
                        {err("periode")}
                    </div>
                    {field("Prime nette", "prime_net", "number")}
                    {field(tauxComm == null ? "Commission" : `Commission (${Math.round(tauxComm * 10000) / 100} % de la prime nette)`, "commission", "number")}
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
                {err("observation")}
            </section>
            )}

            {errorCount > 0 && <div className="pf-error" role="alert">Corrigez {errorCount > 1 ? `les ${errorCount} champs signalés` : "le champ signalé"} pour continuer.</div>}
            {error && <div className="pf-error">{error}</div>}
            {saved && !embedded && fleetDrafts.length > 0 && <div className="pf-error"><button type="button" className="pf-link-button" disabled={saving} onClick={retryFleet}>Réessayer les polices fictives refusées</button></div>}
            {message && <div className="pf-success">{message}{saved && values.flotte && fleetNumInt && <> · <button type="button" className="pf-link-button" onClick={() => setFleetOpen(true)}>Véhicules de la flotte</button></>}</div>}
            {fleetNumInt && fleetOpen && <FlotteDialog key={fleetNumInt} numInt={fleetNumInt} onClose={() => setFleetOpen(false)} />}

            {loading && <div className="pf-success">Recherche en cours…</div>}
            {isCreate && !saved && loadedExisting && step === 1 && (
                <div className="pf-error">Police existante du client : ses informations sont affichées, elle ne peut pas être modifiée ici. Pour en saisir une autre, choisissez « Nouvelle police ».</div>
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
                        <button type="button" className="pf-primary" onClick={goToReceipt} disabled={loadedExisting || saving || saved}>
                            {!values.flotte ? "Suivant : quittance →" : onReceiptReady ? "Suivant : sinistre →" : saving ? "Enregistrement..." : finalLabel}
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className="pf-primary"
                            disabled={saving || saved}
                        >
                            {saving ? "Enregistrement..." : saved ? "Enregistré" : finalLabel}
                        </button>
                    )}
                </footer>
            )}
    </form>

    {fleetEditor && (
      <PoliceFictiveWizard
        contract={{ code_client: values.code_client, nom_client: clientName || nomClient, num_police: values.num_police, effet: values.effet, expiration: values.expiration }}
        draft={fleetEditor.index < 0 ? null : fleetDrafts[fleetEditor.index]}
        otherPlates={fleetDrafts.filter((_, position) => position !== fleetEditor.index).map(item => item.num_imat)}
        onSubmit={storeFleetDraft}
        onClose={() => setFleetEditor(null)}
      />
    )}

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
