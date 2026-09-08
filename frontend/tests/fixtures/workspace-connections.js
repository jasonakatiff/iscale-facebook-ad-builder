import process from 'node:process';
import { test, expect } from '@playwright/test';

export function requireWorkspaceFixture() {
    test.skip(process.env.TEST_WORKSPACE_FIXTURE !== '1', 'Requires the isolated workspace API and worker fixture');
    if (!['127.0.0.1', 'localhost'].includes(new URL(process.env.BASE_URL).hostname)) {
        throw new Error('Workspace mutation tests require an isolated localhost fixture.');
    }
}

export async function workspaceLogin(page, email = process.env.TEST_EMAIL, password = process.env.TEST_PASSWORD) {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Connections', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();
}

export async function choose(page, label, name) {
    await page.getByRole('combobox', { name: label, exact: true }).fill(name);
    await page.getByRole('option', { name, exact: false }).first().click();
}

export async function createWorkspace(page) {
    const name = `test-browser-workspace-${Date.now()}`;
    await page.getByText('Create workspace', { exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Create workspace', exact: true })).toBeDisabled();
    await page.getByLabel('Workspace name', { exact: true }).fill(name);
    const response = page.waitForResponse(res => res.url().endsWith('/api/v2/workspaces') && res.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
    const result = await response;
    expect(result.status()).toBe(201);
    await expect(page.getByText('No accounts are shared with you in this workspace.')).toBeVisible();
    return { name, id: (await result.json()).id };
}

export async function workspaceApi(page, path, method = 'GET', body) {
    return page.evaluate(async ({ path, method, body }) => {
        const response = await fetch(path, { method, headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
        if (!response.ok) throw new Error(`Fixture API returned ${response.status}`);
        return response.json();
    }, { path, method, body });
}
