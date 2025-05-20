import AppRoutes from './AppRoutes';
import { AuthProvider } from './lib/contexts/auth-context';
import { FileProcessingProvider } from './lib/contexts/file-processing-context';
import { BrowserRouter as Router } from 'react-router';

function App() {
  return (
    <AuthProvider>
      <FileProcessingProvider>
        <Router>
          <AppRoutes />
        </Router>
      </FileProcessingProvider>
    </AuthProvider>
  );
}

export default App;
