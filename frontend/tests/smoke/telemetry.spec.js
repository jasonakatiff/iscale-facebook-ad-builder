import { test, expect } from '@playwright/test';
import process from 'node:process';

test('telemetry requires login', async ({ page }) => {
    await page.goto('/telemetry');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
});

test('admin telemetry navigation and key form validation', async ({ page }) => {
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD, 'Requires an active admin test account.');
    await page.goto('/login');
    await page.getByLabel(/email address/i).fill(process.env.TEST_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(process.env.TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i, exact: true }).click();
    await page.getByRole('link', { name: 'Telemetry', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Telemetry', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Collection health' })).toContainText('Environment:');
    await expect(page.getByRole('button', { name: 'Find trace' })).toBeVisible();
    await page.getByRole('link', { name: 'Manage API keys' }).click();
    await expect(page.getByRole('button', { name: 'Create key', exact: true })).toBeDisabled();
    await page.getByLabel('Key name').fill('test-smoke-agent');
    await expect(page.getByRole('button', { name: 'Create key', exact: true })).toBeEnabled();
    await page.getByRole('combobox', { name: /^Access/ }).selectOption('telemetry');
});
