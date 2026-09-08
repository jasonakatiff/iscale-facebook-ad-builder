import { test, expect } from '@playwright/test';
import { installationFixtureEnabled, ownerApi, login } from '../helpers/installation';

test('owner completes setup, saves and downloads an ad, replaces and disconnects a key', async ({ page, request }) => {
    test.skip(!installationFixtureEnabled(), 'Requires the isolated installation server with simulated AI providers.');
    test.setTimeout(60000);
    page.setDefaultTimeout(10000);
    const api = await ownerApi(request);
    await api('/installation', 'PATCH', { step: 'welcome', status: 'in_progress' });
    for (const provider of ['gemini', 'fal']) await api(`/installation/providers/${provider}`, 'DELETE');
    const name = `test-install-${Date.now()}`;
    let brandId;
    try {
        await login(page);
        await expect(page).toHaveURL(/\/setup$/);
        await page.getByRole('button', { name: 'Start setup' }).click();
        for (const [provider, label] of [['gemini', 'Google Gemini'], ['fal', 'fal.ai']]) {
            const card = page.getByRole('region', { name: label, exact: true });
            await card.getByLabel(`${label} API key`).fill(`test-${provider}-first-key`);
            await card.getByRole('button', { name: 'Save key', exact: true }).click();
            await expect(card.getByLabel(`${label} API key`)).toHaveValue('');
            await expect(card.getByText('Saved, not yet verified', { exact: true })).toBeVisible();
        }
        await page.reload();
        await expect(page.getByRole('region', { name: 'Google Gemini' })).toBeVisible();
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        await page.getByRole('button', { name: 'Add a brand', exact: true }).click();
        await page.getByLabel('Brand Name', { exact: true }).fill(name);
        await page.getByRole('button', { name: 'Save Brand' }).click();
        await expect(page.getByRole('dialog', { name: 'Brand details' })).not.toBeVisible();
        brandId = (await api('/brands/')).find(item => item.name === name).id;
        await page.getByRole('button', { name: 'Add a product', exact: true }).click();
        await page.getByRole('combobox', { name: 'Brand' }).click();
        await page.getByRole('option', { name, exact: true }).click();
        await page.getByLabel('Product Name', { exact: true }).fill(`${name}-product`);
        await page.getByLabel('Description', { exact: true }).fill('Meal kits for busy parents');
        await page.getByRole('button', { name: 'Save Product' }).click();
        await expect(page.getByRole('dialog', { name: 'Product details' })).not.toBeVisible();
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        await page.getByRole('combobox', { name: 'Brand', exact: true }).click();
        await page.getByRole('option', { name, exact: true }).click();
        await page.getByLabel('Who is this ad for?').fill('Busy parents');
        await page.getByLabel('What do you want them to know?').fill('Dinner ready in fifteen minutes');
        await page.getByRole('button', { name: 'Generate one ad' }).click();
        await expect(page.getByText('Saved to your creative gallery.')).toBeVisible();
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download image' }).click();
        const download = await downloadPromise;
        expect(await download.failure()).toBeNull();
        const ads = await api(`/generated-ads/?brand_id=${brandId}`);
        expect(ads).toHaveLength(1);
        expect((await request.get(ads[0].image_url)).ok()).toBeTruthy();
        await page.getByRole('button', { name: 'Finish setup and open gallery' }).click();
        await expect(page).toHaveURL(/\/generated-ads$/);
        await page.goto('/settings?tab=integrations');
        const fal = page.getByRole('region', { name: 'fal.ai', exact: true });
        await fal.getByLabel('fal.ai API key').fill('test-fal-replacement-key');
        await fal.getByRole('button', { name: 'Replace key' }).click();
        await expect(fal.getByLabel('fal.ai API key')).toHaveValue('');
        await fal.getByRole('button', { name: 'Disconnect', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Disconnect', exact: true }).click();
        await expect(fal.getByText('Not connected', { exact: true })).toBeVisible();
        await page.reload();
        expect((await api('/installation')).capabilities.image_generation).toBe(false);
        await page.goto('/setup');
        await page.getByRole('button', { name: 'Back to workspace', exact: true }).click();
        expect((await api('/installation')).status).toBe('complete');
    } finally {
        if (brandId) {
            for (const ad of await api(`/generated-ads/?brand_id=${brandId}`)) await api(`/generated-ads/${ad.id}`, 'DELETE');
            await api(`/brands/${brandId}`, 'DELETE');
        }
    }
});
