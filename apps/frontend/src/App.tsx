import { useState, useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from 'react-router';
import { Button } from './components/ui/button';

const getUserFromStorage = () => {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
};

interface User {
  sub: string;
  email: string;
  name: string; // full name (optional, fallback to given_name + family_name)
  given_name: string;
  family_name: string;
  picture: string;
}

function Header({
  user,
  onSignOut,
}: {
  user: User | null;
  onSignOut: () => void;
}) {
  // Prefer full name if available, else fallback to given_name + family_name, else email
  const displayName = user
    ? user.name && user.name !== 'undefined'
      ? user.name
      : user.given_name && user.family_name
      ? `${user.given_name} ${user.family_name}`
      : user.given_name
      ? user.given_name
      : user.email
    : '';

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-900 shadow">
      <h1 className="text-xl font-bold text-primary">Inkstream</h1>
      <nav>
        {user ? (
          <div className="flex items-center gap-4">
            <span className="text-gray-700 dark:text-gray-200">
              {displayName}
            </span>
            {user.picture && (
              <img
                src={user.picture}
                alt={displayName}
                className="w-8 h-8 rounded-full border border-gray-300"
              />
            )}
            <Button variant="secondary" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        ) : (
          <Button asChild>
            <a href="/login">Sign in with Google</a>
          </Button>
        )}
      </nav>
    </header>
  );
}

function LoginPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const user = getUserFromStorage();
    if (code) {
      // Let AppRoutes handle the code exchange, do nothing here
      return;
    }
    if (user) {
      window.location.replace('/');
      return;
    }
    // No code and no user: redirect to Cognito Hosted UI for Google login
    const authParams = new URLSearchParams({
      client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: window.location.origin + '/login',
      identity_provider: 'Google',
      prompt: 'select_account', // Force Google account picker
    });
    window.location.href = `${
      import.meta.env.VITE_COGNITO_DOMAIN
    }/oauth2/authorize?${authParams.toString()}`;
  }, []);
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="text-lg">Redirecting to Google login...</div>
    </div>
  );
}

function HomePage({ user }: { user: User | null }) {
  // Prefer full name if available, else fallback to given_name + family_name, else email
  const displayName = user
    ? user.name && user.name !== 'undefined'
      ? user.name
      : user.given_name && user.family_name
      ? `${user.given_name} ${user.family_name}`
      : user.given_name
      ? user.given_name
      : user.email
    : '';
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <h2 className="text-2xl font-bold mb-4">
        Welcome{displayName ? `, ${displayName}` : ''}!
      </h2>
      <p className="text-gray-600 dark:text-gray-300">
        This is the Inkstream home page.
      </p>
    </div>
  );
}

function AppRoutes({
  user,
  setUser,
}: {
  user: User | null;
  setUser: (u: User | null) => void;
}) {
  const navigate = useNavigate();

  // Handle Cognito redirect with code
  useEffect(() => {
    console.log('[Auth] Checking for OAuth code in URL...');
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    console.log(
      '[Auth] Current path:',
      window.location.pathname,
      'OAuth code:',
      code
    );
    // If on the /login route and a code is present, begin the token exchange
    if (window.location.pathname === '/login' && code) {
      // Exchange the authorization code for tokens with Cognito
      (async () => {
        try {
          // Prepare the POST body for the /oauth2/token endpoint
          const body = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
            code,
            redirect_uri: window.location.origin + '/login',
          });
          console.log(
            '[Auth] Exchanging code for tokens with Cognito:',
            body.toString()
          );
          // Send the request to Cognito to exchange the code for tokens
          const res = await fetch(
            `${import.meta.env.VITE_COGNITO_DOMAIN}/oauth2/token`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body,
            }
          );
          console.log(
            '[Auth] Cognito token endpoint response status:',
            res.status
          );
          // If the response is not OK, throw an error
          if (!res.ok) {
            const errorText = await res.text();
            console.log('[Auth] Token exchange failed. Response:', errorText);
            throw new Error('Token exchange failed: ' + errorText);
          }
          // Parse the returned JSON (contains id_token, access_token, etc.)
          const data = await res.json();
          console.log('[Auth] Token exchange success. Data:', data);
          // Decode the ID token (JWT) to extract user info
          const idToken = data.id_token;
          if (!idToken) {
            console.log('[Auth] No id_token in response:', data);
            throw new Error('No id_token in response');
          }
          const [, payload] = idToken.split('.');
          // Parse the JWT payload to get the user object
          const user = JSON.parse(
            atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
          );
          console.log('[Auth] Decoded user from id_token:', user);
          // Store the user in localStorage and update state
          localStorage.setItem('user', JSON.stringify(user));
          setUser(user);
          // Remove code param from URL and redirect to home
          navigate('/', { replace: true });
        } catch (err: unknown) {
          // Handle errors (e.g., network, invalid code, etc.)
          console.log('[Auth] Login failed:', err);
          // Always remove code param from URL to prevent loop
          navigate('/', { replace: true });
        }
      })();
    }
  }, [setUser, navigate]);

  const handleSignOut = () => {
    console.log('[Auth] Signing out user...');
    localStorage.removeItem('user');
    setUser(null);
    // Cognito logout URL: use logout_uri (not redirect_uri)
    const cognitoLogoutUrl = `${
      import.meta.env.VITE_COGNITO_DOMAIN
    }/logout?client_id=${
      import.meta.env.VITE_COGNITO_CLIENT_ID
    }&logout_uri=${encodeURIComponent(window.location.origin)}`;
    // Redirect to Cognito logout, then back to app
    window.location.href = cognitoLogoutUrl;
  };

  return (
    <>
      <Header user={user} onSignOut={handleSignOut} />
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

function App() {
  const [user, setUser] = useState(getUserFromStorage());
  return (
    <Router>
      <AppRoutes user={user} setUser={setUser} />
    </Router>
  );
}

export default App;
