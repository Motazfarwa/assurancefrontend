import { PERMISSIONS as P } from '../auth/permissions';

export const MODULE_CATEGORIES = [
  { id: 'production', label: 'Production', icon: '01', description: 'Clients, contrats et quittances' },
  { id: 'accounting', label: 'Comptabilite', icon: '02', description: 'Operations et etats financiers' },
  { id: 'collections', label: 'Recouvrement', icon: '03', description: 'Suivi des impayes et relances' },
  { id: 'claims', label: 'Sinistres', icon: '04', description: 'Declarations et suivi des dossiers' },
];

export const INSURANCE_MODULES = [
  { id: '100', category: 'production', title: 'Gestion des clients', description: 'Creer et mettre a jour les dossiers clients.', permission: P.USERS_MANAGE, form: 'client' },
  { id: '110', category: 'production', title: 'Gestion des polices', description: 'Consulter et administrer les contrats.', permission: P.POLICIES_VIEW_ALL, form: 'policy' },

  { id: '530', category: 'production', title: 'Reception terme', description: 'Importer le bordereau terme (Excel) recu du siege de la compagnie.', permission: P.REPORTS_VIEW, form: 'bordereau-reception' },
  { id: '535', category: 'production', title: 'Reception comptant', description: 'Importer le bordereau comptant (Excel) recu du siege de la compagnie.', permission: P.REPORTS_VIEW, form: 'bordereau-comptant' },
  { id: '540', category: 'production', title: 'Confrontation bordereau', description: 'Comparer le bordereau du siege avec vos polices et quittances.', permission: P.REPORTS_VIEW, form: 'bordereau-confrontation' },
  { id: '550', category: 'production', title: 'Fusion bordereau', description: 'Verifier puis fusionner le bordereau recu du siege.', permission: P.REPORTS_VIEW, form: 'bordereau-fusion' },
  { id: '560', category: 'collections', title: 'Gestion des cheques', description: 'Saisir les cheques, traites et autres reglements en instance.', permission: P.REPORTS_VIEW, form: 'cheques' },
  { id: '570', category: 'collections', title: 'Recette Technique', description: 'Saisir un reglement et l’affecter aux quittances impayees.', permission: P.REPORTS_VIEW, form: 'recette' },
  { id: '575', category: 'collections', title: 'Reglement client', description: 'Consulter les reglements d’un client et les quittances qu’ils ont payees.', permission: P.REPORTS_VIEW, form: 'reglement-client' },

  { id: '350', category: 'collections', title: 'Etat des acomptes', description: 'Quittances partiellement reglees : montant regle et reste a payer par client.', permission: P.REPORTS_VIEW, form: 'acompte' },

  { id: '600', category: 'claims', title: 'Declarer un sinistre', description: 'Ouvrir un dossier de sinistre.', permission: P.CLAIMS_CREATE, form: 'sinistre-new' },
  { id: '610', category: 'claims', title: 'Mes dossiers sinistres', description: 'Rechercher et suivre vos dossiers.', permission: P.CLAIMS_VIEW_OWN, form: 'search' },
  { id: '620', category: 'claims', title: 'Gestion des sinistres', description: 'Saisir, scanner (constat, declaration) et suivre les dossiers sinistres.', permission: P.CLAIMS_VIEW_ALL, form: 'sinistre' },
];
