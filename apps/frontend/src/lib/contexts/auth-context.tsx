import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { User } from '../types';
import { ENV } from '../env';
import { getUserFromStorage } from '../auth';

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getUserFromStorage());

  useEffect(() => {
    const syncUser = () => {
      const storedUser = getUserFromStorage();
      setUser(storedUser);
    };
    window.addEventListener('storage', syncUser);
    syncUser();
    return () => window.removeEventListener('storage', syncUser);
  }, []);

  const signOut = useCallback(() => {
    console.log('Signing out user:', user);
    localStorage.removeItem('user');
    localStorage.removeItem('id_token');
    setUser(null);
    const cognitoLogoutUrl = `${ENV.COGNITO_DOMAIN}/logout?client_id=${
      ENV.COGNITO_CLIENT_ID
    }&logout_uri=${encodeURIComponent(window.location.origin)}`;
    window.location.href = cognitoLogoutUrl;
  }, [user, setUser]);

  return (
    <AuthContext.Provider value={{ user, setUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
