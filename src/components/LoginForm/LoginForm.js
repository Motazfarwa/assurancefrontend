import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { listLoginUsers } from '../../services/authApi';

const ADMIN_USER = 'Admin';

export default function LoginForm() {
  const { login } = useAuth();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [remember, setRemember] = useState(false);
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agency, setAgency] = useState('Tunis');
  const [username, setUsername] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState('');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  function toggleAdmin() {
    setIsAdmin(!isAdmin);
    setUsername(isAdmin ? '' : ADMIN_USER);
    setPassword('');
    setNotice('');
  }

  useEffect(() => {
    let active = true;
    setUsername('');
    setIsAdmin(false);
    setPassword('');
    setUsers([]);
    setLoadingUsers(true);
    listLoginUsers(agency)
      .then((items) => { if (active) setUsers(items); })
      .catch((error) => { if (active) setNotice(error.message || 'Impossible de charger les utilisateurs.'); })
      .finally(() => { if (active) setLoadingUsers(false); });
    return () => { active = false; };
  }, [agency]);

  async function handleSubmit(event) {
    event.preventDefault();
    setNotice('');
    setIsSubmitting(true);
    try {
      const form = event.currentTarget;
      await login({
        username,
        password,
        remember,
      });
      window.location.assign('/workspace');
    } catch (error) {
      setNotice(error.message || 'Connexion impossible. Verifiez vos identifiants et reessayez.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="select-row">
        <label className="field select-field"><span>Agence</span><span className="select-wrap"><select value={agency} onChange={(event) => { setAgency(event.target.value); setNotice(''); }} aria-label="Agence"><option value="Tunis">Tunis</option><option value="Hammamet">Hammamet</option></select><span className="chevron" /></span></label>
        <div className="field select-field"><span aria-hidden="true">&nbsp;</span><button type="button" className={`admin-toggle${isAdmin ? ' is-active' : ''}`} aria-pressed={isAdmin} onClick={toggleAdmin}>Admin</button></div>
      </div>
      <label className="field credentials-field"><span>Nom d'utilisateur</span><span className="input-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20v-1.5a7 7 0 0 1 14 0V20"/></svg><select className="username-select" name="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required disabled={loadingUsers}><option value="">{loadingUsers ? 'Chargement des utilisateurs…' : users.length ? 'Sélectionner un utilisateur' : 'Aucun utilisateur pour cette agence'}</option>{(users.includes(ADMIN_USER) || !isAdmin ? users : [ADMIN_USER, ...users]).map((user) => <option key={user} value={user}>{user}</option>)}</select></span></label>
      <label className="field credentials-field"><span>Mot de passe</span><span className="input-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10" width="15" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><input type={passwordVisible ? 'text' : 'password'} name="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Saisissez votre mot de passe" autoComplete="current-password" maxLength="256" required /><button className="password-toggle" type="button" onClick={() => setPasswordVisible(!passwordVisible)} aria-label={passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{passwordVisible ? <svg viewBox="0 0 24 24"><path d="M3 3 21 21M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.2 0 9 5.5 9 7s-1.3 3.4-3.4 4.8M6.2 6.3C3.5 8 3 10.9 3 12c0 1.5 3.8 7 9 7 1 0 2-.2 2.8-.6"/></svg> : <svg viewBox="0 0 24 24"><path d="M2.5 12s3.2-6 9.5-6 9.5 6 9.5 6-3.2 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>}</button></span></label>
      <button className="submit-button" type="submit" disabled={isSubmitting}><span>{isSubmitting ? 'Connexion en cours...' : 'Se connecter'}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
      {notice && <p className="form-notice form-error" role="alert">{notice}</p>}
    </form>
  );
}
