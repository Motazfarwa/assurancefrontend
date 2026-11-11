import { scanPayment } from './paymentScan';
import { readText } from './documentReading';
import { findDrawer } from './chequeApi';

jest.mock('./documentReading', () => ({ readText: jest.fn() }));
jest.mock('./chequeApi', () => ({ findDrawer: jest.fn() }));
jest.mock('./clientApi', () => ({ searchClients: () => Promise.resolve([]) }));

const BANKS = [{ code_banque: '04', nom_banque: 'UBCI' }, { code_banque: '31', nom_banque: 'ATTIJARI' }];
// A cheque as the server OCR (printed + handwritten) reads it; the holder and the RIB are made up.
const CHEQUE = `Attijari bank
B.P. 1074,768
Chèque N° 0451261
Montant max: 10000 DT
Payez contre ce chèque non endossable
Sauf au profit d'une banque ou d'un organisme assimilé. MILLE Soixante Quatorze
dinars 768 mill
À l'ordre de
MR WALID JEMMALI MAGHREBIA
Validité : 13/02/2027
A Tunis Le 6/10/26
Titulaire du compte
04 001 123 4567890123 20 TND
CHIKHROUHOU KARIM`;

beforeEach(() => {
  readText.mockResolvedValue({ text: CHEQUE, engine: 'serveur' });
});

test('a scanned cheque fills the piece; the client is the account holder found among the existing clients', async () => {
  findDrawer.mockResolvedValue({ client: { code_client: '4999', nom: 'CHEIKHROUHOU KARIM', exact: false }, candidats: [] });
  const file = new File(['x'], 'cheque.jpg', { type: 'image/jpeg' });
  const { values, found, warnings } = await scanPayment(file, { accessToken: 't', banks: BANKS });
  expect(values).toMatchObject({ nump: '0451261', montant: '1074.768', echeance: '2026-10-06', code_banque: '31', typeReglement: 'Chèque', tireur: 'CHIKHROUHOU KARIM', code: '4999' });
  expect(findDrawer).toHaveBeenCalledWith('t', 'CHIKHROUHOU KARIM'); // never the payee (the agency)
  expect(found.find((item) => item.key === 'code').value).toBe('4999 - CHEIKHROUHOU KARIM');
  expect(warnings).toEqual(['Client 4999 CHEIKHROUHOU KARIM retenu pour le titulaire « CHIKHROUHOU KARIM » (nom proche) : vérifiez.']);
});

test('no client of that name: the client is left to choose', async () => {
  findDrawer.mockResolvedValue({ client: null, candidats: [] });
  const { values, warnings } = await scanPayment(new File(['x'], 'cheque.jpg', { type: 'image/jpeg' }), { accessToken: 't', banks: BANKS });
  expect(values.code).toBeUndefined();
  expect(warnings).toContain('Titulaire « CHIKHROUHOU KARIM » : aucun client à ce nom, choisissez le client.');
});
