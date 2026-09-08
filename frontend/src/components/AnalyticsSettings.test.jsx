import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { AnalyticsSettings } from './AnalyticsSettings';
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/platformApi', () => ({ usePlatformApi: () => api }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }));
const config = { enabled: true, performance_interval_seconds: 14400, lookback_days: 2, reconcile_days: 30, reconcile_interval_hours: 24, metadata_cache_hours: 24, api_requests_per_minute: 60, api_daily_request_limit: 5000, api_max_concurrency: 2, max_read_retries: 3 };
const patterns = { metric: 'cpa', days: 28, maturity_days: 2, min_impressions: 1000, min_cohort_creatives: 4, min_cohort_conversions: 10, min_trait_creatives: 3, winner_percent: 25, max_fdr: .1, meta_conversion_event: 'lead' };
beforeEach(() => { vi.clearAllMocks(); api.mockResolvedValue({ providers: { google: config }, patterns, configured: { google: false }, can_edit: true }); });
test('persists provider limits and converts hours to seconds', async () => {
    render(<AnalyticsSettings />);
    fireEvent.change(await screen.findByLabelText('Performance refresh (hours)'), { target: { value: '2' } });
    api.mockResolvedValueOnce({ config: { ...config, performance_interval_seconds: 7200 } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Google settings' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/analytics/settings/google', { method: 'PUT', body: JSON.stringify({ ...config, performance_interval_seconds: 7200 }) }));
});
test('read-only buyers can inspect settings without a save action', async () => {
    api.mockResolvedValue({ providers: { google: config }, patterns, configured: { google: true }, can_edit: false });
    render(<AnalyticsSettings />);
    expect(await screen.findByLabelText('Performance refresh (hours)')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save Google settings' })).toBeNull();
});
test('shows save failures and preserves edits', async () => {
    render(<AnalyticsSettings />);
    await screen.findByLabelText('Performance refresh (hours)');
    api.mockRejectedValueOnce(new Error('Correction window must cover the recent window'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Google settings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Correction window');
});
