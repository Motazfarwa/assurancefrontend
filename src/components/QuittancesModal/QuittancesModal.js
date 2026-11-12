import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { searchRecords, updateClientRecord } from '../../services/clientRecordsApi';
import { isBordereauCompany, listCompanies } from '../../services/companyApi';
import { EditRecordDialog, RECEIPT_FIELDS, RecordsDialog } from '../../pages/ClientPreview/ClientPreviewPage';

const COLUMNS = [
  ['num_quittance', 'N° quittance'], ['num_police', 'N° police'], ['code_client', 'Code client'], ['nom_client', 'Nom client'],
  ['nom_compagnie', 'Compagnie'], ['echeance', 'Échéance'], ['tc', 'TC'], ['Periode', 'Période'], ['prime_total', 'Prime totale'],
  ['commission', 'Commission'], ['solde_quittance', 'Solde'], ['Date_Reglement', 'Date Reg'],
];
const STATUSES = [['tous', 'Toutes'], ['impayees', 'Impayées'], ['reglees', 'Réglées']];
const iso = (day) => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
// By default the quittances due this month.
const blankFilters = () => {
  const now = new Date();
  return {
    code_client: '', nom_client: '', num_police: '', num_quittance: '', code_compagnie: '', date_saisie: '', reglement: 'tous',
    date_min: iso(new Date(now.getFullYear(), now.getMonth(), 1)), date_max: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};
// A quittance searched by its number, its police, its client or its date de saisie is found whatever its échéance:
// typing one of them empties the échéance dates of the month (put back once they are all emptied again).
const SEARCH_KEYS = ['num_quittance', 'num_police', 'code_client', 'nom_client', 'date_saisie'];
const searching = (values) => SEARCH_KEYS.some((key) => String(values[key] || '').trim());
export function nextFilters(current, key, value, monthDates) {
  const next = { ...current, [key]: value };
  if (key === 'date_min' || key === 'date_max') return { ...next, autoDates: false };
  if (!SEARCH_KEYS.includes(key)) return next;
  if (searching(next) && !current.autoDates && current.date_min === monthDates.date_min && current.date_max === monthDates.date_max) {
    return { ...next, date_min: '', date_max: '', autoDates: true };
  }
  if (!searching(next) && current.autoDates) return { ...next, ...monthDates, autoDates: false };
  return next;
}
// Only the administrator modifies a quittance; another user may only correct a commission already set.
const hasCommission = (record) => Number(record?.commission || 0) !== 0;

// Module "Gestion des quittances": the quittances of every client, found by client, police, quittance, company,
// échéance or date de saisie, like the policies window of Gestion des polices; a row opens its modification.
export default function QuittancesModal({ moduleId, onClose }) {
  const { accessToken, user } = useAuth();
  const [filters, setFilters] = useState(blankFilters);
  const [companies, setCompanies] = useState([]);
  const [state, setState] = useState({ loading: true, error: '', records: [] });
  const [editing, setEditing] = useState(null);
  const latest = useRef(0); // only the answer of the last search is shown (an older, slower one is dropped)

  useEffect(() => {
    let active = true;
    listCompanies(accessToken)
      // Without STAR, MAE, SALIM, EUROP ASSISTANCE and EL AMANA TAKAFUL, as in Réception comptant.
      .then((result) => { if (active) setCompanies((Array.isArray(result) ? result : result.items || []).filter(isBordereauCompany)); })
      .catch(() => {});
    return () => { active = false; };
  }, [accessToken]);

  async function load(current = filters) {
    const request = latest.current + 1;
    latest.current = request;
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    const { autoDates, ...criteria } = current;
    try {
      const records = await searchRecords(accessToken, 'receipts', { ...criteria, limit: 1000 });
      if (latest.current === request) setState({ loading: false, error: '', records });
    } catch (error) {
      if (latest.current === request) setState({ loading: false, error: error.message, records: [] });
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => load(filters), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const canEdit = (record) => Boolean(user?.isAdmin) || hasCommission(record);
  const fields = user?.isAdmin ? RECEIPT_FIELDS : RECEIPT_FIELDS.filter((field) => field.key === 'commission');

  async function save(changes) {
    await updateClientRecord(accessToken, 'receipts', editing.num_quittance, changes);
    setEditing(null);
    await load();
  }

  return <>
    <RecordsDialog
      wide
      className="quittances-dialog"
      kicker={`PRODUCTION · MODULE ${moduleId}`}
      title="Gestion des quittances"
      columns={COLUMNS}
      {...state}
      filters={[
        { key: 'num_quittance', label: 'N° quittance', value: filters.num_quittance, placeholder: 'Ex : 2026…', maxLength: 30 },
        { key: 'num_police', label: 'N° police', value: filters.num_police, placeholder: 'Ex : 0522…', maxLength: 30 },
        { key: 'code_client', label: 'Code client', value: filters.code_client, placeholder: 'Tous', maxLength: 8 },
        { key: 'nom_client', label: 'Nom client', value: filters.nom_client, placeholder: 'Nom ou prénom' },
        { key: 'code_compagnie', label: 'Compagnie', type: 'select', value: filters.code_compagnie, options: [['', 'Toutes'], ...companies.map((item) => [String(item.code_compagnie), item.nom_compagnie])] },
        { key: 'date_min', label: 'Échéance du', type: 'date', value: filters.date_min },
        { key: 'date_max', label: 'au', type: 'date', value: filters.date_max },
        { key: 'date_saisie', label: 'Date saisie', type: 'date', value: filters.date_saisie },
      ]}
      onFilterChange={(key, value) => setFilters((current) => nextFilters(current, key, value, (({ date_min, date_max }) => ({ date_min, date_max }))(blankFilters())))}
      statusTabs={{ options: STATUSES, value: filters.reglement, onChange: (reglement) => setFilters((current) => ({ ...current, reglement })) }}
      onRowClick={(record) => { if (canEdit(record)) setEditing(record); }}
      onClose={onClose}
      actions={(record) => canEdit(record) && <button type="button" onClick={() => setEditing(record)}>{user?.isAdmin ? 'Modifier' : 'Modifier la commission'}</button>}
    />
    {editing && <EditRecordDialog key={editing.num_quittance} kicker={`MODULE ${moduleId}`} title={`Modifier la quittance ${editing.num_quittance}`} fields={fields} record={editing} onSave={save} onClose={() => setEditing(null)} />}
  </>;
}
