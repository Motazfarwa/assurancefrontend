import Brand from '../../components/Brand/Brand';
import LoginFooter from '../../components/LoginFooter/LoginFooter';
import LoginForm from '../../components/LoginForm/LoginForm';
import WelcomePanel from '../../components/WelcomePanel/WelcomePanel';
import './LoginPage.css';

export default function LoginPage() {
  return (
    <main className="login-page">
      <WelcomePanel />
      <section className="form-panel" aria-label="Connexion a votre espace">
        <div className="mobile-brand"><Brand /></div>
        <div className="form-wrap">
          <div className="form-heading">
            <span className="form-kicker">VOTRE ESPACE PROFESSIONNEL</span>
            <h2>Ravi de vous revoir</h2>
            <p>Connectez-vous pour acceder a votre espace de gestion.</p>
          </div>
          <LoginForm />
          <div className="help-note"><span className="help-icon" aria-hidden="true">?</span><span>Besoin d'aide ? <a href="mailto:support@assurance.tn">Contactez votre administrateur</a></span></div>
        </div>
        <LoginFooter />
      </section>
    </main>
  );
}
