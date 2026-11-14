import { render, screen } from '@testing-library/react';
import WhatsAppRobotPanel from './WhatsAppRobotPanel';
import { getRobotStatus } from '../../services/whatsappRobotApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 'token' }) }));
jest.mock('../../services/whatsappRobotApi', () => ({
  getRobotStatus: jest.fn(), connectRobot: jest.fn(), newRobotQr: jest.fn(), robotPairCode: jest.fn(), disconnectRobot: jest.fn(),
}));

test('a linked number is shown as connected', async () => {
  getRobotStatus.mockResolvedValue({ statut: 'connecte', numero: '21622111222' });
  render(<WhatsAppRobotPanel />);
  expect(await screen.findByText('+21622111222')).toBeInTheDocument();
  expect(screen.getByText('Connecté')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Déconnecter ce numéro' })).toBeInTheDocument();
});

test('while linking, the QR code to scan is shown', async () => {
  getRobotStatus.mockResolvedValue({ statut: 'qr', qr_image: 'data:image/svg+xml,abc', qr_expire: false });
  render(<WhatsAppRobotPanel />);
  expect(await screen.findByAltText('QR code à scanner avec WhatsApp')).toHaveAttribute('src', 'data:image/svg+xml,abc');
  expect(screen.getByRole('button', { name: 'Obtenir un code' })).toBeDisabled();
});
