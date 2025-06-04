// Protected route component for easy route protection
// Replaces manual auth checks in components

import { Navigate } from 'react-router';
import { useAuth } from '@/lib/contexts/auth-context';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      fallback || (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            {/* Logo */}
            <div className="flex items-center justify-center mb-6">
              <img
                src="/inkstream-logo.png"
                alt="Inkstream Logo"
                className="h-16 w-16 rounded-xl shadow-lg"
              />
            </div>
            <h1 className="text-2xl font-bold mb-6">Welcome to Inkstream</h1>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          </div>
        </div>
      )
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
