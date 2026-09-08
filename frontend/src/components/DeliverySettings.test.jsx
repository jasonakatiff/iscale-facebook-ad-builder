import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { DeliverySettings } from './DeliverySettings';
import { deliveryRequest } from '../lib/delivery';

vi.mock('../lib/delivery', async importOriginal => ({ ...await importOriginal(), deliveryRequest: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasRole: () => true }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }));

const config = { min_interval_seconds: 2, max_posts: 30, window_seconds: 60, max_read_retries: 3, max_post_retries: 3,
    status_interval_seconds: 300, stable_status_interval_seconds: 3600, performance_interval_seconds: 14400,
    lookback_days: 2, reconcile_days: 35, reconcile_interval_hours: 24, metadata_cache_hours: 24,
    api_requests_per_minute: 120, import_requests_per_minute: 60, account_requests_per_minute: 60,
    api_daily_request_limit: 10000, api_max_concurrency: 2, api_usage_pause_percent: 80, async_poll_seconds: 30,
    paused: false, imports_enabled: true };

beforeEach(() => { vi.clearAllMocks(); deliveryRequest.mockResolvedValue({ config }); });

test('converts readable refresh units and persists request limits', async () => {
    render(<DeliverySettings />);
    const interval = await screen.findByLabelText('Performance refresh (hours)');
    expect(interval.value).toBe('4');
    fireEvent.change(interval, { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Shared requests per minute'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save delivery settings' }));
    await waitFor(() => expect(deliveryRequest).toHaveBeenCalledWith('/settings', {
        method: 'PUT', body: { ...config, performance_interval_seconds: 3600, api_requests_per_minute: 90 },
    }));
});

test('keeps edits and displays server validation errors', async () => {
    render(<DeliverySettings />);
    await screen.findByLabelText('Performance refresh (hours)');
    deliveryRequest.mockRejectedValueOnce(new Error('Import allowance exceeds the shared limit'));
    fireEvent.change(screen.getByLabelText('Shared requests per minute'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save delivery settings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Import allowance exceeds');
    expect(screen.getByLabelText('Shared requests per minute').value).toBe('20');
});
