import process from 'node:process';
import { test, expect } from '@playwright/test';

test('public login branding and downloadable user guides are available', async ({
    page,
    request,
}) => {
    await page.goto('/login');
    await expect(page).toHaveTitle('BreadWinner by theLeadRouter.com');
    await expect(
        page.getByRole('button', { name: 'Sign In', exact: true }),
    ).toBeVisible();
    const api = process.env.TEST_API_URL;
    test.skip(!api, 'TEST_API_URL identifies the deployed docs API.');
    const guides = await request.get(`${api}/help/docs`);
    expect(guides.status()).toBe(200);
    expect((await guides.json()).data.length).toBeGreaterThanOrEqual(15);
    const markdown = await request.get(
        `${api}/help/docs/claude-code?download=true`,
    );
    expect(markdown.headers()['content-type']).toContain('text/markdown');
    expect(markdown.headers()['content-disposition']).toContain(
        'claude-code.md',
    );
    expect(await markdown.text()).toContain('BREADWINNER_API_KEY');
});
