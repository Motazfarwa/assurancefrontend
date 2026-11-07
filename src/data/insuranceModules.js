import { PERMISSIONS as P } from '../auth/permissions';

export const MODULE_CATEGORIES = [
  { id: 'production', label: 'Production', icon: '01', description: 'Clients, contrats et quittances' },
  { id: 'accounting', label: 'Comptabilite', icon: '02', description: 'Operations et etats financiers' },
  { id: 'collections', label: 'Recouvrement', icon: '03', description: 'Suivi des impayes et relances' },
  { id: 'claims', label: 'Sinistres', icon: '04', description: 'Declarations et suivi des dossiers' },
  { id: 'settings', label: 'Parametrage', icon: '05', description: 'Compagnies et configuration' },
];

export const INSURANCE_MODULES = [
  { id: '100', category: 'production', title: 'Gestion des clients', description: 'Creer et mettre a jour les dossiers clients.', permission: P.USERS_MANAGE, form: 'client' },
  { id: '110', category: 'production', title: 'Gestion des polices', description: 'Consulter et administrer les contrats.', permission: P.POLICIES_VIEW_ALL, form: 'policy' },
  { id: '120', category: 'production', title: 'Gestion des quittances', description: 'Consulter les quittances de tous les clients par client, police, compagnie, echeance ou date de saisie, et les modifier.', permission: P.POLICIES_VIEW_ALL, form: 'quittances' },
  { id: '130', category: 'production', title: 'Operations journalieres (production)', description: 'Polices ou quittances ajoutees, modifiees ou supprimees entre deux dates (production).', permission: P.REPORTS_VIEW, form: 'operations-journalieres' },

  { id: '530', category: 'production', title: 'Reception terme', description: 'Importer le bordereau terme (Excel) recu du siege de la compagnie.', permission: P.REPORTS_VIEW, form: 'bordereau-reception' },
  { id: '535', category: 'production', title: 'Reception comptant', description: 'Importer le bordereau comptant (Excel) recu du siege de la compagnie.', permission: P.REPORTS_VIEW, form: 'bordereau-comptant' },
  { id: '540', category: 'production', title: 'Confrontation bordereau', description: 'Comparer le bordereau du siege avec vos polices et quittances.', permission: P.REPORTS_VIEW, form: 'bordereau-confrontation' },
  { id: '545', category: 'production', title: 'Retour', description: 'Retourner a la compagnie les quittances d’une periode (comptant ou terme) et consulter celles deja retournees.', permission: P.REPORTS_VIEW, form: 'retour-quittances' },
  { id: '548', category: 'production', title: 'Recodification de client', description: 'Passer une police et ses quittances non comptabilisees a un autre client ; corriger un N° police, quittance ou attestation.', permission: P.REPORTS_VIEW, visibleToAll: true, form: 'reconciliation-police' },
  { id: '547', category: 'production', title: 'Etat du terme', description: 'Polices en cours dont le terme tombe dans le mois, par compagnie ou toutes ; les polices temporaires (date d’expiration) sont signalees.', permission: P.REPORTS_VIEW, form: 'etat-terme' },
  { id: '550', category: 'production', title: 'Fusion bordereau', description: 'Verifier puis fusionner le bordereau recu du siege.', permission: P.REPORTS_VIEW, form: 'bordereau-fusion' },
  { id: '730', category: 'settings', title: 'Gestion des compagnies', description: 'Fiche de chaque compagnie et de l’agence : code agent, adresse, CAS, numerotation des quittances.', permission: P.REPORTS_VIEW, form: 'companies' },
  { id: '740', category: 'settings', title: 'Gestion des banques', description: 'Comptes bancaires de l’agence : technique par compagnie ou frais generaux, soldes en cours, import d’un RIB scanne.', permission: P.REPORTS_VIEW, form: 'banques' },
  { id: '555', category: 'production', title: 'Gestion des ristournes', description: 'Saisir, modifier ou supprimer les ristournes (restitutions de prime) d’une police.', permission: P.REPORTS_VIEW, form: 'ristournes' },
  { id: '400', category: 'accounting', title: 'Saisie frais generaux', description: 'Saisir les frais de l’agence (salaires, loyers, telephone, STEG…) par nature et type, et consulter ceux de la periode.', permission: P.REPORTS_VIEW, adminOnly: true, form: 'frais-generaux' },
  { id: '560', category: 'collections', title: 'Saisir les pieces de reglement', description: 'Saisir les cheques, traites et autres reglements en instance.', permission: P.REPORTS_VIEW, form: 'cheques' },
  { id: '565', category: 'collections', title: 'Recette Technique', description: 'Consulter les pieces en instance et les verser sur un compte de l’agence.', permission: P.REPORTS_VIEW, form: 'cheques-instance' },
  { id: '575', category: 'collections', title: 'Reglement client', description: 'Consulter les reglements d’un client et les quittances qu’ils ont payees.', permission: P.REPORTS_VIEW, form: 'reglement-client' },
  { id: '580', category: 'accounting', title: 'Journal d’encaissement', description: 'Choisir les quittances encaissees d’une compagnie, les comptabiliser et imprimer la feuille de caisse.', permission: P.REPORTS_VIEW, form: 'journal-encaissement' },
  { id: '585', category: 'accounting', title: 'Journal de depense', description: 'Comptabiliser les sinistres et ristournes payes d’une compagnie et imprimer la feuille de depense.', permission: P.REPORTS_VIEW, form: 'journal-depense' },
  { id: '590', category: 'accounting', title: 'Feuille de caisse', description: 'Recettes et depenses comptabilisees d’une compagnie a une date : JEQ, sinistres, ristournes, commission.', permission: P.REPORTS_VIEW, form: 'feuille-caisse' },
  { id: '131', category: 'accounting', title: 'Operations journalieres (financieres)', description: 'Etat financier des operations d’une periode : technique (reglements clients, sinistres, ristournes) ou divers.', permission: P.REPORTS_VIEW, form: 'operations-financieres' },
  { id: '597', category: 'accounting', title: 'Etat des comptes client', description: 'Par client : primes, ristournes, sinistres, reglements et commissions entre deux dates, pour une compagnie, un client ou une police.', permission: P.REPORTS_VIEW, form: 'comptes-clients' },
  { id: '595', category: 'collections', title: 'Etat des moins percus & trop percus', description: 'Restes de quittances abandonnes (moins percus) ou montants payes en trop par les clients sur une periode.', permission: P.REPORTS_VIEW, form: 'etat-percus' },

  { id: '340', category: 'collections', title: 'Etat des impayes', description: 'Quittances impayees avec ou sans piece en instance, global par client ou memoire de reglement.', permission: P.REPORTS_VIEW, form: 'etat-impaye' },
  { id: '350', category: 'collections', title: 'Etat des acomptes', description: 'Quittances partiellement reglees : montant regle et reste a payer par client.', permission: P.REPORTS_VIEW, form: 'acompte' },

  { id: '600', category: 'claims', title: 'Declarer un sinistre', description: 'Ouvrir un dossier de sinistre.', permission: P.CLAIMS_CREATE, adminOnly: true, form: 'sinistre-new' }, // employees declare from Gestion des sinistres (620)
  { id: '620', category: 'claims', title: 'Gestion des sinistres', description: 'Saisir, scanner (constat, declaration) et suivre les dossiers sinistres.', permission: P.CLAIMS_VIEW_ALL, form: 'sinistre' },
];
