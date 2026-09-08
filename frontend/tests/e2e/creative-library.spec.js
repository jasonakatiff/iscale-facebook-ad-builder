import { test, expect } from '@playwright/test';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('image and video uploads retain user, source and launch metadata after edits and archive', async ({ page, request }) => {
    test.skip(process.env.CREATIVE_STUDIO_DEMO !== '1', 'Requires isolated real API/database with simulated providers');
    test.setTimeout(90000);
    const api = process.env.TEST_API_URL;
    expect(new URL(api).hostname).toBe('127.0.0.1');
    const login = await request.post(`${api}/auth/login/json`, { data: { email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD } });
    expect(login.ok()).toBeTruthy();
    const token = (await login.json()).access_token;
    const headers = { Authorization: `Bearer ${token}` };
    await page.addInitScript(value => localStorage.setItem('accessToken', value), token);
    await page.goto('/creative-library');
    const name = `test-external-${Date.now()}.png`;
    await page.getByLabel('Upload external creative', { exact: true }).setInputFiles({ name, mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1sAAAAASUVORK5CYII=', 'base64') });
    await page.getByRole('button', { name: `Metadata for ${name}` }).click();
    await expect(page.getByLabel('Lighting', { exact: true })).toHaveValue('natural');
    await page.getByLabel('Lighting', { exact: true }).fill('hard');
    await page.getByRole('button', { name: 'Save metadata', exact: true }).click();
    await expect(page.getByText('Metadata saved with your user attribution')).toBeVisible();
    await page.getByRole('button', { name: 'Close metadata' }).click();
    await page.getByLabel('Upload external creative', { exact: true }).setInputFiles(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/test-creative.mp4'));
    await expect(page.getByRole('button', { name: 'Metadata for test-creative.mp4' })).toBeVisible();
    const assets = (await (await request.get(`${api}/creatives`, { headers })).json()).data;
    const image = assets.find(asset => asset.name === name);
    const video = assets.find(asset => asset.name === 'test-creative.mp4');
    const stamp = String(Date.now());
    const campaignId = `test-creative-campaign-${stamp}`, adsetId = `test-creative-adset-${stamp}`;
    const savedCampaign = await request.post(`${api}/facebook/campaigns/save`, { headers, data: { id: campaignId, name: campaignId, objective: 'OUTCOME_LEADS', budgetType: 'ABO', fbCampaignId: '999001' } });
    expect(savedCampaign.ok()).toBeTruthy();
    const savedAdset = await request.post(`${api}/facebook/adsets/save`, { headers, data: { id: adsetId, campaignId, name: adsetId, optimizationGoal: 'OFFSITE_CONVERSIONS', fbAdsetId: '999002' } });
    expect(savedAdset.ok()).toBeTruthy();
    const jobs = [];
    for (const asset of [image, video]) {
        expect(asset.source_type).toBe('external_upload');
        expect(asset.analysis_status).toBe('ready');
        const body = { request_key: `test-${asset.id}`, account_id: 'act_123', name: asset.name, local_adset_id: adsetId, page_id: '112', media_url: asset.media_url, media_type: asset.media_type, creative_asset_id: asset.id, primary_text: 'test-copy', headline: 'test-headline', website_url: 'https://example.com/', status: 'PAUSED' };
        const result = await request.post(`${api}/delivery/launches`, { headers, data: body });
        expect(result.status()).toBe(202);
        const job = await result.json(); jobs.push(job);
        expect(job.owner_id).toBe(asset.created_by_id);
        expect(job.creative_snapshot.created_by_id).toBe(asset.created_by_id);
    }
    for (let count = 0; count < 24; count++) await request.post(`${api.replace('/api/v1', '')}/test-creatives/tick`);
    for (const job of jobs) {
        const saved = await request.get(`${api}/delivery/jobs/${job.id}`, { headers });
        expect((await saved.json()).status).toBe('succeeded');
    }
    await page.getByRole('button', { name: `Metadata for ${name}` }).click();
    await page.getByLabel('Lighting', { exact: true }).fill('soft');
    await page.getByRole('button', { name: 'Save metadata', exact: true }).click();
    await expect.poll(async () => (await (await request.get(`${api}/creatives/${image.id}`, { headers })).json()).metadata_revision).toBe(3);
    await page.getByRole('button', { name: 'Archive creative', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm archive', exact: true }).click();
    await expect(page.getByText('Creative archived; launch history is retained')).toBeVisible();
    const events = (await (await request.get(`${api}/creatives/${image.id}/events`, { headers })).json()).data;
    expect(events.map(event => event.action)).toEqual(expect.arrayContaining(['uploaded', 'analyzed', 'metadata_edited', 'launched', 'archived']));
    const report = (await (await request.get(`${api}/delivery/report`, { headers })).json()).data;
    expect(report.find(row => row.creative_asset_id === image.id).creative_snapshot.metadata.lighting).toBe('hard');
    await page.goto('/reporting');
    await expect(page.getByText('Creator:', { exact: false }).first()).toBeVisible();
});
