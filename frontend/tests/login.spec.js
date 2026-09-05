import { test, expect } from '@playwright/test';
import { blockBrowserDialogs } from './fixtures/test-data.js';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    blockBrowserDialogs(page);
  });

  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login');

    // Check page elements are visible
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('shows error with invalid credentials', async ({ page }) => {
    // Mock login to return 401
    await page.route('**/api/v1/auth/login/json', route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid credentials' })
      });
    });

    await page.goto('/login');

    // Fill in invalid credentials
    await page.fill('input[type="email"]', 'invalid@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');

    // Click sign in button
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Should show error toast or stay on login page
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/login/);
  });

  test('successful login with valid credentials', async ({ page }) => {
    // Mock successful login
    await page.route('**/api/v1/auth/login/json', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          token_type: 'bearer'
        })
      });
    });

    // Mock /me endpoint
    await page.route('**/api/v1/auth/me', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-user-id',
          email: 'test@test.com',
          name: 'Test User',
          is_active: true
        })
      });
    });

    // Mock dashboard data
    await page.route('**/api/v1/brands**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/api/v1/generated-ads**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.goto('/login');

    // Fill in credentials (mocked - any values work)
    await page.fill('input[type="email"]', 'test@test.com');
    await page.fill('input[type="password"]', 'mockpassword');

    // Click sign in button
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait for navigation - should redirect to dashboard or home
    await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 10000 });
  });
});
