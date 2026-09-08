import process from 'node:process';
import { expect } from '@playwright/test';

export function installationFixtureEnabled() {
    return process.env.TEST_INSTALLATION_E2E === '1' && /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.BASE_URL || '');
}
export async function ownerApi(request) {
    const response = await request.post('/api/v1/auth/login/json', {
        data: { email: 'test-owner@example.com', password: 'test-owner-password-123' },
    });
    expect(response.ok()).toBeTruthy();
    const token = (await response.json()).access_token;
    return async (path, method = 'GET', data) => {
        const result = await request.fetch(`/api/v1${path}`, { method, data, headers: { Authorization: `Bearer ${token}` } });
        expect(result.ok(), `${method} ${path}: ${await result.text()}`).toBeTruthy();
        return result.json();
    };
}
export async function login(page) {
    await page.goto('/login');
    await page.getByLabel('Email').fill('test-owner@example.com');
    await page.getByLabel('Password', { exact: true }).fill('test-owner-password-123');
    await page.getByRole('button', { name: /Sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login$/);
}
