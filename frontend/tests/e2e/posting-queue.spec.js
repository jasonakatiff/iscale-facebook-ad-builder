import { test, expect } from '@playwright/test';
import process from 'node:process';

test('shared queue posts once, reconciles a lost response and reimports unchanged totals', async ({ page, request }) => {
    test.skip(process.env.DELIVERY_DEMO !== '1', 'Requires isolated demo with simulated Meta; never publishes live ads');
    test.setTimeout(90000);
    const api = process.env.TEST_API_URL;
    const login = await request.post(`${api}/auth/login/json`, { data: { email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD } });
    expect(login.ok()).toBeTruthy();
    const token = (await login.json()).access_token;
    const headers = { Authorization: `Bearer ${token}` };
    await page.addInitScript(value => localStorage.setItem('accessToken', value), token);
    await page.goto('/posting-queue');
    await expect(page.getByLabel('Minimum seconds between postings')).toBeVisible();
    await page.getByLabel('Minimum seconds between postings').fill('2');
    await page.getByLabel('Pause posting', { exact: true }).check();
    await page.getByRole('button', { name: 'Save delivery settings' }).click();
    await expect.poll(async () => (await (await request.get(`${api}/delivery/settings`, { headers })).json()).config.paused).toBe(true);

    const jobIds = [];
    const stamp = Date.now();
    for (const name of [`test-queue-${stamp}-one`, `test-queue-${stamp}-two`, `test-timeout-${stamp}`]) {
        const payload = { request_key: name, creative_asset_id: 'test-delivery-legacy-asset', account_id: 'act_919999', name, local_adset_id: 'test-delivery-adset', page_id: '919888', media_url: 'https://example.com/test.png', media_type: 'image', primary_text: 'test-copy', headline: 'test-headline', website_url: 'https://example.com', cta: 'LEARN_MORE', status: 'PAUSED' };
        const posted = await request.post(`${api}/delivery/launches`, { headers, data: payload });
        expect(posted.status()).toBe(202);
        const job = await posted.json();
        jobIds.push(job.id);
        const replayed = await request.post(`${api}/delivery/launches`, { headers, data: payload });
        expect((await replayed.json()).id).toBe(job.id);
    }
    const cancelled = await request.post(`${api}/facebook/ads?ad_account_id=act_919999`, { headers: { ...headers, 'Idempotency-Key': `test-cancel-${stamp}` }, data: { name: `test-cancel-${stamp}`, adset_id: '912222', creative_id: '913456', status: 'PAUSED' } });
    expect(cancelled.status()).toBe(202);
    const cancelJob = await cancelled.json();
    await page.reload();
    await page.getByRole('button', { name: `Cancel test-cancel-${stamp}`, exact: true }).click();
    await page.getByRole('button', { name: 'Cancel posting', exact: true }).click();
    await expect.poll(async () => (await (await request.get(`${api}/delivery/jobs/${cancelJob.id}`, { headers })).json()).status).toBe('cancelled');
    await page.getByLabel('Pause posting', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Save delivery settings' }).click();
    for (const id of jobIds) {
        await expect.poll(async () => (await (await request.get(`${api}/delivery/jobs/${id}`, { headers })).json()).status, { timeout: 45000 }).toMatch(/succeeded|needs_reconciliation/);
    }
    const jobs = await Promise.all(jobIds.map(async id => (await request.get(`${api}/delivery/jobs/${id}`, { headers })).json()));
    const started = jobs.map(job => new Date(job.post_started_at).getTime()).sort();
    expect(started[1] - started[0]).toBeGreaterThanOrEqual(2000);
    expect(started[2] - started[1]).toBeGreaterThanOrEqual(2000);
    await page.reload();
    await page.getByRole('button', { name: 'Find matching Facebook ad', exact: true }).click();
    await expect(page.getByLabel('Matching Facebook ad').locator('option')).toHaveCount(2);
    await page.getByLabel('Matching Facebook ad').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Link selected ad' }).click();
    await expect.poll(async () => (await (await request.get(`${api}/delivery/jobs/${jobIds[2]}`, { headers })).json()).status).toBe('succeeded');

    const syncs = (await (await request.get(`${api}/delivery/syncs`, { headers })).json()).data;
    const performance = syncs.find(sync => sync.kind === 'performance');
    for (let i = 0; i < 2; i++) {
        const restart = await request.post(`${api}/delivery/syncs/${performance.id}/restart`, { headers });
        expect(restart.ok()).toBeTruthy();
        await expect.poll(async () => (await (await request.get(`${api}/delivery/report`, { headers })).json()).pagination.total).toBe(3);
        await expect.poll(async () => (await (await request.get(`${api}/delivery/syncs`, { headers })).json()).data.find(sync => sync.id === performance.id).status).toBe('idle');
    }
    await page.getByRole('link', { name: 'View reporting', exact: true }).click();
    await expect(page.getByText('3 daily records', { exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'USD 0.29', exact: true })).toHaveCount(3);
});
