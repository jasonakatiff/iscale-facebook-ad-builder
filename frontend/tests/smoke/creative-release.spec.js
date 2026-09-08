import process from 'node:process';
import { test, expect } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off' });

test('deployed creative library and shared request settings expose the release contract', async ({ page, request }) => {
    test.skip(process.env.TEST_RAILWAY_LAUNCH !== '1', 'Opt-in authenticated production read-only check');
    await page.goto('/login');
    await page.getByLabel('Email Address', { exact: true }).fill(process.env.TEST_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(process.env.TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/settings?tab=traffic');
    const metaSettings = page.getByRole('region', { name: 'Traffic source sync settings', exact: true });
    await expect(metaSettings.getByLabel('Performance refresh (hours)')).toBeVisible();
    await expect(metaSettings.getByLabel('Maximum posting retries')).toBeVisible();
    await expect(metaSettings.getByLabel('Shared requests per rolling 24 hours')).toBeVisible();
    expect(Number(await metaSettings.getByLabel('Shared requests per minute').inputValue())).toBeGreaterThan(0);
    await page.goto('/creative-library');
    await expect(page.getByRole('heading', { name: 'Creative Library', exact: true })).toBeVisible();
    await expect(page.getByLabel('Upload external creative')).toBeAttached();
    await page.getByLabel('Creative source', { exact: true }).selectOption('external_upload');
    const token = await page.evaluate(() => localStorage.getItem('accessToken'));
    const api = process.env.TEST_API_URL;
    const response = await request.get(`${api}/creatives?limit=5`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.ok()).toBeTruthy();
    const library = await response.json();
    expect(library.pagination).toHaveProperty('total');
    for (const asset of library.data) {
        expect(['system_generated', 'external_upload']).toContain(asset.source_type);
        expect(asset).toHaveProperty('created_by_id');
        expect(['pending', 'ready', 'failed']).toContain(asset.analysis_status);
    }
    await page.goto('/posting-queue');
    await expect(page.getByRole('region', { name: 'Posting jobs' })).toBeVisible();
    await page.goto('/reporting');
    await expect(page.getByRole('heading', { name: 'Meta ad performance' })).toBeVisible();
});
