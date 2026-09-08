import process from 'node:process';
import { test, expect } from '@playwright/test';
import { connectionScenario, loginForConnections } from '../fixtures/meta-connection';

test.afterEach(async ({ page, request }) => {
    if (process.env.TEST_CONNECTION_FIXTURE === '1') await connectionScenario(page, request, 'managed');
});

test('Meta connection smoke hides accounts/drafts while disconnected or status fails', async ({ page, request }) => {
    test.skip(process.env.TEST_CONNECTION_FIXTURE !== '1', 'Requires isolated connection fixture');
    await loginForConnections(page);
    await connectionScenario(page, request, 'disconnected');
    const accounts = [];
    page.on('request', req => { if (new URL(req.url()).pathname.endsWith('/facebook/accounts')) accounts.push(req.url()); });
    await page.goto('/facebook-campaigns');
    await expect(page.getByText('Not connected', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /discard draft/i })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Ad Account', exact: true })).toHaveCount(0);
    expect(accounts).toEqual([]);
    await page.getByRole('link', { name: /build creatives/i }).last().click();
    await expect(page).toHaveURL(/build-creatives/);
    await page.route('**/facebook/connection', route => route.abort('failed'));
    await page.goto('/facebook-campaigns');
    await expect(page.getByRole('button', { name: 'Retry Meta connection' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Ad Account', exact: true })).toHaveCount(0);
    await page.unroute('**/facebook/connection');
    await page.getByRole('button', { name: 'Retry Meta connection' }).click();
    await expect(page.getByText('Not connected', { exact: true })).toBeVisible();
});
