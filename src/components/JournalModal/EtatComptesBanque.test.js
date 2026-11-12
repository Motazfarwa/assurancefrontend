import fs from 'fs';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  ['05/10/2026', 'PAIEMENT CHQ 45123', '05/10/2026', '2915,000', ''], // 1 TND less than our 2 916,000
  ['30/10/2026', 'FRAIS TENUE DE COMPTE', '30/10/2026', '45,500', ''],
  ['03/11/2026', 'VERSEMENT ESPECES', '03/11/2026', '', '500,000'], // after the period
];

beforeEach(() => {
  getBankAccounts.mockResolvedValue([{ code_banque: 'ATTIJARI GAT', archive: false }, { code_banque: 'ATB GAT', archive: true }]);
  getBankStatement.mockResolvedValue(statement);
  readSpreadsheetRows.mockResolvedValue(bankRows);
});

test('shows the account, then confronts it with the bank statement', async () => {
  const { container } = render(<EtatComptesBanqueModal moduleId="598" onClose={() => {}} />);
  await waitFor(() => expect(screen.getByLabelText('Code banque').value).toBe('ATTIJARI GAT'));
  fireEvent.change(screen.getByLabelText('Date début'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Date fin'), { target: { value: '2026-10-31' } });
  // the archived accounts are not offered
  expect(screen.queryByRole('option', { name: /ATB GAT/ })).toBeNull();
  fireEvent.click(screen.getByLabelText('Etat détaillé'));
  fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
  expect(await screen.findByText('ETAT DÉTAILLÉ DU COMPTE ATTIJARI GAT')).toBeTruthy();
  expect(getBankStatement).toHaveBeenCalledWith('token', expect.objectContaining({ code_banque: 'ATTIJARI GAT' }));
  if (process.env.DUMP_DIR) fs.writeFileSync(`${process.env.DUMP_DIR}/bank-etat.html`, screen.getByTestId('report').innerHTML);

  const file = new File(['x'], 'releve.xlsx');
  await act(async () => { fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } }); });
  // Only the lines of the period are confronted.
  expect(await screen.findByText(/5 opérations lues, dont/)).toHaveTextContent('5 opérations lues, dont 4 du 01/10/2026 au 31/10/2026 (1 hors période, non confrontée)');
  expect(getBankStatement).toHaveBeenCalledTimes(1); // same account and dates: not fetched again
  const tally = screen.getByLabelText('Résultat de la confrontation');
  expect(tally).toHaveTextContent('2rapprochés1montants proches à confirmer0chez nous seulement1sur le relevé seulement');
  // 2 916,000 chez nous and 2 915,000 on the statement: side by side, the user answers.
  const proposal = screen.getByRole('group', { name: /Même opération : 2.916,000 et 2.915,000/ });
  expect(proposal.closest('tr')).toHaveTextContent(/− 1,000/);

  fireEvent.click(screen.getByRole('button', { name: 'Voir le rapport de confrontation' }));
  expect(await screen.findByText('2. Montants proches à confirmer (1)')).toBeTruthy();
  expect(screen.getByText('3. Chez nous, absents du relevé (0)')).toBeTruthy();
  expect(screen.getByText('4. Sur le relevé, absents chez nous (1)')).toBeTruthy();
  expect(screen.getByText('FRAIS TENUE DE COMPTE')).toBeTruthy();
  expect(screen.queryByText('03/11/2026')).toBeNull(); // the line after the period is not in the report

  // "Oui": the two are paired with their difference.
  fireEvent.click(within(proposal).getByRole('button', { name: 'Oui' }));
  if (process.env.DUMP_DIR) fs.writeFileSync(`${process.env.DUMP_DIR}/bank-confront-oui.html`, screen.getByTestId('report').innerHTML);
  expect(tally).toHaveTextContent('3rapprochés0montants proches à confirmer');
  expect(await screen.findByText('2. Rapprochés avec un écart de montant (1)')).toBeTruthy();
  expect(screen.getByText(/Écart total − 1,000/)).toBeTruthy();
  // "Non": each stays on its own side.
  fireEvent.click(within(proposal).getByRole('button', { name: 'Non' }));
  expect(tally).toHaveTextContent('2rapprochés0montants proches à confirmer1chez nous seulement2sur le relevé seulement');
  expect(screen.getByText('3. Sur le relevé, absents chez nous (2)')).toBeTruthy();
  if (process.env.DUMP_DIR) {
    fs.writeFileSync(`${process.env.DUMP_DIR}/bank-confront.html`, screen.getByTestId('report').innerHTML);
    fs.writeFileSync(`${process.env.DUMP_DIR}/bank-modal.html`, container.querySelector('.expert-modal-backdrop').outerHTML.replace(/<div data-testid="report">[\s\S]*$/, '</section></div>'));
  }
});
