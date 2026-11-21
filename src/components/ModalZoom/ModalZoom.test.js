import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import ModalZoom from './ModalZoom';

// jsdom has no layout: every element counts as shown.
beforeAll(() => {
  Element.prototype.getClientRects = function rects() { return [{ width: 1, height: 1 }]; };
});
beforeEach(() => window.localStorage.clear());

function Page() {
  const [open, setOpen] = useState(true);
  return <>
    <button type="button" onClick={() => setOpen((value) => !value)}>Basculer</button>
    {open && <section role="dialog" aria-labelledby="t1"><h2 id="t1">Réception terme</h2></section>}
    <ModalZoom />
  </>;
}

test('a window is zoomed with − / +, and opens again with its own zoom', async () => {
  render(<Page />);
  const plus = await screen.findByRole('button', { name: 'Agrandir la fenêtre' });
  fireEvent.click(plus);
  fireEvent.click(plus);
  expect(screen.getByRole('dialog')).toHaveAttribute('data-zoom', '1.2');
  expect(screen.getByRole('button', { name: /Zoom 120 %/ })).toBeInTheDocument();

  fireEvent.click(screen.getByText('Basculer'));
  await waitFor(() => expect(screen.queryByRole('group', { name: 'Zoom de la fenêtre' })).not.toBeInTheDocument());
  fireEvent.click(screen.getByText('Basculer'));
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('data-zoom', '1.2'));

  fireEvent.click(await screen.findByRole('button', { name: /Zoom 120 %/ }));
  expect(screen.getByRole('dialog')).toHaveAttribute('data-zoom', '1');
  fireEvent.click(screen.getByRole('button', { name: 'Réduire la fenêtre' }));
  expect(screen.getByRole('dialog')).toHaveAttribute('data-zoom', '0.9');
});
