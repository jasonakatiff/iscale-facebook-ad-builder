import { beforeEach, expect, it, vi } from 'vitest';
import { publishCampaign } from './publishCampaign';
import { deliveryRequest, prepareQueueMedia } from './delivery';
import { createFacebookAd, createFacebookCreative, facebookRequest } from './facebookApi';
vi.mock('./delivery', () => ({ deliveryRequest: vi.fn(), prepareQueueMedia: vi.fn() }));
vi.mock('./facebookApi', () => ({ createFacebookCampaign: vi.fn(), createFacebookAdSet: vi.fn(), createFacebookAd: vi.fn(), createFacebookCreative: vi.fn(), uploadImageToFacebook: vi.fn(), uploadVideoToFacebook: vi.fn(), facebookRequest: vi.fn() }));
const draft = () => ({
 selectedAdAccount: {id: 'act_123'}, campaignData: {id: 'test-campaign'}, adsetData: {id: 'test-adset'},
 creativeData: { pageId: '123', instagramId: '456', websiteUrl: 'https://example.com/', urlParameters: 'utm_source=test', cta: 'LEARN_MORE', bodies: ['test-body'], headlines: ['test-headline'], creatives: [{ id: 'test-image', imageUrl: 'https://example.com/test.png', mediaType: 'image'}]},
 adsData: [{ id: 'test-ad', creativeId: 'test-image', bodyIndex: 0, headlineIndex: 0, name: 'test-ad'}],
 publishProgress: { campaignId: '123', adsetId: '456', campaignSaved: true, adsetSaved: true, ads: {} },
});
beforeEach(() => { vi.clearAllMocks(); prepareQueueMedia.mockResolvedValue('https://example.com/test.png'); deliveryRequest.mockResolvedValue({id: 'test-job', status: 'queued'}); });
it('queues the reviewed paused ad with its exact copy, identity and tracking', async () => {
 const checkpoint = vi.fn();
 await publishCampaign(draft(), checkpoint, vi.fn());
 expect(deliveryRequest).toHaveBeenCalledWith('/launches', { method: 'POST', body: expect.objectContaining({request_key: 'test-ad', status: 'PAUSED', primary_text: 'test-body', headline: 'test-headline', instagram_user_id: '456', url_tags: 'utm_source=test', local_adset_id: 'test-adset'})});
 expect(createFacebookAd).not.toHaveBeenCalled(); expect(createFacebookCreative).not.toHaveBeenCalled(); expect(facebookRequest).not.toHaveBeenCalled();
 expect(checkpoint).toHaveBeenLastCalledWith(expect.objectContaining({complete: true, queued: true, ads: {'test-ad': expect.objectContaining({jobId: 'test-job'})}}));
});
it('persists the submission before sending and retries the same request after a lost response', async () => {
 const state = draft(); const checkpoint = vi.fn(progress => { state.publishProgress = progress; });
 deliveryRequest.mockRejectedValueOnce(new Error('test-lost-response'));
 await expect(publishCampaign(state, checkpoint, vi.fn())).rejects.toThrow('test-lost-response');
 expect(state.publishProgress.complete).not.toBe(true); expect(state.publishProgress.uncertain).toBeUndefined();
 const first = deliveryRequest.mock.calls[0][1].body;
 await publishCampaign(state, checkpoint, vi.fn());
 expect(deliveryRequest.mock.calls[1][1].body).toEqual(first);
 expect(prepareQueueMedia).toHaveBeenCalledTimes(1);
});
