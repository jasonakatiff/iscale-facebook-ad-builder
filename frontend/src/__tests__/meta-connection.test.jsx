import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacebookCampaigns from '../pages/FacebookCampaigns';
import { useMetaConnection } from '../components/MetaConnectionPanel';

const mocks = vi.hoisted(() => ({ authFetch: vi.fn(), showError: vi.fn(), showSuccess: vi.fn(), provider: vi.fn(), accounts: vi.fn(), cache: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'test-user' }, authFetch: mocks.authFetch }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showError: mocks.showError, showSuccess: mocks.showSuccess }) }));
vi.mock('../lib/facebookApi', () => ({ clearAdAccountCache: mocks.cache }));
vi.mock('../context/CampaignContext', () => ({
  CampaignProvider: ({ children, draftScope }) => { mocks.provider(draftScope); return children; },
  useCampaign: () => ({ currentStep: 1, ready: true, draftStatus: 'test-draft', setCurrentStep: vi.fn(), resetWizard: vi.fn() }),
}));
vi.mock('../components/AdAccountStep', () => ({ default: () => { mocks.accounts(); return <p>test-account-controls</p>; } }));
vi.mock('../components/CampaignStep', () => ({ default: () => null }));
vi.mock('../components/AdSetStep', () => ({ default: () => null }));
vi.mock('../components/AdCreativeStep', () => ({ default: () => null }));
vi.mock('../components/BulkAdCreation', () => ({ default: () => null }));
vi.mock('../components/CampaignReview', () => ({ CampaignReview: () => null }));
vi.mock('../components/CampaignPresetLibrary', () => ({ CampaignPresetLibrary: () => null }));

const response = body => ({ ok: true, json: async () => structuredClone(body) });
function routes(connection, connections = []) {
  mocks.authFetch.mockImplementation(async url => response(url.endsWith('/connections') ? { connections } : connection));
}
const mount = () => render(<MemoryRouter><FacebookCampaigns /></MemoryRouter>);
afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => { vi.clearAllMocks(); routes({ connected: false, state: 'disconnected' }); });

describe('Meta connection page gate', () => {
  it('disables personal connection until server OAuth setup is available', async () => {
    routes({ connected: false, state: 'disconnected', oauth_available: false });
    mount();
    await screen.findByText('Personal Meta connections will be available after setup.');
    const connect = screen.getByRole('button', { name: 'Connect' });
    expect(connect).toBeDisabled();
    fireEvent.click(connect);
    expect(mocks.authFetch.mock.calls.some(([url]) => url.endsWith('/oauth/start'))).toBe(false);
  });
  it('keeps managed campaign controls available while personal OAuth is deferred', async () => {
    routes({ connected: true, state: 'connected', source: 'managed', oauth_available: false, can_disconnect: false });
    mount();
    await screen.findByText('Personal Meta connections will be available after setup.');
    expect(screen.getByText('test-account-controls')).toBeInTheDocument();
    expect(mocks.provider).toHaveBeenCalledWith('system');
  });
  it('does not mount account or draft controls when disconnected', async () => {
    mount();
    await screen.findByText('Not connected');
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(mocks.accounts).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /discard draft/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /build creatives/i })).toHaveAttribute('href', '/build-creatives');
  });
  it('keeps loading hidden until status and choices resolve', async () => {
    let finish;
    mocks.authFetch.mockImplementation(url => url.endsWith('/connections') ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(response({ connected: true, source: 'managed' })));
    mount();
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(mocks.provider).not.toHaveBeenCalled();
    await act(async () => finish(response({ connections: [] })));
    await screen.findByText('test-account-controls');
  });
  it('labels managed access and retains system draft scope without Disconnect', async () => {
    routes({ connected: true, state: 'connected', source: 'managed', can_disconnect: false, ad_account_id: 'act_123' });
    mount();
    await screen.findByText(/Connected through workspace/);
    expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
    expect(mocks.provider).toHaveBeenCalledWith('system');
  });
  it('blocks expired personal credentials even when a legacy response says connected', async () => {
    routes({ connected: true, source: 'oauth', token_expires_at: '2000-01-01T00:00:00Z' });
    mount();
    await screen.findByText('Connection expired');
    expect(mocks.accounts).not.toHaveBeenCalled();
  });
  it('shows a persistent retry on failed status then recovers', async () => {
    mocks.authFetch.mockRejectedValue(new Error('test-network-down'));
    mount();
    await screen.findByRole('alert');
    expect(mocks.provider).not.toHaveBeenCalled();
    routes({ connected: true, source: 'managed', can_disconnect: false });
    fireEvent.click(screen.getByRole('button', { name: /retry meta connection/i }));
    await screen.findByText('test-account-controls');
  });
  it('keeps selection mode outside the campaign provider', async () => {
    routes({ connected: false, state: 'selection_required' }, [{ ad_account_id: 'act_111', account_name: 'test-choice', selected: false }]);
    mount();
    await screen.findByRole('heading', { name: 'Choose a Meta ad account' });
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it('disconnect rechecks effective managed fallback', async () => {
    let disconnected = false;
    mocks.authFetch.mockImplementation(async (url, options) => {
      if (options?.method === 'DELETE') { disconnected = true; return response({ message: 'Disconnected' }); }
      if (url.endsWith('/connections')) return response({ connections: [] });
      return response(disconnected ? { connected: true, source: 'managed', can_disconnect: false } : { connected: true, source: 'oauth', can_disconnect: true, ad_account_id: 'act_111' });
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    await screen.findByText(/Connected through workspace/);
    expect(mocks.provider).toHaveBeenCalledWith('act_111');
    expect(mocks.provider).toHaveBeenCalledWith('system');
  });
  it('ignores a status response that arrives after a newer refresh', async () => {
    let finishOld;
    let calls = 0;
    mocks.authFetch.mockImplementation(url => {
      if (url.endsWith('/connections')) return Promise.resolve(response({ connections: [] }));
      calls += 1;
      return calls === 1 ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve(response({ connected: true, source: 'managed', ad_account_id: 'act_222' }));
    });
    const { result } = renderHook(() => useMetaConnection());
    await act(async () => { await result.current.refreshConnection(); });
    await act(async () => finishOld(response({ connected: true, source: 'oauth', ad_account_id: 'act_111' })));
    expect(result.current.connection.ad_account_id).toBe('act_222');
  });
  it('closes campaign controls when a known token expires while the page stays open', async () => {
    vi.useFakeTimers();
    routes({ connected: true, source: 'oauth', token_expires_at: new Date(Date.now() + 1000).toISOString() });
    mount();
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('test-account-controls')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1001); });
    expect(screen.queryByText('test-account-controls')).not.toBeInTheDocument();
  });
  it('does not let the previous token expiry interrupt an account selection', async () => {
    vi.useFakeTimers();
    let finishSelection;
    const oldConnection = { connected: true, source: 'oauth', ad_account_id: 'act_old', token_expires_at: new Date(Date.now() + 1000).toISOString() };
    mocks.authFetch.mockImplementation((url, options) => {
      if (options?.method === 'POST') return new Promise(resolve => { finishSelection = resolve; });
      return Promise.resolve(response(url.endsWith('/connections') ? { connections: [] } : oldConnection));
    });
    const { result } = renderHook(() => useMetaConnection());
    await act(async () => { await Promise.resolve(); });
    let selecting;
    act(() => { selecting = result.current.selectMetaAccount('act_new'); });
    expect(result.current.canUseCampaign).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1001); });
    await act(async () => {
      finishSelection(response({ connected: true, source: 'oauth', ad_account_id: 'act_new' }));
      await selecting;
    });
    expect(result.current.connection.ad_account_id).toBe('act_new');
    expect(result.current.canUseCampaign).toBe(true);
  });
  it('keeps an expired original connection blocked after selection fails', async () => {
    vi.useFakeTimers();
    let finishSelection;
    const oldConnection = { connected: true, source: 'oauth', ad_account_id: 'act_old', token_expires_at: new Date(Date.now() + 1000).toISOString() };
    mocks.authFetch.mockImplementation((url, options) => {
      if (options?.method === 'POST') return new Promise(resolve => { finishSelection = resolve; });
      return Promise.resolve(response(url.endsWith('/connections') ? { connections: [] } : oldConnection));
    });
    const { result } = renderHook(() => useMetaConnection());
    await act(async () => { await Promise.resolve(); });
    let selecting;
    act(() => { selecting = result.current.selectMetaAccount('act_new'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1001); });
    await act(async () => {
      finishSelection({ ok: false, json: async () => ({ detail: 'test-selection-failed' }) });
      await selecting;
    });
    expect(result.current.canUseCampaign).toBe(false);
    expect(mocks.showError).toHaveBeenCalledWith('test-selection-failed');
  });
});
