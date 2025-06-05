import { Page } from '@playwright/test';

export interface MockTokens {
  access_token: string;
  id_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface MockUser {
  sub: string;
  email: string;
  given_name: string;
  family_name: string;
  name: string;
  picture: string;
}

export const mockUser: MockUser = {
  sub: 'google_123456789',
  email: 'test@example.com',
  given_name: 'Test',
  family_name: 'User',
  name: 'Test User',
  picture: 'https://lh3.googleusercontent.com/test-avatar',
};

export const mockTokens: MockTokens = {
  access_token: 'mock_access_token_12345',
  id_token: createMockIdToken(mockUser),
  refresh_token: 'mock_refresh_token_12345',
  expires_in: 3600,
  token_type: 'Bearer',
};

export function createMockIdToken(user: MockUser): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      ...user,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      // Use actual Cognito values from environment to match API Gateway expectations
      aud: '5i4ajimnhchqns254ivf57lqlp', // Real Cognito client ID
      iss: 'https://dev-inkstream.auth.eu-west-3.amazoncognito.com', // Match custom Cognito domain for API Gateway issuer validation
      token_use: 'id', // Required claim for Cognito ID tokens
    })
  );
  const signature = 'mock_signature';
  return `${header}.${payload}.${signature}`;
}

export async function setupAuthMocks(page: Page) {
  // Mock Cognito token endpoint
  await page.route('**/oauth2/token', async (route) => {
    const request = route.request();
    const postData = request.postData();

    if (postData?.includes('grant_type=authorization_code')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTokens),
      });
    } else if (postData?.includes('grant_type=refresh_token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockTokens,
          access_token: 'refreshed_access_token_12345',
          id_token: createMockIdToken(mockUser),
        }),
      });
    } else {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_request' }),
      });
    }
  });

  // Mock Cognito authorize endpoint (redirect simulation)
  await page.route('**/oauth2/authorize*', async (route) => {
    const url = route.request().url();
    const redirectUri = new URL(url).searchParams.get('redirect_uri');

    if (redirectUri) {
      const callbackUrl = `${redirectUri}?code=mock_auth_code_12345&state=mock_state`;
      await route.fulfill({
        status: 302,
        headers: {
          Location: callbackUrl,
        },
      });
    } else {
      await route.fulfill({
        status: 400,
        body: 'Missing redirect_uri',
      });
    }
  });

  // Mock Cognito logout endpoint
  await page.route('**/logout*', async (route) => {
    const url = route.request().url();
    const logoutUri = new URL(url).searchParams.get('logout_uri');

    if (logoutUri) {
      await route.fulfill({
        status: 302,
        headers: {
          Location: logoutUri,
        },
      });
    } else {
      await route.fulfill({
        status: 302,
        headers: {
          Location: 'http://localhost:5174',
        },
      });
    }
  });

  // Mock Cognito Identity Pool calls
  await page.route('**/cognito-identity.*.amazonaws.com/**', async (route) => {
    const request = route.request();
    const postData = request.postData();

    if (postData) {
      const data = JSON.parse(postData);

      if (data.IdentityId) {
        // Mock GetCredentialsForIdentity response
        await route.fulfill({
          status: 200,
          contentType: 'application/x-amz-json-1.1',
          body: JSON.stringify({
            Credentials: {
              AccessKeyId: 'MOCK_ACCESS_KEY_ID',
              SecretKey: 'MOCK_SECRET_ACCESS_KEY',
              SessionToken: 'MOCK_SESSION_TOKEN',
              Expiration: Date.now() + 3600 * 1000, // Use timestamp number in ms instead of seconds
            },
            IdentityId: data.IdentityId,
          }),
        });
      } else {
        // Mock other Cognito Identity calls
        await route.fulfill({
          status: 200,
          contentType: 'application/x-amz-json-1.1',
          body: JSON.stringify({
            IdentityId: 'mock-identity-id-12345',
          }),
        });
      }
    } else {
      await route.fulfill({
        status: 400,
        contentType: 'application/x-amz-json-1.1',
        body: JSON.stringify({ error: 'invalid_request' }),
      });
    }
  });
}

export async function mockFailedAuth(
  page: Page,
  errorType:
    | 'token_exchange'
    | 'invalid_code'
    | 'oauth_error' = 'token_exchange'
) {
  if (errorType === 'token_exchange') {
    await page.route('**/oauth2/token', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Invalid authorization code',
        }),
      });
    });
  } else if (errorType === 'oauth_error') {
    await page.route('**/oauth2/authorize*', async (route) => {
      const url = route.request().url();
      const redirectUri = new URL(url).searchParams.get('redirect_uri');

      if (redirectUri) {
        const callbackUrl = `${redirectUri}?error=access_denied&error_description=User denied access`;
        await route.fulfill({
          status: 302,
          headers: {
            Location: callbackUrl,
          },
        });
      }
    });
  }
}
