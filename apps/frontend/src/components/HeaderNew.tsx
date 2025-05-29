// Updated Header component using the new auth context
// Cleaner and more maintainable

import { getUserDisplayName } from '@/lib/display';
import { Button } from '../components/ui/button';
import { useAuth } from '../lib/contexts/auth-context';

export function HeaderNew() {
  const { user, isAuthenticated, signOut, isLoading } = useAuth();
  const displayName = getUserDisplayName(user);

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-900 shadow">
      <h1 className="text-xl font-bold text-primary">Inkstream</h1>
      <nav>
        {isAuthenticated ? (
          <div className="flex items-center gap-4">
            <span className="text-gray-700 dark:text-gray-200">
              {displayName}
            </span>
            {user?.picture && (
              <img
                src={user.picture}
                alt={displayName}
                className="w-8 h-8 rounded-full border border-gray-300"
              />
            )}
            <Button
              variant="secondary"
              className="hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              onClick={signOut}
              disabled={isLoading}
            >
              {isLoading ? 'Signing out...' : 'Sign out'}
            </Button>
          </div>
        ) : (
          <Button asChild disabled={isLoading}>
            <a href="/login">
              {isLoading ? 'Loading...' : 'Sign in with Google'}
            </a>
          </Button>
        )}
      </nav>
    </header>
  );
}
