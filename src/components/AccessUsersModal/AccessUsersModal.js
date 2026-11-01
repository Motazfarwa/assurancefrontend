import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { INSURANCE_MODULES, MODULE_CATEGORIES } from '../../data/insuranceModules';
import { listAccess, saveAccess } from '../../services/accessApi';
import { listUsers } from '../../services/adminUsersApi';
import { showToast } from '../../services/toast';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../CompanyManagementModal/CompanyManagementModal.css';
import './AccessUsersModal.css';

const ALL = INSURANCE_MODULES.map((module) => module.id);
const isAdminName = (name) => String(name).trim().toLowerCase() === 'admin';

// Access users (administrator): for each user, the modules shown in their workspace.
// "Tous les modules" keeps the user unrestricted, including modules added later.
export default function AccessUsersModal({ onClose }) {
  const { accessToken } = useAuth();
  const [users, setUsers] = useState([]);
  const [access, setAccess] = useState({}); // username -> list of module ids (absent: every module)
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState(null); // null: every module, otherwise a Set of module ids
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([listUsers(accessToken), listAccess(accessToken)])
      .then(([items, rows]) => {
        const employees = items.filter((item) => !isAdminName(item.username));
        setUsers(employees);
        setAccess(Object.fromEntries(rows.map((row) => [row.username, row.modules])));
        if (employees[0]) pick(employees[0].username, Object.fromEntries(rows.map((row) => [row.username, row.modules])));
      })
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(username, table = access) {
    setSelected(username);
    setDraft(table[username] ? new Set(table[username]) : null);
    setError('');
  }

  const chosen = draft || new Set(ALL);
  const dirty = useMemo(() => {
    const saved = access[selected];
    if (!saved || !draft) return Boolean(saved) !== Boolean(draft);
    return saved.length !== draft.size || saved.some((id) => !draft.has(id));
  }, [access, selected, draft]);

  function toggle(id) {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id); else next.add(id);
    setDraft(next);
  }
  function toggleCategory(ids, on) {
    const next = new Set(chosen);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    setDraft(next);
  }

  async function save() {
    setSaving(true); setError('');
    const modules = draft ? [...draft] : null;
    try {
      await saveAccess(accessToken, selected, modules);
      setAccess((current) => {
        const next = { ...current };
        if (modules) next[selected] = modules; else delete next[selected];
        return next;
      });
      showToast(`Accès de ${selected} enregistrés avec succès.`);
    } catch (saveError) { setError(saveError.message); }
    finally { setSaving(false); }
  }

  const shownUsers = users.filter((item) => item.username.toLowerCase().includes(search.trim().toLowerCase()));

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="catalog-modal acc-modal" role="dialog" aria-modal="true" aria-labelledby="access-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali · Siège</small></span></div><div className="expert-title"><span>ADMINISTRATION</span><h2 id="access-title">Access users</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      {loading ? <div className="catalog-empty">Chargement des utilisateurs…</div> : <div className="acc-body">
        <aside className="acc-users">
          <input className="acc-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un utilisateur…" aria-label="Rechercher un utilisateur" />
          <div className="acc-user-list">
            {shownUsers.map((item) => <button type="button" key={item.username} className={`acc-user${item.username === selected ? ' is-current' : ''}`} onClick={() => pick(item.username)} disabled={saving}>
              <strong>{item.username}</strong><small>{access[item.username] ? `${access[item.username].length} module(s)` : 'Tous les modules'}{item.lieu ? ` · ${item.lieu}` : ''}</small>
            </button>)}
            {!shownUsers.length && <p className="acc-empty">Aucun utilisateur.</p>}
          </div>
        </aside>
        <div className="acc-modules">
          {!selected ? <p className="acc-empty">Choisissez un utilisateur.</p> : <>
            <div className="acc-head">
              <div><span>MODULES VISIBLES PAR</span><h3>{selected}</h3></div>
              <label className="catalog-check"><input type="checkbox" checked={!draft} onChange={(event) => setDraft(event.target.checked ? null : new Set(ALL))} />Tous les modules (y compris les futurs)</label>
            </div>
            {MODULE_CATEGORIES.map((category) => {
              const modules = INSURANCE_MODULES.filter((module) => module.category === category.id);
              if (!modules.length) return null;
              const ids = modules.map((module) => module.id);
              const count = ids.filter((id) => chosen.has(id)).length;
              return <fieldset key={category.id} className="acc-category" disabled={!draft}>
                <legend><label><input type="checkbox" checked={count === ids.length} ref={(box) => { if (box) box.indeterminate = count > 0 && count < ids.length; }} onChange={(event) => toggleCategory(ids, event.target.checked)} />{category.label}</label><small>{count} / {ids.length}</small></legend>
                <div className="acc-grid">{modules.map((module) => <label key={module.id} className={`acc-module${chosen.has(module.id) ? ' is-on' : ''}`} title={module.description}>
                  <input type="checkbox" checked={chosen.has(module.id)} onChange={() => toggle(module.id)} /><b>{module.id}</b><span>{module.title}</span>{module.adminOnly && <em>admin</em>}
                </label>)}</div>
              </fieldset>;
            })}
          </>}
        </div>
      </div>}
      {error && <div className="expert-error catalog-message cmp-message" role="alert">{error}</div>}
      <footer className="acc-footer">
        <span>{selected ? (draft ? `${draft.size} module(s) sur ${ALL.length}` : 'Accès à tous les modules') : ''}</span>
        <div><button type="button" className="expert-cancel" onClick={onClose} disabled={saving}>Fermer</button><button type="button" className="expert-submit" onClick={save} disabled={saving || !selected || !dirty}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button></div>
      </footer>
    </section>
  </div>;
}
