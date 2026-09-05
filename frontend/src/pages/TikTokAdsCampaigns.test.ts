import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TikTokAdsCampaigns from './TikTokAdsCampaigns';

const authFetch = vi.fn();
const showError = vi.fn();
const showSuccess = vi.fn();

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ authFetch }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showError, showSuccess }) }));

const campaignRequests = () => authFetch.mock.calls.filter(([url]) => url.includes('/campaigns?'));

describe('BreadWinner TikTok campaigns', () => {
    let connected;
    let advertiserId;
    let failCampaigns;

    beforeEach(() => {
        vi.clearAllMocks();
        connected = true;
        advertiserId = 'test-advertiser-1';
        failCampaigns = false;
        authFetch.mockImplementation(async (url, options) => {
            const path = new URL(url, 'http://localhost').pathname;
            const json = (data) => ({ ok: true, json: async () => data });
            if (path.endsWith('/connection/select')) {
                advertiserId = JSON.parse(options.body).advertiser_id;
                return json({ connected, advertiser_id: advertiserId });
            }
            if (path.endsWith('/connections')) {
                return json({ connections: [
                    { advertiser_id: 'test-advertiser-1', account_name: 'test-first', selected: true },
                    { advertiser_id: 'test-advertiser-2', account_name: 'test-second', selected: false },
                ] });
            }
            if (path.endsWith('/connection')) return json({ connected, advertiser_id: advertiserId });
            if (path.endsWith('/campaigns')) {
                if (failCampaigns) throw new Error('Network unavailable');
                const preset = new URL(url, 'http://localhost').searchParams.get('date_preset');
                return json({ campaigns: [{ campaign_id: 'test-campaign', campaign_name: `${advertiserId}-${preset}` }] });
            }
            throw new Error(`Unexpected request: ${url}`);
        });
    });

    afterEach(cleanup);

    it('loads existing campaigns after connection discovery', async () => {
        render(createElement(TikTokAdsCampaigns));
        expect(await screen.findByText('test-advertiser-1-last_30d')).toBeInTheDocument();
        expect(campaignRequests()).toHaveLength(1);
    });

    it('reloads campaigns when the date preset changes', async () => {
        render(createElement(TikTokAdsCampaigns));
        await screen.findByText('test-advertiser-1-last_30d');
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'last_7d' } });
        expect(await screen.findByText('test-advertiser-1-last_7d')).toBeInTheDocument();
        expect(campaignRequests()).toHaveLength(2);
    });

    it('does not request campaigns when disconnected', async () => {
        connected = false;
        render(createElement(TikTokAdsCampaigns));
        await screen.findByText('Not connected');
        expect(campaignRequests()).toHaveLength(0);
    });

    it('reloads campaigns after switching connected advertisers', async () => {
        render(createElement(TikTokAdsCampaigns));
        await screen.findByText('test-advertiser-1-last_30d');
        fireEvent.click(screen.getByRole('button', { name: 'Change TikTok advertiser' }));
        fireEvent.click(screen.getByRole('button', { name: /test-second/ }));
        expect(await screen.findByText('test-advertiser-2-last_30d')).toBeInTheDocument();
        expect(campaignRequests()).toHaveLength(2);
    });

    it('surfaces network errors and clears the loading state', async () => {
        failCampaigns = true;
        render(createElement(TikTokAdsCampaigns));
        await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to load TikTok campaigns'));
        expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    });
});
