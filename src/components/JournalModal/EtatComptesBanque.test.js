import fs from 'fs';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EtatComptesBanqueModal from './EtatComptesBanque';
import { getBankAccounts, getBankStatement } from '../../services/journalApi';
import { readSpreadsheetRows } from '../../services/bordereauParser';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 'token' }) }));
jest.mock('../../services/journalApi', () => ({ getBankAccounts: jest.fn(), getBankStatement: jest.fn() }));
jest.mock('../../services/bordereauParser', () => ({ ...jest.requireActual('../../services/bordereauParser'), readSpreadsheetRows: jest.fn() }));
// The report tab is rendered in place.
jest.mock('../NewWindow/NewWindow', () => ({ __esModule: true, default: ({ children }) => <div data-testid="report">{children}</div>, openReportWindow: () => ({ close() {} }) }));

const statement = {
  banque: { code_banque: 'ATTIJARI GAT', nom_banque: 'GAT ATTIJ 9232', num_compte: '076 161 00942492 32' },
  solde_depart: 7291.551, total_credit: 1748.116, total_debit: 2916, solde_final: 6123.667,
  items: [
    { id: 'R1', sens: 'C', date_mvt: '2026-10-01', reference: 'ESP30.092026', montant: 1009.274, code_client: '5054', nom_client: 'CLIENT A', libelle: 'Règlement client', solde: 8300.825 },
    { id: 'R2', sens: 'C', date_mvt: '2026-10-01', reference: 'BIAT0001180', montant: 738.842, code_client: '1319', nom_client: 'CLIENT B', libelle: 'Règlement client', solde: 9039.667 },
    { id: 'D1', sens: 'D', date_mvt: '2026-10-05', reference: '451236', montant: 2916, code_client: '', nom_client: null, libelle: 'SINISTRE', solde: 6123.667 },
  ],
};
const bankRows = [
  ['RELEVE DE COMPTE'],
  ['Date opération', 'Libellé', 'Date valeur', 'Débit', 'Crédit'],
  ['02/10/2026', 'VERSEMENT ESPECES', '02/10/2026', '', '1009,274'],
  ['06/10/2026', 'REMISE CHQ 0001180', '07/10/2026', '', '738,842'],
  ['30/10/2026', 'FRAIS TENUE DE COMPTE', '30/10/2026', '45,500', ''],
];

beforeEach(() => {
  getBankAccounts.mockResolvedValue([{ code_banque: 'ATTIJARI GAT', archive: false }, { code_banque: 'ATB GAT', archive: true }]);
  getBankStatement.mockResolvedValue(statement);
  readSpreadsheetRows.mockResolvedValue(bankRows);
});

test('shows the account, then confronts it with the bank statement', async () => {
  const { container } = render(<EtatComptesBanqueModal moduleId="598" onClose={() => {}} />);
  await waitFor(() => expect(screen.getByLabelText('Code banque').value).toBe('ATTIJARI GAT'));
  fireEvent.click(screen.getByLabelText('Etat détaillé'));
  fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
  expect(await screen.findByText('ETAT DÉTAILLÉ DU COMPTE ATTIJARI GAT')).toBeTruthy();
  expect(getBankStatement).toHaveBeenCalledWith('token', expect.objectContaining({ code_banque: 'ATTIJARI GAT' }));
  if (process.env.DUMP_DIR) fs.writeFileSync(`${process.env.DUMP_DIR}/bank-etat.html`, screen.getByTestId('report').innerHTML);

  const file = new File(['x'], 'releve.xlsx');
  await act(async () => { fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } }); });
  expect(await screen.findByText(/3 opérations lues · 2 rapprochées, 1 chez nous seulement, 1 sur le relevé seulement/)).toBeTruthy();
  expect(getBankStatement).toHaveBeenCalledTimes(1); // same account and dates: not fetched again
  fireEvent.click(screen.getByRole('button', { name: 'Voir le rapport de confrontation' }));
  expect(await screen.findByText('Chez nous, absents du relevé (1)')).toBeTruthy();
  expect(screen.getByText('Sur le relevé, absents chez nous (1)')).toBeTruthy();
  expect(screen.getByText('FRAIS TENUE DE COMPTE')).toBeTruthy();
  if (process.env.DUMP_DIR) {
    fs.writeFileSync(`${process.env.DUMP_DIR}/bank-confront.html`, screen.getByTestId('report').innerHTML);
    fs.writeFileSync(`${process.env.DUMP_DIR}/bank-modal.html`, container.querySelector('.expert-modal-backdrop').outerHTML.replace(/<div data-testid="report">[\s\S]*$/, '</section></div>'));
  }
});
