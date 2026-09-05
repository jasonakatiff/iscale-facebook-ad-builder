// @ts-check
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

test.describe('Login Smoke Tests', () => {
  test('login page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    // Check login form exists
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('login page has no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Filter out known acceptable errors
    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('404')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('protected routes redirect to login', async ({ page }) => {
    await page.goto(`${BASE_URL}/research`);

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});
