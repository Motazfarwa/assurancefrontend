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
  { id: '560', category: 'collections', title: 'Saisir les pieces de reglement', description: 'Saisir les cheques, traites et autres reglements en instance.', permission: P.REPORTS_VIEW, form: 'cheques' },
  { id: '565', category: 'collections', title: 'Recette Technique', description: 'Consulter les pieces en instance et les verser sur un compte de l’agence.', permission: P.REPORTS_VIEW, form: 'cheques-instance' },
  { id: '575', category: 'collections', title: 'Reglement client', description: 'Consulter les reglements d’un client et les quittances qu’ils ont payees.', permission: P.REPORTS_VIEW, form: 'reglement-client' },
  { id: '580', category: 'collections', title: 'Journal d’encaissement', description: 'Choisir les quittances encaissees d’une compagnie, les comptabiliser et imprimer la feuille de caisse.', permission: P.REPORTS_VIEW, form: 'journal-encaissement' },
  { id: '585', category: 'collections', title: 'Journal de depense', description: 'Comptabiliser les sinistres et ristournes payes d’une compagnie et imprimer la feuille de depense.', permission: P.REPORTS_VIEW, form: 'journal-depense' },
  { id: '590', category: 'collections', title: 'Feuille de caisse', description: 'Recettes et depenses comptabilisees d’une compagnie a une date : JEQ, sinistres, ristournes, commission.', permission: P.REPORTS_VIEW, form: 'feuille-caisse' },

  { id: '340', category: 'collections', title: 'Etat des impayes', description: 'Quittances impayees avec ou sans piece en instance, global par client ou memoire de reglement.', permission: P.REPORTS_VIEW, form: 'etat-impaye' },
  { id: '350', category: 'collections', title: 'Etat des acomptes', description: 'Quittances partiellement reglees : montant regle et reste a payer par client.', permission: P.REPORTS_VIEW, form: 'acompte' },

  { id: '600', category: 'claims', title: 'Declarer un sinistre', description: 'Ouvrir un dossier de sinistre.', permission: P.CLAIMS_CREATE, form: 'sinistre-new' },
  { id: '620', category: 'claims', title: 'Gestion des sinistres', description: 'Saisir, scanner (constat, declaration) et suivre les dossiers sinistres.', permission: P.CLAIMS_VIEW_ALL, form: 'sinistre' },
];
