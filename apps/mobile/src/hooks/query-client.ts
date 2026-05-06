// src/hooks/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Conservative global default; overridden per-hook where appropriate
      staleTime:            30_000,
      gcTime:               5 * 60 * 1_000,
      retry: (failureCount, error: unknown) => {
        if (error && typeof error === 'object' && 'statusCode' in error) {
          const status = (error as { statusCode: number }).statusCode;
          // Never retry 4xx client errors
          if (status >= 400 && status < 500) return false;
        }
        return failureCount < 2;
      },
      retryDelay:           (attempt) => Math.min(1_000 * 2 ** attempt, 10_000),
      refetchOnReconnect:   true,
      refetchOnWindowFocus: false,
      // Structural sharing: prevent unnecessary re-renders when data is referentially equal
      structuralSharing:    true,
    },
    mutations: {
      retry: false,
    },
  },
});

// ─── Per-query stale time overrides ──────────────────────────────────────────
// Applied via useQuery({ staleTime: STALE_TIMES.xxx }) in individual hooks.
export const STALE_TIMES = {
  // Auth profile: rarely changes; refresh on app foreground instead
  AUTH_PROFILE:      5 * 60_000,          // 5 minutes

  // Notifications: high frequency; badge must be accurate
  NOTIFICATION_LIST: 15_000,              // 15 seconds
  UNREAD_COUNT:      10_000,              // 10 seconds

  // Shipment list: changes on status transitions
  SHIPMENT_LIST:     30_000,              // 30 seconds
  SHIPMENT_DETAIL:   20_000,              // 20 seconds

  // Quote: pricing changes rarely; 2 minutes is safe
  QUOTE:             2 * 60_000,          // 2 minutes

  // Admin stats: poll every minute
  ADMIN_STATS:       60_000,              // 1 minute

  // Payment: while in flight, poll aggressively
  PAYMENT_ACTIVE:    5_000,               // 5 seconds (webhook latency window)
  PAYMENT_SETTLED:   10 * 60_000,         // 10 minutes (once paid)
} as const;
