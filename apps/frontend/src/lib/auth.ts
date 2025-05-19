// Provides authentication utilities for Cognito + Google login.
// - getUserFromStorage: Reads the user object from localStorage.
// - handleCognitoCodeExchange: Exchanges Cognito OAuth code for tokens and user info.

import type { User } from './types';
import { ENV } from './env';

// Reads the user object from localStorage (if present)
export function getUserFromStorage(): User | null {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

// Exchanges Cognito OAuth code for tokens, decodes user info, and updates state
export async function handleCognitoCodeExchange(
  code: string,
  setUser: (u: User | null) => void,
  navigate: (path: string, opts: { replace: boolean }) => void
) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: ENV.COGNITO_CLIENT_ID,
    code,
    redirect_uri: window.location.origin + '/login',
  });
  // Add logging for debugging
  console.log(
    '[Auth] Exchanging code for tokens with Cognito:',
    body.toString()
  );
  const res = await fetch(`${ENV.COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Auth] Token exchange failed. Response:', errorText);
    throw new Error('Token exchange failed: ' + errorText);
  }
  const data = await res.json();
  const idToken = data.id_token;
  if (!idToken) throw new Error('No id_token in response');
  const [, payload] = idToken.split('.');
  const user: User = JSON.parse(
    atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
  );
  // Store id_token in localStorage for S3 uploads
  localStorage.setItem('id_token', idToken);
  localStorage.setItem('user', JSON.stringify(user));
  setUser(user);
  // Log for debugging
  console.log('[Auth] User set after token exchange:', user);
  navigate('/', { replace: true });
}
