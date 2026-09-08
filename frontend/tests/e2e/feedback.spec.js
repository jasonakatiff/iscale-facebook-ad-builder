import process from 'node:process';
import { Buffer } from 'node:buffer';
import { test, expect } from '@playwright/test';

test('draft restores campaign input and clears only on discard', async ({ page }) => {
    test.skip(
        !process.env.TEST_EMAIL || !process.env.TEST_PASSWORD,
        'TEST_EMAIL and TEST_PASSWORD required',
    );
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(process.env.TEST_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(process.env.TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await page.goto('/facebook-campaigns');
    const account = page.getByRole('combobox', { name: /ad account/i });
    await account.fill(process.env.TEST_AD_ACCOUNT || 'test-');
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: /next step/i }).click();
    await page.getByLabel('Campaign Name', { exact: false }).fill('test-draft-feedback');
    await expect(page.getByText(/draft saved/i)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Campaign Name', { exact: false })).toHaveValue(
        'test-draft-feedback',
    );
    await page.getByRole('button', { name: /discard draft/i }).click();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Select Ad Account' })).toBeVisible();
});

// Uses real app/API/PostgreSQL, simulated Meta SDK transport and a durable-storage response.
for (const interrupted of [false, true]) {
    test(`review precedes Meta writes and ${interrupted ? 'interrupted publication cannot be repeated' : 'paused queue submission round trips'}`, async ({
        page,
        request,
    }) => {
        test.skip(
            process.env.TEST_META_FIXTURE !== '1',
            'Requires the isolated Meta fixture server',
        );
        expect(new URL(metaUrlForIsolation()).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
        await page.route('**/api/v1/uploads/', route => route.fulfill({json: {url: 'https://example.com/test-queued-media.png'}}));
        if (interrupted) await page.setViewportSize({ width: 390, height: 844 });
        const metaUrl = process.env.TEST_META_URL || 'http://127.0.0.1:8017';
        const before = await (await request.get(`${metaUrl}/test-meta-calls`)).json();
        const writesBefore = before.filter((call) => call.method === 'POST').length;
        await page.goto('/login');
        await page.getByLabel(/email/i).fill(process.env.TEST_EMAIL);
        await page.getByLabel('Password', { exact: true }).fill(process.env.TEST_PASSWORD);
        await page.getByRole('button', { name: /sign in/i }).click();
        await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
        let nativeHeaders = null;
        const nativeApi = process.env.TEST_API_URL;
        if (!interrupted && process.env.TEST_NATIVE_LEADROUTER === '1') {
            expect(new URL(nativeApi).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
            const token = await page.evaluate(() => localStorage.getItem('accessToken'));
            nativeHeaders = { Authorization: `Bearer ${token}` };
            await request.delete(`${nativeApi}/leadrouter/connection`, { headers: nativeHeaders });
            const result = await request.put(`${nativeApi}/leadrouter/connection`, { headers: nativeHeaders, data: { apiKey: 'lr_test_native_browser_key', accountType: 'partner' } });
            expect(result.ok()).toBe(true);
        }
        await page.goto('/facebook-campaigns');
        if (interrupted)
            expect(
                await page.evaluate(() => document.documentElement.scrollWidth),
            ).toBeLessThanOrEqual(390);
        await page.getByRole('combobox', { name: 'Ad Account' }).fill('test-feedback');
        await page.getByRole('option').first().click();
        await page.getByRole('button', { name: /next step/i }).click();
        if (nativeHeaders) {
            await page.getByText('LeadRouter · Optional campaign link', { exact: true }).click();
            const nativePicker = page.getByRole('combobox', { name: 'LeadRouter campaign', exact: true });
            await expect(nativePicker).toBeEnabled(); await nativePicker.click();
            await page.getByRole('option', { name: /test-Solar campaign/ }).click();
            await page.getByText('LeadRouter · test-Solar campaign', { exact: true }).click();
        }
        await page
            .getByLabel('Campaign Name', { exact: false })
            .fill(interrupted ? 'test-interrupt-publish' : 'test-feedback-publish');
        await page.getByLabel('Campaign Objective', { exact: false }).selectOption('OUTCOME_LEADS');
        await page.getByRole('button', { name: /next step/i }).click();
        await page.getByLabel('Ad Set Name', { exact: false }).fill('test-feedback-adset');
        await page.getByLabel(/Daily Budget/).fill('19.99');
        await expect(page.getByLabel('Conversion Event', { exact: false })).toHaveValue('LEAD');
        await page.getByRole('combobox', { name: 'Facebook Pixel' }).fill('test-Pixel');
        await page.getByRole('option', { name: 'test-Pixel', exact: true }).click();
        await page.getByLabel('Location inclusion').selectOption('exclude');
        await page.getByLabel('Search locations', { exact: true }).fill('California');
        await page.getByRole('button', { name: /California/ }).click();
        await page.getByRole('checkbox', { name: 'Facebook Stories', exact: true }).uncheck();
        await page
            .getByRole('combobox', { name: 'Include Custom Audiences / lookalikes' })
            .fill('test-Lookalike');
        await page.getByRole('option', { name: /test-Lookalike/ }).click();
        await page
            .getByRole('combobox', { name: 'Exclude Custom Audiences / lookalikes' })
            .fill('test-Customers');
        await page.getByRole('option', { name: 'test-Customers', exact: true }).click();
        await page.getByRole('button', { name: /next step/i }).click();
        await expect(
            page.getByRole('combobox', { name: 'Facebook Page', exact: true }),
        ).toHaveValue('');
        await page.getByRole('combobox', { name: 'Facebook Page', exact: true }).fill('test-');
        await expect(page.getByRole('option').first()).toHaveText('test-Alpha Page');
        await page.getByRole('option', { name: 'test-Alpha Page', exact: true }).click();
        await page
            .getByRole('combobox', { name: 'Instagram account', exact: true })
            .fill('test_brand');
        await page.getByRole('option', { name: 'test_brand', exact: true }).click();
        await page.getByLabel('Upload images or videos').setInputFiles({
            name: 'test creative.png',
            mimeType: 'image/png',
            buffer: Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=',
                'base64',
            ),
        });
        await page.getByRole('button', { name: 'Add headline', exact: true }).click();
        await page.getByLabel('Headline 2', { exact: true }).fill('test-second-headline');
        await page.getByRole('radio', { name: 'Dark theme' }).check();
        await page.getByRole('button', { name: 'Add primary text', exact: true }).click();
        await page.getByLabel('Primary text 2', { exact: true }).fill('test-second-body');
        await page.getByRole('button', { name: /next step/i }).click();
        await expect(page.getByRole('alert')).toContainText('Website URL');
        await page.getByLabel('Website URL', { exact: false }).fill('https://example.com/test');
        await expect(page.getByText(/draft saved/i)).toBeVisible();
        await page.reload();
        await expect(page.getByRole('img', { name: 'test creative.png' })).toBeVisible();
        await expect(page.getByLabel('Headline 2', { exact: true })).toHaveValue(
            'test-second-headline',
        );
        await page.getByText('Saved settings library', { exact: true }).click();
        await page.getByLabel('Preset name', { exact: true }).fill('test-feedback-preset');
        await page.getByLabel('Vertical / offer').fill('test-legal');
        await page.getByRole('button', { name: 'Save current settings as new' }).click();
        await expect(page.getByText('Campaign settings saved.', { exact: true })).toBeVisible();
        await page
            .getByRole('combobox', { name: 'Saved settings for this ad account' })
            .fill('test-feedback-preset');
        await page
            .getByRole('option', { name: /test-feedback-preset/ })
            .first()
            .click();
        await page.getByRole('button', { name: 'Load settings', exact: true }).click();
        await page.getByRole('button', { name: 'Delete preset', exact: true }).click();
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
        await page.getByRole('button', { name: /next step/i }).click();
        await expect(page.getByLabel('Ad 1 name')).toHaveValue('test_creative');
        await page.getByLabel('Ad 1 name').fill('test-edited-ad');
        await page.getByRole('button', { name: 'Review & Launch', exact: true }).click();
        await expect(
            page.getByRole('heading', { name: 'Review & Launch', exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Queue 1 paused ads on Facebook' }),
        ).toBeEnabled();
        await expect(page.getByText('test-edited-ad', { exact: true })).toBeVisible();
        await page.screenshot({
            path: interrupted
                ? '/tmp/breadwinner-feedback-review-mobile.png'
                : '/tmp/breadwinner-feedback-review.png',
            fullPage: true,
        });
        const reviewedCalls = await (await request.get(`${metaUrl}/test-meta-calls`)).json();
        expect(reviewedCalls.filter((call) => call.method === 'POST')).toHaveLength(writesBefore);
        const submission = interrupted ? null : page.waitForRequest(req => req.url().endsWith('/delivery/launches') && req.method() === 'POST');
        await page.getByRole('button', { name: 'Queue 1 paused ads on Facebook' }).click();
        if (interrupted) {
            await expect(
                page.getByText('Publication needs reconciliation', { exact: true }),
            ).toBeVisible();
            await page.reload();
            await expect(
                page.getByText('Publication needs reconciliation', { exact: true }),
            ).toBeVisible();
            await expect(
                page.getByRole('button', { name: 'Queue 1 paused ads on Facebook' }),
            ).toBeDisabled();
            const interruptedCalls = await (await request.get(`${metaUrl}/test-meta-calls`)).json();
            expect(interruptedCalls.filter((call) => call.method === 'POST')).toHaveLength(
                writesBefore + 1,
            );
            return;
        }
        await expect(page.getByRole('heading', { name: '1 paused ads queued' })).toBeVisible({
            timeout: 20000,
        });
        if (nativeHeaders) {
            const response = await request.get(`${nativeApi}/leadrouter/defaults`, { headers: nativeHeaders });
            expect(response.ok()).toBe(true);
            expect((await response.json()).data).toEqual(expect.arrayContaining([expect.objectContaining({ resourceType: 'campaign', campaign: expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111' }) })]));
            expect((await request.delete(`${nativeApi}/leadrouter/connection`, { headers: nativeHeaders })).ok()).toBe(true);
        }
        const after = await (await request.get(`${metaUrl}/test-meta-calls`)).json();
        const writes = after.filter((call) => call.method === 'POST').slice(writesBefore);
        for (const call of writes.filter((call) => /\/(campaigns|adsets|ads)$/.test(call.path)))
            expect(call.params.status).toBe('PAUSED');
        const adset = writes.find((call) => call.path.endsWith('/adsets')).params;
        const targeting =
            typeof adset.targeting === 'string' ? JSON.parse(adset.targeting) : adset.targeting;
        expect(Number(adset.daily_budget)).toBe(1999);
        expect(targeting.excluded_geo_locations.regions).toEqual([{ key: '3843' }]);
        expect(targeting.facebook_positions).not.toContain('story');
        expect(targeting.custom_audiences).toEqual([{ id: '444' }]);
        expect(targeting.excluded_custom_audiences).toEqual([{ id: '445' }]);
        const queued = (await submission).postDataJSON();
        expect(queued.status).toBe('PAUSED');
        expect(queued.instagram_user_id).toBe('222');
        expect(queued.primary_text).toBe('test-second-body');
        expect(queued.headline).toBe('test-second-headline');
        expect(queued.url_tags).toContain('ad_id={{ad.id}}');
        await page.getByRole('button', { name: 'Start a new campaign' }).click();
        await expect(page.getByRole('heading', { name: 'Select Ad Account' })).toBeVisible();
    });
}

function metaUrlForIsolation() { return process.env.TEST_META_URL || 'http://127.0.0.1:8017'; }
