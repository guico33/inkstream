import { Navigate, Route, Routes, useNavigate } from 'react-router';
import { LoginPage } from './components/LoginPage';
import { HomePage } from './components/HomePage';
import { Header } from './components/Header';
import { handleCognitoCodeExchange, useAuth } from './lib/auth';
import { useEffect } from 'react';

function AppRoutes() {
  const { user, signOut, setUser } = useAuth();
  const navigate = useNavigate();

  // Handle Cognito redirect with code
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (window.location.pathname === '/login' && code) {
      (async () => {
        try {
          await handleCognitoCodeExchange(code, setUser, navigate);
        } catch {
          navigate('/', { replace: true });
        }
      })();
    }
  }, [setUser, navigate]);

  return (
    <>
      <Header user={user} onSignOut={signOut} />
      <main className="max-w-2xl mx-auto p-6">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<HomePage user={user} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  );
}

export default AppRoutes;
