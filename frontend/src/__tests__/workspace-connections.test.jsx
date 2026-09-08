import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { workspaceRequest, listWorkspaceRows, WORKSPACE_JOB_POLL_MS } from '../lib/workspaceApi';
import { AccountSnapshotPanel } from '../components/WorkspaceConnections';

vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showError: vi.fn(), showSuccess: vi.fn() }) }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
const page = (data = [], sync = {}) => ({ data, pagination: { total: data.length, hasMore: false }, sync: { coverage: 'none', status: 'pending', stale: true, ...sync } });
const account = { id: 'test-a', can_sync: true, state: 'connected', account_name: 'test-account' };

it('checks HTTP errors before parsing and uses the v2 route', async () => {
    const parse = vi.fn();
    const fetcher = vi.fn(async () => ({ ok: false, status: 403, json: parse }));
    await expect(workspaceRequest(fetcher, '/workspaces')).rejects.toThrow(/access/i);
    expect(parse).not.toHaveBeenCalled();
    expect(fetcher.mock.calls[0][0]).toMatch(/\/api\/v2\/workspaces$/);
});

it('loads all pages for searchable choices', async () => {
    const api = vi.fn(async path => path.includes('offset=100') ? page([{ id: 'test-b' }]) : { data: [{ id: 'test-a' }], pagination: { hasMore: true, limit: 100 } });
    expect(await listWorkspaceRows(api, '/workspaces')).toEqual([{ id: 'test-a' }, { id: 'test-b' }]);
    expect(api).toHaveBeenCalledTimes(2);
});

it('only enqueues when requested; status polling never enqueues again', async () => {
    const api = vi.fn(async (path, options) => options?.method === 'POST' ? { status: 'queued' } : page([], { status: 'queued' }));
    render(<AccountSnapshotPanel api={api} account={account} />);
    await screen.findByText(/Waiting to start/);
    expect(api.mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(true);
    cleanup();
    api.mockImplementation(async (path, options) => options?.method === 'POST' ? { status: 'queued' } : page());
    render(<AccountSnapshotPanel api={api} account={account} />);
    const refresh = await screen.findByRole('button', { name: 'Refresh this account' });
    await waitFor(() => expect(refresh).toBeEnabled());
    fireEvent.click(refresh);
    await waitFor(() => expect(api.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1));
    const mutation = api.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(mutation[0]).toBe('/accounts/test-a/sync');
});

it('ignores late snapshots after changing accounts', async () => {
    let resolveOld;
    const api = vi.fn(path => path.includes('test-a') ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(page([{ id: '2', name: 'test-new-campaign' }], { coverage: 'complete' })));
    const view = render(<AccountSnapshotPanel api={api} account={account} />);
    await waitFor(() => expect(resolveOld).toBeDefined());
    view.rerender(<AccountSnapshotPanel api={api} account={{ ...account, id: 'test-b' }} />);
    await screen.findByText('test-new-campaign');
    await act(async () => resolveOld(page([{ id: '1', name: 'test-old-campaign' }], { coverage: 'complete' })));
    expect(screen.queryByText('test-old-campaign')).not.toBeInTheDocument();
});

it('hides sync for read-only grants and clears rows after a denied status check', async () => {
    const api = vi.fn(async () => page([{ id: '1', name: 'test-private-campaign' }], { coverage: 'complete' }));
    render(<AccountSnapshotPanel api={api} account={{ ...account, can_sync: false }} />);
    await screen.findByText('test-private-campaign');
    expect(screen.queryByRole('button', { name: 'Refresh this account' })).not.toBeInTheDocument();
    api.mockRejectedValue(new Error('Account access is unavailable.'));
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('test-private-campaign')).not.toBeInTheDocument();
});

it('distinguishes a successful empty snapshot from never synced', async () => {
    render(<AccountSnapshotPanel api={async () => page([], { coverage: 'complete', status: 'succeeded' })} account={account} />);
    await screen.findByText('No campaigns in the last complete refresh.');
    expect(screen.queryByText('No snapshot yet.')).not.toBeInTheDocument();
});

it('polls a queued job without requesting another Facebook refresh', async () => {
    vi.useFakeTimers();
    const api = vi.fn(async () => page([], { status: 'queued' }));
    render(<AccountSnapshotPanel api={api} account={account} />);
    await act(async () => {});
    expect(api).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(WORKSPACE_JOB_POLL_MS * 2); });
    expect(api).toHaveBeenCalledTimes(3);
    expect(api.mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(true);
});

it('preserves the last complete rows on failed sync and blocks unavailable credentials', async () => {
    render(<AccountSnapshotPanel api={async () => page([{ id: '1', name: 'test-last-complete' }], { coverage: 'complete', status: 'failed', error: { message: 'Meta request failed.' } })} account={{ ...account, state: 'unavailable' }} />);
    await screen.findByText('test-last-complete');
    expect(screen.getByText(/Refresh failed/)).toBeInTheDocument();
    expect(screen.getByText('Stale · refresh needed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh this account' })).toBeDisabled();
});
