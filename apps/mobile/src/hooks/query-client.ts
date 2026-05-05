// src/hooks/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale after 30 seconds — refetch on window focus
      staleTime:            30_000,
      // Keep in cache for 5 minutes after component unmounts
      gcTime:               5 * 60 * 1000,
      // Retry on error (not on 4xx)
      retry:                (failureCount, error: unknown) => {
        if (error && typeof error === 'object' && 'statusCode' in error) {
          const status = (error as { statusCode: number }).statusCode;
          if (status >= 400 && status < 500) return false;
        }
        return failureCount < 2;
      },
      retryDelay:           (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      // Refetch on reconnect and app foreground
      refetchOnReconnect:   true,
      refetchOnWindowFocus: false,   // Mobile: handled by AppState listener
    },
    mutations: {
      retry: false,
    },
  },
});
