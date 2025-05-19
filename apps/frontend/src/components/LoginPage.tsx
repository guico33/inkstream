// Handles the login redirect logic for Cognito + Google authentication.
// 1. If a Cognito OAuth code is present in the URL, do nothing (handled by AppRoutes).
// 2. If a user is already in localStorage, redirect to home.
// 3. Otherwise, redirect to Cognito Hosted UI for Google login.
import { useEffect } from 'react';
import { getUserFromStorage } from '../lib/auth';

export function LoginPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const user = getUserFromStorage();
    if (code) return; // Let AppRoutes handle code exchange
    if (user) {
      window.location.replace('/');
      return;
    }
    // Redirect to Cognito Hosted UI for Google login
    const authParams = new URLSearchParams({
      client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: window.location.origin + '/login',
      identity_provider: 'Google',
    });
    window.location.href = `${
      import.meta.env.VITE_COGNITO_DOMAIN
    }/oauth2/authorize?${authParams.toString()}`;
  }, []);
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="text-lg">Redirecting to Google login...</div>
    </div>
  );
}
