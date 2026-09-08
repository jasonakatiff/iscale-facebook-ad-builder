import process from 'node:process';
import { expect } from '@playwright/test';

export async function loginForConnections(page) {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(process.env.TEST_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(process.env.TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}

export async function connectionScenario(page, request, scenario) {
    const baseURL = process.env.TEST_META_URL;
    if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Connection scenarios require a localhost fixture.');
    const token = await page.evaluate(() => localStorage.getItem('accessToken'));
    const result = await request.post(`${baseURL}/test-connection-scenario`, { headers: { Authorization: `Bearer ${token}` }, data: { scenario } });
    expect(result.ok()).toBe(true);
}
