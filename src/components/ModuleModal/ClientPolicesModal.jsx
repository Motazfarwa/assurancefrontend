
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ClientPolicesModal.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://https://assurancebackend.onrender.com";

// Format dates in French
function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("fr-FR");
}

// Format monetary values
function formatMoney(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  return Number(value).toLocaleString("fr-TN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });
}

const EMPTY_FILTERS = {
  numero: "",
  code_client: "",
  code_branche: "",
  etat: "",
  num_imat: "",
  effet_du: "",
  effet_au: ""
};

function hasCriteria(filters) {
  return Object.values(filters).some((value) => value.trim());
}

// Validate the criteria and build the query string
function buildParams(filters) {
  const values = Object.fromEntries(
    Object.entries(filters).map(([key, value]) => [key, value.trim()])
  );

  if (!Object.values(values).some(Boolean)) {
    return { error: "Renseignez au moins un critère de recherche." };
  }

  if (values.numero) {
    if (!/^[0-9%]+$/.test(values.numero)) {
      return { error: "Utilisez uniquement des chiffres et le caractère % pour le numéro." };
    }
    if (values.numero.length < 4) {
      return { error: "Le numéro doit contenir au moins 4 caractères." };
    }
  }

  if (values.code_branche && !/^[0-9]{1,3}$/.test(values.code_branche)) {
    return { error: "Le code branche doit contenir 1 à 3 chiffres." };
  }

  if (values.effet_du && values.effet_au && values.effet_du > values.effet_au) {
    return { error: "La date de début doit précéder la date de fin." };
  }

  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  return { params };
}

export default function ClientPolicesModal({
  codeClient,
  onClose,
  onSelect
}) {
  const [polices, setPolices] = useState([]);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, code_client: codeClient || "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const controllerRef = useRef(null);
  const searchRef = useRef(null);

  // Focus search field when popup opens
  useEffect(() => {
    searchRef.current?.focus();

    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  // Close popup with Escape
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        onClose();
      }
    };

    window.addEventListener(
      "keydown",
      handleEscape,
      true
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleEscape,
        true
      );
    };
  }, [onClose]);

  // Search automatically shortly after the criteria stop changing
  useEffect(() => {
    if (!hasCriteria(filters) || buildParams(filters).error) {
      return;
    }

    const timer = setTimeout(() => {
      handleSearch(null, filters);
    }, 400);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Search policies using PostgreSQL LIKE
  async function handleSearch(event, filterValues) {
    event?.preventDefault();

    const { params, error: validationError } = buildParams(
      filterValues ?? filters
    );

    // Cancel previous request if any
    controllerRef.current?.abort();
    controllerRef.current = null;

    setPolices([]);
    setError("");
    setHasSearched(false);

    if (validationError) {
      setError(validationError);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/polices/search?${params.toString()}`,
        {
          method: "GET",
          credentials: "include",
          signal: controller.signal
        }
      );

      if (!response.ok) {
        const details = await response.json().catch(() => null);

        throw new Error(
          typeof details?.detail === "string"
            ? details.detail
            : `Erreur de recherche (${response.status})`
        );
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error(
          "Format de réponse invalide du serveur."
        );
      }

      if (!controller.signal.aborted) {
        setPolices(data);
        setHasSearched(true);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message);
      }
    } finally {
      if (controllerRef.current === controller) {
        setLoading(false);
        controllerRef.current = null;
      }
    }
  }

  // Clear old results whenever the search input changes
  function handleFilterChange(event) {
    controllerRef.current?.abort();
    controllerRef.current = null;

    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
    setPolices([]);
    setError("");
    setHasSearched(false);
    setLoading(false);
  }

  return createPortal(
    <div
      className="client-polices-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="client-polices-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Recherche des polices"
      >
        {/* Header */}
        <header className="client-polices-header">
          <div>
            <small>GESTION DES POLICES</small>
            <h2>Visualisation des polices</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
          >
            ×
          </button>
        </header>

        <div className="client-polices-content">

          {/* Search area */}
          <div className="client-polices-tools">
        

            <form
              className="client-polices-search-form"
              onSubmit={handleSearch}
            >
              <input
                ref={searchRef}
                type="search"
                name="numero"
                placeholder="Ex : 2026011%"
                value={filters.numero}
                onChange={handleFilterChange}
                maxLength={15}
              />

              <button
                type="submit"
                disabled={loading}
              >
                {loading ? "Recherche..." : "Rechercher"}
              </button>
            </form>
          </div>

          {/* Additional filters */}
          <div className="client-polices-filters">
            <label>
              <span>Code client</span>
              <input
                name="code_client"
                value={filters.code_client}
                onChange={handleFilterChange}
                maxLength={8}
              />
            </label>

            <label>
              <span>Code branche</span>
              <input
                name="code_branche"
                value={filters.code_branche}
                onChange={handleFilterChange}
                maxLength={3}
                inputMode="numeric"
                placeholder="Ex : 011"
              />
            </label>

            <label>
              <span>État</span>
              <input
                name="etat"
                value={filters.etat}
                onChange={handleFilterChange}
                maxLength={10}
                placeholder="Ex : AN"
              />
            </label>

            <label>
              <span>Immatriculation</span>
              <input
                name="num_imat"
                value={filters.num_imat}
                onChange={handleFilterChange}
                maxLength={12}
              />
            </label>

            <label>
              <span>Date effet du</span>
              <input
                type="date"
                name="effet_du"
                value={filters.effet_du}
                onChange={handleFilterChange}
              />
            </label>

            <label>
              <span>Date effet au</span>
              <input
                type="date"
                name="effet_au"
                value={filters.effet_au}
                onChange={handleFilterChange}
              />
            </label>

            <button
              type="button"
              className="client-polices-reset"
              onClick={() => {
                controllerRef.current?.abort();
                setFilters(EMPTY_FILTERS);
                setPolices([]);
                setError("");
                setHasSearched(false);
                setLoading(false);
              }}
            >
              Réinitialiser
            </button>
          </div>


          {/* Errors */}
          {error && (
            <p
              role="alert"
              className="client-polices-error"
            >
              {error}
            </p>
          )}

          {/* Results table */}
          <div className="client-polices-table-wrap">
            <table className="client-polices-table">
              <thead>
                <tr>
                  <th>N° Police</th>
                  <th>Code client</th>
                  <th>Code branche</th>
                  <th>Nom branche</th>
                  <th>Date effet</th>
                  <th>Expiration</th>
                  <th>État</th>
                  <th>Prime nette</th>
                  <th>Immatriculation</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="empty-row">
                      Recherche en cours...
                    </td>
                  </tr>
                ) : !hasSearched ? (
                  <tr>
                    <td colSpan={10} className="empty-row">
                      Saisissez au moins un critère (numéro de
                      police, client, branche, état…) puis
                      cliquez sur Rechercher.
                    </td>
                  </tr>
                ) : polices.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="empty-row">
                      Aucune police trouvée pour cette recherche.
                    </td>
                  </tr>
                ) : (
                  polices.map((police) => (
                    <tr key={police.num_int}>
                      <td>
                        <strong>
                          {police.num_police || "—"}
                        </strong>
                      </td>

                      <td>
                        {police.code_client || "—"}
                      </td>

                      <td>
                        {police.code_branche || "—"}
                      </td>

                      <td>
                        {police.nom_branche || "—"}
                      </td>

                      <td>
                        {formatDate(police.effet)}
                      </td>

                      <td>
                        {formatDate(police.expiration)}
                      </td>

                      <td>
                        {police.etat || "—"}
                      </td>

                      <td>
                        {formatMoney(police.prime_net)}
                      </td>

                      <td>
                        {police.num_imat || "—"}
                      </td>

                      <td>
                        <button
                          type="button"
                          className="client-polices-select"
                          onClick={() => onSelect?.(police)}
                        >
                          Sélectionner
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Result counter */}
          {hasSearched && !loading && (
            <p className="client-polices-count">
              {polices.length} police(s) trouvée(s)
              {polices.length === 100 &&
                " — résultats limités à 100"}
            </p>
          )}
        </div>

        {/* Footer */}
        <footer className="client-polices-footer">
          <button type="button" onClick={onClose}>
            Fermer
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
