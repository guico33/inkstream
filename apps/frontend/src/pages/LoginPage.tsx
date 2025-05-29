import { useEffect, useState } from 'react';
import { useAuth } from '../lib/contexts/auth-context';
import { useNavigate, useLocation } from 'react-router';

export function LoginPage() {
  const { user, getLoginUrl, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (code) return; // Let AppRoutes handle code exchange

    if (isAuthenticated) {
      navigate('/', { replace: true });
      return;
    }

    // Prevent multiple redirects
    if (hasRedirected) return;

    // Redirect to Cognito Hosted UI for Google login
    setHasRedirected(true);
    window.location.href = getLoginUrl(); // OAuth redirect must use window.location
  }, [user, getLoginUrl, isAuthenticated, hasRedirected, navigate, location.search]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      <div className="mt-4 text-lg">Redirecting to Google sign in...</div>
    </div>
  );
}
