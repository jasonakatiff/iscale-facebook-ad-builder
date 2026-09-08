import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

test.use({
    trace: 'off',
    screenshot: 'off',
    viewport: { width: 1366, height: 768 },
});

test('native connection, defaults, campaign draft, reporting, and disconnect', async ({
    page,
    request,
}) => {
    test.setTimeout(120000);
    test.skip(
        process.env.TEST_NATIVE_LEADROUTER !== '1',
        'Requires the local simulated LeadRouter harness.',
    );
    const api = process.env.TEST_API_URL;
    expect(new URL(api).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
    let headers, brandId, refreshToken;
    const select = async (label, option) => {
        const input = page.getByRole('combobox', { name: label, exact: true });
        await expect(input).toBeEnabled();
        await input.click();
        await page.getByRole('option', { name: option }).click();
    };
    try {
        await page.goto('/login');
        await page.getByLabel('Email Address').fill(process.env.TEST_EMAIL);
        await page.getByLabel('Password', { exact: true }).fill(process.env.TEST_PASSWORD);
        await page.getByRole('button', { name: 'Sign In', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
        const tokens = await page.evaluate(() => ({
            jwt: localStorage.getItem('accessToken'),
            refresh: localStorage.getItem('refreshToken'),
        }));
        headers = { Authorization: `Bearer ${tokens.jwt}` };
        refreshToken = tokens.refresh;
        expect((await request.delete(`${api}/leadrouter/connection`, { headers })).ok()).toBe(true);
        const brand = await request.post(`${api}/brands`, {
            headers,
            data: {
                name: `test-native-${randomUUID().slice(0, 8)}`,
                voice: 'test',
                colors: {
                    primary: '#123456',
                    secondary: '#234567',
                    highlight: '#345678',
                },
                products: [],
                profileIds: [],
            },
        });
        expect(brand.ok()).toBe(true);
        const row = await brand.json();
        brandId = row.id;
        await page.goto('/settings/leadrouter');
        await page.getByLabel('LeadRouter API key').fill('lr_test_invalid_browser_key');
        await page.getByRole('button', { name: 'Connect LeadRouter', exact: true }).click();
        await expect(page.getByText(/LeadRouter rejected this key/)).toBeVisible();
        await page.getByLabel('LeadRouter API key').fill('lr_test_native_browser_key');
        await page.getByRole('button', { name: 'Connect LeadRouter', exact: true }).click();
        await expect(page.getByText('Connected · test-LeadRouter partner')).toBeVisible();
        await select('Brand for LeadRouter default', row.name);
        await page.getByText('LeadRouter default', { exact: true }).click();
        const defaults = page.getByRole('region', {
            name: 'LeadRouter catalog defaults',
        });
        const defaultPicker = defaults.getByRole('combobox', {
            name: 'LeadRouter campaign',
            exact: true,
        });
        await expect(defaultPicker).toBeEnabled();
        await defaultPicker.click();
        await defaults.getByRole('option', { name: /test-Solar campaign/ }).click();
        await page.getByRole('button', { name: 'Save LeadRouter default' }).click();
        await expect(page.getByText('Your LeadRouter brand default was saved.')).toBeVisible();
        await page.reload();
        await select('Brand for LeadRouter default', row.name);
        await page.getByText('LeadRouter default', { exact: true }).click();
        await expect(
            page
                .getByRole('region', { name: 'LeadRouter catalog defaults' })
                .getByRole('combobox', { name: 'LeadRouter campaign' }),
        ).toHaveValue(/test-Solar campaign/);
        await page.goto('/facebook-campaigns');
        await select('Ad Account', /test-feedback-account/);
        await page.getByRole('button', { name: 'Next Step', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Campaign Setup' })).toBeVisible();
        const next = await page
            .getByRole('button', { name: 'Next Step', exact: true })
            .boundingBox();
        expect(next.y + next.height).toBeLessThanOrEqual(768);
        await page.getByText('LeadRouter · Optional campaign link', { exact: true }).click();
        await select('LeadRouter campaign', /test-Solar campaign/);
        await page.getByText('LeadRouter · test-Solar campaign', { exact: true }).click();
        await expect(page.getByText('Draft saved on this browser')).toBeVisible();
        await page.reload();
        await expect(
            page.getByText('LeadRouter · test-Solar campaign', { exact: true }),
        ).toBeVisible();
        await page.goto('/reporting');
        await select('LeadRouter reporting campaign', /test-Solar campaign/);
        await expect(page.getByText('Lifetime leads', { exact: true }).locator('..')).toContainText(
            '7',
        );
        await expect(page.getByText(/not attributed to individual ads in this workspace/)).toBeVisible();
        await page.goto('/settings/leadrouter');
        await page.getByRole('button', { name: 'Disconnect LeadRouter', exact: true }).click();
        await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Disconnect', exact: true })
            .click();
        await expect(
            page.getByRole('button', { name: 'Connect LeadRouter', exact: true }),
        ).toBeVisible();
        const defaultsResult = await request.get(`${api}/leadrouter/defaults`, {
            headers,
        });
        expect((await defaultsResult.json()).data).toEqual([]);
    } finally {
        if (headers) {
            await request.delete(`${api}/leadrouter/connection`, { headers });
            if (brandId) await request.delete(`${api}/brands/${brandId}`, { headers });
            if (refreshToken)
                await request.post(`${api}/auth/logout`, {
                    data: { refresh_token: refreshToken },
                });
        }
    }
});
