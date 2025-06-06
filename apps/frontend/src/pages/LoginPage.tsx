import { useEffect } from 'react';
import { useAuth } from '../lib/contexts/auth-context';
import { useNavigate, useLocation } from 'react-router';
import { Button } from '../components/ui/button';

export function LoginPage() {
  const { getLoginUrl, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (code) return; // Let AppRoutes handle code exchange

    if (isAuthenticated) {
      navigate('/', { replace: true });
      return;
    }
  }, [isAuthenticated, navigate, location.search]);

  const handleSignIn = () => {
    window.location.href = getLoginUrl();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
      {/* Logo */}
      <div className="flex items-center justify-center mb-4">
        <img
          src="/inkstream-logo.png"
          alt="Inkstream Logo"
          className="h-30 w-30 rounded-xl shadow-lg"
        />
      </div>

      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">Welcome to Inkstream</h1>
        <p className="text-muted-foreground max-w-md">
          Transform your documents with AI-powered processing. Sign in to get
          started.
        </p>
      </div>

      <Button
        onClick={handleSignIn}
        size="lg"
        className="flex items-center space-x-2"
      >
        <img src="/google.png" alt="Google" className="h-5 w-5 mb-1" />
        <span>Sign in with Google</span>
      </Button>
    </div>
  );
}
