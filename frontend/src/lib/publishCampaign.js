import {
    createFacebookCampaign,
    createFacebookAdSet,
    createFacebookCreative,
    createFacebookAd,
    uploadImageToFacebook,
    uploadVideoToFacebook,
    facebookRequest,
} from './facebookApi';
import { validateLeadRouterSelection } from './leadrouter';

const activeAccounts = new Set();

export async function publishCampaign(state, onCheckpoint, onStatus, nativeApi = null) {
    const key = `breadwinner-publish:${state.selectedAdAccount.id}`;
    const run = async () => {
        if (activeAccounts.has(key))
            throw new Error('A publication for this account is already running.');
        activeAccounts.add(key);
        try {
            return await publish(state, onCheckpoint, onStatus, nativeApi);
        } finally {
            activeAccounts.delete(key);
        }
    };
    if (!navigator.locks) return run();
    return navigator.locks.request(key, { ifAvailable: true }, (lock) => {
        if (!lock)
            throw new Error('A publication for this account is already running in another tab.');
        return run();
    });
}

async function publish(state, onCheckpoint, onStatus, nativeApi) {
    if (state.leadRouter) {
        if (!nativeApi)
            throw new Error(
                'LeadRouter validation is unavailable. Reload this page before publishing.',
            );
        await validateLeadRouterSelection(nativeApi, state.leadRouter);
    }
    const accountId = state.selectedAdAccount.id;
    const progress = structuredClone(state.publishProgress || { ads: {} });
    progress.campaignLocalId ||= state.campaignData.id || crypto.randomUUID();
    progress.adsetLocalId ||= state.adsetData.id || crypto.randomUUID();
    const campaign = {
        ...state.campaignData,
        id: progress.campaignLocalId,
        status: state.campaignData.isExisting ? state.campaignData.status : 'PAUSED',
    };
    const adset = {
        ...state.adsetData,
        id: progress.adsetLocalId,
        status: state.adsetData.isExisting ? state.adsetData.status : 'PAUSED',
    };
    if (progress.uncertain)
        throw new Error(
            'A previous Facebook request has an unknown outcome. Check the recorded operation in Ads Manager before starting another publication.',
        );
    const checkpoint = async () => {
        await onCheckpoint(structuredClone(progress));
    };
    const remote = async (operation, create, record) => {
        onStatus(operation);
        // Persist intent before writing so a reload cannot silently repeat a request.
        progress.uncertain = operation;
        await checkpoint();
        const result = await create();
        record(result);
        progress.uncertain = null;
        await checkpoint();
    };
    if (!progress.campaignId) {
        if (campaign.isExisting) progress.campaignId = campaign.fbCampaignId;
        else
            await remote(
                'Create campaign',
                () => createFacebookCampaign(campaign, accountId),
                (id) => {
                    progress.campaignId = id;
                },
            );
    }
    if (!progress.campaignSaved) {
        onStatus('Saving campaign record…');
        await facebookRequest('/campaigns/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...campaign, fbCampaignId: progress.campaignId }),
        });
        progress.campaignSaved = true;
        await checkpoint();
    }
    {
        // The association is idempotent and completes before the next Meta write.
        const nativeSelectionId = state.leadRouter
            ? `${state.leadRouter.connectionId}:${state.leadRouter.campaign.id}`
            : null;
        if (state.leadRouter && progress.leadRouterSaved !== nativeSelectionId) {
            await nativeApi(`/leadrouter/defaults/campaign/${encodeURIComponent(campaign.id)}`, {
                method: 'PUT',
                body: JSON.stringify({
                    campaignId: state.leadRouter.campaign.id,
                    connectionId: state.leadRouter.connectionId,
                }),
            });
            progress.leadRouterSaved = nativeSelectionId;
            await checkpoint();
        }
        if (!state.leadRouter && progress.leadRouterSaved && nativeApi) {
            await nativeApi(`/leadrouter/defaults/campaign/${encodeURIComponent(campaign.id)}`, {
                method: 'DELETE',
            });
            progress.leadRouterSaved = null;
            await checkpoint();
        }
    }
    if (!progress.adsetId) {
        if (adset.isExisting) progress.adsetId = adset.fbAdsetId;
        else
            await remote(
                'Create ad set',
                () =>
                    createFacebookAdSet(
                        {
                            ...adset,
                            objective: campaign.objective,
                            ...(campaign.budgetType === 'CBO'
                                ? {
                                      bidStrategy: campaign.bidStrategy,
                                      bidAmount: campaign.bidAmount,
                                  }
                                : {}),
                        },
                        progress.campaignId,
                        accountId,
                        campaign.budgetType,
                    ),
                (id) => {
                    progress.adsetId = id;
                },
            );
    }
    if (!progress.adsetSaved) {
        onStatus('Saving ad set record…');
        await facebookRequest('/adsets/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...adset,
                campaignId: campaign.id,
                fbAdsetId: progress.adsetId,
            }),
        });
        progress.adsetSaved = true;
        await checkpoint();
    }
    for (const [index, ad] of state.adsData.entries()) {
        const item = (progress.ads[ad.id] ||= {});
        const media = state.creativeData.creatives.find(
            (creative) => creative.id === ad.creativeId,
        );
        const isVideo = media.mediaType === 'video';
        const creative = {
            ...state.creativeData,
            creativeName: ad.name,
            bodies: [state.creativeData.bodies[ad.bodyIndex]],
            headlines: [state.creativeData.headlines[ad.headlineIndex]],
        };
        if (!item.imageHash && !item.video) {
            onStatus(`Uploading media for ad ${index + 1} of ${state.adsData.length}…`);
            if (isVideo)
                item.video = await uploadVideoToFacebook(
                    media.videoUrl || media.previewUrl,
                    accountId,
                );
            else
                item.imageHash = await uploadImageToFacebook(
                    media.imageUrl || media.previewUrl,
                    accountId,
                );
            await checkpoint();
        }
        if (!item.creativeId)
            await remote(
                `Create creative ${index + 1}`,
                () =>
                    createFacebookCreative(
                        creative,
                        item.imageHash,
                        creative.pageId,
                        accountId,
                        item.video
                            ? {
                                  video_id: item.video.video_id,
                                  thumbnail_url: item.video.thumbnails?.[0],
                              }
                            : null,
                    ),
                (id) => {
                    item.creativeId = id;
                },
            );
        if (!item.adId)
            await remote(
                `Create paused ad ${index + 1} of ${state.adsData.length}`,
                () =>
                    createFacebookAd(
                        { ...ad, status: 'PAUSED' },
                        progress.adsetId,
                        item.creativeId,
                        accountId,
                    ),
                (id) => {
                    item.adId = id;
                },
            );
        if (!item.saved) {
            await facebookRequest('/ads/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: ad.id,
                    adsetId: adset.id,
                    name: ad.name,
                    creativeName: creative.creativeName,
                    mediaType: isVideo ? 'video' : 'image',
                    imageUrl: media.imageUrl || null,
                    videoUrl: media.videoUrl || null,
                    videoId: item.video?.video_id || null,
                    thumbnailUrl: item.video?.thumbnails?.[0] || null,
                    bodies: creative.bodies,
                    headlines: creative.headlines,
                    description: creative.description,
                    cta: creative.cta,
                    websiteUrl: creative.websiteUrl,
                    status: 'PAUSED',
                    fbAdId: item.adId,
                    fbCreativeId: item.creativeId,
                }),
            });
            item.saved = true;
            await checkpoint();
        }
    }
    progress.complete = true;
    await checkpoint();
    return progress;
}
