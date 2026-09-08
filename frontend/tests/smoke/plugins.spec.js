import { test, expect } from '@playwright/test';
import process from 'node:process';
import { Buffer } from 'node:buffer';

test.use({ trace: 'off', screenshot: 'off' });

test('Plugin library navigation, import validation and help', async ({
    page,
    request,
}) => {
    test.skip(
        !process.env.TEST_EMAIL || !process.env.TEST_PASSWORD,
        'Requires an explicit test login.',
    );
    try {
        await page.goto('/login');
        await page.getByLabel('Email address').fill(process.env.TEST_EMAIL);
        await page
            .getByLabel('Password', { exact: true })
            .fill(process.env.TEST_PASSWORD);
        await page
            .getByRole('button', { name: 'Sign In', exact: true })
            .click();
        await page.getByRole('link', { name: 'Plugins', exact: true }).click();
        await expect(
            page.getByRole('heading', { name: 'Plugins', exact: true }),
        ).toBeVisible();
        await page.getByLabel('Plugin package file').setInputFiles({
            name: 'test-invalid.json',
            mimeType: 'application/json',
            buffer: Buffer.from('{"schemaVersion":99}'),
        });
        await expect(
            page.getByText(/Check the supplied settings|Invalid plugin/),
        ).toBeVisible();
        await page
            .getByRole('link', { name: 'Plugin help & API', exact: true })
            .click();
        await expect(page.getByRole('heading', { name: /Help/ })).toBeVisible();
        await expect(
            page.getByRole('heading', {
                name: 'Plugins: local packages and connected services',
                exact: true,
            }),
        ).toBeVisible();
    } finally {
        const tokens = await page.evaluate(() => ({
            access: localStorage.getItem('accessToken'),
            refresh: localStorage.getItem('refreshToken'),
        }));
        if (tokens.access && tokens.refresh) {
            const response = await request.post(
                `${
                    process.env.TEST_API_URL || 'http://127.0.0.1:63421/api/v1'
                }/auth/logout`,
                {
                    headers: { Authorization: `Bearer ${tokens.access}` },
                    data: { refresh_token: tokens.refresh },
                },
            );
            expect(response.status()).toBe(200);
        }
    }
});
