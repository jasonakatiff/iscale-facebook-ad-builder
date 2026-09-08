import process from 'node:process';
import { test, expect } from '@playwright/test';

test('campaign wizard loads with account loading state and usable navigation', async ({ page }) => {
    test.skip(
        !process.env.TEST_EMAIL || !process.env.TEST_PASSWORD,
        'TEST_EMAIL and TEST_PASSWORD required',
    );
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(process.env.TEST_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(process.env.TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await page.goto('/facebook-campaigns');
    await expect(page.getByRole('heading', { name: 'Facebook Campaigns' })).toBeVisible();
    await expect(page.getByRole('button', { name: /sync/i })).toBeVisible();
    await expect(page.getByText('Review & Launch', { exact: true })).toBeVisible();
});
