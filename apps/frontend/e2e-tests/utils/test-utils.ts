import { Page, expect } from '@playwright/test';
import { MockTokens, MockUser } from '../mocks/auth-mocks';

export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle');
}

export async function clearStorage(page: Page) {
  try {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  } catch {
    // Ignore security errors when page hasn't loaded yet
    // This is expected when called before navigation
  }
}

export async function setStorageAuth(
  page: Page,
  user: MockUser,
  tokens: MockTokens & { createdAt?: number; expiresAt?: number }
) {
  await page.evaluate(
    ({ user, tokens }) => {
      // Convert OAuth token format to AuthService format
      const authTokens = {
        accessToken: tokens.access_token,
        idToken: tokens.id_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiresAt || Date.now() + 3600000,
      };

      localStorage.setItem('inkstream_user', JSON.stringify(user));
      localStorage.setItem('inkstream_tokens', JSON.stringify(authTokens));

      // Debug: log what we're setting
      console.log('Setting localStorage auth:', {
        user: JSON.stringify(user),
        tokens: JSON.stringify(authTokens),
      });
    },
    { user, tokens }
  );
}

export async function expectToBeOnLoginPage(page: Page) {
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole('heading', { name: /Welcome to Inkstream/i })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Sign in with Google/i })
  ).toBeVisible();
}

export async function expectToBeOnDashboard(page: Page) {
  await expect(page).toHaveURL(/\//);
  await expect(page.locator('body')).not.toContainText('Welcome to Inkstream');
}

export async function expectToBeOnAuthCallback(page: Page) {
  await expect(page).toHaveURL(/\/auth\/callback/);
}

export async function debugAuthState(page: Page) {
  const authState = await page.evaluate(() => {
    const user = localStorage.getItem('inkstream_user');
    const tokens = localStorage.getItem('inkstream_tokens');

    return {
      hasUser: !!user,
      hasTokens: !!tokens,
      user: user ? JSON.parse(user) : null,
      tokens: tokens ? JSON.parse(tokens) : null,
      currentUrl: window.location.href,
    };
  });

  console.log('Auth state debug:', authState);
  return authState;
}
