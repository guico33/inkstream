import { Navigate, Route, Routes, useNavigate } from 'react-router';
import { LoginPage } from './components/LoginPage';
import { HomePage } from './components/HomePage';
import { Header } from './components/Header';
import { handleCognitoCodeExchange } from './lib/auth';
import { useAuth } from './lib/contexts/auth-context';
import { useEffect, useRef } from 'react';
import { S3FileUpload } from './components/S3FileUpload';

function AppRoutes() {
  const { user, signOut, setUser } = useAuth();
  const navigate = useNavigate();
  const codeExchangeInProgress = useRef(false);

  // Handle Cognito redirect with code
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    // Only run code exchange if user is not set, code is present, and not already in progress
    if (
      window.location.pathname === '/login' &&
      code &&
      !user &&
      !codeExchangeInProgress.current
    ) {
      codeExchangeInProgress.current = true;
      (async () => {
        try {
          await handleCognitoCodeExchange(code, setUser, navigate);
        } catch {
          navigate('/', { replace: true });
        } finally {
          codeExchangeInProgress.current = false;
        }
      })();
    }
  }, [setUser, navigate, user]);

  return (
    <>
      <Header user={user} onSignOut={signOut} />
      <main className="max-w-2xl mx-auto p-6">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<HomePage user={user} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        <S3FileUpload />
      </main>
    </>
  );
}

export default AppRoutes;
