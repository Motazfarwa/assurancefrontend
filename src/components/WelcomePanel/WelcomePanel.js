import Brand from '../Brand/Brand';

export default function WelcomePanel() {
  return (
    <section className="welcome-panel" aria-label="Presentation de votre espace assurance">
      <div className="welcome-top">
        <Brand />
        <span className="secure-label"><span className="secure-dot" /> Espace securise</span>
      </div>
      <div className="welcome-copy">
        <span className="eyebrow"><span /> VOTRE AGENCE, EN TOUTE SIMPLICITE</span>
        <h1>Assurance<br />Jemmali <em>ici</em></h1>
        <p>Retrouvez votre espace de gestion et prenez soin de l'essentiel, en toute confiance.</p>
        <div className="welcome-rule" />
        <div className="trust-row">
          <span className="trust-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 3 20 6v5.7c0 4.8-3.3 8.3-8 10.2-4.7-1.9-8-5.4-8-10.2V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>
          </span>
          <span><strong>Vos donnees sont protegees</strong><small>Un espace pense pour votre tranquillite</small></span>
        </div>
      </div>
      <div className="welcome-footer"><span>ASSURANCE JEMMALI</span><span>·</span><span>A VOS COTES, CHAQUE JOUR</span></div>
      <div className="panel-decoration" aria-hidden="true" />
    </section>
  );
}
