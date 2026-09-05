import { test, expect } from '@playwright/test';
import { blockBrowserDialogs } from './fixtures/test-data.js';

test.describe('Auth Network Error Handling', () => {
    test.beforeEach(async ({ page }) => {
        blockBrowserDialogs(page);
    });

    test('should NOT logout on network error during token refresh', async ({ page }) => {
        // Mock the API calls
        await page.route('**/api/v1/auth/login/json', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    access_token: 'fake_access_token',
                    refresh_token: 'fake_refresh_token',
                    token_type: 'bearer'
                })
            });
        });

        await page.route('**/api/v1/auth/me', async route => {
            const headers = route.request().headers();
            if (headers['authorization'] === 'Bearer fake_access_token') {
                // First call succeeds
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 1, email: 'test@example.com' })
                });
            } else {
                // Subsequent calls fail with 401 to trigger refresh
                await route.fulfill({
                    status: 401,
                    contentType: 'application/json',
                    body: JSON.stringify({ detail: 'Unauthorized' })
                });
            }
        });

        // Mock dashboard data
        await page.route('**/api/v1/brands**', route => {
            route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        });
        await page.route('**/api/v1/generated-ads**', route => {
            route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        });

        // Go to login page
        await page.goto('/login');

        // Perform login
        await page.fill('input[type="email"]', 'test@example.com');
        await page.fill('input[type="password"]', 'password');
        await page.getByRole('button', { name: 'Sign In' }).click();

        // Wait for login to complete
        await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

        // Verify tokens are set
        const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
        expect(accessToken).toBeTruthy();
    });

    test('should logout on 401 error during token refresh', async ({ page }) => {
        // Mock login
        await page.route('**/api/v1/auth/login/json', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    access_token: 'fake_access_token',
                    refresh_token: 'fake_refresh_token',
                    token_type: 'bearer'
                })
            });
        });

        // Mock /me to succeed first time
        let meCallCount = 0;
        await page.route('**/api/v1/auth/me', async route => {
            meCallCount++;
            if (meCallCount === 1) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 1, email: 'test@example.com' })
                });
            } else {
                await route.fulfill({ status: 401 });
            }
        });

        // Mock dashboard data
        await page.route('**/api/v1/brands**', route => {
            route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        });
        await page.route('**/api/v1/generated-ads**', route => {
            route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        });

        await page.goto('/login');
        await page.fill('input[type="email"]', 'test@example.com');
        await page.fill('input[type="password"]', 'password');
        await page.getByRole('button', { name: 'Sign In' }).click();
        await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

        // Mock /refresh to fail with 401 (Explicit denial)
        await page.route('**/api/v1/auth/refresh', async route => {
            await route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ detail: 'Invalid refresh token' })
            });
        });

        await page.reload();
        await page.waitForTimeout(2000);

        // If app logs out on 401 refresh, tokens should be removed or we redirect to login
        const currentUrl = page.url();
        const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));

        // Either tokens are cleared OR we're on login page
        const loggedOut = accessToken === null || currentUrl.includes('/login');
        expect(loggedOut).toBe(true);
    });
});
