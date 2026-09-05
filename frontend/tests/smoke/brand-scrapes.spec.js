// @ts-check
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@test.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testpassword';

test.describe('Brand Scrapes Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Fill login form
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard (not login page)
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 20000 });
    await page.waitForLoadState('networkidle');
  });

  test('brand scrapes page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/research/brand-scrapes`);
    await page.waitForLoadState('networkidle');

    // Check page title
    await expect(page.getByRole('heading', { name: 'Scrape Brand Ads' })).toBeVisible({ timeout: 15000 });

    // Check form elements - use actual placeholders
    await expect(page.locator('input[placeholder*="Nike"]')).toBeVisible();
    await expect(page.locator('input[placeholder*="123456789"]')).toBeVisible();
  });

  test('brand scrapes navigation works', async ({ page }) => {
    // Navigate via sidebar
    await page.click('text=Research');
    await page.click('text=Scrape Brand Ads');

    await expect(page).toHaveURL(/\/research\/brand-scrapes/);
  });

  test('form validation shows error for invalid input', async ({ page }) => {
    await page.goto(`${BASE_URL}/research/brand-scrapes`);
    await page.waitForLoadState('networkidle');

    // Wait for form to load
    const brandInput = page.locator('input[placeholder*="Nike"]');
    await brandInput.waitFor({ state: 'visible', timeout: 15000 });

    // Fill form with invalid input (not a page ID or valid URL)
    await brandInput.fill('TestBrand');
    await page.locator('input[placeholder*="123456789"]').fill('invalid-input');

    // Submit
    await page.click('button[type="submit"]');

    // Should show error toast
    await expect(page.getByText(/Invalid input/i).first()).toBeVisible({ timeout: 5000 });
  });
});
