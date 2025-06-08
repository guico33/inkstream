import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8">
          <div className="text-center max-w-md">
            <div className="flex items-center justify-center mb-6">
              <img
                src="/inkstream-logo.png"
                alt="Inkstream Logo"
                className="h-16 w-16 rounded-xl shadow-lg"
              />
            </div>
            <h2 className="text-xl font-semibold mb-4">Something went wrong</h2>
            <p className="text-gray-600 mb-6">
              An unexpected error occurred. Please try reloading the page.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}