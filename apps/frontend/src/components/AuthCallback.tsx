import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../lib/contexts/auth-context';

export function AuthCallback() {
  const navigate = useNavigate();
  const { exchangeCodeForTokens } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');

      if (error) {
        console.error('OAuth error:', error);
        setError('Authentication failed. Please try again.');
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      if (!code) {
        console.error('No authorization code found');
        setError('No authorization code found.');
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      try {
        await exchangeCodeForTokens(code);
        navigate('/', { replace: true });
      } catch (error) {
        console.error('Token exchange failed:', error);
        setError('Authentication failed. Please try again.');
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    handleCallback();
  }, [exchangeCodeForTokens, navigate]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 mb-2">❌</div>
          <p className="text-red-600">{error}</p>
          <p className="text-sm text-gray-500 mt-2">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
        <p>Completing sign in...</p>
      </div>
    </div>
  );
}
