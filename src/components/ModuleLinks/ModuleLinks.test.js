import { fireEvent, render, screen } from '@testing-library/react';
import ModuleLinks from './ModuleLinks';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't' }) }));

test('a module shows the other modules the user may open, and its own actions', () => {
  const onNavigate = jest.fn();
  render(<ModuleLinks current="110" available={['110', '120', '620']} onNavigate={onNavigate}><button type="button">＋ Nouvelle police</button></ModuleLinks>);
  expect(screen.queryByRole('button', { name: /Gestion des polices/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '＋ Nouvelle police' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Gestion des sinistres/ }));
  expect(onNavigate).toHaveBeenCalledWith('620');
  fireEvent.click(screen.getByRole('button', { name: /Gestion des quittances/ }));
  expect(onNavigate).toHaveBeenCalledWith('120');
});

test('a module the user may not open is not offered', () => {
  render(<ModuleLinks current="120" available={['110', '120']} onNavigate={() => {}} />);
  expect(screen.getByRole('button', { name: /Gestion des polices/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Gestion des sinistres/ })).not.toBeInTheDocument();
});
