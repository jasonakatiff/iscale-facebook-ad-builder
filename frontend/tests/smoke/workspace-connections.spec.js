import { test, expect } from '@playwright/test';
import { requireWorkspaceFixture, workspaceLogin, createWorkspace, workspaceApi } from '../fixtures/workspace-connections';

test('Connections navigation, manual policy, creation validation and load retry', async ({ page }) => {
    requireWorkspaceFixture();
    await workspaceLogin(page);
    await expect(page.getByText('Manual refresh · one selected account at a time')).toBeVisible();
    const workspace = await createWorkspace(page);
    try {
        await page.route('**/api/v2/workspaces?*', route => route.abort('failed'));
        await page.reload();
        await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
        await page.unroute('**/api/v2/workspaces?*');
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        await expect(page.getByRole('combobox', { name: 'Workspace', exact: true })).toBeVisible();
    } finally { await workspaceApi(page, `/api/test-workspaces/${workspace.id}`, 'DELETE'); }
});
