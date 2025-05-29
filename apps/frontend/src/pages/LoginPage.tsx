// Handles the login redirect logic for Cognito + Google authentication.
// 1. If a Cognito OAuth code is present in the URL, do nothing (handled by AppRoutes).
// 2. If a user is already authenticated, redirect to home.
// 3. Otherwise, redirect to Cognito Hosted UI for Google login.
import { useEffect } from 'react';
import { useAuth } from '../lib/contexts/auth-context';

export function LoginPage() {
  const { user, getLoginUrl, isAuthenticated } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) return; // Let AppRoutes handle code exchange

    if (isAuthenticated) {
      window.location.replace('/');
      return;
    }

    // Redirect to Cognito Hosted UI for Google login
    window.location.href = getLoginUrl();
  }, [user, getLoginUrl, isAuthenticated]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      <div className="mt-4 text-lg">Redirecting to Google sign in...</div>
    </div>
  );
}
