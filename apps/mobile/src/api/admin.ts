// src/api/admin.ts
/**
 * Admin-only API calls.
 * All endpoints require admin or super_admin role.
 * Called with the authenticated user's Bearer token — RBAC enforced server-side.
 */

import { apiClient } from './client';

export interface PlatformStats {
  shipments_by_status: Record<string, number>;
  total_shipments:     number;
  active_shipments:    number;
  pending_approval_count: number;
  total_revenue_mwk:   number;   // Tambala
  payments_today_count: number;
  total_users:         number;
  active_users_30d:    number;
  open_disputes:       number;
  generated_at:        string;
}

export interface DailyRevenuePoint {
  date:       string;  // YYYY-MM-DD
  revenue_mwk: number; // Tambala
  count:       number;
}

export const adminApi = {
  /**
   * Fetch aggregate platform stats via Supabase RPC.
   * Calls: supabase.rpc('get_platform_stats')
   */
  getPlatformStats: async (): Promise<PlatformStats> => {
    const res = await apiClient.get<{ data: PlatformStats }>('/v1/admin/stats');
    return res.data.data;
  },
} as const;
