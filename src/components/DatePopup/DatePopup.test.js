import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DatePopup, { isoOf, monthGrid } from './DatePopup';

function Form() {
  const [value, setValue] = useState('2026-11-17');
  return (
    <>
      <input type="date" aria-label="Date début" value={value} onChange={(event) => setValue(event.target.value)} />
      <output aria-label="valeur">{value}</output>
      <DatePopup />
    </>
  );
}

test('the month is shown in 6 weeks from Monday, as the legacy calendar', () => {
  const days = monthGrid(2026, 10); // novembre 2026
  expect(days).toHaveLength(42);
  expect(isoOf(days[0])).toBe('2026-10-26');
  expect(isoOf(days[41])).toBe('2026-12-06');
});

test('a click on a date field opens the calendar; a day chosen is written in the field (the form sees it)', () => {
  render(<Form />);
  fireEvent.click(screen.getByLabelText('Date début'));
  expect(screen.getByRole('group', { name: 'Calendrier' })).toBeInTheDocument();
  expect(screen.getByText('novembre 2026')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '17/11/2026' })).toHaveClass('is-chosen');
  fireEvent.click(screen.getByRole('button', { name: '25/11/2026' }));
  expect(screen.getByLabelText('valeur')).toHaveTextContent('2026-11-25');
  expect(screen.queryByRole('group', { name: 'Calendrier' })).not.toBeInTheDocument();
});

test('‹ › move the month, Aujourd\'hui gives today, Échap closes', () => {
  render(<Form />);
  fireEvent.click(screen.getByLabelText('Date début'));
  fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }));
  expect(screen.getByText('décembre 2026')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Aujourd'hui/ }));
  expect(screen.getByLabelText('valeur')).toHaveTextContent(isoOf(new Date()));
  fireEvent.click(screen.getByLabelText('Date début'));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('group', { name: 'Calendrier' })).not.toBeInTheDocument();
});
