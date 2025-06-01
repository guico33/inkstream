// Header component for the dashboard layout
// Displays user info, app branding, and logout functionality

import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/contexts/auth-context';
import { getUserDisplayName } from '@/lib/display';
import { LogOut, FileText, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router';

export function Header() {
  const { user, isAuthenticated, signOut, getCognitoLogoutUrl } = useAuth();
  const navigate = useNavigate();
  const displayName = getUserDisplayName(user);

  const handleSignIn = () => {
    // Navigate to login page using React Router
    navigate('/login');
  };

  const handleSignOut = async () => {
    try {
      // Clear local auth state first
      await signOut();

      // For complete logout, redirect to Cognito logout which will redirect back to our app
      // This ensures the user is logged out from both our app and Cognito
      window.location.href = getCognitoLogoutUrl();
    } catch (error) {
      console.error('Logout error:', error);
      // Fallback: navigate to login page
      navigate('/login');
    }
  };

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center space-x-2">
            <FileText className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Inkstream</h1>
          </div>

          {/* User Info & Actions - Show different content based on auth state */}
          {isAuthenticated ? (
            <div className="flex items-center space-x-4">
              {displayName && (
                <span className="text-sm text-muted-foreground">
                  Welcome, {displayName}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="flex items-center space-x-2"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-4">
              <Button
                onClick={handleSignIn}
                className="flex items-center space-x-2"
              >
                <LogIn className="h-4 w-4" />
                <span>Sign in with Google</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
