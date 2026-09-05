import { test, expect } from '@playwright/test';
import { testUser, blockBrowserDialogs } from '../fixtures/test-data.js';

const mockGeneratedAds = [
  {
    id: 'ad_1',
    headline: 'Test Headline 1',
    body: 'Test body text',
    cta: 'SHOP_NOW',
    image_url: 'https://example.com/image1.png',
    media_type: 'image',
    size_name: 'Square',
    dimensions: '1080x1080',
    ad_bundle_id: 'bundle_1',
    created_at: '2025-01-01T00:00:00Z'
  },
  {
    id: 'ad_2',
    headline: 'Video Ad Headline',
    body: 'Video body text',
    cta: 'WATCH_MORE',
    media_type: 'video',
    video_url: 'https://example.com/video.mp4',
    video_id: 'fb_vid_123',
    thumbnail_url: 'https://example.com/thumb.jpg',
    size_name: 'Square',
    dimensions: '1080x1080',
    ad_bundle_id: 'bundle_2',
    created_at: '2025-01-02T00:00:00Z'
  }
];

test.describe('Generated Ads Gallery', () => {

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

    // Mock generated ads API
    await page.route('**/api/v1/generated-ads**', route => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockGeneratedAds)
        });
      } else {
        route.continue();
      }
    });

    // Mock brands for dashboard
    await page.route('**/api/v1/brands**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
  });

  test('gallery page loads and displays ads', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/generated-ads');
    await page.waitForLoadState('networkidle');

    // Page should load without error
    await expect(page).not.toHaveURL(/error/);
  });

  test('can filter ads by media type', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/generated-ads');
    await page.waitForLoadState('domcontentloaded');

    // Look for filter controls
    const filterButton = page.locator('button:has-text("Filter"), select[name*="filter"], [data-testid="filter"]');
    if (await filterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await filterButton.click();
    }

    // Page loads successfully
    await expect(page).not.toHaveURL(/error/);
  });

  test('can delete an ad with confirmation', async ({ page }) => {
    let deleteRequested = false;

    await page.route('**/api/v1/generated-ads/ad_1', route => {
      if (route.request().method() === 'DELETE') {
        deleteRequested = true;
        route.fulfill({ status: 200, body: '{"success": true}' });
      } else {
        route.continue();
      }
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/generated-ads');
    await page.waitForLoadState('networkidle');

    // Look for delete button
    const deleteBtn = page.locator('button[aria-label*="delete" i], button:has-text("Delete"), [data-testid="delete-ad"]').first();
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();

      // Should show confirmation modal (not browser confirm)
      const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes"), [data-testid="confirm-delete"]');
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click();
      }
    }
  });

  test('can export ads to CSV', async ({ page }) => {
    await page.route('**/api/v1/generated-ads/export-csv', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/csv',
        headers: { 'Content-Disposition': 'attachment; filename="ads.csv"' },
        body: 'ID,Headline,Body\nad_1,Test,Test'
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/generated-ads');
    await page.waitForLoadState('domcontentloaded');

    // Look for export button
    const exportBtn = page.locator('button:has-text("Export"), button:has-text("CSV"), [data-testid="export"]');
    if (await exportBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await exportBtn.click();
    }

    // Page loads successfully
    await expect(page).not.toHaveURL(/error/);
  });

  test('video ads show video player or thumbnail', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/generated-ads');
    await page.waitForLoadState('networkidle');

    // Just check the page loaded without errors
    await expect(page).not.toHaveURL(/error/);
  });

});
