import { getUserDisplayName } from '@/lib/display';
import { Button } from '../components/ui/button';
import type { User } from '../lib/types';

export function Header({
  user,
  onSignOut,
}: {
  user: User | null;
  onSignOut: () => void;
}) {
  const displayName = getUserDisplayName(user);

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-900 shadow">
      <h1 className="text-xl font-bold text-primary">Inkstream</h1>
      <nav>
        {user ? (
          <div className="flex items-center gap-4">
            <span className="text-gray-700 dark:text-gray-200">
              {displayName}
            </span>
            {user.picture && (
              <img
                src={user.picture}
                alt={displayName}
                className="w-8 h-8 rounded-full border border-gray-300"
              />
            )}
            {/* Sign out triggers Cognito logout via onSignOut */}
            <Button variant="secondary" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        ) : (
          // Sign in button triggers Cognito Hosted UI login
          <Button asChild>
            <a href="/login">Sign in with Google</a>
          </Button>
        )}
      </nav>
    </header>
  );
}
