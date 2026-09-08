import process from 'node:process';
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

test('themes persist across login, routes, and a campaign draft', async ({ page }) => {
    test.setTimeout(90000);
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD, 'Test login required');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/login');
    await page.getByRole('radio', { name: 'Dark theme' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Dark theme' })).toBeChecked();
    await page.getByLabel('Email Address').fill(process.env.TEST_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(process.env.TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    const routes = [
        '/',
        '/overview',
        '/google-ads',
        '/tiktok-ads',
        '/build-creatives',
        '/image-ads',
        '/video-ads',
        '/ad-remix',
        '/brands',
        '/products',
        '/profiles',
        '/winning-ads',
        '/generated-ads',
        '/research',
        '/research/brand-scrapes',
        '/research/settings',
        '/settings',
        '/facebook-campaigns',
    ];
    for (const theme of ['light', 'dark']) {
        await page
            .getByRole('radio', { name: `${theme === 'light' ? 'Light' : 'Dark'} theme` })
            .check();
        for (const route of routes) {
            await page.goto(route);
            await page.waitForLoadState('networkidle');
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
            await expect(page.locator('main')).toBeVisible();
            expect(
                await page.evaluate(() => document.documentElement.scrollWidth),
            ).toBeLessThanOrEqual(1440);
            expect(
                await page
                    .locator('main')
                    .evaluate((element) => element.scrollWidth - element.clientWidth),
            ).toBeLessThanOrEqual(1);
            if (['/', '/build-creatives', '/facebook-campaigns'].includes(route)) {
                await page.screenshot({
                    path: `/tmp/breadwinner-studio-${theme}-${route.replaceAll('/', '') || 'dashboard'}.png`,
                    fullPage: true,
                });
            }
        }
    }
    await page
        .getByRole('combobox', { name: 'Ad Account' })
        .fill(process.env.TEST_AD_ACCOUNT || 'test-');
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: /Next Step/i }).click();
    await page.getByLabel('Campaign Name', { exact: false }).fill('test-studio-draft');
    await page.getByRole('radio', { name: 'Light theme' }).check();
    await page.reload();
    await expect(page.getByLabel('Campaign Name', { exact: false })).toHaveValue(
        'test-studio-draft',
    );
    await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    for (let index = 0; index < 5; index++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement.closest('dialog'))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Discard draft', exact: true })).toBeFocused();
    await page.getByRole('radio', { name: 'System theme' }).check();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Expand Creative Building', exact: true }).click();
    await page.getByRole('link', { name: 'Brands', exact: true }).click();
    await expect(
        page.getByRole('heading', { name: 'Brand Management', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
    );
    await page.screenshot({ path: '/tmp/breadwinner-studio-dark-mobile.png', fullPage: true });
    for (const route of routes) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('main')).toBeVisible();
        expect(
            await page
                .locator('main')
                .evaluate((element) => element.scrollWidth - element.clientWidth),
            `${route} mobile overflow`,
        ).toBeLessThanOrEqual(1);
    }
});
