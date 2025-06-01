import AppRoutes from './AppRoutes';
import { AuthProvider } from './lib/contexts/auth-context';
import { BrowserRouter as Router } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { Toaster } from 'sonner';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <AppRoutes />
          <Toaster position="top-right" richColors />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
