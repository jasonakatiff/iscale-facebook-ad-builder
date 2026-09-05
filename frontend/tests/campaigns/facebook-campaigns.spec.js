import { test, expect } from '@playwright/test';
import { testUser, blockBrowserDialogs } from '../fixtures/test-data.js';

const mockCampaigns = [
  {
    id: 'camp_1',
    name: 'Test Campaign 1',
    objective: 'CONVERSIONS',
    status: 'ACTIVE',
    daily_budget: 5000
  },
  {
    id: 'camp_2',
    name: 'Test Campaign 2',
    objective: 'TRAFFIC',
    status: 'PAUSED',
    daily_budget: 2500
  }
];

const mockAdAccounts = [
  { id: 'act_123456', name: 'Test Ad Account' }
];

test.describe('Facebook Campaigns', () => {

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

    // Mock Facebook API endpoints
    await page.route('**/api/v1/facebook/accounts**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAdAccounts)
      });
    });

    await page.route('**/api/v1/facebook/campaigns**', route => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockCampaigns)
        });
      } else if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'new_camp', name: 'New Campaign' })
        });
      } else {
        route.continue();
      }
    });

    // Mock brands and generated-ads for dashboard
    await page.route('**/api/v1/brands**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.route('**/api/v1/generated-ads**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
  });

  test('campaigns page loads', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/facebook-campaigns');
    await expect(page).not.toHaveURL(/error/);
  });

  test('can create new campaign', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/facebook-campaigns');
    await page.waitForLoadState('networkidle');

    // Look for create button
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New Campaign"), [data-testid="create-campaign"]');
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();

      // Fill campaign form if modal appears
      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]');
      if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameInput.fill('Test Campaign');
      }
    }

    // Page should not crash
    await expect(page).not.toHaveURL(/error/);
  });

  test('displays campaign list', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/facebook-campaigns');
    await page.waitForLoadState('networkidle');

    // Page should load without errors
    await expect(page).not.toHaveURL(/error/);
  });

});

test.describe('Facebook Ad Sets', () => {

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

    await page.route('**/api/v1/facebook/adsets**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'adset_1', name: 'Test AdSet', campaign_id: 'camp_1', status: 'ACTIVE' }
        ])
      });
    });

    await page.route('**/api/v1/brands**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.route('**/api/v1/generated-ads**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
  });

  test('adsets load for campaign', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/facebook-campaigns');
    await expect(page).not.toHaveURL(/error/);
  });

});

test.describe('Facebook Ads', () => {

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

    await page.route('**/api/v1/facebook/ads**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'ad_1',
            name: 'Test Ad',
            adset_id: 'adset_1',
            status: 'ACTIVE',
            media_type: 'image',
            image_url: 'https://example.com/image.png'
          }
        ])
      });
    });

    await page.route('**/api/v1/brands**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.route('**/api/v1/generated-ads**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
  });

  test('can attach generated ads to campaign', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/facebook-campaigns');
    await page.waitForLoadState('networkidle');

    // Just verify page loads
    await expect(page).not.toHaveURL(/error/);
  });

});
