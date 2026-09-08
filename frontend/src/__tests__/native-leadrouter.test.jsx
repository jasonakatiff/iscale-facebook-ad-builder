import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeadRouterPicker } from '../components/LeadRouterPicker';
import { LeadRouterBrief } from '../components/LeadRouterDefault';
import { validateLeadRouterSelection, loadLeadRouterCampaigns } from '../lib/leadrouter';
import { publishCampaign } from '../lib/publishCampaign';
import * as facebook from '../lib/facebookApi';

const { api, showError } = vi.hoisted(() => ({
    api: vi.fn(),
    showError: vi.fn(),
}));
vi.mock('../lib/platformApi', () => ({ usePlatformApi: () => api }));
vi.mock('../context/ToastContext', () => ({
    useToast: () => ({ showError, showSuccess: vi.fn() }),
}));
vi.mock('../lib/facebookApi', () => ({
    facebookRequest: vi.fn(),
    createFacebookCampaign: vi.fn(),
    createFacebookAdSet: vi.fn(),
    createFacebookCreative: vi.fn(),
    createFacebookAd: vi.fn(),
    uploadImageToFacebook: vi.fn(),
    uploadVideoToFacebook: vi.fn(),
}));
const campaign = {
    id: 'test-campaign',
    name: 'test-Solar',
    offerName: 'test-Solar offer',
    status: 'active',
    leadCount: 7,
};
const selection = { connectionId: 'test-connection', campaign };
const mount = (component) => render(<MemoryRouter>{component}</MemoryRouter>);
beforeEach(() => {
    vi.clearAllMocks();
    api.mockImplementation(async (path) => {
        if (path === '/leadrouter/connection')
            return {
                data: { id: selection.connectionId, accountName: 'test-Partner' },
            };
        if (path.startsWith('/leadrouter/campaigns?'))
            return {
                data: [
                    campaign,
                    {
                        ...campaign,
                        id: 'test-paused',
                        name: 'test-Paused',
                        status: 'paused',
                    },
                ],
                pagination: { hasMore: false },
                fetchedAt: '2026-09-07T12:00:00Z',
            };
        if (path.startsWith('/leadrouter/campaigns/')) return { data: campaign };
        if (path.startsWith('/leadrouter/defaults/resolve'))
            return { data: { ...selection, resourceType: 'product' } };
        throw new Error(`Unexpected test route ${path}`);
    });
});

describe('native LeadRouter', () => {
    it('loads campaigns only when opened and filters inactive choices', async () => {
        const onChange = vi.fn();
        mount(<LeadRouterPicker value={null} onChange={onChange} />);
        await waitFor(() =>
            expect(api).toHaveBeenCalledWith('/leadrouter/connection', expect.anything()),
        );
        expect(api.mock.calls.some(([path]) => path.startsWith('/leadrouter/campaigns?'))).toBe(
            false,
        );
        fireEvent.click(screen.getByText('LeadRouter · Optional campaign link'));
        const picker = await screen.findByRole('combobox', {
            name: 'LeadRouter campaign',
        });
        await waitFor(() => expect(picker).toBeEnabled());
        fireEvent.focus(picker);
        expect(screen.queryByRole('option', { name: /test-Paused/ })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('option', { name: /test-Solar/ }));
        expect(onChange).toHaveBeenCalledWith(selection);
    });

    it('has a native setup path when disconnected', async () => {
        api.mockResolvedValue({ data: null });
        mount(<LeadRouterPicker value={null} onChange={vi.fn()} expanded />);
        expect(await screen.findByText(/Connect your LeadRouter account/)).toBeVisible();
        expect(screen.getByRole('link', { name: 'Configure LeadRouter' })).toHaveAttribute(
            'href',
            '/settings/leadrouter',
        );
        expect(api.mock.calls).toHaveLength(1);
    });

    it('shows upstream errors with retry and keeps the selection clearable', async () => {
        api.mockRejectedValue(new Error('LeadRouter is unavailable.'));
        const change = vi.fn();
        mount(<LeadRouterPicker value={selection} onChange={change} expanded />);
        expect(await screen.findByRole('alert')).toHaveTextContent('LeadRouter is unavailable.');
        fireEvent.click(screen.getByRole('button', { name: 'Clear LeadRouter link' }));
        expect(change).toHaveBeenCalledWith(null);
    });

    it('uses a personal product default only after an explicit action and checks live data', async () => {
        const useOffer = vi.fn();
        mount(<LeadRouterBrief productId="test-product" onUseOffer={useOffer} />);
        fireEvent.click(await screen.findByRole('button', { name: /Use product default/ }));
        expect(useOffer).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Use LeadRouter offer in brief' }));
        await waitFor(() => expect(useOffer).toHaveBeenCalledWith('test-Solar offer'));
        expect(api).toHaveBeenCalledWith(
            '/leadrouter/campaigns/test-campaign?connectionId=test-connection',
        );
    });

    it('rejects inactive selections before publication', async () => {
        api.mockResolvedValue({ data: { ...campaign, status: 'paused' } });
        await expect(validateLeadRouterSelection(api, selection)).rejects.toThrow(
            'active LeadRouter',
        );
        await expect(
            publishCampaign(
                { selectedAdAccount: { id: 'test-meta' }, leadRouter: selection },
                vi.fn(),
                vi.fn(),
                api,
            ),
        ).rejects.toThrow('active LeadRouter');
        expect(facebook.createFacebookCampaign).not.toHaveBeenCalled();
        expect(facebook.facebookRequest).not.toHaveBeenCalled();
    });

    it('saves the association when resuming a campaign after its ad set was created', async () => {
        api.mockImplementation(async (path) =>
            path.startsWith('/leadrouter/campaigns/') ? { data: campaign } : { data: {} },
        );
        const state = {
            selectedAdAccount: { id: 'test-meta' },
            leadRouter: selection,
            campaignData: { id: 'test-local-campaign' },
            adsetData: { id: 'test-adset' },
            adsData: [],
            publishProgress: {
                campaignId: 'test-meta-campaign',
                adsetId: 'test-meta-adset',
                campaignSaved: true,
                adsetSaved: true,
                leadRouterSaved: `old-connection:${campaign.id}`,
                ads: {},
            },
        };
        const checkpoint = vi.fn();
        await publishCampaign(state, checkpoint, vi.fn(), api);
        expect(api).toHaveBeenCalledWith(
            '/leadrouter/defaults/campaign/test-local-campaign',
            expect.objectContaining({
                method: 'PUT',
                body: JSON.stringify({
                    campaignId: campaign.id,
                    connectionId: selection.connectionId,
                }),
            }),
        );
        expect(checkpoint).toHaveBeenLastCalledWith(
            expect.objectContaining({
                complete: true,
                leadRouterSaved: `${selection.connectionId}:${campaign.id}`,
            }),
        );
        expect(facebook.createFacebookAdSet).not.toHaveBeenCalled();
    });

    it('follows pagination and refuses an empty continuation', async () => {
        const pages = vi
            .fn()
            .mockResolvedValueOnce({
                data: [campaign],
                pagination: { hasMore: true },
            })
            .mockResolvedValueOnce({
                data: [{ ...campaign, id: 'second' }],
                pagination: { hasMore: false },
                fetchedAt: 'test-time',
            });
        expect(
            (await loadLeadRouterCampaigns(pages, '/leadrouter/campaigns?connectionId=test')).data,
        ).toHaveLength(2);
        expect(pages.mock.calls[1][0]).toContain('offset=100');
        pages.mockResolvedValue({ data: [], pagination: { hasMore: true } });
        await expect(
            loadLeadRouterCampaigns(pages, '/leadrouter/campaigns?connectionId=test'),
        ).rejects.toThrow('changed while loading');
    });
});
