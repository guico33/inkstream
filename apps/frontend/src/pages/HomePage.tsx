import { Header } from '../components/Header';
import { Dashboard } from '../components/Dashboard';

export function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Dashboard />
      </main>
    </div>
  );
}
