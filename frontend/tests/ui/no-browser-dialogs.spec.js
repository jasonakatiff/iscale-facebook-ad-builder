import { test, expect } from '@playwright/test';
import { testUser, blockBrowserDialogs } from '../fixtures/test-data.js';

/**
 * Critical UI tests - ensure no browser alert()/confirm() calls
 *
 * Per specifications.md:
 * - NEVER use browser alert()
 * - NEVER use browser confirm()
 * - Always use Toast/Modal components
 */

test.describe('No Browser Dialogs Policy', () => {

  test.beforeEach(async ({ page }) => {
    blockBrowserDialogs(page);

    // Mock login
    await page.route('**/api/v1/auth/login/json', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-token',
          refresh_token: 'mock-refresh',
          token_type: 'bearer'
        })
      });
    });

    await page.route('**/api/v1/auth/me', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-user',
          email: testUser.email,
          name: 'Test User',
          is_active: true
        })
      });
    });
  });

  test('alert() should not be called anywhere in the app', async ({ page }) => {
    let alertCalled = false;

    // Listen for dialogs (already blocked by blockBrowserDialogs, but track it)
    page.on('dialog', async dialog => {
      if (dialog.type() === 'alert') {
        alertCalled = true;
      }
    });

    // Mock common API endpoints
    await page.route('**/api/v1/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    // Navigate through various pages
    const pagesToTest = ['/brands', '/generated-ads'];

    for (const pageUrl of pagesToTest) {
      await page.goto(pageUrl);
      await page.waitForLoadState('networkidle');
    }

    expect(alertCalled).toBe(false);
  });

  test('confirm() should not be called for delete actions', async ({ page }) => {
    let confirmCalled = false;

    page.on('dialog', async dialog => {
      if (dialog.type() === 'confirm') {
        confirmCalled = true;
      }
    });

    // Mock brands with one item
    await page.route('**/api/v1/brands**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: '1', name: 'Test Brand', colors: { primary: '#FF0000' } }])
      });
    });

    await page.route('**/api/v1/generated-ads**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/brands');
    await page.waitForLoadState('networkidle');

    // Try to click delete if available
    const deleteButton = page.locator('button[aria-label*="delete" i], button:has-text("Delete"), .delete-btn, [data-action="delete"]');

    if (await deleteButton.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteButton.first().click();
      await page.waitForTimeout(1000);

      // confirm() should NOT have been called
      expect(confirmCalled).toBe(false);
    }
  });

  test('error responses show toast not alert', async ({ page }) => {
    let alertCalled = false;

    page.on('dialog', async dialog => {
      alertCalled = true;
    });

    // Mock failed login
    await page.route('**/api/v1/auth/login/json', route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid credentials' })
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', 'wrong@email.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    // Should NOT use alert
    expect(alertCalled).toBe(false);
  });

  test('success messages use toast not alert', async ({ page }) => {
    let alertCalled = false;

    page.on('dialog', async dialog => {
      alertCalled = true;
    });

    // Mock successful brand creation
    await page.route('**/api/v1/brands**', route => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      } else if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: '1', name: 'New Brand' })
        });
      } else {
        route.continue();
      }
    });

    await page.route('**/api/v1/generated-ads**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/brands');
    await page.waitForLoadState('networkidle');

    // Create a brand if button exists
    const createButton = page.locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")');
    if (await createButton.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await createButton.first().click();

      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]');
      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await nameInput.fill('Test Brand');

        const submitButton = page.locator('button[type="submit"], button:has-text("Save")');
        await submitButton.first().click();

        await page.waitForTimeout(2000);
      }
    }

    // Should NOT use alert
    expect(alertCalled).toBe(false);
  });

});
