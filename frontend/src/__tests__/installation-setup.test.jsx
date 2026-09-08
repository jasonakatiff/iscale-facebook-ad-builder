import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProviderConnections } from '../components/ProviderConnections';

const mocks = vi.hoisted(() => ({ api: vi.fn(), refresh: vi.fn(), isAdmin: true, toast: vi.fn() }));
vi.mock('../lib/platformApi', () => ({ usePlatformApi: () => mocks.api }));
vi.mock('../context/InstallationContext', () => ({ useInstallation: () => ({ refresh: mocks.refresh }) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasRole: () => mocks.isAdmin }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showSuccess: mocks.toast, showError: mocks.toast }) }));
vi.mock('../components/ConfirmationModal', () => ({ default: ({ isOpen, onConfirm, onClose }) => isOpen
    ? <button onClick={async () => { await onConfirm(); onClose(); }}>Confirm disconnect</button> : null }));

const provider = { provider: 'gemini', name: 'Google Gemini', purpose: 'Write ad copy',
    guide: ['Create a key in Google AI Studio.'], key_url: 'https://aistudio.google.com/app/apikey',
    configured: false, status: 'not_configured', source: null, key_hint: null, message: null };

beforeEach(() => {
    mocks.isAdmin = true;
    mocks.refresh.mockResolvedValue({});
    mocks.api.mockReset();
    mocks.api.mockImplementation(async (_path, options) => options?.method === 'PUT'
        ? { ...provider, configured: true, status: 'saved_unverified', key_hint: '••••1234' }
        : { data: [{ ...provider }] });
});

function show() { render(<MemoryRouter><ProviderConnections /></MemoryRouter>); }

it('saves a key through the app, clears the input, and does not claim verification', async () => {
    show();
    fireEvent.change(await screen.findByLabelText('Google Gemini API key'), { target: { value: 'test-secret-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('/installation/providers/gemini', {
        method: 'PUT', body: JSON.stringify({ api_key: 'test-secret-1234' }),
    }));
    await screen.findByText('Saved, not yet verified');
    expect(screen.getByLabelText('Google Gemini API key')).toHaveValue('');
    expect(screen.queryByDisplayValue('test-secret-1234')).not.toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
});

it('shows validation failure without clearing an unsaved key', async () => {
    mocks.api.mockImplementation(async (_path, options) => {
        if (options?.method === 'PUT') throw new Error('Paste the complete API key without spaces.');
        return { data: [{ ...provider }] };
    });
    show();
    fireEvent.change(await screen.findByLabelText('Google Gemini API key'), { target: { value: 'test-invalid-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Paste the complete API key');
    expect(screen.getByLabelText('Google Gemini API key')).toHaveValue('test-invalid-key');
});

it('does not request or render provider controls for non-admins', () => {
    mocks.isAdmin = false;
    show();
    expect(screen.getByText(/Only an installation administrator/)).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
});

it('disconnects with confirmation and refreshes capabilities', async () => {
    mocks.api.mockImplementation(async (_path, options) => options?.method === 'DELETE'
        ? { ...provider } : { data: [{ ...provider, configured: true, status: 'connected' }] });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    expect(mocks.api).not.toHaveBeenCalledWith('/installation/providers/gemini', { method: 'DELETE' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm disconnect' }));
    await screen.findByText('Not connected');
    expect(mocks.refresh).toHaveBeenCalled();
});
