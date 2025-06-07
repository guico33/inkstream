import { test, expect } from '@playwright/test';
import {
  setupAuthMocks,
  mockFailedAuth,
  mockUser,
  mockTokens,
} from '../mocks/auth-mocks';
import { TEST_TIMEOUTS } from '../utils/test-config';
import {
  waitForPageLoad,
  clearStorage,
  setStorageAuth,
  expectToBeOnLoginPage,
  expectToBeOnDashboard,
  expectToBeOnAuthCallback,
} from '../utils/test-utils';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a basic page first to establish a context for localStorage
    await page.goto('/');
    await clearStorage(page);
  });

  test('should display the login page correctly', async ({ page }) => {
    await page.goto('/login');

    await expect(
      page.getByRole('heading', { name: /Welcome to Inkstream/i })
    ).toBeVisible();

    const googleSignInButton = page.getByRole('button', {
      name: /Sign in with Google/i,
    });
    await expect(googleSignInButton).toBeVisible();
    await expect(
      googleSignInButton.getByRole('img', { name: /google/i })
    ).toBeVisible();
  });

  test('should redirect authenticated user from login page to dashboard', async ({
    page,
  }) => {
    // Pre-authenticate user
    await setStorageAuth(page, mockUser, {
      ...mockTokens,
      expiresAt: Date.now() + 3600000, // 1 hour from now
    });

    await page.goto('/login');
    await waitForPageLoad(page);

    // Should redirect to dashboard
    await expectToBeOnDashboard(page);
  });

  test('should complete successful Google OAuth flow', async ({ page }) => {
    await setupAuthMocks(page);

    // Start at login page
    await page.goto('/login');
    await expectToBeOnLoginPage(page);

    // Click sign in button
    const googleSignInButton = page.getByRole('button', {
      name: /Sign in with Google/i,
    });
    await googleSignInButton.click();

    // Should redirect to callback page and process auth
    await expectToBeOnAuthCallback(page);

    // Wait for auth processing and redirect to dashboard
    await waitForPageLoad(page);
    await expectToBeOnDashboard(page);

    // Verify user is now authenticated by checking localStorage
    const userDataString = await page.evaluate(() =>
      localStorage.getItem('inkstream_user')
    );
    const userData = JSON.parse(userDataString!);
    expect(userData).toMatchObject({
      email: mockUser.email,
      name: mockUser.name,
    });
  });

  test('should handle successful auth callback with authorization code', async ({
    page,
  }) => {
    await setupAuthMocks(page);

    // Simulate direct navigation to callback with auth code
    await page.goto('/auth/callback?code=mock_auth_code_12345');

    // Should show processing state initially
    await expect(page.getByText(/Completing Sign In/i)).toBeVisible();
    await expect(page.getByText(/Processing authentication/i)).toBeVisible();

    // Should redirect to dashboard after processing
    await waitForPageLoad(page);
    await expectToBeOnDashboard(page);

    // Verify authentication state
    const userDataString = await page.evaluate(() =>
      localStorage.getItem('inkstream_user')
    );
    const userData = JSON.parse(userDataString!);
    expect(userData.email).toBe(mockUser.email);
  });

  test('should handle OAuth error from provider', async ({ page }) => {
    await mockFailedAuth(page, 'oauth_error');

    await page.goto('/login');
    const googleSignInButton = page.getByRole('button', {
      name: /Sign in with Google/i,
    });
    await googleSignInButton.click();

    // Should show error on callback page
    await expect(
      page.getByRole('heading', { name: /Authentication Failed/i })
    ).toBeVisible();
    await expect(
      page.getByText(/Authentication was cancelled or failed/i)
    ).toBeVisible();

    // Should redirect back to login after delay (we can check immediately)
    await page.waitForTimeout(TEST_TIMEOUTS.AUTH_REDIRECT); // Wait for redirect timeout
    await expectToBeOnLoginPage(page);
  });

  test('should handle token exchange failure', async ({ page }) => {
    await mockFailedAuth(page, 'token_exchange');

    // Navigate directly to callback with code
    await page.goto('/auth/callback?code=invalid_code_12345');

    // Should show error message
    await expect(
      page.getByRole('heading', { name: /Authentication Failed/i })
    ).toBeVisible();
    await expect(
      page.getByText(/Authentication failed. Please try again/i)
    ).toBeVisible();

    // Should redirect back to login
    await page.waitForTimeout(TEST_TIMEOUTS.AUTH_REDIRECT);
    await expectToBeOnLoginPage(page);
  });

  test('should handle missing authorization code in callback', async ({
    page,
  }) => {
    await page.goto('/auth/callback'); // No code parameter

    // Should show error message
    await expect(
      page.getByRole('heading', { name: /Authentication Failed/i })
    ).toBeVisible();
    await expect(
      page.getByText(/Invalid authentication response/i)
    ).toBeVisible();

    // Should redirect back to login
    await page.waitForTimeout(TEST_TIMEOUTS.AUTH_REDIRECT);
    await expectToBeOnLoginPage(page);
  });

  test('should protect routes for unauthenticated users', async ({ page }) => {
    // Try to access protected dashboard route without auth
    await page.goto('/');

    // Should redirect to login page
    await expectToBeOnLoginPage(page);
  });

  test('should allow access to protected routes for authenticated users', async ({
    page,
  }) => {
    // Pre-authenticate user
    await setStorageAuth(page, mockUser, {
      ...mockTokens,
      expiresAt: Date.now() + 3600000,
    });

    // Try to access dashboard
    await page.goto('/');
    await waitForPageLoad(page);

    // Should remain on dashboard
    await expectToBeOnDashboard(page);
  });

  test('should handle logout flow', async ({ page }) => {
    await setupAuthMocks(page);

    // Pre-authenticate user
    await setStorageAuth(page, mockUser, {
      ...mockTokens,
      expiresAt: Date.now() + 3600000,
    });

    await page.goto('/');
    await waitForPageLoad(page); // Wait for dashboard to load

    // Verify user is initially authenticated
    await expectToBeOnDashboard(page);

    // Verify localStorage has user data initially
    const userDataString = await page.evaluate(() =>
      localStorage.getItem('inkstream_user')
    );
    expect(userDataString).not.toBeNull();

    const logoutButton = page
      .getByRole('button', { name: /sign out|logout/i })
      .first();

    if (await logoutButton.isVisible()) {
      // Load values from environment variables
      const cognitoDomain = process.env.VITE_COGNITO_DOMAIN?.replace(
        'https://',
        ''
      );
      const cognitoClientId = process.env.VITE_COGNITO_CLIENT_ID;
      const appBaseUrl = page.url().split('/').slice(0, 3).join('/');

      // Ensure environment variables are loaded
      if (!cognitoDomain || !cognitoClientId) {
        throw new Error(
          'Missing required environment variables: VITE_COGNITO_DOMAIN and VITE_COGNITO_CLIENT_ID must be set'
        );
      }

      // Set up request interception to capture the Cognito logout URL
      let cognitoLogoutUrl = '';
      const requestPromise = new Promise<void>((resolve) => {
        page.on('request', (request) => {
          const url = request.url();
          if (url.includes(cognitoDomain) && url.includes('/logout')) {
            cognitoLogoutUrl = url;
            console.log('Captured Cognito logout URL:', url);
            resolve();
          }
        });
      });

      // Block the external request to prevent navigation to fake domain
      await page.route(`https://${cognitoDomain}/*`, async (route) => {
        console.log('Blocked request to:', route.request().url());
        // Simulate successful logout by redirecting back to app
        await route.fulfill({
          status: 302,
          headers: {
            Location: appBaseUrl,
          },
        });
      });

      // Click logout button
      await logoutButton.click();

      // Wait for the Cognito logout request to be intercepted
      await Promise.race([
        requestPromise,
        page.waitForTimeout(TEST_TIMEOUTS.DEFAULT), // Fallback timeout
      ]);

      // Verify the Cognito logout URL was correctly constructed
      if (cognitoLogoutUrl) {
        expect(cognitoLogoutUrl).toMatch(
          new RegExp(`^https://${cognitoDomain}/logout`)
        );
        expect(cognitoLogoutUrl).toContain(`client_id=${cognitoClientId}`);
        expect(cognitoLogoutUrl).toContain(`logout_uri=${appBaseUrl}`);
      } else {
        throw new Error('Expected Cognito logout URL was not captured');
      }
    } else {
      throw new Error('Logout button not found - cannot test logout flow');
    }
  });
});
