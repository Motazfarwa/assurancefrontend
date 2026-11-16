import { fireEvent, render, screen } from '@testing-library/react';
import CarteVerteDialog, { carteVerteSuggestion } from './CarteVerteDialog';
import { inForce } from '../QuittancesModal/NewQuittanceDialog';
import { policeErrors } from '../ModuleModal/policyValidation';
import { journalDayOf } from '../SinistreModal/SinistreModal';

test('période consommée: the days of the carte verte; solde: the days left until the échéance', () => {
  expect(carteVerteSuggestion('2026-11-17', '2026-11-30', '2026-12-31')).toEqual({ periode_consommee: '14 jours', solde_echeance: '31 jours' });
  expect(carteVerteSuggestion('2026-11-30', '2026-11-17', '2026-12-31')).toEqual({ periode_consommee: '', solde_echeance: '' });
  expect(carteVerteSuggestion('2026-11-17', '2026-11-17', '')).toEqual({ periode_consommee: '1 jour', solde_echeance: '' });
});

test('the popup asks both dates and fills the durations, which can be changed', () => {
  const onSave = jest.fn();
  render(<CarteVerteDialog value={{}} echeance="2026-12-31" onSave={onSave} onCancel={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(screen.getAllByText('Ce champ est obligatoire.')).toHaveLength(2);
  fireEvent.change(screen.getByLabelText(/^Carte verte du/), { target: { value: '2026-11-17' } });
  fireEvent.change(screen.getByLabelText(/^Carte verte au/), { target: { value: '2026-11-30' } });
  expect(screen.getByLabelText('Période consommée')).toHaveValue('14 jours');
  expect(screen.getByLabelText('Solde jusqu’à l’échéance')).toHaveValue('31 jours');
  fireEvent.change(screen.getByLabelText('Observations'), { target: { value: 'Voyage Italie' } });
  fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(onSave).toHaveBeenCalledWith({ cv_du: '2026-11-17', cv_au: '2026-11-30', cv_periode: '14 jours', cv_solde: '31 jours', cv_observations: 'Voyage Italie' });
});

test('a new quittance is for a police en vigueur (AN / RV, not expired)', () => {
  expect(inForce({ etat: 'AN', expiration: '2099-01-01' })).toBe(true);
  expect(inForce({ etat: 'RV ', expiration: null })).toBe(true);
  expect(inForce({ etat: 'AN', expiration: '2020-01-01' })).toBe(false);
  expect(inForce({ etat: 'RE', expiration: '2099-01-01' })).toBe(false);
});

test('a police flotte numbered prefix + year + counter is accepted as it is', () => {
  const base = { code_compagnie: '9', date_creation: '2026-11-17', effet: '2026-11-17', heure_effet: '00:00', echeance: '17/11', expiration: '2027-11-17', etat: 'AN' };
  expect(policeErrors({ ...base, num_police: '555202600046', flotte_auto: true }).num_police).toBeUndefined();
  expect(policeErrors({ ...base, num_police: '555202600046' }).num_police).toBeDefined();
});

test('a sinistre règlement goes in the feuille de caisse of the 15th or of the end of the month', () => {
  expect(journalDayOf('2026-11-03')).toBe('2026-11-15');
  expect(journalDayOf('2026-11-16')).toBe('2026-11-30');
  expect(journalDayOf('2026-02-20')).toBe('2026-02-28');
});
