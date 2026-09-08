import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const entry = process.env.PROTOTYPE_FILE ? pathToFileURL(process.env.PROTOTYPE_FILE).href : '/prototype/';

async function prepare(page) {
  await page.goto(entry);
  await page.getByLabel('Select Morning ritual').check();
  await page.getByRole('button', { name: 'Create brief', exact: true }).click();
  await page.getByLabel('Hypothesis').fill('test-Morning routine will make the offer easier to understand.');
  await page.getByRole('button', { name: 'Build creatives', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare deployment', exact: true }).click();
  await page.getByLabel('Connection scenario').selectOption('managed');
  await page.getByRole('button', { name: 'Open campaign planner' }).click();
}

test('full sample workflow preserves evidence and exposes paused review without API calls', async ({ page }) => {
  const requests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api') || (url.protocol !== 'file:' && !['blob:', 'data:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname))) requests.push(request.url());
  });
  await prepare(page);
  await expect(page.getByTestId('ad-count')).toContainText('24 ads');
  await page.getByRole('button', { name: 'Review launch', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review exact launch' })).toBeVisible();
  await expect(page.getByTestId('budget-total')).toContainText('$39.98');
  await expect(page.getByTestId('creative-history')).toContainText('Morning ritual');
  await page.getByRole('button', { name: 'Create 24 paused ads' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Simulate paused creation' }).click();
  await page.getByRole('button', { name: 'Simulate completion', exact: true }).click();
  await expect(page.getByTestId('job-summary')).toContainText('24 confirmed');
  await page.getByRole('button', { name: 'View sample report' }).click();
  await expect(page.getByText('Sample performance — not live account results')).toBeVisible();
  await page.getByRole('button', { name: 'Inspect Morning ritual' }).click();
  await expect(page.getByText('Contributing sample ads')).toBeVisible();
  await page.getByRole('button', { name: 'Create next brief' }).click();
  await expect(page.getByTestId('creative-history')).toContainText('Sample report');
  await expect(page.getByLabel('Hypothesis')).toHaveValue(/test/i);
  await page.reload();
  await expect(page.getByLabel('Hypothesis')).toHaveValue(/test/i);
  expect(requests).toEqual([]);
});

test('connection states, conflict and interrupted launch remain actionable', async ({ page }) => {
  await prepare(page);
  await page.getByLabel('Build name').fill('test-local edits');
  await page.getByRole('button', { name: 'Simulate edit conflict' }).click();
  await page.getByRole('button', { name: 'Fork my changes' }).click();
  await expect(page.getByLabel('Build name')).toHaveValue(/test-local edits/);
  await page.getByRole('button', { name: 'Review launch', exact: true }).click();
  await page.getByRole('button', { name: 'Create 24 paused ads' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Simulate paused creation' }).click();
  await page.getByRole('button', { name: 'Simulate interrupted launch' }).click();
  await page.getByRole('button', { name: 'Stop remaining work', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Keep working' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Stop remaining work', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Stop remaining work', exact: true }).click();
  await dialog.getByRole('button', { name: 'Stop 15 remaining ads' }).click();
  await expect(page.getByTestId('job-summary')).toContainText('8 confirmed');
  await expect(page.getByTestId('job-summary')).toContainText('1 unknown');
  await expect(page.getByTestId('job-summary')).toContainText('15 stopped');
  await page.reload();
  await expect(page.getByTestId('job-summary')).toContainText('1 unknown');
  await expect(page.getByRole('button', { name: 'Retry all' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Ad Deployment', exact: true }).click();
  for (const state of ['loading', 'disconnected', 'expired', 'revoked', 'selection', 'empty']) {
    await page.getByLabel('Connection scenario').selectOption(state);
    await expect(page.getByRole('button', { name: 'Open campaign planner' })).toHaveCount(0);
  }
  await page.getByLabel('Connection scenario').selectOption('managed');
  await expect(page.getByRole('heading', { name: 'Connected through workspace', exact: true })).toBeVisible();
});

test('local media, copy and source overrides persist with explicit missing-media recovery', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: 'Select ad set 2' }).click();
  await page.getByLabel('Audience override').fill('test-Past purchasers');
  await expect(page.getByTestId('selected-audience')).toContainText('test-Past purchasers');
  await page.getByRole('button', { name: 'Reset to source' }).click();
  await expect(page.getByTestId('selected-audience')).toContainText('Broad prospecting');
  await page.getByRole('link', { name: 'Creative Building', exact: true }).click();
  await page.getByLabel('Upload finished creatives').setInputFiles({ name: 'test-creative.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>') });
  await expect(page.getByText('test-creative.svg', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('Select the file again to restore its preview.', { exact: true })).toBeVisible();
});

for (const width of [390, 768, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`nine screens remain usable at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await prepare(page);
      await page.getByRole('radio', { name: `${theme === 'light' ? 'Light' : 'Dark'} theme` }).check();
      await page.getByRole('button', { name: 'Review launch', exact: true }).click();
      await page.getByRole('button', { name: 'Create 24 paused ads' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Simulate paused creation' }).click();
      await page.getByRole('button', { name: 'Simulate completion', exact: true }).click();
      for (const screen of ['research', 'brief', 'create', 'deploy', 'planner', 'review', 'job', 'reports', 'detail']) {
        await page.getByLabel('Prototype screen').selectOption(screen);
        await expect(page.getByTestId('sample-notice')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    });
  }
}
