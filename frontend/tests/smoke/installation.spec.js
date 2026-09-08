import { test, expect } from '@playwright/test';
import { installationFixtureEnabled, ownerApi, login } from '../helpers/installation';

test('mobile setup permits deferral and settings validate key inputs', async ({ page, request }) => {
    test.skip(!installationFixtureEnabled(), 'Requires isolated installation fixtures.');
    const api = await ownerApi(request);
    await api('/installation', 'PATCH', { step: 'providers', status: 'in_progress' });
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    const gemini = page.getByRole('region', { name: 'Google Gemini', exact: true });
    await expect(gemini).toBeVisible();
    await gemini.getByLabel('Google Gemini API key').fill('short');
    await expect(gemini.getByRole('button', { name: /Save key|Replace key/ })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.getByRole('button', { name: 'Finish later', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.reload();
    await expect(page).not.toHaveURL(/\/setup$/);
    await page.goto('/settings?tab=integrations');
    await expect(page.getByRole('region', { name: 'Google Gemini', exact: true })).toBeVisible();
    expect((await api('/installation')).status).toBe('deferred');
});
