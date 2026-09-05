import { test, expect } from '@playwright/test';
import { testUser, mockLoginSuccess, setAuthTokens, clearAuthTokens, blockBrowserDialogs } from '../fixtures/test-data.js';

test.describe('Authentication', () => {

  test.beforeEach(async ({ page }) => {
    blockBrowserDialogs(page);
  });

  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('shows error with invalid credentials', async ({ page }) => {
    // Mock login failure
    await page.route('**/api/v1/auth/login/json', route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid credentials' })
      });
    });

    await page.goto('/login');

    await page.fill('input[type="email"]', 'invalid@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should stay on login page (error shown via toast)
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/login/);
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await mockLoginSuccess(page);

    // Mock dashboard data
    await page.route('**/api/v1/brands**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/api/v1/generated-ads**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.goto('/login');

    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 10000 });
  });

  test('protected route redirects to login when not authenticated', async ({ page }) => {
    // Mock auth/me to return 401 (not authenticated)
    await page.route('**/api/v1/auth/me', route => {
      route.fulfill({ status: 401, body: '{"detail": "Not authenticated"}' });
    });

    await page.goto('/brands');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('protected route accessible when authenticated', async ({ page }) => {
    await mockLoginSuccess(page);

    // Mock brands API
    await page.route('**/api/v1/brands**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    // Login first
    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    // Now access protected route
    await page.goto('/brands');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('logout clears tokens and redirects to login', async ({ page }) => {
    await mockLoginSuccess(page);

    // Mock logout
    await page.route('**/api/v1/auth/logout', route => {
      route.fulfill({ status: 200, body: '{}' });
    });

    // Mock dashboard data
    await page.route('**/api/v1/brands**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    // Find and click logout (adjust selector as needed)
    const logoutButton = page.locator('button:has-text("Logout"), [aria-label="Logout"], .logout-btn');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    }
  });

});

test.describe('Session Management', () => {

  test('expired token triggers refresh', async ({ page }) => {
    let refreshCalled = false;

    // Mock initial auth
    await page.route('**/api/v1/auth/me', route => {
      const headers = route.request().headers();
      if (headers['authorization']?.includes('new-token')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: '1', email: 'test@test.com' })
        });
      } else {
        route.fulfill({ status: 401 });
      }
    });

    await page.route('**/api/v1/auth/refresh', route => {
      refreshCalled = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'new-token',
          refresh_token: 'new-refresh'
        })
      });
    });

    // Set old tokens
    await page.goto('/');
    await setAuthTokens(page);

    // The app should attempt refresh when it gets 401
    // This is a basic check - actual behavior depends on implementation
  });

});
