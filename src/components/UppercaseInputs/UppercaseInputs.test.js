import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import UppercaseInputs from './UppercaseInputs';

function Form({ onSave }) {
  const [values, setValues] = useState({ nom: '', email: '', obs: '', user: '' });
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  return <>
    <UppercaseInputs pathname="/workspace" />
    <label>Nom client<input value={values.nom} onChange={set('nom')} /></label>
    <label>Email 1<input type="email" value={values.email} onChange={set('email')} /></label>
    <label>Observation<textarea value={values.obs} onChange={set('obs')} /></label>
    <label>Nom d’utilisateur<input value={values.user} onChange={set('user')} /></label>
    <button type="button" onClick={() => onSave(values)}>Enregistrer</button>
  </>;
}

test('what is typed is saved in capitals, except the emails and the user names', () => {
  const onSave = jest.fn();
  render(<Form onSave={onSave} />);
  fireEvent.input(screen.getByLabelText('Nom client'), { target: { value: 'ben salah' } });
  fireEvent.input(screen.getByLabelText('Email 1'), { target: { value: 'ben@mail.tn' } });
  fireEvent.input(screen.getByLabelText('Observation'), { target: { value: 'réglé à l’agence' } });
  fireEvent.input(screen.getByLabelText('Nom d’utilisateur'), { target: { value: 'farwa' } });
  expect(screen.getByLabelText('Nom client')).toHaveValue('BEN SALAH');
  fireEvent.click(screen.getByText('Enregistrer'));
  expect(onSave).toHaveBeenCalledWith({ nom: 'BEN SALAH', email: 'ben@mail.tn', obs: 'RÉGLÉ À L’AGENCE', user: 'farwa' });
});
