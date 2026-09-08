import process from 'node:process';
import { test, expect } from '@playwright/test';
import { connectionScenario, loginForConnections } from '../fixtures/meta-connection';

test.beforeEach(async ({ page }) => {
    test.skip(process.env.TEST_CONNECTION_FIXTURE !== '1', 'Requires isolated connection fixture');
    await loginForConnections(page);
});

test.afterEach(async ({ page, request }) => {
    if (process.env.TEST_CONNECTION_FIXTURE === '1') await connectionScenario(page, request, 'managed');
});

test('managed status, empty accounts and expired personal grants remain consistent', async ({ page, request }) => {
    await connectionScenario(page, request, 'managed');
    await page.goto('/facebook-campaigns');
    await expect(page.getByText(/Connected through workspace/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Ad Account', exact: true })).toBeVisible();
    await connectionScenario(page, request, 'empty');
    await page.reload();
    await expect(page.getByText(/No accessible ad accounts/)).toBeVisible();
    await connectionScenario(page, request, 'expired');
    await page.reload();
    await expect(page.getByText('Connection expired', { exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Ad Account', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /discard draft/i })).toHaveCount(0);
    const calls = await (await request.get(`${process.env.TEST_META_URL}/test-meta-calls`)).json();
    expect(calls).toEqual([]);
});

test('personal selection restores its draft and disconnect exposes managed fallback', async ({ page, request }) => {
    await connectionScenario(page, request, 'selection');
    await page.goto('/facebook-campaigns');
    await expect(page.getByRole('heading', { name: 'Choose a Meta ad account' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Ad Account', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /test-feedback-account.*act_123/ }).click();
    const account = page.getByRole('combobox', { name: 'Ad Account', exact: true });
    await account.fill('test-feedback');
    await page.getByRole('option', { name: /test-feedback-account/ }).click();
    await page.getByRole('button', { name: /next step/i }).click();
    await page.getByLabel('Campaign Name', { exact: false }).fill('test-preserved-personal-draft');
    await expect(page.getByText(/draft saved/i)).toBeVisible();
    await connectionScenario(page, request, 'managed-after-personal');
    await page.reload();
    await expect(page.getByLabel('Campaign Name', { exact: false })).toHaveValue('test-preserved-personal-draft');
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(page.getByText(/Connected through workspace/)).toBeVisible();
    await expect(page.getByLabel('Campaign Name', { exact: false })).toHaveCount(0);
    await connectionScenario(page, request, 'personal');
    await page.reload();
    await expect(page.getByLabel('Campaign Name', { exact: false })).toHaveValue('test-preserved-personal-draft');
});
