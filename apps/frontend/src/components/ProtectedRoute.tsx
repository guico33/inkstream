// Protected route component for easy route protection
// Replaces manual auth checks in components

import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../lib/auth/use-auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      fallback || (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      )
    );
  }

  if (!isAuthenticated) {
    // Save current location to redirect back after login
    const redirectTo = encodeURIComponent(
      `${location.pathname}${location.search}`
    );
    return <Navigate to={`/login?redirect=${redirectTo}`} replace />;
  }

  return <>{children}</>;
}
