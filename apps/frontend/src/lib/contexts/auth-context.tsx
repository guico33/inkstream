// Modern auth context using auth-service
// Provides centralized authentication state management with clean interface

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { User } from '../types/user-types';
import { authService } from '../auth/auth-service';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  getLoginUrl: () => string;
  exchangeCodeForTokens: (code: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(authService.getCurrentUser());
  const [isLoading, setIsLoading] = useState(false);
  const [isLoginInProgress, setIsLoginInProgress] = useState(false);

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = authService.subscribe((newUser) => {
      setUser(newUser);
      setIsLoading(false);
      // Clear login in progress when user is authenticated
      if (newUser) {
        setIsLoginInProgress(false);
      }
    });

    // Check if tokens need refreshing on mount
    setIsLoading(true);
    authService
      .refreshTokensIfNeeded()
      .catch(() => {
        // Silent fail - user will need to re-authenticate
      })
      .finally(() => {
        setIsLoading(false);
      });

    // Check if we're in the middle of an OAuth flow
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('code') || window.location.pathname === '/login') {
      setIsLoginInProgress(true);
    }

    return unsubscribe;
  }, []);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      await authService.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshTokens = useCallback(async () => {
    setIsLoading(true);
    try {
      await authService.refreshTokensIfNeeded();
    } catch (error) {
      console.error('Token refresh error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getIdToken = useCallback(async () => {
    return authService.getIdToken();
  }, []);

  const getLoginUrl = useCallback(() => {
    // Set login in progress when initiating login
    setIsLoginInProgress(true);
    return authService.getLoginUrl();
  }, []);

  const exchangeCodeForTokens = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      await authService.exchangeCodeForTokens(code);
      // Success will be handled by the auth service subscription
    } catch (error) {
      console.error('Token exchange error:', error);
      // Clear login in progress on error
      setIsLoginInProgress(false);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: authService.isAuthenticated(),
        isLoading: isLoading || isLoginInProgress,
        signOut,
        refreshTokens,
        getIdToken,
        getLoginUrl,
        exchangeCodeForTokens,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
