import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../auth/AuthContext";
import "./ClientPolicesModal.css";

const API_URL =
  import.meta.env.VITE_API_URL || "https://assurancebackend.onrender.com";

// Same filters as the legacy "Liste des polices" window; "En vigueur" is the default.
const STATUTS = [
  { value: "tous", label: "Tous", title: "Toutes les polices" },
  { value: "vigueur", label: "En vigueur", title: "Les polices en vigueur" },
  { value: "susp", label: "Susp. / Rés.", title: "Les polices suspendues ou résiliées" },
  { value: "expirees", label: "Expirées", title: "Les polices expirées" }
];

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("fr-FR");
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "";
  return Number(value).toLocaleString("fr-TN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });
}

const PAGE_SIZE = 50;

export default function ClientPolicesModal({ codeClient, onClose, onSelect }) {
  const { accessToken } = useAuth();
  const [code, setCode] = useState(codeClient || "");
  const [statut, setStatut] = useState("tous");
  const [nomClient, setNomClient] = useState("");
  const [polices, setPolices] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const codeRef = useRef(null);

  useEffect(() => {
    codeRef.current?.focus();
  }, []);

  // Close popup with Escape
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [onClose]);

  // Client name for the typed code
  useEffect(() => {
    const value = code.trim();
    if (!value) {
      setNomClient("");
      return undefined;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${API_URL}/api/clients/${encodeURIComponent(value)}`, {
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
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [code, accessToken]);

  // Policies of the client, filtered by status (re-run whenever the code or the filter changes)
  useEffect(() => {
    const value = code.trim();
    setSelected(null);
    setError("");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        // Without a client code the filter applies to every client's policies.
        const params = new URLSearchParams({ statut, page: String(page), page_size: String(PAGE_SIZE) });
        if (value) params.set("code_client", value);
        const response = await fetch(`${API_URL}/api/polices/search?${params}`, {
          credentials: "include",
          signal: controller.signal
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            typeof data?.detail === "string" ? data.detail : `Erreur de recherche (${response.status})`
          );
        }
        if (!Array.isArray(data?.items)) throw new Error("Format de réponse invalide du serveur.");
        setPolices(data.items);
        setTotal(Number(data.total) || 0);
        setSearched(true);
      } catch (err) {
        if (err.name !== "AbortError") {
          setPolices([]);
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [code, statut, page]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const current = STATUTS.find((item) => item.value === statut);

  return createPortal(
    <div
      className="client-polices-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="client-polices-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Liste des polices du client"
      >
        <header className="client-polices-header">
          <div>
            <small>GESTION DES POLICES</small>
            <h2>{current.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer">×</button>
        </header>

        <div className="client-polices-content">
          <div className="client-polices-client">
            <label>
              <span>Code client</span>
              <input
                ref={codeRef}
                value={code}
                onChange={(event) => { setCode(event.target.value); setPage(1); }}
                maxLength={8}
                placeholder="Ex : 4909"
              />
            </label>
            <label className="client-polices-client-name">
              <span>Nom client</span>
              <input value={nomClient} readOnly placeholder="Détecté automatiquement" />
            </label>
          </div>

          {error && <p role="alert" className="client-polices-error">{error}</p>}

          <div className="client-polices-list">
            <div className="client-polices-list-title">Liste des polices client</div>
            <div className="client-polices-table-wrap">
              <table className="client-polices-table">
                <thead>
                  <tr>
                    <th>N° Police</th>
                    <th>Effet</th>
                    <th>Échéance</th>
                    <th>Expiration</th>
                    <th className="is-number">Comm.</th>
                    <th className="is-number">P. Total</th>
                    <th>Observation</th>
                    <th>Risque</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="empty-row">Recherche en cours...</td></tr>
                  ) : searched && polices.length === 0 ? (
                    <tr><td colSpan={8} className="empty-row">Aucune police pour ce filtre.</td></tr>
                  ) : (
                    polices.map((police) => (
                      <tr
                        key={police.num_int}
                        className={selected?.num_int === police.num_int ? "is-selected" : undefined}
                        onClick={() => setSelected(police)}
                        onDoubleClick={() => onSelect?.(police)}
                      >
                        <td><strong>{police.num_police || ""}</strong></td>
                        <td>{formatDate(police.effet)}</td>
                        <td>{police.echeance || ""}</td>
                        <td>{formatDate(police.expiration)}</td>
                        <td className="is-number">{formatMoney(police.commission)}</td>
                        <td className="is-number">{formatMoney(police.prime_total)}</td>
                        <td>{police.observation || ""}</td>
                        <td>{police.risque || ""}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="client-polices-statuts" role="group" aria-label="Filtre des polices">
            {STATUTS.map((item) => (
              <button
                type="button"
                key={item.value}
                className={statut === item.value ? "is-active" : undefined}
                onClick={() => { setStatut(item.value); setPage(1); }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <footer className="client-polices-footer">
          <div className="client-polices-pager">
            <span>{searched && !loading ? `${total.toLocaleString("fr-FR")} police(s)` : ""}</span>
            <button type="button" onClick={() => setPage(1)} disabled={page <= 1 || loading} aria-label="Première page">«</button>
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} aria-label="Page précédente">‹</button>
            <strong>Page {page} / {pageCount}</strong>
            <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount || loading} aria-label="Page suivante">›</button>
            <button type="button" onClick={() => setPage(pageCount)} disabled={page >= pageCount || loading} aria-label="Dernière page">»</button>
          </div>
          <div>
            <button
              type="button"
              className="client-polices-primary"
              disabled={!selected}
              onClick={() => selected && onSelect?.(selected)}
            >
              Sélectionner
            </button>
            <button type="button" onClick={onClose}>Fermer</button>
          </div>
        </footer>
      </section>
    </div>,
    document.body
  );
}
