import process from 'node:process';
import { test, expect } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off' });

test('Railway login, managed Meta access and workspace controls work with personal OAuth deferred', async ({ page, request }) => {
    test.skip(process.env.TEST_RAILWAY_LAUNCH !== '1', 'Opt-in check against the deployed Railway release');
    test.setTimeout(90000);
    expect(process.env.TEST_EMAIL).toBeTruthy();
    expect(process.env.TEST_PASSWORD).toBeTruthy();
    const api = process.env.BACKEND_URL || 'https://ad-builder-backend-production.up.railway.app';
    let auth = null;
    try {
        await page.goto('/login');
        await page.getByLabel('Email Address', { exact: true }).fill(process.env.TEST_EMAIL);
        await page.getByLabel('Password', { exact: true }).fill(process.env.TEST_PASSWORD);
        const [login] = await Promise.all([
            page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login/json'),
            page.getByRole('button', { name: 'Sign In', exact: true }).click(),
        ]);
        expect(login.ok()).toBe(true);
        auth = await login.json();
        await expect(page).not.toHaveURL(/\/login(?:\?|$)/);

        const connectionResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/facebook/connection', { timeout: 15000 });
        await page.goto('/facebook-campaigns');
        const connection = await connectionResponse;
        expect(connection.ok()).toBe(true);
        expect(await connection.json()).toMatchObject({ connected: true, source: 'managed', oauth_available: false });
        await expect(page.getByText('Personal Meta connections will be available after setup.')).toBeVisible();
        await expect(page.getByText(/Connected through workspace/)).toBeVisible();
        await expect(page.getByRole('combobox', { name: 'Ad Account', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toHaveCount(0);

        const workspaceResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v2/workspaces');
        await page.getByRole('link', { name: 'Connections', exact: true }).click();
        const workspaces = await workspaceResponse;
        expect(workspaces.ok()).toBe(true);
        expect(await workspaces.json()).toHaveProperty('pagination');
        await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();
        await expect(page.getByText('Manual refresh · one selected account at a time')).toBeVisible();
        await expect(page.getByRole('combobox', { name: 'Workspace', exact: true })).toBeVisible();
        const create = page.locator('summary').filter({ hasText: 'Create workspace' });
        if (await create.count()) {
            await create.click();
            await expect(page.getByRole('button', { name: 'Create workspace', exact: true })).toBeDisabled();
        }
    } finally {
        if (auth) {
            const response = await request.post(`${api}/api/v1/auth/logout`, {
                headers: { Authorization: `Bearer ${auth.access_token}` },
                data: { refresh_token: auth.refresh_token },
            });
            expect(response.ok()).toBe(true);
        }
    }
});
