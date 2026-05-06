// src/hooks/use-admin.ts
import { useQuery } from '@tanstack/react-query';

import { adminApi } from '../api/admin';
import { useAuthStore } from '../stores/auth.store';

export function usePlatformStats() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  return useQuery({
    queryKey:  ['admin', 'platform-stats'],
    queryFn:   adminApi.getPlatformStats,
    enabled:   isAdmin,
    // Poll every 60 seconds while screen is active
    refetchInterval: 60_000,
    staleTime:       30_000,
  });
}
