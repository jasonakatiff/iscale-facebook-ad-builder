import { useCallback } from 'react';
import { usePlatformApi } from './platformApi';
import { useWorkspaceData } from './workspaceApi';

export const LEADROUTER_SETTINGS_PATH = '/settings/leadrouter';
export const LEADROUTER_ORIGIN = 'https://theleadrouter.com';
export const MAX_LEADROUTER_PAGES = 100;

export async function loadLeadRouterCampaigns(api, path, options) {
    const rows = new Map();
    for (let index = 0; index < MAX_LEADROUTER_PAGES; index += 1) {
        const result = await api(`${path}&limit=100&offset=${index * 100}`, options);
        result.data.forEach((row) => rows.set(row.id, row));
        if (!result.pagination.hasMore)
            return { data: [...rows.values()], fetchedAt: result.fetchedAt };
        if (!result.data.length)
            throw new Error(
                'LeadRouter’s campaign list changed while loading. Refresh to try again.',
            );
    }
    throw new Error(
        'This account exceeds the 10,000 campaign picker limit. Use an account with narrower campaign access.',
    );
}

export function useLeadRouterCatalog(enabled) {
    const api = usePlatformApi();
    const connection = useWorkspaceData(api, '/leadrouter/connection', {
        poll: false,
    });
    const catalogApi = useCallback(
        (path, options) => loadLeadRouterCampaigns(api, path, options),
        [api],
    );
    const catalog = useWorkspaceData(
        catalogApi,
        enabled && connection.data?.data
            ? `/leadrouter/campaigns?connectionId=${connection.data.data.id}`
            : null,
        { poll: false },
    );
    return { connection, catalog };
}

export function leadRouterSelection(connectionId, campaign) {
    return campaign ? { connectionId, campaign } : null;
}

export async function validateLeadRouterSelection(api, selection) {
    if (!selection) return null;
    const result = await api(
        `/leadrouter/campaigns/${selection.campaign.id}?connectionId=${selection.connectionId}`,
    );
    if (result.data.status !== 'active')
        throw new Error('Choose an active LeadRouter campaign before publishing.');
    return result.data;
}
