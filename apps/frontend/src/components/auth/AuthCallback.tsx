import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../lib/contexts/auth-context';

export function AuthCallback() {
  const navigate = useNavigate();
  const { exchangeCodeForTokens } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const hasProcessed = useRef(false); // Prevent double execution in React StrictMode

  useEffect(() => {
    console.log(
      'AuthCallback useEffect running, hasProcessed:',
      hasProcessed.current
    );

    // Prevent double execution in React StrictMode
    if (hasProcessed.current) {
      console.log('AuthCallback: Skipping because already processed');
      return;
    }
    hasProcessed.current = true;

    console.log('AuthCallback: Starting token exchange process');

    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const oauthError = params.get('error');

      // Handle OAuth errors from the provider
      if (oauthError) {
        console.error('OAuth error from provider:', oauthError);
        setError('Authentication was cancelled or failed. Please try again.');
        setIsProcessing(false);
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      // Handle missing authorization code
      if (!code) {
        console.error('No authorization code found in callback');
        setError('Invalid authentication response. Please try again.');
        setIsProcessing(false);
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      // Exchange code for tokens
      try {
        console.log('Exchanging authorization code for tokens...');
        await exchangeCodeForTokens(code);
        console.log('Authentication successful, redirecting to home...');
        navigate('/', { replace: true });
      } catch (error) {
        console.error('Token exchange failed:', error);
        setError('Authentication failed. Please try again.');
        setIsProcessing(false);
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    handleCallback();
  }, [exchangeCodeForTokens, navigate]);

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <div className="text-red-600 mb-4 text-4xl">❌</div>
          <h2 className="text-xl font-semibold mb-2">Authentication Failed</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">Redirecting to login page...</p>
        </div>
      </div>
    );
  }

  // Show processing state
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold mb-2">Completing Sign In</h2>
        <p className="text-gray-600">
          {isProcessing ? 'Processing authentication...' : 'Redirecting...'}
        </p>
      </div>
    </div>
  );
}
