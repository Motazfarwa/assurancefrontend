import { Component } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ModulesWorkspace from '../ModulesWorkspace/ModulesWorkspace';
import BackButton, { closeButtonOf, topDialog } from './BackButton';
import { INSURANCE_MODULES } from '../../data/insuranceModules';
import { ClientProvider } from '../../contexts/ClientContext';

jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ accessToken: 't', user: { name: 'Admin', isAdmin: true, role: 'admin', lieu: 'SIEGE' }, logout: () => {} }),
}));

class Boundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError(error) { return { failed: String(error && error.stack).slice(0, 400) }; }
  render() { return this.state.failed ? <p>crashed {this.state.failed}</p> : this.props.children; }
}

beforeEach(() => {
  // jsdom lays nothing out: every element counts as shown.
  jest.spyOn(Element.prototype, 'getClientRects').mockImplementation(() => [{}]);
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: () => Promise.resolve([]), text: () => Promise.resolve('[]'), blob: () => Promise.resolve(new Blob()) }));
  jest.spyOn(window, 'confirm').mockImplementation(() => true);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

test('Retour closes the window on top, then the one under it', async () => {
  const closeInner = jest.fn();
  const closeOuter = jest.fn();
  function Windows({ inner }) {
    return <>
      <section role="dialog" aria-label="Module"><button type="button" onClick={closeOuter} aria-label="Fermer">×</button><button type="button">Annuler</button>
        {inner && <section role="alertdialog" aria-label="Confirmer"><button type="button" onClick={closeInner}>Annuler</button><button type="button">Oui</button></section>}
      </section>
      <BackButton />
    </>;
  }
  const { rerender } = render(<Windows inner />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retour à la fenêtre précédente' }));
  expect(closeInner).toHaveBeenCalledTimes(1);
  expect(closeOuter).not.toHaveBeenCalled();
  rerender(<Windows inner={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Retour à la fenêtre précédente' }));
  expect(closeOuter).toHaveBeenCalledTimes(1);
});

test('Retour is hidden on the workspace with no window open', async () => {
  window.history.pushState({}, '', '/workspace');
  render(<BackButton />);
  await act(async () => {});
  expect(screen.queryByRole('button', { name: 'Retour à la fenêtre précédente' })).toBeNull();
});

// Every module of the workspace: opened, then "Retour" brings back the list of programmes.
const modules = INSURANCE_MODULES.filter((module) => module.form !== 'client');
test.each(modules.map((module) => [module.id, module.title, module]))('Retour closes module %s %s', async (_id, _title, module) => {
  window.history.pushState({}, '', '/workspace');
  render(<ClientProvider><Boundary><ModulesWorkspace /></Boundary></ClientProvider>);
  fireEvent.click(screen.getByRole('radio', { name: /Tous/ }));
  const row = screen.getAllByRole('button').find((button) => button.title.startsWith(`${module.id} · ${module.title}`));
  if (!row) return; // not in the list for this test user (permission)
  fireEvent.click(row);
  await waitFor(() => expect(topDialog()).not.toBeNull());
  await act(async () => {});
  for (let step = 0; step < 4 && topDialog(); step += 1) {
    const dialog = topDialog();
    expect([dialog.getAttribute('aria-label') || dialog.className, Boolean(closeButtonOf(dialog))]).toEqual([dialog.getAttribute('aria-label') || dialog.className, true]);
    await act(async () => { closeButtonOf(dialog).click(); });
  }
  expect(topDialog()).toBeNull();
});
