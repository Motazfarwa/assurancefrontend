import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { connectRobot, disconnectRobot, getRobotStatus, newRobotQr, robotPairCode } from '../../services/whatsappRobotApi';
import './WhatsAppRobotPanel.css';

const LABELS = {
  connecte: 'Connecté',
  qr: 'En attente du scan',
  demarrage: 'Démarrage…',
  reconnexion: 'Reconnexion…',
  arrete: 'Non connecté',
  deconnecte: 'Non connecté',
  erreur: 'Erreur',
  indisponible: 'Indisponible',
};
const formatNumber = (digits) => (digits ? `+${digits}` : '');

// Administration → WhatsApp: the agency's WhatsApp number linked to the server (like WhatsApp Web). Once linked, the
// "Envoyer" of a mémoire de règlement sends the PDF and the message directly to the client's WhatsApp.
export default function WhatsAppRobotPanel() {
  const { accessToken } = useAuth();
  const [robot, setRobot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);

  const refresh = useCallback(() => getRobotStatus(accessToken).then((body) => { setRobot(body); setError(''); }).catch((failure) => setError(failure.message)), [accessToken]);
  useEffect(() => { refresh(); }, [refresh]);
  // While linking, the QR code changes every ~20 s: the panel follows it.
  const waiting = robot && ['qr', 'demarrage', 'reconnexion'].includes(robot.statut);
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [waiting, refresh]);
  useEffect(() => { if (robot?.statut === 'connecte') setCode(''); }, [robot?.statut]);

  async function act(action) {
    setBusy(true);
    setError('');
    try {
      setRobot(await action());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const askCode = (event) => {
    event.preventDefault();
    act(async () => { const body = await robotPairCode(accessToken, phone); setCode(body.code || ''); return body; });
  };

  const status = robot?.statut || 'arrete';
  const connected = status === 'connecte';
  return <section className="wa-robot" aria-labelledby="wa-robot-title">
    <header>
      <div>
        <h2 id="wa-robot-title">WhatsApp de l’agence</h2>
        <p>Le numéro connecté ici envoie directement les mémoires de règlement aux clients (bouton « Envoyer par WhatsApp »).</p>
      </div>
      <span className={`wa-robot-badge is-${connected ? 'ok' : ['erreur', 'indisponible'].includes(status) ? 'ko' : 'wait'}`}>{robot ? LABELS[status] || status : 'Chargement…'}</span>
    </header>

    {connected && <div className="wa-robot-body">
      <p>Numéro connecté : <b>{formatNumber(robot.numero) || 'numéro de l’agence'}</b>. Les mémoires partent de ce numéro.</p>
      <button type="button" className="wa-robot-danger" disabled={busy} onClick={() => setConfirmLogout(true)}>Déconnecter ce numéro</button>
    </div>}

    {status === 'qr' && <div className="wa-robot-body wa-robot-link">
      <div className="wa-robot-qr">
        {robot.qr_image && !robot.qr_expire ? <img src={robot.qr_image} alt="QR code à scanner avec WhatsApp" />
          : <p>{robot.qr_expire ? 'Le QR code a expiré.' : 'QR code en préparation…'}</p>}
        <button type="button" className="wa-robot-secondary" disabled={busy} onClick={() => act(() => newRobotQr(accessToken))}>Nouveau QR code</button>
      </div>
      <ol>
        <li>Sur le téléphone du numéro de l’agence, ouvrez <b>WhatsApp</b>.</li>
        <li>Menu <b>⋮</b> (ou Réglages) → <b>Appareils connectés</b> → <b>Connecter un appareil</b>.</li>
        <li>Scannez ce QR code. Le statut passe à « Connecté ».</li>
      </ol>
      <form className="wa-robot-code" onSubmit={askCode}>
        <span>Le téléphone est celui-ci et ne peut pas scanner ? Liez-le par numéro :</span>
        <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Numéro de l’agence, ex : 22 123 456" aria-label="Numéro WhatsApp de l’agence" />
        <button type="submit" className="wa-robot-secondary" disabled={busy || phone.replace(/\D/g, '').length < 8}>Obtenir un code</button>
        {code && <p>Dans WhatsApp → Appareils connectés → Connecter un appareil → <b>Connecter avec le numéro de téléphone</b>, saisissez : <b className="wa-robot-pair">{code}</b></p>}
      </form>
    </div>}

    {!connected && status !== 'qr' && <div className="wa-robot-body">
      {['demarrage', 'reconnexion'].includes(status)
        ? <p>Connexion à WhatsApp en cours…</p>
        : <p>Aucun numéro n’est connecté : les mémoires « Envoyer par WhatsApp » passent par le partage manuel. Connectez le numéro de l’agence (de préférence un numéro réservé à cet usage).</p>}
      {robot?.erreur && <p className="wa-robot-error">{robot.erreur}</p>}
      {!['demarrage', 'reconnexion', 'indisponible'].includes(status) && <button type="button" className="wa-robot-primary" disabled={busy} onClick={() => act(() => connectRobot(accessToken))}>{busy ? 'Démarrage…' : 'Connecter un numéro WhatsApp'}</button>}
    </div>}

    {error && <p className="wa-robot-error" role="alert">{error}</p>}
    <p className="wa-robot-note">Service non officiel (comme WhatsApp Web) : WhatsApp peut bloquer un numéro qui envoie beaucoup de messages à des personnes qui ne l’ont pas enregistré. Utilisez un numéro dédié.</p>

    {confirmLogout && <div className="wa-robot-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirmLogout(false); }}>
      <section className="wa-robot-dialog" role="alertdialog" aria-modal="true" aria-labelledby="wa-robot-logout">
        <h3 id="wa-robot-logout">Déconnecter le numéro {formatNumber(robot?.numero)} ?</h3>
        <p>Les mémoires ne seront plus envoyés directement par WhatsApp jusqu’à ce qu’un numéro soit de nouveau connecté.</p>
        <footer>
          <button type="button" className="wa-robot-secondary" onClick={() => setConfirmLogout(false)} disabled={busy} autoFocus>Annuler</button>
          <button type="button" className="wa-robot-danger" disabled={busy} onClick={async () => { await act(() => disconnectRobot(accessToken)); setConfirmLogout(false); }}>{busy ? 'Déconnexion…' : 'Déconnecter'}</button>
        </footer>
      </section>
    </div>}
  </section>;
}
