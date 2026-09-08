import process from 'node:process';
import { test, expect } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off' });

test('native LeadRouter setup, reporting, and downloadable contract are accessible', async ({
    page,
    request,
}) => {
    test.skip(
        !process.env.TEST_EMAIL || !process.env.TEST_PASSWORD || !process.env.TEST_API_URL,
        'Explicit test credentials and API URL are required.',
    );
    await page.goto('/login');
    await page.getByLabel('Email Address').fill(process.env.TEST_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(process.env.TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await page.goto('/connections');
    await page.getByRole('link', { name: 'Configure LeadRouter', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'LeadRouter', exact: true })).toBeVisible();
    await expect(
        page.getByText('Private to your ad workspace user.', { exact: false }),
    ).toBeVisible();
    // Read-only smoke supports either an already connected or a disconnected account.
    await expect(page.getByRole('region', { name: 'LeadRouter connection' })).not.toContainText(
        'Loading connection…',
    );
    await expect(
        page.getByRole('button', {
            name: /^(Connect LeadRouter|Disconnect LeadRouter)$/,
        }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.goto('/reporting');
    await expect(page.getByRole('region', { name: 'LeadRouter reporting' })).toBeVisible();
    const guide = await request.get(`${process.env.TEST_API_URL}/help/docs/leadrouter-integration`);
    expect(guide.ok()).toBe(true);
    expect(await guide.text()).toContain('Native LeadRouter');
    const schema = await request.get(`${process.env.TEST_API_URL}/openapi.json`);
    expect(schema.ok()).toBe(true);
    expect(
        (await schema.json()).paths['/api/v1/leadrouter/defaults/{resource_type}/{resource_id}'],
    ).toBeTruthy();
    const refreshToken = await page.evaluate(() => localStorage.getItem('refreshToken'));
    if (refreshToken)
        await request.post(`${process.env.TEST_API_URL}/auth/logout`, {
            data: { refresh_token: refreshToken },
        });
});
