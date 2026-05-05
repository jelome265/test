// src/components/layout/AdminGuard.tsx
/**
 * Use this to wrap any admin-only screen content.
 * Redirects customers who somehow reach an admin route.
 */

import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';

import { useAuthStore } from '../../stores/auth.store';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user   = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user && user.role === 'customer') {
      router.replace('/(app)/shipments');
    }
  }, [user?.role]);

  if (!user || user.role === 'customer') return null;
  return <>{children}</>;
}
