import { test, expect } from '@playwright/test';
import process from 'node:process';

test('posting navigation, settings validation and reporting load', async ({ page }) => {
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD, 'Requires credentials for the exact test environment');
    await page.goto('/login');
    await page.getByLabel('Email Address').fill(process.env.TEST_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(process.env.TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await page.goto('/posting-queue');
    await expect(page.getByRole('link', { name: 'Posting queue', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Posting queue', exact: true })).toBeVisible();
    const retryInput = page.getByLabel('Maximum data-pull retries');
    await retryInput.fill('-1');
    await page.getByRole('button', { name: 'Save delivery settings' }).click();
    expect(await retryInput.evaluate(element => element.validity.rangeUnderflow)).toBe(true);
    await retryInput.fill('3');
    await page.getByRole('link', { name: 'View reporting', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Campaign Reporting' })).toBeVisible();
    await expect(page.getByLabel('Reporting period')).toBeVisible();
    await expect(page.getByText('124.5K', { exact: true })).toHaveCount(0);
});
