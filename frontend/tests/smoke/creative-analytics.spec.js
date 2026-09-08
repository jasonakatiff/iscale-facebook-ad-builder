import { test, expect } from '@playwright/test';
import process from 'node:process';

test('analytics navigation, saved settings and mobile layout', async ({ page, request }) => {
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD, 'Requires an authorized test account');
    const api = process.env.TEST_API_URL;
    const login = await request.post(`${api}/auth/login/json`, { data: { email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD } });
    expect(login.ok()).toBeTruthy();
    await page.addInitScript(value => localStorage.setItem('accessToken', value), (await login.json()).access_token);
    await page.goto('/creative-analytics');
    await expect(page.getByRole('heading', { name: 'Creative analytics', exact: true })).toBeVisible();
    await expect(page.getByLabel('Success metric')).toBeVisible();
    await expect(page.getByText(/eligible creative\/group combinations/)).toBeVisible();
    for (const name of ['Imported ads', 'Daily performance', 'Data sources']) {
        await page.getByRole('button', { name, exact: true }).click();
        await expect(page.getByRole('region', { name: name === 'Data sources' ? 'Analytics data sources' : name })).toBeVisible();
    }
    await page.getByRole('link', { name: 'Analytics settings' }).click();
    await expect(page.getByRole('heading', { name: 'Google imports' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'TikTok imports' })).toBeVisible();
    await expect(page.getByLabel('Default success metric')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto('/creative-analytics');
    await expect(page.getByLabel('Success metric')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
