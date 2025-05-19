// Provides authentication utilities and hooks for Cognito + Google login.
// - getUserFromStorage: Reads the user object from localStorage.
// - useAuth: Custom React hook for user state and sign-out logic.
// - handleCognitoCodeExchange: Exchanges Cognito OAuth code for tokens and user info.

import { useState, useCallback } from 'react';
import type { User } from './types';

// Reads the user object from localStorage (if present)
export function getUserFromStorage(): User | null {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

// Custom React hook for managing user state and sign-out
export function useAuth() {
  const [user, setUser] = useState<User | null>(getUserFromStorage());

  // Signs out the user from Cognito and clears local state
  const signOut = useCallback(() => {
    localStorage.removeItem('user');
    setUser(null);
    const cognitoLogoutUrl = `${
      import.meta.env.VITE_COGNITO_DOMAIN
    }/logout?client_id=${
      import.meta.env.VITE_COGNITO_CLIENT_ID
    }&logout_uri=${encodeURIComponent(window.location.origin)}`;
    window.location.href = cognitoLogoutUrl;
  }, []);

  return { user, setUser, signOut };
}

// Exchanges Cognito OAuth code for tokens, decodes user info, and updates state
export async function handleCognitoCodeExchange(
  code: string,
  setUser: (u: User | null) => void,
  navigate: (path: string, opts: { replace: boolean }) => void
) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
    code,
    redirect_uri: window.location.origin + '/login',
  });
  const res = await fetch(
    `${import.meta.env.VITE_COGNITO_DOMAIN}/oauth2/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }
  );
  if (!res.ok) {
    throw new Error('Token exchange failed: ' + (await res.text()));
  }
  const data = await res.json();
  const idToken = data.id_token;
  if (!idToken) throw new Error('No id_token in response');
  const [, payload] = idToken.split('.');
  const user: User = JSON.parse(
    atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
  );
  localStorage.setItem('user', JSON.stringify(user));
  setUser(user);
  navigate('/', { replace: true });
}
