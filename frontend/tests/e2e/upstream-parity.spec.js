import process from 'node:process';
import { test, expect } from '@playwright/test';

test('latest upstream platform screens and connection controls remain reachable', async ({
    page,
}) => {
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD, 'Test login required');
    await page.goto('/login');
    await page.getByLabel('Email Address').fill(process.env.TEST_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(process.env.TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    for (const label of ['Overview', 'Google Ads', 'TikTok Ads']) {
        await page.getByRole('link', { name: label, exact: true }).click();
        await expect(
            page.getByRole('heading', { name: label, exact: true, level: 1 }),
        ).toBeVisible();
        if (label !== 'Overview')
            await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
    }
    await page.getByRole('link', { name: 'Facebook Campaigns', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Meta Ads', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Select Ad Account', exact: true }),
    ).toBeVisible();
});
