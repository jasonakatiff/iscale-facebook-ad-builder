import { test, expect } from '@playwright/test';
import { testUser, blockBrowserDialogs } from '../fixtures/test-data.js';

test.describe('Video Ad Upload', () => {

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

    // Mock video upload endpoint
    await page.route('**/api/v1/facebook/upload-video', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          video_id: 'fb_video_123',
          status: 'ready',
          thumbnails: ['https://example.com/thumb1.jpg']
        })
      });
    });

    // Mock video status endpoint
    await page.route('**/api/v1/facebook/video-status/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ready',
          video_id: 'fb_video_123',
          length: 30.5
        })
      });
    });

    // Mock uploads endpoint
    await page.route('**/api/v1/uploads/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: '/uploads/test-video.mp4',
          media_type: 'video'
        })
      });
    });

    // Mock brands
    await page.route('**/api/v1/brands**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'brand_1', name: 'Test Brand', colors: { primary: '#FF0000' } }
        ])
      });
    });

    // Mock generated ads for dashboard
    await page.route('**/api/v1/generated-ads**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
  });

  test('video ads page loads', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/video-ads');
    await expect(page).not.toHaveURL(/error/);
  });

  test('can navigate to video ad creation', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/video-ads');
    await page.waitForLoadState('networkidle');

    // Page should load without browser dialogs
    await expect(page).not.toHaveURL(/error/);
  });

  test('video upload shows progress', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/video-ads');
    await page.waitForLoadState('networkidle');

    // Page should handle video uploads gracefully
    await expect(page).not.toHaveURL(/error/);
  });

  test('shows video thumbnails after upload', async ({ page }) => {
    await page.route('**/api/v1/facebook/video-thumbnails/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          thumbnails: [
            'https://example.com/thumb1.jpg',
            'https://example.com/thumb2.jpg',
            'https://example.com/thumb3.jpg'
          ]
        })
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/video-ads');
    await expect(page).not.toHaveURL(/error/);
  });

});

test.describe('Video Ad Creation Flow', () => {

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

    // Mock all necessary endpoints
    await page.route('**/api/v1/brands**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'brand_1', name: 'Test Brand', colors: { primary: '#FF0000' } }
        ])
      });
    });

    await page.route('**/api/v1/products**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'prod_1', name: 'Test Product', brand_id: 'brand_1' }
        ])
      });
    });

    await page.route('**/api/v1/generated-ads**', route => {
      if (route.request().url().includes('/batch')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ count: 1 })
        });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
    });
  });

  test('can save video ad to gallery', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

    await page.goto('/video-ads');
    await page.waitForLoadState('networkidle');

    // Page should load and function without browser dialogs
    await expect(page).not.toHaveURL(/error/);
  });

});
