import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { User } from '../types';
import { ENV } from '../constants';
import { getUserFromStorage, getIdTokenFromStorage } from '../auth';

interface AuthContextType {
  user: User | null;
  idToken: string | null;
  setUser: (user: User | null, token?: string | null) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(() =>
    getUserFromStorage()
  );
  const [idToken, setIdTokenState] = useState<string | null>(() =>
    getIdTokenFromStorage()
  );

  console.log(
    '[AuthContext] Initial user state from storage:',
    user,
    idToken
      ? '[idToken present]'
      : '[No idToken, user may not be authenticated]'
  );

  const setUser = useCallback(
    (newUser: User | null, newToken?: string | null) => {
      setUserState(newUser);
      if (newUser && newToken !== undefined) {
        localStorage.setItem('user', JSON.stringify(newUser));
        if (newToken) {
          localStorage.setItem('id_token', newToken);
          setIdTokenState(newToken);
        } else {
          localStorage.removeItem('id_token');
          setIdTokenState(null);
        }
      } else if (!newUser) {
        localStorage.removeItem('user');
        localStorage.removeItem('id_token');
        setIdTokenState(null);
      }
    },
    []
  );

  useEffect(() => {
    const syncAuth = () => {
      const storedUser = getUserFromStorage();
      const storedToken = getIdTokenFromStorage();
      setUserState(storedUser);
      setIdTokenState(storedToken);
      console.log('[AuthContext] Synced auth state from storage:', {
        user: storedUser,
        idToken: storedToken,
      });
    };
    window.addEventListener('storage', syncAuth);
    syncAuth();
    return () => window.removeEventListener('storage', syncAuth);
  }, []);

  const signOut = useCallback(() => {
    console.log('Signing out user:', user);
    localStorage.removeItem('user');
    localStorage.removeItem('id_token');
    setUserState(null);
    setIdTokenState(null);
    const cognitoLogoutUrl = `${ENV.COGNITO_DOMAIN}/logout?client_id=${
      ENV.COGNITO_CLIENT_ID
    }&logout_uri=${encodeURIComponent(window.location.origin)}`;
    window.location.href = cognitoLogoutUrl;
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, idToken, setUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
