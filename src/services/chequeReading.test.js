import { amountInWords, readCheque, readChequeAll, ribKeyValid, wordsToNumber } from './chequeReading';
import { extractPaymentAll } from './paymentScan';

// The agency's banks (TTBanque): its own codes, which are not the codes of the RIB (04 is UBCI here, Attijari is 31).
const BANKS = [{ code_banque: '01', nom_banque: 'BIAT' }, { code_banque: '04', nom_banque: 'UBCI' }, { code_banque: '10', nom_banque: 'CCP' }, { code_banque: '31', nom_banque: 'ATTIJARI' }];
const TODAY = '2026-11-11';

// Anonymised copy of what the browser OCR (tesseract, printed text only) really returns for an Attijari cheque:
// the printed parts are right, the handwritten amount and date are misread. (Name and RIB replaced, same layout.)
const BROWSER_OCR = [`peu +  Aion  re
ChèqueN° 0451261                                                     creme
10% , 943
10000 DT
54) JUN pué cdail Lie Jilés |yaol
= contre ce chèque non endossable  M D         SEA WE    Quaté         ;   ST DR sit k
J5$ES pai—
6/19/2746
js}                    AM Whu)d . Tentmi NKEHE 80:
Validité : 13/02/2027          A 74603
= pu          Les        Trtsredscompte 997 =      Pig
S'AVENUE HABIB BOURGUIBA    04 001 123 4567890123 20 TND,
.                                                                          BEN SALAH KARIM
70 640 070                                               7
54 70-022 007                           KI—`, `pu  Ve Attijart re
104 , 73
Montant max:
10000 DT
Chèque Ne
0451261
Payez contre ce jo non endossable
pus HULLE  soi WE   Quats!
Alordre de
Validité : 13/02/2027
Tirataire du compte
007
 AGENCE ARIANA
F'AVENUE HABIB BOURGUIBA
04
007 4567890123 20 TND,
BEN SALAH KARIM
AX  70022007`];

// The same cheque as the server OCR (Azure Read, printed and handwritten) returns it, in reading order.
const SERVER_OCR = `Attijari bank
B.P. 1074,768
Chèque N° 0451261
Montant max: 10000 DT
Les chèques certifiés ne sont pas concernés par le montant max du chèque
Payez contre ce chèque non endossable
Sauf au profit d'une banque ou d'un organisme assimilé. MILLE Soixante Quatorze
dinars 768 mill
À l'ordre de
MR WALID JEMMALI MAGHREBIA
Validité : 13/02/2027
A Tunis Le 6/10/26
Payable à
AGENCE ARIANA
9 AVENUE HABIB BOURGUIBA
TEL: 70 640 070
FAX: 70 022 007
Titulaire du compte
007
04 001 123 4567890123 20 TND
BEN SALAH KARIM
Signature(s)
⑈0451261⑈04001⑉1234567890123 20⑈`;

// The sample cheque with its talon (PDF with a text layer).
const SAMPLE = `TALON - MODULE 560
Code client
2973
Nom client
Société Exemple SARL
N° pièce
0001234
Date saisie
26/10/2026
Échéance
26/10/2026
Mode
Chèque
Banque
10 - Banque Exemple de Tunisie
Montant (TND)
1 250,500
Solde
0,000
Statut
À verser / En instance
BANQUE EXEMPLE DE TUNISIE
Code banque : 10 # 1 250,500 DT #
Payez contre ce chèque la somme de :
** Mille deux cent cinquante dinars et cinq cents millimes **
À l'ordre de : Société Exemple SARL
Payable à : Banque Exemple de Tunisie Tunis, le 26/10/2026 · Échéance : 26/10/2026
Signature du tireur
RIB : 10 006 0351234567890 12
Client : 2973
|0001234| 10006035123456789012: 10`;

test('French amounts in words', () => {
  expect(wordsToNumber(['mille', 'soixante', 'quatorze'])).toBe(1074);
  expect(wordsToNumber(['deux', 'cent', 'cinquante'])).toBe(250);
  expect(wordsToNumber(['quatre', 'vingt', 'dix', 'sept'])).toBe(97);
  expect(wordsToNumber(['trois', 'mille', 'cinq', 'cents'])).toBe(3500);
  expect(amountInWords('Payez contre ce chèque MILLE Soixante Quatorze dinars 768 mill À l’ordre de')).toMatchObject({ dinars: 1074, millimes: 768 });
  expect(amountInWords('Sauf au profit d’une banque ou d’un organisme')).toBeNull();
});

test('RIB key', () => {
  expect(ribKeyValid('04001123456789012320')).toBe(true);
  expect(ribKeyValid('04001123456789012321')).toBe(false);
});

test('browser OCR of a real cheque: the printed values are taken, the misread handwriting is left empty (never Montant max nor Validité)', () => {
  const { values, warnings } = readChequeAll(BROWSER_OCR, BANKS, TODAY);
  expect(values).toMatchObject({ nump: '0451261', rib: '04001123456789012320', banqueLue: 'Attijari bank', code_banque: '31', tireur: 'BEN SALAH KARIM', typeReglement: 'Chèque' });
  expect(values.montant).toBeUndefined();
  expect(values.echeance).toBeUndefined();
  expect(warnings.join(' ')).toMatch(/Montant non lu \(écriture illisible\)/);
  expect(warnings.join(' ')).toMatch(/Date du chèque mal lue \(« 6\/19\/2746 »\)/);
  expect(warnings).toHaveLength(2);
  // the generic reading must not take the maximum amount nor the validity of the chequebook either
  const generic = extractPaymentAll(BROWSER_OCR, BANKS);
  expect(generic.montant).not.toBe('10000.000');
  expect(generic.echeance).not.toBe('2027-02-13');
});

test('server OCR (handwriting read): amount confirmed by the words, date of the cheque, holder (not the payee)', () => {
  const { values, warnings } = readCheque(SERVER_OCR, BANKS, TODAY);
  expect(values).toMatchObject({ nump: '0451261', montant: '1074.768', echeance: '2026-10-06', code_banque: '31', tireur: 'BEN SALAH KARIM' });
  expect(warnings).toEqual([]);
});

test('figures and words that disagree: the amount is not filled', () => {
  const { values, warnings } = readCheque(SERVER_OCR.replace('1074,768', '1047,768'), BANKS, TODAY);
  expect(values.montant).toBeUndefined();
  expect(warnings[0]).toMatch(/Montant à vérifier : 1\s047,768 en chiffres, 1\s074,768 en lettres/);
});

test('the sample cheque', () => {
  const { values, warnings } = readCheque(SAMPLE, BANKS, TODAY);
  expect(values).toMatchObject({ montant: '1250.500', echeance: '2026-10-26' });
  expect(values.tireur).toBeUndefined(); // "Signature du tireur" is a label, not a name
  expect(warnings.join(' ')).toMatch(/clé est incorrecte/); // the sample's RIB is made up
});
