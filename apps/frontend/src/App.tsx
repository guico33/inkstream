import AppRoutes from './AppRoutes';
import { AuthProvider } from './lib/contexts/auth-context';
import { BrowserRouter as Router } from 'react-router';

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
