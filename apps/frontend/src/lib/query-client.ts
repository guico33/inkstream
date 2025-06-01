// React Query configuration and client setup
// Provides centralized query client with error handling and caching strategies

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Background refetch every 30 seconds
      refetchInterval: 30000,
      // Refetch on window focus
      refetchOnWindowFocus: true,
      // Retry failed requests up to 3 times
      retry: 3,
      // Cache data for 5 minutes
      staleTime: 5 * 60 * 1000,
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
});
