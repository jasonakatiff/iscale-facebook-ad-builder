import { test, expect } from '@playwright/test';
import { requireWorkspaceFixture, workspaceLogin, createWorkspace, workspaceApi, choose } from '../fixtures/workspace-connections';

test('share, manually refresh through worker, grant viewer access, then revoke it', async ({ page, browser }) => {
    requireWorkspaceFixture();
    await workspaceLogin(page);
    const workspace = await createWorkspace(page);
    const viewerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    try {
        const syncCalls = [];
        page.on('request', req => { if (req.method() === 'POST' && req.url().endsWith('/sync')) syncCalls.push(req.url()); });
        await choose(page, 'Personal Meta account', 'test-Primary Meta');
        await page.getByRole('button', { name: 'Share account', exact: true }).click();
        await choose(page, 'Account to view or refresh', 'test-Primary Meta');
        await expect(page.getByText('No snapshot yet.', { exact: true })).toBeVisible();
        expect(syncCalls).toHaveLength(0);
        await page.getByRole('button', { name: 'Refresh this account', exact: true }).click();
        await expect(page.getByText('test-Prospecting', { exact: true })).toBeVisible({ timeout: 20000 });
        await expect(page.getByText('test-Retargeting', { exact: true })).toBeVisible();
        expect(syncCalls).toHaveLength(1);

        await choose(page, 'Personal Meta account', 'act_456');
        await page.getByRole('button', { name: 'Share account', exact: true }).click();
        await choose(page, 'Account to view or refresh', 'act_456');
        await expect(page.getByText('No snapshot yet.', { exact: true })).toBeVisible();
        await expect(page.getByText('test-Prospecting', { exact: true })).toHaveCount(0);
        expect(syncCalls).toHaveLength(1);

        const accounts = await workspaceApi(page, `/api/v2/workspaces/${workspace.id}/connections`);
        const second = accounts.data.find(row => row.external_account_id === 'act_456');
        await workspaceApi(page, `/api/test-workspaces/${workspace.id}/reissue/${second.id}`, 'POST', {});
        await page.reload();
        await choose(page, 'Workspace', workspace.name);
        await choose(page, 'Account to view or refresh', 'act_456');
        await expect(page.getByText(/Meta access is unavailable/)).toBeVisible();
        await choose(page, 'Personal Meta account', 'test-Reissued Meta');
        await page.getByRole('button', { name: 'Reconnect shared account', exact: true }).click();
        await expect(page.getByText(/Meta access is unavailable/)).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Refresh this account', exact: true })).toBeEnabled();
        expect(syncCalls).toHaveLength(1);

        await choose(page, 'Workspace teammate', 'test-workspace-viewer');
        await page.getByRole('button', { name: 'Save membership', exact: true }).click();
        await expect(page.getByText('Active workspace member', { exact: true })).toBeVisible();
        await choose(page, 'Manage registered account', 'test-Primary Meta');
        await choose(page, 'Teammate account access', 'test-workspace-viewer');
        await page.getByRole('button', { name: 'Save account access', exact: true }).click();
        await expect(page.getByText('Current access: Read only · Viewer', { exact: true })).toBeVisible();
        const viewer = await viewerContext.newPage();
        await workspaceLogin(viewer, 'test-workspace-viewer@example.com', 'test-workspace-password');
        await choose(viewer, 'Workspace', workspace.name);
        await choose(viewer, 'Account to view or refresh', 'test-Primary Meta');
        await expect(viewer.getByText('test-Prospecting', { exact: true })).toBeVisible();
        await expect(viewer.getByRole('button', { name: 'Refresh this account', exact: true })).toHaveCount(0);
        await expect(viewer.getByRole('region', { name: 'Workspace administration' })).toHaveCount(0);

        await page.getByRole('button', { name: 'Revoke account access', exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.getByRole('button', { name: 'Revoke access', exact: true }).click();
        await expect(page.getByText('Current access: No access · Viewer', { exact: true })).toBeVisible();
        await viewer.getByRole('button', { name: 'Check status', exact: true }).click();
        await expect(viewer.getByRole('alert')).toBeVisible();
        await expect(viewer.getByText('test-Prospecting', { exact: true })).toHaveCount(0);
        expect(syncCalls).toHaveLength(1);
    } finally {
        await viewerContext.close();
        await workspaceApi(page, `/api/test-workspaces/${workspace.id}`, 'DELETE');
    }
});
