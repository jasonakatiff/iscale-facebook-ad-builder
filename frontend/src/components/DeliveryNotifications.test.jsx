import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { DeliveryNotifications } from './DeliveryNotifications';
import { deliveryRequest } from '../lib/delivery';
vi.mock('../lib/delivery', () => ({ deliveryRequest: vi.fn(), DELIVERY_NOTIFICATION_POLL_MS: 30000 }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showWarning: vi.fn() }) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'test-buyer' } }) }));
const notice = { id: 'test-notice', job_id: 'test-job', name: 'test-ad', message: 'Reconnect Meta, then retry.', status: 'failed' };
beforeEach(() => vi.clearAllMocks());
test('unread failures link to the exact job and acknowledgement persists through the API', async () => {
    deliveryRequest.mockResolvedValueOnce({ data: [notice], pagination: { total: 1 } }).mockResolvedValueOnce({ id: notice.id }).mockResolvedValue({ data: [], pagination: { total: 0 } });
    render(<MemoryRouter><DeliveryNotifications /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Posting notifications, 1 unread' }));
    expect(screen.getByRole('link', { name: 'View test-ad' })).toHaveAttribute('href', '/posting-queue?job=test-job');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification for test-ad' }));
    await waitFor(() => expect(deliveryRequest).toHaveBeenCalledWith('/notifications/test-notice/read', { method: 'POST' }));
    await screen.findByText('No unread posting failures.');
});
test('notification polling failure is visible instead of reporting zero failures', async () => {
    deliveryRequest.mockRejectedValue(new Error('Notifications unavailable'));
    render(<MemoryRouter><DeliveryNotifications /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Posting notifications unavailable' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Notifications unavailable');
});
