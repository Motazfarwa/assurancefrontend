import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { navigate } from '../../navigation';
import { createUser, deleteUser, listUsers, updateUser } from '../../services/adminUsersApi';
import './AdminUsersPage.css';

const EMPTY_FORM = { username: '', password: '', lieu: '', codeDepot: '01' };
const LIEUX = ['Tunis', 'Hammamet'];

export default function AdminUsersPage() {
  const { accessToken, user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await listUsers(accessToken));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  function startCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setNotice('');
    setError('');
    setDialogOpen(true);
  }

  function startEdit(item) {
    setEditing(item.username);
    setForm({ username: item.username, password: '', lieu: item.lieu ?? '', codeDepot: item.code_depot ?? '01' });
    setNotice('');
    setError('');
    setDialogOpen(true);
  }

  function closeDialog() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(false);
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editing) {
        const changes = { lieu: form.lieu || null };
        if (form.password) changes.password = form.password;
        await updateUser(accessToken, editing, changes);
        setNotice(`Utilisateur « ${editing} » modifié.`);
      } else {
        await createUser(accessToken, { username: form.username.trim(), password: form.password, lieu: form.lieu, codeDepot: form.codeDepot.trim() });
        setNotice(`Utilisateur « ${form.username.trim()} » créé.`);
      }
      closeDialog();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(item) {
    if (!window.confirm(`Supprimer l’utilisateur « ${item.username} » ?`)) return;
    setError('');
    setNotice('');
    try {
      await deleteUser(accessToken, item.username);
      setNotice(`Utilisateur « ${item.username} » supprimé.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const query = search.trim().toLocaleLowerCase();
  const visible = users.filter((item) => !query || `${item.username} ${item.lieu ?? ''}`.toLocaleLowerCase().includes(query));
  const adminCount = users.filter((item) => item.username.toLocaleLowerCase() === 'admin').length;

  return (
    <div className="admin-shell">
      <div className="admin-navbar" role="banner">
        <a className="admin-navbar-brand" href="/workspace" aria-label="Retour aux modules">
          <span className="admin-navbar-mark">A</span>
          <span><strong>Gestion Assurances</strong><small>Espace administrateur</small></span>
        </a>
        <ol className="admin-breadcrumb" aria-label="Fil d’Ariane">
          <li><button type="button" onClick={() => navigate('/workspace')}>Accueil</button></li>
          <li>Administration</li>
          <li aria-current="page">Utilisateurs</li>
        </ol>
        <div className="admin-navbar-user">
          <span className="admin-navbar-avatar">{user.name.charAt(0).toUpperCase()}</span>
          <span><strong>{user.name}</strong><small>Administrateur</small></span>
          <button type="button" onClick={logout}>Quitter</button>
        </div>
      </div>

      <div className="admin-body">
        <aside className="admin-sidebar">
          <nav aria-label="Navigation administrateur">
            <span className="admin-sidebar-title">ADMINISTRATION</span>
            <button type="button" className="is-current" aria-current="page">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></svg>Utilisateurs
            </button>
            <span className="admin-sidebar-title">ACCÈS RAPIDE</span>
            <button type="button" onClick={() => navigate('/workspace')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" /></svg>Modules
            </button>
            <button type="button" onClick={() => navigate('/clients')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 4 0 0 0 0 8z" /></svg>Gestion des clients
            </button>
          </nav>
        </aside>

        <main className="admin-users-page">
      <section className="admin-users-window">
        <header className="admin-users-header">
          <div><span>ADMINISTRATION</span><h1>Gestion des utilisateurs</h1><p>Connecté en tant que {user.name} · accès complet à tous les modules</p></div>
          <div className="admin-users-header-actions">
            <button type="button" className="admin-users-primary" onClick={startCreate}>+ Nouvel utilisateur</button>
          </div>
        </header>

        <div className="admin-users-stats">
          <div><strong>{users.length}</strong><span>Comptes</span></div>
          <div><strong>{adminCount}</strong><span>Administrateur</span></div>
          <div><strong>{users.length - adminCount}</strong><span>Utilisateurs</span></div>
        </div>

        {error && !dialogOpen && <p className="admin-users-message is-error" role="alert">{error}</p>}
        {notice && <p className="admin-users-message is-success" role="status">{notice}</p>}

        <section className="admin-users-list">
          <div className="admin-users-list-head">
            <h2>Comptes ({visible.length})</h2>
            <input type="search" placeholder="Rechercher un utilisateur" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {loading ? <p className="admin-users-empty">Chargement…</p> : visible.length === 0 ? <p className="admin-users-empty">Aucun utilisateur trouvé.</p> : (
            <div className="admin-users-table-wrap">
              <table>
                <thead><tr><th>Utilisateur</th><th>Lieu</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {visible.map((item) => {
                    const isAdminAccount = item.username.toLocaleLowerCase() === 'admin';
                    return (
                      <tr key={item.username}>
                        <td><span className="admin-users-user"><span className="admin-users-avatar">{item.username.charAt(0).toUpperCase()}</span><span>{item.username}{isAdminAccount && <em>Administrateur</em>}</span></span></td>
                        <td>{item.lieu ?? '—'}</td>
                        <td className="admin-users-row-actions">
                          <button type="button" className="admin-users-secondary" onClick={() => startEdit(item)}>Modifier</button>
                          <button type="button" className="admin-users-danger" disabled={isAdminAccount} onClick={() => remove(item)}>Supprimer</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>

      {dialogOpen && (
        <div className="admin-users-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
          <form className="admin-users-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="admin-user-title">
            <h2 id="admin-user-title">{editing ? `Modifier « ${editing} »` : 'Créer un compte'}</h2>
            <label><span>Nom d’utilisateur</span><input value={form.username} maxLength={25} required disabled={Boolean(editing)} autoFocus={!editing} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
            <label><span>{editing ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe'}</span><input type="password" value={form.password} required={!editing} autoComplete="new-password" autoFocus={Boolean(editing)} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            <label><span>Lieu (agence)</span><select value={form.lieu} onChange={(e) => setForm({ ...form, lieu: e.target.value })}><option value="">Non défini</option>{[...LIEUX, ...(form.lieu && !LIEUX.includes(form.lieu) ? [form.lieu] : [])].map((lieu) => <option key={lieu} value={lieu}>{lieu}</option>)}</select></label>
            {!editing && <label><span>Code dépôt</span><input value={form.codeDepot} maxLength={3} required onChange={(e) => setForm({ ...form, codeDepot: e.target.value })} /></label>}
            {error && <p className="admin-users-message is-error" role="alert">{error}</p>}
            <div className="admin-users-actions">
              <button type="button" className="admin-users-secondary" onClick={closeDialog}>Annuler</button>
              <button type="submit" className="admin-users-primary" disabled={saving}>{saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer le compte'}</button>
            </div>
          </form>
        </div>
      )}
        </main>
      </div>
    </div>
  );
}
