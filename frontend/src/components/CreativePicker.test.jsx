Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CreativePicker } from './CreativePicker';

const mocks = vi.hoisted(() => ({ request: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'test-user' } }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showError: mocks.error, showSuccess: mocks.success }) }));
vi.mock('../lib/creatives', async original => ({ ...await original(), creativeRequest: mocks.request }));

const asset = { id: 'test-asset', name: 'test-external.png', source_type: 'external_upload', media_type: 'image', media_url: 'https://example.com/test.png', created_by_id: 'test-user', created_by_name: 'test-uploader', analysis_status: 'ready', metadata_revision: 1, metadata: { lighting: 'soft' }, can_edit: true };
const listing = { data: [asset], pagination: { total: 1, hasMore: false } };
function Picker() { const [selected, setSelected] = useState([]); return <CreativePicker selected={selected} onChange={setSelected} />; }
beforeEach(() => {
    mocks.request.mockReset(); mocks.error.mockReset(); mocks.success.mockReset();
    mocks.request.mockImplementation(async path => path.startsWith('?') ? listing : asset);
});

it('reuses analyzed library creative and saves an attributed metadata revision', async () => {
    render(<Picker />);
    fireEvent.click(await screen.findByRole('button', { name: 'Select test-external.png' }));
    expect(await screen.findByText('Selected creative (1)')).toBeVisible();
    expect(mocks.request.mock.calls.some(([path]) => path.endsWith('/analyze'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Metadata for test-external.png' }));
    fireEvent.change(screen.getByLabelText('Lighting'), { target: { value: 'hard' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save metadata' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/test-asset', { method: 'PATCH', body: { expected_revision: 1, metadata: { lighting: 'hard' } } }));
});

it('retains a failed upload analysis for retry without uploading twice', async () => {
    let attempt = 0;
    mocks.request.mockImplementation(async path => {
        if (path.startsWith('?')) return listing;
        if (path === '/uploads') return { ...asset, analysis_status: 'pending' };
        if (path.endsWith('/analyze') && attempt++ === 0) throw new Error('test-analysis-unavailable');
        return asset;
    });
    render(<Picker />);
    fireEvent.change(screen.getByLabelText('Upload external creative'), { target: { files: [new File(['test'], 'test.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('test-analysis-unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' }));
    expect(await screen.findByText(/Analyzed · revision 1/)).toBeVisible();
    expect(mocks.request.mock.calls.filter(([path]) => path === '/uploads')).toHaveLength(1);
});

it('shows read-only metadata for a creative owned by another user', async () => {
    mocks.request.mockImplementation(async path => path.endsWith('/events') ? { data: [{ id: 'test-event', action: 'metadata_edited', actor_name: 'test-editor', created_at: '2026-09-07T00:00:00Z' }] } : path.startsWith('?') ? { ...listing, data: [{ ...asset, can_edit: false }] } : asset);
    render(<Picker />);
    fireEvent.click(await screen.findByRole('button', { name: 'Select test-external.png' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Metadata for test-external.png' }));
    expect(screen.getByLabelText('Lighting')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save metadata' })).toBeNull();
    expect(await screen.findByText(/metadata edited · test-editor/)).toBeVisible();
});
