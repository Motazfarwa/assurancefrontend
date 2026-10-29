import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { hasPermission, ROLES } from '../../auth/permissions';
import { INSURANCE_MODULES, MODULE_CATEGORIES } from '../../data/insuranceModules';
import { navigate } from '../../navigation';
import ModuleModal from '../ModuleModal/ModuleModal';
import ExpertManagementModal from '../ExpertManagementModal/ExpertManagementModal';
import CompanyManagementModal from '../CompanyManagementModal/CompanyManagementModal';
import BranchManagementModal from '../BranchManagementModal/BranchManagementModal';
import DocumentEntryModal from '../DocumentEntryModal/DocumentEntryModal';
import AgencyUnpaidModal from '../AgencyUnpaidModal/AgencyUnpaidModal';
import AcompteModal from '../AcompteModal/AcompteModal';
import BordereauReceptionModal from '../BordereauModal/BordereauReceptionModal';
import BordereauConfrontationModal from '../BordereauModal/BordereauConfrontationModal';
import BordereauFusionModal from '../BordereauModal/BordereauFusionModal';
import ChequeModal from '../ChequeModal/ChequeModal';
import RecetteModal from '../RecetteModal/RecetteModal';
import ReglementClientModal from '../ReglementClientModal/ReglementClientModal';
import SinistreModal from '../SinistreModal/SinistreModal';
import SyncStatus from '../SyncStatus/SyncStatus';
import './ModulesWorkspace.css';

export default function ModulesWorkspace() {
  const { user, logout } = useAuth();
  const [activeCategory, setActiveCategory] = useState('production');
  const [search, setSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState(null);
  const [showExpertModal, setShowExpertModal] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showUnpaidModal, setShowUnpaidModal] = useState(false);
  const [acompteModule, setAcompteModule] = useState(null);
  const [bordereauModal, setBordereauModal] = useState(null);
  const [showChequeModal, setShowChequeModal] = useState(false);
  const [showRecetteModal, setShowRecetteModal] = useState(false);
  const [reglementClientModule, setReglementClientModule] = useState(null);
  const [sinistreModule, setSinistreModule] = useState(null);
  const [activeModuleId, setActiveModuleId] = useState(null);
  const visibleModules = useMemo(
    () => user.role ? INSURANCE_MODULES.filter((module) => hasPermission(user, module.permission)) : INSURANCE_MODULES,
    [user],
  );
  // A category without any module yet (e.g. Comptabilite) stays listed; otherwise it needs a module the user may open.
  const categories = MODULE_CATEGORIES.filter((category) => visibleModules.some((module) => module.category === category.id)
    || !INSURANCE_MODULES.some((module) => module.category === category.id));
  const filteredModules = visibleModules.filter((module) => {
    const matchesCategory = activeCategory === 'all' || module.category === activeCategory;
    const query = search.trim().toLocaleLowerCase();
    const matchesSearch = !query || `${module.id} ${module.title} ${module.description}`.toLocaleLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });
  const selectedCategory = MODULE_CATEGORIES.find((category) => category.id === selectedModule?.category);
  const currentCategory = MODULE_CATEGORIES.find((category) => category.id === activeCategory);

  function openModule(module) {
    if (module.id === '100' && module.form === 'client') {
      navigate('/clients');
      return;
    }
    if (module.form === 'expert') {
      setActiveModuleId(module.id);
      setShowExpertModal(true);
      return;
    }
    if (module.form === 'companies' || module.form === 'branches') {
      setActiveModuleId(module.id);
      setShowCompanyModal(module.form === 'companies');
      setShowBranchModal(module.form === 'branches');
      return;
    }
    if (module.form === 'documents') {
      setActiveModuleId(module.id);
      setShowDocumentModal(true);
      return;
    }
    if (['bordereau-reception', 'bordereau-comptant', 'bordereau-confrontation', 'bordereau-fusion'].includes(module.form)) {
      setActiveModuleId(module.id);
      setBordereauModal(module.form);
      return;
    }
    if (module.form === 'cheques') {
      setActiveModuleId(module.id);
      setShowChequeModal(true);
      return;
    }
    if (module.form === 'sinistre' || module.form === 'sinistre-new') {
      setActiveModuleId(module.id);
      setSinistreModule(module);
      return;
    }
    if (module.form === 'recette') {
      setActiveModuleId(module.id);
      setShowRecetteModal(true);
      return;
    }
    if (module.form === 'reglement-client') {
      setActiveModuleId(module.id);
      setReglementClientModule(module);
      return;
    }
    if (module.form === 'unpaid-agency') {
      setActiveModuleId(module.id);
      setShowUnpaidModal(true);
      return;
    }
    if (module.form === 'acompte') {
      setActiveModuleId(module.id);
      setAcompteModule(module);
      return;
    }
    setActiveModuleId(module.id);
    setSelectedModule(module);
  }

  return (
    <main className="workspace-shell">
      <section className="workspace-window" aria-label="Gestion Assurance">
        <header className="workspace-topbar">
          <a className="workspace-brand" href="/workspace"><span className="workspace-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>ESPACE PROFESSIONNEL</small></span></a>
          <div className="workspace-company"><div><strong>Assurance Jemmali</strong></div><SyncStatus /></div>
          <div className="workspace-user"><span className="workspace-avatar">{user.name.slice(0, 1).toUpperCase()}</span><span className="workspace-user-copy"><strong>{user.name}</strong><small>{user.role ? (user.role === ROLES.ADMIN ? 'Administrateur' : 'Membre') : user.lieu ? `Agence ${user.lieu}` : 'Compte authentifie'}</small></span>{user.isAdmin && <button type="button" className="workspace-logout" onClick={() => navigate('/admin/users')}>Utilisateurs</button>}<button type="button" className="workspace-logout" onClick={logout}>Quitter <span aria-hidden="true">↗</span></button></div>
        </header>

        <fieldset className="nature-selector">
          <legend>Nature du programme</legend>
          <div className="nature-options">
            {categories.map((category) => {
              const count = visibleModules.filter((module) => module.category === category.id).length;
              return <label className={`nature-option ${activeCategory === category.id ? 'is-active' : ''}`} key={category.id}>
                <input type="radio" name="program-nature" value={category.id} checked={activeCategory === category.id} onChange={() => { setActiveCategory(category.id); setSearch(''); }} />
                <span className="nature-option-icon">{category.icon}</span><span>{category.label}</span><b>{count}</b>
              </label>;
            })}
            <label className={`nature-option nature-all ${activeCategory === 'all' ? 'is-active' : ''}`}>
              <input type="radio" name="program-nature" value="all" checked={activeCategory === 'all'} onChange={() => { setActiveCategory('all'); setSearch(''); }} />
              <span className="nature-option-icon">ALL</span><span>Tous</span><b>{visibleModules.length}</b>
            </label>
          </div>
        </fieldset>

        <div className="workspace-workbench">
          <aside className="workspace-intro">
            <div className="workspace-intro-copy"><span>VOTRE ESPACE DE GESTION</span><h1>Bonjour,<br /><em>{user.name}</em></h1><p>Selectionnez un programme pour acceder rapidement aux fonctionnalites de votre agence.</p></div>
            <svg className="workspace-illustration" viewBox="0 0 520 440" role="img" aria-label="Illustration moderne d'un espace professionnel">
              <defs><linearGradient id="building-glass" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#e9faf8"/><stop offset="1" stopColor="#a6d9d2"/></linearGradient><linearGradient id="floor-glow" x1="0" x2="1"><stop offset="0" stopColor="#64bdad" stopOpacity="0"/><stop offset=".52" stopColor="#64bdad" stopOpacity=".36"/><stop offset="1" stopColor="#64bdad" stopOpacity="0"/></linearGradient></defs>
              <path d="M69 380 157 60l76-28v348M233 31l118 47v302M351 78l106 40v262" fill="url(#building-glass)" stroke="#74b9b0" strokeWidth="2"/>
              <path d="M87 315h360M103 255h342M121 195h323M138 135h303M160 77v291M204 58v314M278 50v320M320 66v300M388 91v279M424 105v266" fill="none" stroke="#fff" strokeWidth="5" opacity=".9"/>
              <path d="M36 370h440M20 392h478M92 414h352" fill="none" stroke="url(#floor-glow)" strokeWidth="8" strokeLinecap="round"/>
              <circle cx="420" cy="73" r="22" fill="#fff" opacity=".65"/><circle cx="420" cy="73" r="8" fill="#52ad9d"/>
              <g fill="#24475a"><path d="M184 230c0-8 5-14 12-14s12 6 12 14-5 13-12 13-12-5-12-13m-9 133 5-84c1-12 7-19 16-19s15 7 16 19l7 84h-16l-4-57-4 57z"/><path d="M303 256c0-7 4-12 10-12s10 5 10 12-4 11-10 11-10-4-10-11m-7 105 4-67c1-9 5-15 13-15s12 6 13 15l6 67h-13l-4-42-4 42z" opacity=".7"/></g>
              <g fill="#54ad9c"><circle cx="82" cy="341" r="13"/><circle cx="448" cy="330" r="17"/><circle cx="130" cy="360" r="8"/></g>
            </svg>
            <div className="workspace-intro-footer"><span className="workspace-secure-dot" /> Acces securise selon votre profil <span className="workspace-role-tag">{user.role ? user.role.toUpperCase() : 'CONNECTE'}</span></div>
          </aside>

          <section className="module-browser" aria-label="Liste des programmes">
            <div className="module-browser-heading"><div><span className="dashboard-kicker">{activeCategory === 'all' ? 'CATALOGUE DES PROGRAMMES' : 'PROGRAMMES DISPONIBLES'}</span><h2>{activeCategory === 'all' ? 'Tous les modules' : currentCategory?.label}</h2><p>{activeCategory === 'all' ? 'Choisissez un module dans la liste.' : currentCategory?.description}</p></div><div className="workspace-count"><strong>{filteredModules.length}</strong><span>programmes</span></div></div>
            <label className="workspace-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4 4"/></svg><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par numero ou nom..." aria-label="Rechercher un programme" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche">×</button>}</label>
            <div className="module-table-head"><span>N° PGM.</span><span>Nom du programme</span><span aria-hidden="true" /></div>
            <div className="module-list" role="region" aria-label="Programmes disponibles">
              {filteredModules.map((module) => <button type="button" className={`module-row ${activeModuleId === module.id ? 'is-selected' : ''}`} key={`${module.category}-${module.id}`} onClick={() => openModule(module)}><span className="module-row-code">{module.id}</span><span className="module-row-info"><strong>{module.title}</strong><small>{activeCategory === 'all' ? `${MODULE_CATEGORIES.find((category) => category.id === module.category)?.label} · ` : ''}{module.description}</small></span><span className="module-row-action" aria-hidden="true">↗</span></button>)}
              {!filteredModules.length && <div className="module-list-empty"><span>⌕</span><strong>Aucun programme trouve</strong><small>Modifiez votre recherche ou choisissez une autre nature.</small></div>}
            </div>
            <div className="module-browser-footer"><span>Selectionnez une ligne pour ouvrir le formulaire du programme.</span><span>{filteredModules.length} resultats</span></div>
          </section>
        </div>
        <footer className="workspace-footer"><span>© 2026 Assurance Jemmali</span><span>Interface de gestion · Les acces dependent de votre profil</span></footer>
      </section>
      {selectedModule && selectedCategory && <ModuleModal module={selectedModule} category={selectedCategory} onClose={() => setSelectedModule(null)} />}
      {showExpertModal && <ExpertManagementModal onClose={() => setShowExpertModal(false)} />}
      {showCompanyModal && <CompanyManagementModal onClose={() => setShowCompanyModal(false)} />}
      {showBranchModal && <BranchManagementModal onClose={() => setShowBranchModal(false)} />}
      {showDocumentModal && <DocumentEntryModal onClose={() => setShowDocumentModal(false)} />}
      {showUnpaidModal && <AgencyUnpaidModal onClose={() => setShowUnpaidModal(false)} />}
      {acompteModule && <AcompteModal moduleId={acompteModule.id} onClose={() => setAcompteModule(null)} />}
      {bordereauModal === 'bordereau-reception' && <BordereauReceptionModal tc="T" onClose={() => setBordereauModal(null)} />}
      {bordereauModal === 'bordereau-comptant' && <BordereauReceptionModal tc="C" onClose={() => setBordereauModal(null)} />}
      {bordereauModal === 'bordereau-confrontation' && <BordereauConfrontationModal onClose={() => setBordereauModal(null)} />}
      {bordereauModal === 'bordereau-fusion' && <BordereauFusionModal onClose={() => setBordereauModal(null)} />}
      {showChequeModal && <ChequeModal onClose={() => setShowChequeModal(false)} />}
      {showRecetteModal && <RecetteModal onClose={() => setShowRecetteModal(false)} />}
      {reglementClientModule && <ReglementClientModal moduleId={reglementClientModule.id} onClose={() => setReglementClientModule(null)} />}
      {sinistreModule && <SinistreModal moduleId={sinistreModule.id} mode={sinistreModule.form === 'sinistre-new' ? 'new' : 'manage'} onClose={() => setSinistreModule(null)} />}
    </main>
  );
}
