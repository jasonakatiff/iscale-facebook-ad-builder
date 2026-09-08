import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

test.use({
    trace: 'off',
    screenshot: 'off',
    viewport: { width: 1440, height: 900 },
});

test('user keys, theme library, and downloadable API docs work together', async ({
    page,
    request,
}) => {
    test.setTimeout(120000);
    test.skip(
        !process.env.TEST_EMAIL ||
            !process.env.TEST_PASSWORD ||
            !process.env.TEST_API_URL,
        'A test login and explicit API URL are required.',
    );
    const api = process.env.TEST_API_URL;
    const keyName = `test-platform-tools-${randomUUID().slice(0, 8)}`;
    const themeName = `test-platform-skin-${randomUUID().slice(0, 8)}`;
    let jwt, refreshToken, keyId, themeId;
    try {
        await page.goto('/login');
        await expect(page).toHaveTitle('theLeadRouter — Ad Builder & Manager');
        await expect(
            page.getByText('Powered by', { exact: false }).first(),
        ).toBeVisible();
        await page.getByLabel('Email Address').fill(process.env.TEST_EMAIL);
        await page
            .getByLabel('Password', { exact: true })
            .fill(process.env.TEST_PASSWORD);
        await page
            .getByRole('button', { name: 'Sign In', exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Dashboard', exact: true }),
        ).toBeVisible();
        ({ jwt, refreshToken } = await page.evaluate(() => ({
            jwt: localStorage.getItem('accessToken'),
            refreshToken: localStorage.getItem('refreshToken'),
        })));
        const sessionHeaders = { Authorization: `Bearer ${jwt}` };
        await page.goto('/facebook-campaigns');
        const accountSelect = page.getByRole('combobox', {
            name: 'Ad Account',
            exact: true,
        });
        await expect(accountSelect).toBeEnabled({ timeout: 30000 });
        await accountSelect.click();
        await page.getByRole('option').first().click();
        await page
            .getByRole('button', { name: 'Next Step', exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Campaign Setup', exact: true }),
        ).toBeVisible();
        await page.setViewportSize({ width: 1366, height: 768 });
        await page.evaluate(() => window.scrollTo(0, 0));
        for (const control of [
            page.getByRole('button', {
                name: 'ABO Ad Set Budget',
                exact: true,
            }),
            page.getByRole('button', { name: 'Next Step', exact: true }),
        ]) {
            const box = await control.boundingBox();
            expect(box).not.toBeNull();
            expect(box.y).toBeGreaterThanOrEqual(0);
            expect(box.y + box.height).toBeLessThanOrEqual(768);
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/settings/api-keys');
        await page.getByLabel('Key name', { exact: true }).fill(keyName);
        const createdResponse = page.waitForResponse(
            (response) =>
                response.url().endsWith('/api-keys') &&
                response.request().method() === 'POST',
        );
        await page
            .getByRole('button', { name: 'Create key', exact: true })
            .click();
        const created = await (await createdResponse).json();
        keyId = created.data.id;
        const key = await page.getByLabel('Generated API key').textContent();
        const identity = await request.get(`${api}/auth/me`, {
            headers: { Authorization: `Bearer ${key}` },
        });
        expect(identity.ok()).toBe(true);
        const denied = await request.post(`${api}/brands`, {
            headers: { Authorization: `Bearer ${key}` },
            data: {},
        });
        expect(denied.status()).toBe(403);
        await page.getByRole('button', { name: 'I saved my key' }).click();
        await expect(page.getByLabel('Generated API key')).toHaveCount(0);
        await page
            .getByRole('button', { name: `Revoke ${keyName}`, exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Revoke key', exact: true })
            .click();
        await expect(page.getByText('API key revoked.')).toBeVisible();
        expect(
            (
                await request.get(`${api}/auth/me`, {
                    headers: { Authorization: `Bearer ${key}` },
                })
            ).status(),
        ).toBe(401);
        await page.goto('/themes');
        await page
            .getByRole('button', { name: 'Create theme', exact: true })
            .click();
        await page.getByLabel('Theme name', { exact: true }).fill(themeName);
        const savedResponse = page.waitForResponse(
            (response) =>
                response.url().endsWith('/themes') &&
                response.request().method() === 'POST',
        );
        await page
            .getByRole('button', { name: 'Save theme', exact: true })
            .click();
        themeId = (await (await savedResponse).json()).data.id;
        const custom = page.getByRole('article').filter({
            has: page.getByRole('heading', {
                name: themeName,
                exact: true,
            }),
        });
        await custom
            .getByRole('button', { name: 'Apply', exact: true })
            .click();
        await page
            .getByRole('radio', { name: 'Dark theme', exact: true })
            .check();
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute(
            'data-theme',
            'dark',
        );
        await expect(
            custom.getByText('Applied', { exact: true }),
        ).toBeVisible();
        const exported = page.waitForEvent('download');
        await custom
            .getByRole('button', { name: `Download ${themeName}` })
            .click();
        expect((await exported).suggestedFilename()).toBe(
            'leadrouter-ad-builder-manager-theme.json',
        );
        await page.goto('/help');
        await expect(
            page.getByRole('heading', { name: 'Help & API Docs', exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', {
                name: 'Use Ad Builder & Manager from Claude Code',
                exact: true,
            }),
        ).toBeVisible();
        await page.getByLabel('Search API endpoints').fill('/api/v1/themes');
        await expect(
            page
                .locator('summary')
                .filter({ hasText: '/api/v1/themes' })
                .first(),
        ).toBeVisible();
        const docsDownload = page.waitForEvent('download');
        await page
            .getByRole('button', { name: 'Download all docs', exact: true })
            .click();
        expect((await docsDownload).suggestedFilename()).toBe(
            'leadrouter-ad-builder-manager-docs.zip',
        );
        const schema = await request.get(`${api}/openapi.json`);
        expect((await schema.json()).paths['/api/v1/api-keys']).toBeTruthy();
        for (const path of ['/themes', '/settings/api-keys', '/help']) {
            await page.setViewportSize({ width: 390, height: 844 });
            await page.goto(path);
            expect(
                await page.evaluate(() => document.documentElement.scrollWidth),
            ).toBeLessThanOrEqual(390);
        }
        await request.delete(`${api}/themes/${themeId}`, {
            headers: sessionHeaders,
        });
        themeId = null;
    } finally {
        if (jwt) {
            const headers = { Authorization: `Bearer ${jwt}` };
            if (keyId)
                await request.delete(`${api}/api-keys/${keyId}`, { headers });
            if (themeId)
                await request.delete(`${api}/themes/${themeId}`, { headers });
            if (refreshToken)
                await request.post(`${api}/auth/logout`, {
                    headers,
                    data: { refresh_token: refreshToken },
                });
        }
    }
});
