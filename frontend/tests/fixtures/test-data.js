/**
 * Test fixtures and helpers for Playwright tests
 */

export const testUser = {
  email: 'test@playwright.com',
  password: 'testpass123'
};

export const testBrand = {
  name: 'Test Brand',
  primaryColor: '#FF0000',
  secondaryColor: '#00FF00',
  highlightColor: '#0000FF',
  voice: 'Professional and friendly'
};

export const testProduct = {
  name: 'Test Product',
  description: 'A test product for automated testing',
  defaultUrl: 'https://example.com/product'
};

/**
 * Login helper - logs in and waits for dashboard
 */
export async function loginAs(page, user = testUser) {
  await page.goto('/login');
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });
}

/**
 * Mock API response helper
 */
export async function mockApiResponse(page, urlPattern, response, status = 200) {
  await page.route(urlPattern, route => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response)
    });
  });
}

/**
 * Mock login response (for testing without backend)
 */
export async function mockLoginSuccess(page) {
  // Mock login endpoint - actual endpoint is /auth/login/json
  await page.route('**/api/v1/auth/login/json', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        token_type: 'bearer'
      })
    });
  });

  // Also mock /auth/login for backwards compatibility
  await page.route('**/api/v1/auth/login', route => {
    if (route.request().url().includes('/json')) {
      route.continue();
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          token_type: 'bearer'
        })
      });
    }
  });

  // Mock /me endpoint for auth check
  await page.route('**/api/v1/auth/me', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'test-user-id',
        email: testUser.email,
        name: 'Test User',
        is_active: true
      })
    });
  });

  // Set tokens in localStorage before navigation
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'mock-access-token');
    localStorage.setItem('refreshToken', 'mock-refresh-token');
  });
}

/**
 * Mock brands list response
 */
export async function mockBrandsList(page, brands = []) {
  await page.route('**/api/v1/brands**', route => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(brands)
      });
    } else {
      route.continue();
    }
  });
}

/**
 * Set auth tokens in localStorage (for testing protected routes)
 */
export async function setAuthTokens(page) {
  await page.evaluate(() => {
    localStorage.setItem('accessToken', 'mock-access-token');
    localStorage.setItem('refreshToken', 'mock-refresh-token');
  });
}

/**
 * Clear auth tokens from localStorage
 */
export async function clearAuthTokens(page) {
  await page.evaluate(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  });
}

/**
 * Wait for toast notification
 */
export async function waitForToast(page, type = 'success') {
  const toastSelector = type === 'error'
    ? '.bg-red-500, [class*="error"], [data-toast="error"]'
    : '.bg-green-500, [class*="success"], [data-toast="success"]';

  await page.waitForSelector(toastSelector, { timeout: 5000 });
}

/**
 * Ensure no browser alert/confirm is called
 */
export function blockBrowserDialogs(page) {
  page.on('dialog', async dialog => {
    console.error(`Browser ${dialog.type()} detected: ${dialog.message()}`);
    // Dismiss any dialogs but fail the test
    await dialog.dismiss();
    throw new Error(`Browser ${dialog.type()}() should not be used. Use Toast or Modal components instead.`);
  });
}
