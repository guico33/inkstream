import AppRoutes from './AppRoutes';
import { AuthProvider } from './lib/contexts/auth-context';
import { BrowserRouter as Router } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { Toaster } from 'sonner';
import { ThemeProvider } from './lib/contexts/theme-provider';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="inkstream-ui-theme">
        <AuthProvider>
          <Router>
            <AppRoutes />
            <Toaster position="top-center" richColors />
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
