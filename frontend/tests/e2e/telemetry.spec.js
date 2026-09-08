import { test, expect } from '@playwright/test';
import process from 'node:process';

test('admin creates agent key, follows feedback trace and revokes key', async ({ page, request }) => {
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD || !process.env.TEST_API_URL,
        'Requires admin test credentials and TEST_API_URL for the exact backend.');
    const api = process.env.TEST_API_URL;
    const keyName = `test-agent-${Date.now()}`;
    let keyId;
    let jwt;
    try {
        await page.goto('/login');
        await page.getByLabel(/email address/i).fill(process.env.TEST_EMAIL);
        await page.getByLabel('Password', { exact: true }).fill(process.env.TEST_PASSWORD);
        await page.getByRole('button', { name: /sign in/i, exact: true }).click();
        await page.getByRole('link', { name: 'Telemetry', exact: true }).click();
        await expect(page.getByRole('region', { name: 'Collection health' })).toBeVisible();
        jwt = await page.evaluate(() => localStorage.getItem('accessToken'));
        await page.getByRole('link', { name: 'Manage API keys' }).click();
        await page.getByLabel('Key name').fill(keyName);
        await page.getByRole('combobox', { name: /^Access/ }).selectOption('telemetry');
        const createdResponse = page.waitForResponse(response => response.url() === `${api}/api-keys` && response.request().method() === 'POST');
        await page.getByRole('button', { name: 'Create key', exact: true }).click();
        const created = await (await createdResponse).json();
        keyId = created.data.id;
        await expect(page.getByLabel('Generated API key')).toHaveText(created.apiKey);
        const agentHeaders = { 'X-API-Key': created.apiKey };
        const capabilities = await request.get(`${api}/telemetry/capabilities`, { headers: agentHeaders });
        expect(capabilities.ok()).toBeTruthy();
        expect((await capabilities.json()).scopes).toEqual(['telemetry:read', 'feedback:write']);
        await page.getByRole('button', { name: 'I saved my key', exact: true }).click();

        await page.getByRole('link', { name: 'Telemetry', exact: true }).click();
        await page.getByText('Send feedback', { exact: true }).click();
        await page.getByLabel('Feedback', { exact: true }).fill('test-feedback: verify agent can investigate this browser session');
        await page.getByRole('button', { name: 'Submit feedback', exact: true }).click();
        const reference = page.getByTestId('feedback-reference');
        await expect(reference).toBeVisible();
        const traceId = await reference.textContent();
        await page.getByText('Send feedback', { exact: true }).click();
        await page.getByLabel('Trace ID', { exact: true }).fill(traceId);
        await page.getByRole('button', { name: 'Find trace', exact: true }).click();
        await expect(page.getByText('test-feedback: verify agent can investigate this browser session', { exact: true })).toBeVisible();
        const trace = await request.get(`${api}/telemetry/traces/${traceId}`, { headers: agentHeaders });
        expect(trace.ok()).toBeTruthy();
        expect((await trace.json()).data.some(event => event.kind === 'feedback')).toBeTruthy();

        await page.getByRole('link', { name: 'Manage API keys' }).click();
        await page.getByRole('button', { name: `Revoke ${keyName}`, exact: true }).click();
        await page.getByRole('button', { name: 'Revoke key', exact: true }).click();
        await expect.poll(async () => (await request.get(`${api}/telemetry/events`, { headers: agentHeaders })).status()).toBe(401);
    } finally {
        if (keyId && jwt) {
            const revoked = await request.delete(`${api}/api-keys/${keyId}`, { headers: { Authorization: `Bearer ${jwt}` } });
            expect(revoked.ok()).toBeTruthy();
        }
    }
});
