import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { Buffer } from 'node:buffer';

test.use({ trace: 'off', screenshot: 'off' });

const api = process.env.TEST_API_URL || 'http://127.0.0.1:63421/api/v1';

test('Local package and service complete the same library/API workflow', async ({
    page,
    request,
}) => {
    test.setTimeout(90000);
    test.skip(
        !process.env.TEST_EMAIL || !process.env.TEST_PASSWORD,
        'Requires an explicit test login.',
    );
    const ids = [];
    let headers, refreshToken;
    const document = (execution) => ({
        schemaVersion: 1,
        slug: `test-${execution}-${randomUUID().slice(0, 8)}`,
        name: `test-${execution} plugin`,
        version: '1.0.0',
        description: 'test-Private plugin lifecycle',
        category: 'prompts',
        execution,
        inputs: [{ name: 'product', label: 'Product', required: true }],
        configFields: [{ name: 'voice', label: 'Voice', default: 'Direct' }],
        template:
            execution === 'template'
                ? { brief: '{{voice}}: {{product}}' }
                : null,
    });
    try {
        await page.goto('/login');
        await page.getByLabel('Email address').fill(process.env.TEST_EMAIL);
        await page
            .getByLabel('Password', { exact: true })
            .fill(process.env.TEST_PASSWORD);
        await page
            .getByRole('button', { name: 'Sign In', exact: true })
            .click();
        await page.waitForURL((url) => url.pathname !== '/login');
        const tokens = await page.evaluate(() => ({
            access: localStorage.getItem('accessToken'),
            refresh: localStorage.getItem('refreshToken'),
        }));
        headers = { Authorization: `Bearer ${tokens.access}` };
        refreshToken = tokens.refresh;
        await page.goto('/plugins');
        for (const execution of ['template', 'service']) {
            const pkg = document(execution);
            await page.getByLabel('Plugin package file').setInputFiles({
                name: 'test-plugin.json',
                mimeType: 'application/json',
                buffer: Buffer.from(JSON.stringify(pkg)),
            });
            await expect(
                page.getByRole('heading', { name: 'Import preview' }),
            ).toBeVisible();
            const installed = page.waitForResponse(
                (response) =>
                    response.url() === `${api}/plugins` &&
                    response.request().method() === 'POST',
            );
            await page
                .getByRole('button', { name: 'Install plugin', exact: true })
                .click();
            const result = await (await installed).json();
            const id = result.data.id;
            ids.push(id);
            await page.getByLabel('Voice', { exact: true }).fill('test-Warm');
            await page
                .getByRole('button', {
                    name: 'Save configuration',
                    exact: true,
                })
                .click();
            await page
                .getByLabel('Product', { exact: true })
                .fill('test-Coffee');
            await page
                .getByRole('button', { name: 'Run plugin', exact: true })
                .click();
            if (execution === 'template') {
                await expect(
                    page.getByTestId('plugin-output').first(),
                ).toContainText('test-Warm: test-Coffee');
            } else {
                // The first connection preserves waiting work; rotation cancels unfinished jobs.
                await page
                    .getByRole('button', {
                        name: 'Create service key',
                        exact: true,
                    })
                    .click();
                const key = await page
                    .getByLabel('One-time service key')
                    .inputValue();
                const jobResponse = await request.post(
                    `${api}/plugins/${id}/runs`,
                    {
                        headers,
                        data: {
                            requestId: randomUUID(),
                            inputs: { product: 'test-Service coffee' },
                        },
                    },
                );
                expect(jobResponse.status()).toBe(202);
                const job = (await jobResponse.json()).data;
                const workerHeaders = { Authorization: `Bearer ${key}` };
                const claimResponse = await request.post(
                    `${api}/plugin-worker/jobs/${job.id}/claim`,
                    { headers: workerHeaders },
                );
                expect(claimResponse.ok()).toBe(true);
                const claim = await claimResponse.json();
                expect(claim.data.configuration.voice).toBe('test-Warm');
                expect(
                    (
                        await request.post(
                            `${api}/plugin-worker/jobs/${job.id}/result`,
                            {
                                headers: workerHeaders,
                                data: {
                                    leaseToken: claim.leaseToken,
                                    output: {
                                        message:
                                            'test-Simulated company result',
                                    },
                                },
                            },
                        )
                    ).ok(),
                ).toBe(true);
                await page
                    .getByRole('button', { name: 'Refresh runs', exact: true })
                    .click();
                await expect(
                    page.getByTestId('plugin-output').first(),
                ).toContainText('test-Simulated company result');
            }
            const downloaded = page.waitForEvent('download');
            await page
                .getByRole('button', { name: 'Export package', exact: true })
                .click();
            expect((await downloaded).suggestedFilename()).toContain(pkg.slug);
            await page
                .getByRole('button', { name: 'Disable plugin', exact: true })
                .click();
            await expect(
                page.getByRole('button', { name: 'Run plugin', exact: true }),
            ).toBeDisabled();
            await page
                .getByRole('button', { name: 'Uninstall plugin', exact: true })
                .click();
            await page
                .getByRole('dialog')
                .getByRole('button', { name: 'Uninstall', exact: true })
                .click();
            await expect(
                page.getByRole('button', { name: pkg.name, exact: false }),
            ).toHaveCount(0);
            expect(
                (
                    await request.get(`${api}/plugins/runs?pluginId=${id}`, {
                        headers,
                    })
                ).ok(),
            ).toBe(true);
        }
    } finally {
        if (headers) {
            for (const id of ids)
                await request.delete(`${api}/plugins/${id}`, { headers });
            if (refreshToken)
                expect(
                    (
                        await request.post(`${api}/auth/logout`, {
                            headers,
                            data: { refresh_token: refreshToken },
                        })
                    ).ok(),
                ).toBe(true);
        }
    }
});
