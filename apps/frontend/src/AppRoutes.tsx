import { Navigate, Route, Routes } from 'react-router';
import { LoginPage } from './components/LoginPage';
import { HomePage } from './components/HomePage';
import { Header } from './components/Header';
import { AuthCallback } from './components/AuthCallback';
import { useAuth } from './lib/contexts/auth-context';

function AppRoutes() {
  const { user } = useAuth();

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto p-6">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<HomePage user={user} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  );
}

export default AppRoutes;
