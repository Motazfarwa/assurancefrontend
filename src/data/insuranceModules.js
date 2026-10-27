import { PERMISSIONS as P } from '../auth/permissions';

export const MODULE_CATEGORIES = [
  { id: 'production', label: 'Production', icon: '01', description: 'Clients, contrats et quittances' },
  { id: 'accounting', label: 'Comptabilite', icon: '02', description: 'Operations et etats financiers' },
  { id: 'collections', label: 'Recouvrement', icon: '03', description: 'Suivi des impayes et relances' },
  { id: 'claims', label: 'Sinistres', icon: '04', description: 'Declarations et suivi des dossiers' },
  { id: 'settings', label: 'Parametrage', icon: '05', description: 'Utilisateurs et configuration' },
];

export const INSURANCE_MODULES = [
  { id: '100', category: 'production', title: 'Gestion des clients', description: 'Creer et mettre a jour les dossiers clients.', permission: P.USERS_MANAGE, form: 'client' },
  { id: '110', category: 'production', title: 'Gestion des polices', description: 'Consulter et administrer les contrats.', permission: P.POLICIES_VIEW_ALL, form: 'policy' },

  { id: '400', category: 'accounting', title: 'Reglement des sinistres', description: 'Saisir les operations de reglement.', permission: P.CLAIMS_REVIEW, form: 'accounting' },
  { id: '410', category: 'accounting', title: 'Reglement des ristournes', description: 'Enregistrer les reglements de ristournes.', permission: P.POLICIES_MANAGE, form: 'accounting' },
  { id: '420', category: 'accounting', title: 'Frais generaux', description: 'Saisir et suivre les frais de gestion.', permission: P.REPORTS_VIEW, form: 'accounting' },
  { id: '430', category: 'accounting', title: 'Recettes et depenses diverses', description: 'Enregistrer une operation diverse.', permission: P.REPORTS_VIEW, form: 'accounting' },
  { id: '440', category: 'accounting', title: 'Operations journalieres', description: 'Consulter les operations financieres.', permission: P.REPORTS_VIEW, form: 'report' },
  { id: '450', category: 'accounting', title: 'Etat detaille des depenses', description: 'Filtrer les depenses par periode.', permission: P.REPORTS_VIEW, form: 'report' },
  { id: '460', category: 'accounting', title: 'Etat des frais generaux', description: 'Consulter les frais generaux par agence.', permission: P.REPORTS_VIEW, form: 'report' },
  { id: '470', category: 'accounting', title: 'Frais generaux par banque', description: 'Rechercher les mouvements par banque.', permission: P.REPORTS_VIEW, form: 'report' },
  { id: '480', category: 'accounting', title: 'Etat detaille des comptes', description: 'Consulter les comptes comptables.', permission: P.REPORTS_VIEW, form: 'report' },
  { id: '490', category: 'accounting', title: 'Comptes Jemmali', description: 'Consulter les comptes de la compagnie.', permission: P.REPORTS_VIEW, form: 'report' },
  { id: '500', category: 'accounting', title: 'Depenses techniques', description: 'Suivre les depenses techniques.', permission: P.REPORTS_VIEW, form: 'report' },
  { id: '510', category: 'accounting', title: 'Moins percus et trop percus', description: 'Rechercher les ecarts de perception.', permission: P.REPORTS_VIEW, form: 'report' },
  { id: '520', category: 'accounting', title: 'Recus supprimes', description: 'Consulter l’historique des recus annules.', permission: P.REPORTS_VIEW, form: 'report' },
  { id: '530', category: 'accounting', title: 'Reception terme', description: 'Importer le bordereau terme (Excel) recu du siege de la compagnie.', permission: P.REPORTS_VIEW, form: 'bordereau-reception' },
  { id: '535', category: 'accounting', title: 'Reception comptant', description: 'Importer le bordereau comptant (Excel) recu du siege de la compagnie.', permission: P.REPORTS_VIEW, form: 'bordereau-comptant' },
  { id: '540', category: 'accounting', title: 'Confrontation bordereau', description: 'Comparer le bordereau du siege avec vos polices et quittances.', permission: P.REPORTS_VIEW, form: 'bordereau-confrontation' },
  { id: '550', category: 'accounting', title: 'Fusion bordereau', description: 'Verifier puis fusionner le bordereau recu du siege.', permission: P.REPORTS_VIEW, form: 'bordereau-fusion' },
  { id: '560', category: 'accounting', title: 'Gestion des cheques', description: 'Saisir les cheques, traites et autres reglements en instance.', permission: P.REPORTS_VIEW, form: 'cheques' },
  { id: '570', category: 'accounting', title: 'Recette Technique', description: 'Saisir un reglement et l’affecter aux quittances impayees.', permission: P.REPORTS_VIEW, form: 'recette' },

  { id: '300', category: 'collections', title: 'Suivi du recouvrement', description: 'Consulter les paiements en attente.', permission: P.REPORTS_VIEW, form: 'search' },
  { id: '310', category: 'collections', title: 'Dossiers en retard', description: 'Identifier les echeances impayees.', permission: P.REPORTS_VIEW, form: 'report' },
  { id: '320', category: 'collections', title: 'Relances clients', description: 'Rechercher et preparer les relances.', permission: P.REPORTS_VIEW, form: 'search' },
  { id: '330', category: 'collections', title: 'Etat du recouvrement', description: 'Afficher les resultats par periode.', permission: P.REPORTS_VIEW, form: 'report' },
  { id: '340', category: 'collections', title: 'Etat des impayes Agence', description: 'Consulter et filtrer les quittances impayees de l’agence.', permission: P.REPORTS_VIEW, form: 'unpaid-agency' },

  { id: '600', category: 'claims', title: 'Declarer un sinistre', description: 'Ouvrir un dossier de sinistre.', permission: P.CLAIMS_CREATE, form: 'sinistre-new' },
  { id: '610', category: 'claims', title: 'Mes dossiers sinistres', description: 'Rechercher et suivre vos dossiers.', permission: P.CLAIMS_VIEW_OWN, form: 'search' },
  { id: '620', category: 'claims', title: 'Gestion des sinistres', description: 'Saisir, scanner (constat, declaration) et suivre les dossiers sinistres.', permission: P.CLAIMS_VIEW_ALL, form: 'sinistre' },
  { id: '630', category: 'claims', title: 'Reglements et indemnisations', description: 'Traiter les reglements de sinistres.', permission: P.CLAIMS_REVIEW, form: 'accounting' },
  { id: '640', category: 'claims', title: 'Etat des sinistres', description: 'Consulter les sinistres par periode.', permission: P.CLAIMS_VIEW_ALL, form: 'report' },

  { id: '700', category: 'settings', title: 'Utilisateurs et roles', description: 'Gerer les comptes et les niveaux d’acces.', permission: P.USERS_MANAGE, form: 'user' },
  { id: '710', category: 'settings', title: 'Agences', description: 'Configurer les agences de la compagnie.', permission: P.SETTINGS_MANAGE, form: 'agency' },
  { id: '720', category: 'settings', title: 'Compagnies et branches', description: 'Configurer les branches d’assurance.', permission: P.SETTINGS_MANAGE, form: 'agency' },
];
