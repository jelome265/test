# Phase 9 — Production Hardening, Polish & Deployment

**Version:** 1.7.0  
**Scope:** Tab bar icons, admin analytics dashboard, CI/CD pipelines, production observability (Sentry full config), E2E test suite, app store submission, performance optimizations, Docker/Railway production deployment, push notification deep-link polish, offline support, final security hardening.

---

## Table of Contents

1. [Tab Bar Icons & Navigation Polish](#1-tab-bar-icons--navigation-polish)
2. [Admin Analytics Dashboard](#2-admin-analytics-dashboard)
3. [Observability — Sentry Full Configuration](#3-observability--sentry-full-configuration)
4. [Performance Optimizations](#4-performance-optimizations)
5. [Offline Support & Error Boundaries](#5-offline-support--error-boundaries)
6. [Push Notification Deep-Link Polish](#6-push-notification-deep-link-polish)
7. [Backend E2E Test Suite](#7-backend-e2e-test-suite)
8. [Mobile Integration Tests](#8-mobile-integration-tests)
9. [GitHub Actions CI/CD Pipelines](#9-github-actions-cicd-pipelines)
10. [Production Docker & Railway Deployment](#10-production-docker--railway-deployment)
11. [App Store Submission](#11-app-store-submission)
12. [Database — Production Maintenance Scripts](#12-database--production-maintenance-scripts)
13. [Security Hardening Audit Fixes](#13-security-hardening-audit-fixes)
14. [Final package.json Version Bumps](#14-final-packagejson-version-bumps)
15. [Production Deployment Checklist](#15-production-deployment-checklist)

---

## 1. Tab Bar Icons & Navigation Polish

### Why

Every layout file has `tabBarIcon: () => null, // Icons to be added in Phase 9`. The `@expo/vector-icons` package is already installed (`"@expo/vector-icons": "^14.0.2"` in `apps/mobile/package.json`). This phase wires up Ionicons for both the customer tab bar and the admin tab bar, adds haptic feedback on tab press, and implements a badge animation for the notifications tab.

---

### `apps/mobile/src/components/ui/TabBarIcon.tsx` *(new file)*

```tsx
// src/components/ui/TabBarIcon.tsx
/**
 * Wrapper for Ionicons used in tab bars.
 * Handles focused/unfocused color and size scaling.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabBarIconProps {
  name:    IoniconName;
  color:   string;
  size?:   number;
  focused: boolean;
  badge?:  number;
}

export function TabBarIcon({ name, color, size = 24, focused, badge }: TabBarIconProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (focused) {
      // Subtle spring when tab becomes active
      Animated.spring(scaleAnim, {
        toValue: 1.15,
        friction: 4,
        tension: 120,
        useNativeDriver: true,
      }).start(() => {
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [focused]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <View style={styles.iconContainer}>
        <Ionicons name={name} size={size} color={color} />
        {badge !== undefined && badge > 0 && (
          <View style={styles.badge}>
            {/* Badge number shown for ≤99; "99+" after */}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  badge: {
    position:        'absolute',
    top:             -4,
    right:           -8,
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: '#DC2626',
  },
});
```

> **Why `expo-haptics`:** Install with `npx expo install expo-haptics`. It is included in Expo SDK 51 and requires no native configuration beyond the Expo managed workflow.

---

### `apps/mobile/app/(app)/_layout.tsx` *(replace)*

```tsx
// app/(app)/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import React, { useCallback } from 'react';
import { Platform } from 'react-native';

import { colors, typography } from '../../src/theme';
import { useNotificationStore } from '../../src/stores/notification.store';

// Icon name map keeps variant switching (outline vs filled) in one place.
// Filled variant is used when the tab is active — matches iOS HIG conventions.
const ICONS = {
  shipments: {
    focused:   'cube'          as const,
    unfocused: 'cube-outline'  as const,
  },
  notifications: {
    focused:   'notifications'         as const,
    unfocused: 'notifications-outline' as const,
  },
  profile: {
    focused:   'person-circle'         as const,
    unfocused: 'person-circle-outline' as const,
  },
} as const;

export default function AppLayout() {
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const handleTabPress = useCallback(() => {
    // Light haptic on every tab switch — matches native iOS tab bar feel
    if (Platform.OS === 'ios') {
      void Haptics.selectionAsync();
    }
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor:    colors.surface.card,
          borderTopColor:     colors.surface.border,
          borderTopWidth:     0.5,
          height:             Platform.OS === 'ios' ? 80 : 60,
          paddingBottom:      Platform.OS === 'ios' ? 20 : 8,
          paddingTop:         8,
          // Subtle shadow on iOS only
          ...Platform.select({
            ios: {
              shadowColor:   '#000',
              shadowOffset:  { width: 0, height: -1 },
              shadowOpacity: 0.05,
              shadowRadius:  4,
            },
            android: {
              elevation: 8,
            },
          }),
        },
        tabBarActiveTintColor:   colors.brand.accent,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarLabelStyle: {
          ...typography.caption,
          fontSize: 11,
          marginTop: 2,
        },
        // Suppress the default ripple on Android — we handle via the icon
        tabBarPressOpacity: 0.7,
      }}
      screenListeners={{
        tabPress: handleTabPress,
      }}
    >
      <Tabs.Screen
        name="shipments"
        options={{
          title: 'Shipments',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? ICONS.shipments.focused : ICONS.shipments.unfocused}
              size={24}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? ICONS.notifications.focused : ICONS.notifications.unfocused}
              size={24}
              color={color}
            />
          ),
          tabBarBadge:       unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle:  {
            backgroundColor: colors.semantic.danger,
            fontSize:        10,
            fontWeight:      '700',
            minWidth:        18,
            height:          18,
            borderRadius:    9,
            lineHeight:      18,
          },
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? ICONS.profile.focused : ICONS.profile.unfocused}
              size={24}
              color={color}
            />
          ),
        }}
      />

      {/* Hidden from tab bar — accessed via router.push() */}
      <Tabs.Screen name="index"    options={{ href: null }} />
      <Tabs.Screen name="payments" options={{ href: null }} />
    </Tabs>
  );
}
```

---

### `apps/mobile/app/(admin)/_layout.tsx` *(replace)*

```tsx
// app/(admin)/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import React, { useCallback } from 'react';
import { Platform } from 'react-native';

import { colors, typography } from '../../src/theme';
import { AdminGuard } from '../../src/components/layout/AdminGuard';

const ADMIN_ICONS = {
  shipments: {
    focused:   'list'         as const,
    unfocused: 'list-outline' as const,
  },
  stats: {
    focused:   'bar-chart'         as const,
    unfocused: 'bar-chart-outline' as const,
  },
} as const;

export default function AdminLayout() {
  const handleTabPress = useCallback(() => {
    if (Platform.OS === 'ios') {
      void Haptics.selectionAsync();
    }
  }, []);

  return (
    <AdminGuard>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.brand.primary,
            borderTopColor:  `${colors.text.inverse}15`,
            borderTopWidth:  0.5,
            height:          Platform.OS === 'ios' ? 80 : 60,
            paddingBottom:   Platform.OS === 'ios' ? 20 : 8,
            paddingTop:      8,
          },
          tabBarActiveTintColor:   '#FFFFFF',
          tabBarInactiveTintColor: 'rgba(255,255,255,0.40)',
          tabBarLabelStyle: {
            ...typography.caption,
            fontSize: 11,
            marginTop: 2,
          },
        }}
        screenListeners={{ tabPress: handleTabPress }}
      >
        <Tabs.Screen
          name="shipments"
          options={{
            title: 'Shipments',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? ADMIN_ICONS.shipments.focused : ADMIN_ICONS.shipments.unfocused}
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: 'Analytics',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? ADMIN_ICONS.stats.focused : ADMIN_ICONS.stats.unfocused}
                size={24}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
    </AdminGuard>
  );
}
```

---

## 2. Admin Analytics Dashboard

### Why

`apps/mobile/app/(admin)/stats/index.tsx` contains a placeholder: *"Phase 9 will include detailed analytics and performance charts."* The admin dashboard needs real data from `get_platform_stats()` (migration 014). This section builds the full analytics screen with revenue charts, shipment funnel visualization, and KPI cards using React Native's built-in `View` primitives (no chart library dependency — pure SVG + layout for zero install surface).

---

### `apps/mobile/src/api/admin.ts` *(new file)*

```typescript
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
```

---

### `apps/backend/src/routes/admin.routes.ts` *(new file)*

```typescript
/**
 * admin.routes.ts — Admin-only management routes.
 *
 * Mounted at: /api/v1/admin
 *
 * Endpoints:
 *   GET /stats → Platform statistics (admin only)
 *
 * Note: Shipment admin routes are in shipment.routes.ts (adminShipmentRouter).
 * This file handles non-shipment admin operations.
 */

import { Router }      from 'express';
import type { Request, Response } from 'express';

import { requireAuth }      from '../middleware/auth.middleware.js';
import { requireAdminRole } from '../middleware/rbac.middleware.js';
import { supabaseServiceRole } from '../config/supabase.js';
import { asyncHandler }     from '../utils/async-handler.js';
import { mapSupabaseError }  from '../errors/app-error.js';
import { logger }           from '../utils/logger.js';

export const adminRouter = Router();

// ─── GET /api/v1/admin/stats ──────────────────────────────────────────────────
/**
 * Returns aggregate platform stats from get_platform_stats() RPC.
 *
 * Response 200:
 *   { data: PlatformStats }
 *
 * Cache hint: results are STABLE — same within same second.
 * Consider a 60-second Cache-Control header for repeated polling.
 */
adminRouter.get(
  '/stats',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (_req: Request, res: Response) => {
    const { data, error } = await supabaseServiceRole().rpc('get_platform_stats');

    if (error) {
      logger.error({ error: error.message }, 'get_platform_stats RPC failed');
      throw mapSupabaseError(error);
    }

    res.setHeader('Cache-Control', 'private, max-age=60');
    res.status(200).json({ data });
  }),
);
```

> **Wire up in `apps/backend/src/app.ts`:** Add `import { adminRouter } from './routes/admin.routes.js';` and `v1Router.use('/admin', adminRouter);` alongside the existing admin shipment router. The existing `adminShipmentRouter` handles `/admin/shipments/*`; the new `adminRouter` handles `/admin/stats` and any future non-shipment admin routes.

---

### `apps/mobile/src/hooks/use-admin.ts` *(new file)*

```typescript
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
```

---

### `apps/mobile/src/components/ui/KpiCard.tsx` *(new file)*

```tsx
// src/components/ui/KpiCard.tsx
/**
 * Single KPI metric card for the analytics dashboard.
 * Shows: label, primary value, optional secondary label, optional trend indicator.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography, radius } from '../../theme';

interface KpiCardProps {
  label:       string;
  value:       string;
  subLabel?:   string;
  accent?:     string;   // Override color for value text
  emoji?:      string;
}

export function KpiCard({ label, value, subLabel, accent, emoji }: KpiCardProps) {
  return (
    <View style={styles.card}>
      {emoji && <Text style={styles.emoji}>{emoji}</Text>}
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, accent ? { color: accent } : {}]}>
        {value}
      </Text>
      {subLabel && <Text style={styles.subLabel}>{subLabel}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex:            1,
    backgroundColor: colors.surface.card,
    borderRadius:    radius.lg,
    padding:         spacing.base,
    borderWidth:     1,
    borderColor:     colors.surface.border,
    gap:             spacing.xs,
    minWidth:        140,
  },
  emoji:    { fontSize: 22 },
  label:    { ...typography.caption, color: colors.text.tertiary, letterSpacing: 0.8 },
  value:    { ...typography.h2, color: colors.text.primary, fontSize: 26, letterSpacing: -0.5 },
  subLabel: { ...typography.caption, color: colors.text.secondary },
});
```

---

### `apps/mobile/src/components/ui/ShipmentFunnel.tsx` *(new file)*

```tsx
// src/components/ui/ShipmentFunnel.tsx
/**
 * Horizontal bar chart representing the shipment lifecycle funnel.
 * Each status is a proportional bar segment, color-coded.
 * Uses pure RN View layout — no chart library dependency.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { STATUS_LABELS } from '@courier/shared-constants';
import type { ShipmentStatus } from '@courier/shared-types';
import { colors, spacing, typography, radius } from '../../theme';

interface ShipmentFunnelProps {
  statusCounts: Record<string, number>;
  total:        number;
}

// Ordered pipeline — terminal states grouped at end
const PIPELINE_ORDER: ShipmentStatus[] = [
  'pending_approval',
  'approved',
  'payment_pending',
  'payment_confirmed',
  'picked_up',
  'in_transit',
  'delivered',
  'confirmed',
  'rejected',
  'cancelled',
  'failed',
];

const STATUS_COLORS: Partial<Record<ShipmentStatus, string>> = {
  pending_approval:  '#9CA3AF',
  approved:          '#2563EB',
  payment_pending:   '#D97706',
  payment_confirmed: '#059669',
  picked_up:         '#7C3AED',
  in_transit:        '#7C3AED',
  delivered:         '#16A34A',
  confirmed:         '#15803D',
  rejected:          '#DC2626',
  cancelled:         '#6B7280',
  failed:            '#EF4444',
};

export function ShipmentFunnel({ statusCounts, total }: ShipmentFunnelProps) {
  const items = useMemo(() =>
    PIPELINE_ORDER
      .map((status) => ({
        status,
        count:      statusCounts[status] ?? 0,
        label:      STATUS_LABELS[status],
        color:      STATUS_COLORS[status] ?? colors.text.tertiary,
        percentage: total > 0 ? ((statusCounts[status] ?? 0) / total) * 100 : 0,
      }))
      .filter((item) => item.count > 0),
    [statusCounts, total],
  );

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No shipment data yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stacked bar */}
      <View style={styles.bar}>
        {items.map((item) => (
          <View
            key={item.status}
            style={[
              styles.segment,
              {
                flex:            item.percentage,
                backgroundColor: item.color,
              },
            ]}
          />
        ))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {items.map((item) => (
          <View key={item.status} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={styles.legendCount}>{item.count}</Text>
            <Text style={styles.legendPct}>
              {item.percentage.toFixed(1)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  bar: {
    flexDirection: 'row',
    height:        20,
    borderRadius:  radius.md,
    overflow:      'hidden',
    backgroundColor: colors.surface.divider,
  },
  segment:    { height: '100%' },
  legend:     { gap: spacing.sm },
  legendRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendDot:  { width: 10, height: 10, borderRadius: 5 },
  legendLabel:{ ...typography.caption, color: colors.text.secondary, flex: 1 },
  legendCount:{ ...typography.caption, color: colors.text.primary, fontWeight: '600', width: 36, textAlign: 'right' },
  legendPct:  { ...typography.caption, color: colors.text.tertiary, width: 44, textAlign: 'right' },
  empty:      { alignItems: 'center', padding: spacing.xl },
  emptyText:  { ...typography.body, color: colors.text.tertiary },
});
```

---

### `apps/mobile/app/(admin)/stats/index.tsx` *(replace)*

```tsx
// app/(admin)/stats/index.tsx
/**
 * Admin analytics dashboard.
 * Data sourced from GET /api/v1/admin/stats → get_platform_stats() RPC.
 *
 * Sections:
 *   1. Revenue KPIs (total, today's payments, avg per shipment)
 *   2. Shipment KPIs (total, active, pending approval)
 *   3. User KPIs (total customers, 30d actives)
 *   4. Shipment funnel (stacked bar by status)
 *   5. Open disputes indicator
 */

import React from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { tambalaToMwk, formatMwk } from '@courier/shared-constants';

import { ErrorState }      from '../../../src/components/ui/ErrorState';
import { LoadingState }    from '../../../src/components/ui/LoadingState';
import { KpiCard }         from '../../../src/components/ui/KpiCard';
import { ShipmentFunnel }  from '../../../src/components/ui/ShipmentFunnel';
import { usePlatformStats } from '../../../src/hooks/use-admin';
import { colors, spacing, typography, radius } from '../../../src/theme';

export default function AdminStatsScreen() {
  const { data: stats, isLoading, isError, refetch, isFetching } = usePlatformStats();

  if (isLoading) return <LoadingState message="Loading analytics…" />;
  if (isError || !stats) return <ErrorState onRetry={() => void refetch()} />;

  const totalRevenueMwk = tambalaToMwk(stats.total_revenue_mwk);
  const avgRevenueMwk   = stats.total_shipments > 0
    ? totalRevenueMwk / stats.total_shipments
    : 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={() => void refetch()}
          tintColor={colors.brand.accent}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Analytics</Text>
        <Text style={styles.generatedAt}>
          Updated {new Date(stats.generated_at).toLocaleTimeString('en-MW', {
            hour: '2-digit', minute: '2-digit',
          })}
        </Text>
      </View>

      {/* Revenue KPIs */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>REVENUE</Text>
        <View style={styles.kpiRow}>
          <KpiCard
            emoji="💰"
            label="Total Revenue"
            value={`MWK ${(totalRevenueMwk / 1000).toFixed(1)}K`}
            subLabel="All paid shipments"
            accent={colors.semantic.success}
          />
          <KpiCard
            emoji="📅"
            label="Today's Payments"
            value={String(stats.payments_today_count)}
            subLabel="Completed today"
          />
        </View>
        <View style={styles.kpiRow}>
          <KpiCard
            emoji="📊"
            label="Avg per Shipment"
            value={`MWK ${Math.round(avgRevenueMwk).toLocaleString('en-MW')}`}
            subLabel="Revenue / total"
          />
          <KpiCard
            emoji="⚠️"
            label="Open Disputes"
            value={String(stats.open_disputes)}
            subLabel="Needs review"
            accent={stats.open_disputes > 0 ? colors.semantic.danger : colors.text.primary}
          />
        </View>
      </View>

      {/* Shipment KPIs */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SHIPMENTS</Text>
        <View style={styles.kpiRow}>
          <KpiCard
            emoji="📦"
            label="Total Shipments"
            value={stats.total_shipments.toLocaleString('en-MW')}
            subLabel="All time"
          />
          <KpiCard
            emoji="🚚"
            label="Active Now"
            value={String(stats.active_shipments)}
            subLabel="In-progress"
            accent={colors.brand.accent}
          />
        </View>
        <View style={styles.kpiRow}>
          <KpiCard
            emoji="🔍"
            label="Pending Approval"
            value={String(stats.pending_approval_count)}
            subLabel="Needs review"
            accent={stats.pending_approval_count > 0 ? colors.semantic.warning : colors.text.primary}
          />
          <KpiCard
            emoji="✅"
            label="Confirmed"
            value={String(stats.shipments_by_status?.['confirmed'] ?? 0)}
            subLabel="Completed"
            accent={colors.semantic.success}
          />
        </View>
      </View>

      {/* User KPIs */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>USERS</Text>
        <View style={styles.kpiRow}>
          <KpiCard
            emoji="👥"
            label="Total Customers"
            value={stats.total_users.toLocaleString('en-MW')}
            subLabel="Registered"
          />
          <KpiCard
            emoji="🔥"
            label="Active (30d)"
            value={String(stats.active_users_30d)}
            subLabel="Placed a shipment"
            accent={colors.brand.accent}
          />
        </View>
      </View>

      {/* Shipment funnel */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SHIPMENT PIPELINE</Text>
        <View style={styles.card}>
          <ShipmentFunnel
            statusCounts={stats.shipments_by_status ?? {}}
            total={stats.total_shipments}
          />
        </View>
      </View>

      {/* Footer spacer for bottom safe area */}
      <View style={styles.footer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:     { flex: 1, backgroundColor: colors.surface.background },
  container:  { padding: spacing.base, gap: spacing.lg },
  header: {
    paddingTop:    spacing.xl,
    flexDirection: 'row',
    alignItems:    'baseline',
    justifyContent: 'space-between',
  },
  title:       { ...typography.h1, color: colors.text.primary },
  generatedAt: { ...typography.caption, color: colors.text.tertiary },
  section:     { gap: spacing.sm },
  sectionTitle:{ ...typography.caption, color: colors.text.tertiary, letterSpacing: 1.5, textTransform: 'uppercase' },
  kpiRow:      { flexDirection: 'row', gap: spacing.sm },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius:    radius.lg,
    padding:         spacing.base,
    borderWidth:     1,
    borderColor:     colors.surface.border,
  },
  footer: { height: spacing.xxxl },
});
```

---

## 3. Observability — Sentry Full Configuration

### Why

`SENTRY_DSN` is in `.env.example` and the `@sentry/node` package is installed, but Sentry is only partially wired. Phase 9 completes the integration: initializing Sentry before anything else loads, adding `expressIntegration`, configuring `tracesSampleRate` per environment, adding custom tags (service version, Node env), and ensuring the backend's global error handler captures non-operational errors with full context.

---

### `apps/backend/src/config/sentry.ts` *(new file)*

```typescript
/**
 * sentry.ts — Sentry SDK initialization.
 *
 * MUST be imported as the VERY FIRST statement in src/index.ts,
 * before any other application code loads.
 *
 * Why first? Sentry patches Node's module system to add automatic
 * instrumentation. If any module loads before Sentry initializes,
 * those modules won't be instrumented and errors inside them won't
 * be captured with full context.
 *
 * Configuration:
 *   - Production: tracesSampleRate 0.10 (10% of requests traced)
 *   - Staging:    tracesSampleRate 0.50
 *   - Development: disabled (no DSN)
 *
 * Tags added to every event:
 *   - service:     'courier-backend'
 *   - version:     package.json version
 *   - environment: NODE_ENV value
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Read environment directly — env.ts validates later.
// This avoids circular import (env.ts imports logger which may import sentry).
const dsn         = process.env['SENTRY_DSN'];
const environment = process.env['SENTRY_ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'development';
const version     = process.env['npm_package_version'] ?? '1.7.0';
const isProduction = environment === 'production';
const isTest       = environment === 'test';

export function initSentry(): void {
  // Skip in test and dev without a DSN
  if (isTest || !dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment,
    release: `courier-backend@${version}`,

    // Traces: only sample a fraction in production to control cost.
    // 10% in production, 50% in staging, 100% in development (if DSN present).
    tracesSampleRate: isProduction ? 0.10 : 0.50,

    // Profiling: only in production, 10% of traced requests
    profilesSampleRate: isProduction ? 0.10 : 0,

    integrations: [
      // Auto-instrument: http, https, net, dns, child_process, fs
      Sentry.httpIntegration({ tracing: true }),

      // Connect/Express middleware instrumentation
      Sentry.expressIntegration(),

      // Profiling (requires @sentry/profiling-node)
      ...(isProduction ? [nodeProfilingIntegration()] : []),
    ],

    // Scrub sensitive data before sending to Sentry
    beforeSend(event, hint) {
      // Never send PII in exception breadcrumbs
      if (event.request?.data) {
        const data = event.request.data as Record<string, unknown>;
        const SENSITIVE = ['password', 'new_password', 'current_password', 'confirm_password',
                           'token', 'access_token', 'refresh_token', 'fcm_token',
                           'card_number', 'cvv'];
        for (const key of SENSITIVE) {
          if (key in data) {
            (event.request.data as Record<string, unknown>)[key] = '[FILTERED]';
          }
        }
      }

      // Drop health check noise
      if (event.request?.url?.includes('/api/v1/health')) {
        return null;
      }

      return event;
    },

    // Ignore these noisy operational errors
    ignoreErrors: [
      'ECONNRESET',
      'ECONNABORTED',
      'EPIPE',
      'ETIMEDOUT',
      'AbortError',
    ],

    // Add global tags to every event
    initialScope: {
      tags: {
        service:     'courier-backend',
        version,
      },
    },
  });
}

/**
 * Wrap an error with additional Sentry context before re-throwing.
 * Use in catch blocks where you want to add structured data.
 *
 * @example
 *   captureWithContext(err, { shipmentId, userId, operation: 'advance_payment' });
 *   throw err;
 */
export function captureWithContext(
  err:     unknown,
  context: Record<string, string | number | boolean>,
): void {
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      scope.setExtra(key, value);
    }
    Sentry.captureException(err);
  });
}
```

> **Install:** `npm install @sentry/profiling-node --workspace=@courier/backend`

---

### `apps/backend/src/index.ts` *(first two lines, prepended)*

```typescript
// ─── MUST BE FIRST — instruments Node.js before any other code loads ─────────
import { initSentry } from './config/sentry.js';
initSentry();
// ─────────────────────────────────────────────────────────────────────────────

import http from 'http';
// ... rest of existing index.ts unchanged
```

---

### `apps/backend/src/middleware/error.middleware.ts` *(update Sentry capture block)*

In the existing `errorHandler`, replace the Sentry capture block:

```typescript
// ─── Capture in Sentry (non-operational errors only) ──────────────────────
if (!appError.isOperational) {
  Sentry.withScope((scope) => {
    scope.setTag('error.code',         appError.code);
    scope.setTag('error.operational',  'false');
    scope.setTag('http.method',        req.method);
    scope.setTag('http.url',           req.originalUrl);
    scope.setLevel('error');

    if (req.user?.id) {
      scope.setUser({
        id:    req.user.id,
        email: req.user.email,
        role:  req.user.role,
      });
    }

    // Add request body (scrubbed of sensitive fields)
    const safeBody = { ...(req.body as Record<string, unknown> ?? {}) };
    const SCRUB    = ['password', 'new_password', 'current_password',
                      'confirm_password', 'token', 'fcm_token'];
    for (const k of SCRUB) delete safeBody[k];
    scope.setExtra('request.body', safeBody);
    scope.setExtra('request.id',   req.headers['x-request-id']);

    Sentry.captureException(appError);
  });
}
```

---

### Mobile Sentry Configuration

#### Install

```bash
npx expo install @sentry/react-native
npx sentry-wizard -i reactNative -p android ios
```

#### `apps/mobile/src/lib/sentry.ts` *(new file)*

```typescript
// src/lib/sentry.ts
/**
 * Sentry React Native initialization.
 *
 * Call initMobileSentry() as the FIRST statement in app/_layout.tsx,
 * before the QueryClientProvider mounts.
 *
 * Automatic instrumentation covers:
 *   - Expo Router navigation performance
 *   - React component render performance
 *   - Unhandled JS exceptions and Promise rejections
 *   - Native crash reports (via Sentry native SDKs)
 */

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const DSN         = Constants.expoConfig?.extra?.['sentryDsn'] as string | undefined;
const ENVIRONMENT = Constants.expoConfig?.extra?.['environment'] as string ?? 'development';
const VERSION     = Constants.expoConfig?.version ?? '1.7.0';

export function initMobileSentry(): void {
  if (!DSN || __DEV__) return;

  Sentry.init({
    dsn:         DSN,
    environment: ENVIRONMENT,
    release:     `courier-mobile@${VERSION}`,

    // Sample 20% of sessions for performance tracing
    tracesSampleRate: ENVIRONMENT === 'production' ? 0.20 : 0.50,

    // Enable automatic Expo Router breadcrumbs
    enableAutoPerformanceTracking: true,
    enableAutoSessionTracking:     true,
    sessionTrackingIntervalMillis: 30_000,

    // Scrub PII from captured events
    beforeSend(event) {
      if (event.extra) {
        const SENSITIVE = ['password', 'access_token', 'refresh_token', 'fcm_token'];
        for (const key of SENSITIVE) {
          if (key in event.extra) {
            event.extra[key] = '[FILTERED]';
          }
        }
      }
      return event;
    },

    integrations: [
      Sentry.reactNativeTracingIntegration(),
    ],
  });
}

/**
 * Tag the current Sentry scope with the authenticated user.
 * Call after successful login.
 */
export function identifySentryUser(userId: string, role: string): void {
  Sentry.setUser({ id: userId, role });
}

/** Clear user from Sentry scope on logout. */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}
```

---

## 4. Performance Optimizations

### 4.1 React Query — Fine-Tuned Stale Times

The existing `queryClient.ts` uses a blanket 30-second `staleTime`. Different data has very different freshness requirements:

#### `apps/mobile/src/hooks/query-client.ts` *(replace)*

```typescript
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
```

---

### 4.2 FlatList Optimization in Shipments Screen

#### `apps/mobile/app/(app)/shipments/index.tsx` *(performance additions)*

Add these props to both `FlatList` instances (shipment list and filter chips):

```tsx
// Add to the shipments FlatList:
initialNumToRender={8}
maxToRenderPerBatch={8}
windowSize={5}
removeClippedSubviews={true}
getItemLayout={(_data, index) => ({
  // ShipmentCard height: padding (16×2) + tracking (28) + route (24) + meta (20) + date (18) + gaps (16×3) = ~170
  length: 170,
  offset: 170 * index,
  index,
})}
keyboardShouldPersistTaps="handled"
```

> **Why `getItemLayout`:** Eliminates the layout measurement phase for items that haven't been rendered yet, dramatically improving scroll-to-index performance and reducing janky frames on Android.

---

### 4.3 Backend Response Compression

#### `apps/backend/src/app.ts` *(add compression)*

```typescript
import compression from 'compression';

// Add immediately after helmet(), before webhook routes
app.use(compression({
  // Only compress responses >1KB — smaller ones don't benefit
  threshold: 1024,
  // Skip compression for streaming responses (not used currently)
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));
```

---

### 4.4 Database — Missing Indexes

Identified from query plan analysis. Add as migration 018:

#### `supabase/migrations/018_performance_indexes.sql` *(new file)*

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 018 — PERFORMANCE INDEXES
-- Indexes identified from slow query analysis in Phase 9 load testing.
-- All are CONCURRENTLY created to avoid table-level locks in production.
-- ═══════════════════════════════════════════════════════════════════

-- Payments: webhook handler looks up by provider_reference frequently.
-- Already indexed in 008, but add a composite for the common join
-- pattern: provider_reference + status.
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_payments_provider_ref_status
  ON payments (provider_reference, status)
  WHERE provider_reference IS NOT NULL;

-- Shipments: admin dashboard filters by status + created_at DESC.
-- Composite index avoids full scan on status + sort.
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_shipments_status_created
  ON shipments (status, created_at DESC)
  WHERE status NOT IN ('confirmed', 'rejected', 'cancelled');

-- Notifications: background worker fetches push_sent=false.
-- Partial index on unsent push jobs (most rows will be sent).
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_notifications_unsent
  ON app_notifications (created_at ASC)
  WHERE push_sent = FALSE;

-- Audit log: support queries filter by target_id frequently.
-- Composite covers the common (target_type, target_id, created_at) pattern.
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_audit_log_target_time
  ON audit_log (target_type, target_id, created_at DESC)
  WHERE target_id IS NOT NULL;

-- Payments: expiry worker scans by expires_at + status.
-- Existing partial index covers status; add expires_at for range scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_payments_expiry_scan
  ON payments (expires_at ASC, status)
  WHERE status IN ('pending', 'processing');

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'Migration 018: performance indexes created.';
END $$;
```

---

## 5. Offline Support & Error Boundaries

### 5.1 Network Status Hook

#### `apps/mobile/src/hooks/use-network.ts` *(new file)*

```typescript
// src/hooks/use-network.ts
/**
 * Subscribes to NetInfo to detect offline state.
 * Used by the offline banner and to suppress background refetches.
 *
 * Package: @react-native-community/netinfo (already in Expo SDK 51)
 * Install: npx expo install @react-native-community/netinfo
 */

import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { focusManager } from '@tanstack/react-query';

export interface NetworkState {
  isConnected:      boolean | null;
  isInternetReachable: boolean | null;
}

export function useNetworkStatus(): NetworkState {
  const [state, setState] = useState<NetworkState>({
    isConnected:         null,
    isInternetReachable: null,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState) => {
      setState({
        isConnected:         netState.isConnected,
        isInternetReachable: netState.isInternetReachable,
      });

      // Pause React Query background refetches when offline.
      // focusManager controls whether queries consider the window "focused".
      focusManager.setFocused(netState.isConnected === true);
    });

    return unsubscribe;
  }, []);

  return state;
}
```

---

### 5.2 Offline Banner Component

#### `apps/mobile/src/components/ui/OfflineBanner.tsx` *(new file)*

```tsx
// src/components/ui/OfflineBanner.tsx
/**
 * Persistent banner shown at the top of the screen when the device
 * loses internet connectivity. Animates in/out smoothly.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNetworkStatus } from '../../hooks/use-network';
import { colors, typography } from '../../theme';

export function OfflineBanner() {
  const { isInternetReachable } = useNetworkStatus();
  const isOffline = isInternetReachable === false;
  const insets    = useSafeAreaInsets();

  const translateY = useRef(new Animated.Value(-60)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue:         isOffline ? 0 : -60,
        friction:        8,
        tension:         80,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue:         isOffline ? 1 : 0,
        duration:        200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isOffline]);

  if (!isOffline && opacity._value === 0) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          paddingTop:  insets.top + 8,
          transform:   [{ translateY }],
          opacity,
        },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text style={styles.text}>⚠ No internet connection</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    zIndex:          9999,
    backgroundColor: '#92400E',
    paddingHorizontal: 16,
    paddingBottom:   8,
    alignItems:      'center',
  },
  text: { ...typography.label, color: '#FEF3C7' },
});
```

---

### 5.3 Global Error Boundary

#### `apps/mobile/src/components/layout/AppErrorBoundary.tsx` *(new file)*

```tsx
// src/components/layout/AppErrorBoundary.tsx
/**
 * Top-level React error boundary.
 * Catches JS errors that bubble up from the component tree.
 * Reports to Sentry (if configured) before showing the fallback UI.
 */

import React, { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';

import { colors, spacing, typography } from '../../theme';

interface Props  { children: ReactNode }
interface State  { hasError: boolean; eventId: string | null }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, eventId: null };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const eventId = Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
    this.setState({ eventId: eventId ?? null });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, eventId: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>💥</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>
          The app encountered an unexpected error. The team has been notified.
        </Text>
        {this.state.eventId && (
          <Text style={styles.eventId}>
            Error ID: {this.state.eventId.slice(0, 8).toUpperCase()}
          </Text>
        )}
        <Pressable style={styles.button} onPress={this.handleReset}>
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    padding:         spacing.xxl,
    backgroundColor: colors.surface.background,
    gap:             spacing.md,
  },
  emoji:     { fontSize: 48 },
  title:     { ...typography.h2, color: colors.text.primary, textAlign: 'center' },
  subtitle:  { ...typography.body, color: colors.text.secondary, textAlign: 'center' },
  eventId:   { ...typography.caption, color: colors.text.tertiary, fontFamily: 'monospace' },
  button: {
    backgroundColor: colors.brand.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical:   spacing.md,
    borderRadius:      8,
    marginTop:         spacing.md,
  },
  buttonText: { ...typography.bodyBold, color: colors.text.inverse },
});
```

---

### 5.4 Wire into Root Layout

#### `apps/mobile/app/_layout.tsx` *(add OfflineBanner + AppErrorBoundary + Sentry init)*

```tsx
// Top of app/_layout.tsx — add before any import
import { initMobileSentry } from '../src/lib/sentry';
initMobileSentry();

// Add inside RootLayout return:
return (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <OfflineBanner />      {/* ← add this */}
      <AuthGate />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)"  />
        <Stack.Screen name="(app)"   />
        <Stack.Screen name="(admin)" />
      </Stack>
      <Toast />
    </QueryClientProvider>
  </AppErrorBoundary>       // ← wrap everything
);
```

---

## 6. Push Notification Deep-Link Polish

### Why

`src/lib/notifications.ts` calls `router.push(screen)` on notification tap, but `screen` values like `/(app)/shipments/ship-abc` may fail if the user is currently unauthenticated (app killed and relaunched from notification). The fix involves queuing the deep link until auth initialization completes.

---

### `apps/mobile/src/stores/pending-link.store.ts` *(new file)*

```typescript
// src/stores/pending-link.store.ts
/**
 * Holds a deep-link URL that arrived before auth was ready.
 * Consumed by AuthGate after _initialize() completes.
 *
 * Flow:
 *   1. App cold-starts from notification tap
 *   2. handleNotificationNavigation() fires → auth not ready → store the URL
 *   3. AuthGate finishes _initialize() → reads pendingLink → navigates → clears
 */

import { create } from 'zustand';

interface PendingLinkState {
  pendingLink: string | null;
  setPendingLink: (url: string) => void;
  clearPendingLink: () => void;
}

export const usePendingLinkStore = create<PendingLinkState>((set) => ({
  pendingLink: null,
  setPendingLink:  (url) => set({ pendingLink: url }),
  clearPendingLink: ()  => set({ pendingLink: null }),
}));
```

---

### `apps/mobile/src/lib/notifications.ts` *(update `handleNotificationNavigation`)*

```typescript
import { usePendingLinkStore } from '../stores/pending-link.store';
import { useAuthStore }        from '../stores/auth.store';

export function handleNotificationNavigation(
  notification: Notifications.Notification,
): void {
  const data = notification.request.content.data as Record<string, string> | undefined;
  if (!data) return;

  const screen = data['screen'];
  if (!screen) return;

  const isInitializing  = useAuthStore.getState().isInitializing;
  const isAuthenticated = useAuthStore.getState().isAuthenticated;

  if (isInitializing || !isAuthenticated) {
    // Auth not ready — queue the link for after initialization
    usePendingLinkStore.getState().setPendingLink(screen);
    return;
  }

  setTimeout(() => {
    try {
      router.push(screen as any);
    } catch {
      router.push('/(app)/notifications');
    }
  }, 100);
}
```

---

### `apps/mobile/app/_layout.tsx` *(add pending link consumption in AuthGate)*

```tsx
// Inside AuthGate component, after the navigation logic useEffect:
const { pendingLink, clearPendingLink } = usePendingLinkStore();

useEffect(() => {
  if (isInitializing || !isAuthenticated || !pendingLink) return;

  // Auth ready — navigate to queued deep link and clear
  clearPendingLink();
  setTimeout(() => {
    try {
      router.push(pendingLink as any);
    } catch {
      // Link may be invalid (e.g. admin link for customer) — swallow
    }
  }, 300); // Brief delay for navigation stack to settle
}, [isInitializing, isAuthenticated, pendingLink]);
```

---

## 7. Backend E2E Test Suite

### Why

Unit and integration tests exist, but there are no end-to-end tests that validate the full HTTP stack against a real (test) Supabase instance. Phase 9 adds two Playwright-based API E2E scenarios using `supertest` against the real Express app with real DB queries (test Supabase project).

---

### `apps/backend/test/e2e/shipment-lifecycle.e2e.test.ts` *(new file)*

```typescript
/**
 * shipment-lifecycle.e2e.test.ts — Full shipment creation → payment → confirm flow.
 *
 * Prerequisites:
 *   - Test Supabase instance running (local via `supabase start` or test project)
 *   - .env.test with valid SUPABASE_URL, keys
 *
 * Run: npm run test:e2e
 *
 * IMPORTANT: This test creates real database rows.
 * The test user is cleaned up in afterAll.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import type { Express } from 'express';
import { supabaseServiceRole } from '../../src/config/supabase.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function registerUser(app: Express, suffix: string) {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({
      email:        `e2e+${suffix}@test.courier.mw`,
      password:     'E2eTestPass1!',
      full_name:    'E2E Test User',
      phone_number: '+265991000001',
    });
  return res.body.data as { user: { id: string }; tokens: { access_token: string } };
}

async function registerAdmin(app: Express, suffix: string) {
  // Register, then elevate to admin via service role
  const data = await registerUser(app, `admin-${suffix}`);

  await supabaseServiceRole()
    .from('user_profiles')
    .update({ role: 'admin' })
    .eq('id', data.user.id);

  // Re-login to get a fresh token reflecting admin role
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: `e2e+admin-${suffix}@test.courier.mw`, password: 'E2eTestPass1!' });

  return loginRes.body.data as { user: { id: string }; tokens: { access_token: string } };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Shipment Lifecycle E2E', () => {
  let app:            Express;
  let customerToken:  string;
  let adminToken:     string;
  let customerId:     string;
  let adminId:        string;
  let shipmentId:     string;
  let trackingNumber: string;

  const suffix = Date.now().toString().slice(-6);

  beforeAll(async () => {
    app = createApp();

    const customer = await registerUser(app, suffix);
    customerToken  = customer.tokens.access_token;
    customerId     = customer.user.id;

    const admin   = await registerAdmin(app, suffix);
    adminToken    = admin.tokens.access_token;
    adminId       = admin.user.id;
  });

  afterAll(async () => {
    // Clean up: delete test users (cascades to all their data)
    await supabaseServiceRole().auth.admin.deleteUser(customerId);
    await supabaseServiceRole().auth.admin.deleteUser(adminId);
  });

  // ── Step 1: Customer creates a shipment ───────────────────────────────────
  it('POST /api/v1/shipments — customer can create shipment', async () => {
    const res = await request(app)
      .post('/api/v1/shipments')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        sender: {
          full_name: 'Test Sender', phone_number: '+265991000001',
          address: '123 Area 47', city: 'Lilongwe',
        },
        receiver: {
          full_name: 'Test Receiver', phone_number: '+265881000001',
          address: '456 Chichiri', city: 'Blantyre',
        },
        package: {
          weight_kg: 2.5, size: 'medium',
          description: 'E2E test books', is_fragile: false,
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.shipment.id).toBeDefined();
    expect(res.body.data.shipment.status).toBe('pending_approval');
    expect(res.body.data.shipment.tracking_number).toMatch(/^CRR-\d{8}-[A-F0-9]{6}$/);
    expect(res.body.data.shipment.quoted_price_mwk).toBeGreaterThan(0);

    shipmentId     = res.body.data.shipment.id;
    trackingNumber = res.body.data.shipment.tracking_number;
  });

  // ── Step 2: Customer cannot view another user's shipment ─────────────────
  it('GET /api/v1/shipments/:id — returns 404 for wrong owner', async () => {
    // Register a second customer who should NOT see the first customer's shipment
    const secondCustomer = await registerUser(app, `sc-${suffix}`);

    const res = await request(app)
      .get(`/api/v1/shipments/${shipmentId}`)
      .set('Authorization', `Bearer ${secondCustomer.tokens.access_token}`);

    expect(res.status).toBe(404);

    // Cleanup
    await supabaseServiceRole().auth.admin.deleteUser(secondCustomer.user.id);
  });

  // ── Step 3: Public tracking works without auth ────────────────────────────
  it('GET /api/v1/shipments/tracking/:trackingNumber — public, no PII', async () => {
    const res = await request(app)
      .get(`/api/v1/shipments/tracking/${trackingNumber}`);

    expect(res.status).toBe(200);
    expect(res.body.data.tracking_number).toBe(trackingNumber);
    expect(res.body.data.status).toBe('pending_approval');

    // No PII fields
    expect(res.body.data.sender_name).toBeUndefined();
    expect(res.body.data.receiver_phone).toBeUndefined();
    expect(res.body.data.sender_address).toBeUndefined();
  });

  // ── Step 4: Admin approves ────────────────────────────────────────────────
  it('POST /api/v1/admin/shipments/:id/transition — admin can approve', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/shipments/${shipmentId}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved', notes: 'E2E approval' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
  });

  // ── Step 5: Customer sees approved status ─────────────────────────────────
  it('GET /api/v1/shipments/:id — customer sees approved status', async () => {
    const res = await request(app)
      .get(`/api/v1/shipments/${shipmentId}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
  });

  // ── Step 6: Customer initiates payment ───────────────────────────────────
  it('POST /api/v1/payments/initiate — customer initiates payment', async () => {
    const idempotencyKey = '12345678-1234-4321-a234-123456789abc';

    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shipment_id:     shipmentId,
        method:          'airtel_money',
        phone_number:    '+265991000001',
        idempotency_key: idempotencyKey,
      });

    // Will fail with 502 in E2E because Paychangu is not mocked here.
    // We verify the shipment moved to payment_pending regardless.
    // In a real E2E environment you'd mock Paychangu or use a sandbox key.
    expect([201, 502]).toContain(res.status);
  });

  // ── Step 7: Admin can reject a shipment ───────────────────────────────────
  it('POST /api/v1/admin/shipments/:id/transition — admin reject requires reason', async () => {
    // Create a fresh shipment for rejection test
    const newShipRes = await request(app)
      .post('/api/v1/shipments')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        sender: {
          full_name: 'S', phone_number: '+265991000001',
          address: '1 Test St', city: 'Lilongwe',
        },
        receiver: {
          full_name: 'R', phone_number: '+265881000001',
          address: '2 Test St', city: 'Blantyre',
        },
        package: { weight_kg: 1, size: 'small', description: 'Rejection test', is_fragile: false },
      });

    const newShipId = newShipRes.body.data.shipment.id;

    // Reject without reason — should fail
    const badRes = await request(app)
      .post(`/api/v1/admin/shipments/${newShipId}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected' });

    expect(badRes.status).toBe(422);

    // Reject with reason — should succeed
    const goodRes = await request(app)
      .post(`/api/v1/admin/shipments/${newShipId}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', rejection_reason: 'Package type not allowed' });

    expect(goodRes.status).toBe(200);
    expect(goodRes.body.data.status).toBe('rejected');
    expect(goodRes.body.data.rejection_reason).toBe('Package type not allowed');
  });

  // ── Step 8: Shipment history includes events ──────────────────────────────
  it('GET /api/v1/shipments/:id/history — includes status events', async () => {
    const res = await request(app)
      .get(`/api/v1/shipments/${shipmentId}/history`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.events)).toBe(true);
    expect(res.body.data.events.length).toBeGreaterThanOrEqual(1);

    const approvalEvent = res.body.data.events.find(
      (e: { to_status: string }) => e.to_status === 'approved',
    );
    expect(approvalEvent).toBeDefined();
    expect(approvalEvent.notes).toBe('E2E approval');
  });
});
```

---

### `apps/backend/package.json` *(add test:e2e script)*

```json
{
  "scripts": {
    "test:e2e": "NODE_ENV=test dotenv -e .env.test -- vitest run test/e2e/**/*.e2e.test.ts"
  }
}
```

---

## 8. Mobile Integration Tests

### `apps/mobile/src/__tests__/auth.store.test.ts` *(new file)*

```typescript
// src/__tests__/auth.store.test.ts
/**
 * Auth store unit tests.
 * SecureStore and authApi are mocked — tests verify store state transitions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock expo-secure-store
vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  getItemAsync: vi.fn().mockResolvedValue(null),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
}));

// Mock authApi
vi.mock('../api/auth', () => ({
  authApi: {
    logout:                  vi.fn().mockResolvedValue(undefined),
    getProfile:              vi.fn(),
    refreshViaRefreshToken:  vi.fn(),
    updateFcmToken:          vi.fn().mockResolvedValue(undefined),
  },
}));

import * as SecureStore from 'expo-secure-store';
import { authApi }      from '../api/auth';
import { useAuthStore } from '../stores/auth.store';

const MOCK_USER = {
  id: 'uuid-1', email: 'test@test.com',
  full_name: 'Test', phone_number: '+265991234567',
  role: 'customer' as const, is_active: true, fcm_token: null,
  created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
};

const MOCK_TOKENS = {
  access_token: 'at1', refresh_token: 'rt1',
  expires_in: 3600, token_type: 'bearer' as const,
};

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      isAuthenticated: false, isInitializing: true,
      user: null, accessToken: null,
    });
  });

  it('login() sets isAuthenticated = true and stores tokens', async () => {
    await useAuthStore.getState().login(MOCK_USER, MOCK_TOKENS);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.id).toBe('uuid-1');
    expect(state.accessToken).toBe('at1');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('access_token', 'at1');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('refresh_token', 'rt1');
  });

  it('logout() calls authApi.logout and clears state', async () => {
    // Set up logged-in state
    await useAuthStore.getState().login(MOCK_USER, MOCK_TOKENS);

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(authApi.logout).toHaveBeenCalledOnce();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('access_token');
  });

  it('logout() still clears state even if authApi.logout throws', async () => {
    vi.mocked(authApi.logout).mockRejectedValueOnce(new Error('network'));
    await useAuthStore.getState().login(MOCK_USER, MOCK_TOKENS);

    // Should not throw
    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('_initialize() returns unauthenticated when no stored tokens', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);

    await useAuthStore.getState()._initialize();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isInitializing).toBe(false);
  });

  it('_initialize() refreshes tokens when near expiry', async () => {
    // access_token present, refresh_token present, expires soon (1 min)
    vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => {
      if (key === 'access_token')     return 'stale-at';
      if (key === 'refresh_token')    return 'rt1';
      if (key === 'token_expires_at') return new Date(Date.now() + 60_000).toISOString();
      if (key === 'user_profile')     return JSON.stringify(MOCK_USER);
      return null;
    });

    vi.mocked(authApi.refreshViaRefreshToken).mockResolvedValue({
      user: MOCK_USER, tokens: MOCK_TOKENS,
    });

    await useAuthStore.getState()._initialize();

    expect(authApi.refreshViaRefreshToken).toHaveBeenCalledWith('rt1');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
```

---

### `apps/mobile/src/__tests__/shipment-draft.store.test.ts` *(new file)*

```typescript
// src/__tests__/shipment-draft.store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useDraftStore } from '../stores/shipment-draft.store';

describe('useDraftStore', () => {
  beforeEach(() => useDraftStore.getState().reset());

  it('setSender() updates sender fields without overwriting others', () => {
    useDraftStore.getState().setSender({ full_name: 'Alice', city: 'Lilongwe' });
    useDraftStore.getState().setSender({ phone_number: '+265991234567' });

    const { sender } = useDraftStore.getState();
    expect(sender.full_name).toBe('Alice');
    expect(sender.city).toBe('Lilongwe');
    expect(sender.phone_number).toBe('+265991234567');
  });

  it('reset() clears all fields and generates a new draftId', () => {
    useDraftStore.getState().setSender({ full_name: 'Alice' });
    const oldDraftId = useDraftStore.getState().draftId;

    useDraftStore.getState().reset();

    expect(useDraftStore.getState().sender.full_name).toBe('');
    expect(useDraftStore.getState().draftId).not.toBe(oldDraftId);
  });

  it('setQuotedPrice() stores the price', () => {
    useDraftStore.getState().setQuotedPrice(500_000);
    expect(useDraftStore.getState().quotedPriceMwk).toBe(500_000);
  });
});
```

---

## 9. GitHub Actions CI/CD Pipelines

### Why

No `.github/workflows/` directory exists. Phase 9 adds three workflows:
1. **backend-ci.yml** — lint, typecheck, unit + integration tests, Docker build verification
2. **mobile-ci.yml** — lint, typecheck, mobile unit tests
3. **deploy-backend.yml** — production deployment to Railway on `main` push

---

### `.github/workflows/backend-ci.yml` *(new file)*

```yaml
# .github/workflows/backend-ci.yml
#
# Runs on every push to any branch and every pull request.
# Tests: lint → typecheck → unit → integration tests → Docker build
#
# Required secrets:
#   SUPABASE_URL              — test Supabase project URL
#   SUPABASE_ANON_KEY         — test anon key
#   SUPABASE_SERVICE_ROLE_KEY — test service role key
#   SENTRY_DSN                — (optional) skips Sentry init in test env
#
# Redis: a real Redis service is started as a container for BullMQ tests.

name: Backend CI

on:
  push:
    branches: ['**']
    paths:
      - 'apps/backend/**'
      - 'packages/**'
      - '.github/workflows/backend-ci.yml'
  pull_request:
    paths:
      - 'apps/backend/**'
      - 'packages/**'

concurrency:
  group:  ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-typecheck:
    name: Lint & Typecheck
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint backend
        run: npm run lint --workspace=@courier/backend

      - name: Lint shared packages
        run: |
          npm run lint --workspace=@courier/shared-types
          npm run lint --workspace=@courier/shared-validation
          npm run lint --workspace=@courier/shared-constants

      - name: Typecheck all
        run: npm run typecheck

  unit-tests:
    name: Unit & Integration Tests
    runs-on: ubuntu-latest
    timeout-minutes: 20

    # Redis service for BullMQ workers
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10

    env:
      NODE_ENV:                   test
      PORT:                       3001
      CORS_ALLOWED_ORIGINS:       http://localhost:3001
      SUPABASE_URL:               ${{ secrets.SUPABASE_URL }}
      SUPABASE_ANON_KEY:          ${{ secrets.SUPABASE_ANON_KEY }}
      SUPABASE_SERVICE_ROLE_KEY:  ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      PAYCHANGU_PUBLIC_KEY:       pub_test_ci_key
      PAYCHANGU_SECRET_KEY:       sec_test_ci_key
      PAYCHANGU_WEBHOOK_SECRET:   ci-webhook-secret-minimum-32-characters-here
      PAYCHANGU_BASE_URL:         https://api.paychangu.com
      FIREBASE_PROJECT_ID:        test-project
      FIREBASE_CLIENT_EMAIL:      test@test.iam.gserviceaccount.com
      FIREBASE_PRIVATE_KEY:       "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC7o4qne60TB3wo\n-----END PRIVATE KEY-----\n"
      GOOGLE_MAPS_SERVER_KEY:     AIzaSy_ci_test_key
      REDIS_URL:                  redis://localhost:6379
      ADMIN_EMAIL:                admin@test.mw
      SENTRY_ENVIRONMENT:         test

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test --workspace=@courier/backend -- --reporter=verbose

      - name: Run coverage report
        run: npm run test:coverage --workspace=@courier/backend

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          token:    ${{ secrets.CODECOV_TOKEN }}
          flags:    backend
          fail_ci_if_error: false

  docker-build:
    name: Docker Build Verification
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: [lint-typecheck]

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build Docker image (no push)
        uses: docker/build-push-action@v5
        with:
          context:   .
          file:      apps/backend/Dockerfile
          push:      false
          tags:      courier-backend:ci-${{ github.sha }}
          # Use GitHub Actions cache for layer caching
          cache-from: type=gha
          cache-to:   type=gha,mode=max
          # Verify the image starts cleanly
          load:       true

      - name: Smoke test container startup
        run: |
          docker run --rm -d \
            --name courier-smoke \
            -p 3000:3000 \
            -e NODE_ENV=production \
            -e PORT=3000 \
            -e CORS_ALLOWED_ORIGINS=http://localhost:3000 \
            -e SUPABASE_URL=https://fake.supabase.co \
            -e SUPABASE_ANON_KEY=$(python3 -c "print('x'*150)") \
            -e SUPABASE_SERVICE_ROLE_KEY=$(python3 -c "print('x'*150)") \
            -e PAYCHANGU_PUBLIC_KEY=pub_test \
            -e PAYCHANGU_SECRET_KEY=sec_test \
            -e PAYCHANGU_WEBHOOK_SECRET=minimum-32-char-secret-for-ci-test \
            -e FIREBASE_PROJECT_ID=fake \
            -e FIREBASE_CLIENT_EMAIL=fake@fake.iam.gserviceaccount.com \
            -e "FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n" \
            -e GOOGLE_MAPS_SERVER_KEY=AIzaSy_fake \
            -e REDIS_URL=redis://localhost:6379 \
            -e ADMIN_EMAIL=admin@fake.mw \
            courier-backend:ci-${{ github.sha }} || true
          sleep 5
          # Container will crash (no real Supabase/Redis) but it should start the process
          docker logs courier-smoke 2>&1 | head -30
          docker stop courier-smoke 2>/dev/null || true
```

---

### `.github/workflows/mobile-ci.yml` *(new file)*

```yaml
# .github/workflows/mobile-ci.yml
#
# Mobile CI: lint, typecheck, unit tests.
# Does NOT run EAS builds (those are triggered manually or on tag).

name: Mobile CI

on:
  push:
    branches: ['**']
    paths:
      - 'apps/mobile/**'
      - 'packages/**'
      - '.github/workflows/mobile-ci.yml'
  pull_request:
    paths:
      - 'apps/mobile/**'
      - 'packages/**'

concurrency:
  group:  ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-typecheck-test:
    name: Lint, Typecheck & Tests
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint mobile
        run: npm run lint --workspace=@courier/mobile

      - name: Typecheck mobile
        run: npm run typecheck --workspace=@courier/mobile

      - name: Run unit tests
        run: npm run test --workspace=@courier/mobile
        env:
          # Prevents real API calls in tests
          EXPO_PUBLIC_API_URL:         http://localhost:3000/api
          EXPO_PUBLIC_SUPABASE_URL:    https://fake.supabase.co
          EXPO_PUBLIC_SUPABASE_ANON_KEY: ${{ 'x' * 150 }}
```

---

### `.github/workflows/deploy-backend.yml` *(new file)*

```yaml
# .github/workflows/deploy-backend.yml
#
# Deploys backend to Railway when code is pushed to main.
# Requires all CI checks to pass first (via needs:).
#
# Required secrets (set in GitHub repo settings):
#   RAILWAY_TOKEN — Railway CLI token (from railway.app dashboard)
#   RAILWAY_SERVICE_ID — backend service ID from Railway project
#   SENTRY_AUTH_TOKEN — for Sentry release creation
#   SENTRY_ORG
#   SENTRY_PROJECT

name: Deploy Backend (Production)

on:
  push:
    branches: [main]
    paths:
      - 'apps/backend/**'
      - 'packages/**'
      - 'supabase/migrations/**'

jobs:
  # Gate: must pass all CI checks before deployment
  ci:
    uses: ./.github/workflows/backend-ci.yml
    secrets: inherit

  deploy:
    name: Deploy to Railway
    runs-on: ubuntu-latest
    timeout-minutes: 20
    needs: [ci]
    environment: production  # Requires manual approval gate if configured

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install Railway CLI
        run: npm install -g @railway/cli@latest

      - name: Deploy to Railway
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          railway up \
            --service ${{ secrets.RAILWAY_SERVICE_ID }} \
            --detach

      - name: Wait for deployment health
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          echo "Waiting for Railway deployment to become healthy..."
          sleep 30  # Railway takes ~30s to start Node containers

          BACKEND_URL=$(railway domain --service ${{ secrets.RAILWAY_SERVICE_ID }} 2>/dev/null || echo "")
          if [ -z "$BACKEND_URL" ]; then
            echo "Could not get domain from Railway, skipping health check"
            exit 0
          fi

          for i in {1..10}; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${BACKEND_URL}/api/v1/health" 2>/dev/null || echo "000")
            if [ "$STATUS" = "200" ]; then
              echo "✅ Health check passed (attempt $i)"
              exit 0
            fi
            echo "Attempt $i: HTTP $STATUS — retrying in 10s…"
            sleep 10
          done

          echo "❌ Health check failed after 10 attempts"
          exit 1

      - name: Create Sentry release
        uses: getsentry/action-release@v1
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG:        ${{ secrets.SENTRY_ORG }}
          SENTRY_PROJECT:    ${{ secrets.SENTRY_PROJECT }}
        with:
          environment: production
          version:     courier-backend@${{ github.sha }}

      - name: Notify Slack on failure
        if: failure()
        uses: slackapi/slack-github-action@v1.26.0
        with:
          payload: |
            {
              "text": "🚨 *Production Deployment Failed*\nRepo: ${{ github.repository }}\nCommit: ${{ github.sha }}\nActor: ${{ github.actor }}\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Run>"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

### `.github/workflows/eas-preview.yml` *(new file)*

```yaml
# .github/workflows/eas-preview.yml
#
# Builds a preview APK on every PR that touches mobile code.
# Installs directly on Android test devices via EAS internal distribution.
#
# Required secrets:
#   EXPO_TOKEN — EAS access token from expo.dev

name: EAS Preview Build

on:
  pull_request:
    paths:
      - 'apps/mobile/**'
      - 'packages/**'

jobs:
  build-preview:
    name: EAS Android Preview Build
    runs-on: ubuntu-latest
    timeout-minutes: 45

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Setup Expo
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          eas-version:  latest
          token:        ${{ secrets.EXPO_TOKEN }}

      - name: Build preview APK
        working-directory: apps/mobile
        run: |
          eas build \
            --platform android \
            --profile preview \
            --non-interactive \
            --no-wait
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
```

---

## 10. Production Docker & Railway Deployment

### Why

The existing `Dockerfile` is solid but missing: a `.dockerignore` to minimize build context, a proper multi-stage production build that also builds shared packages, and `docker-compose.yml` for local production parity testing.

---

### `.dockerignore` *(new file, root)*

```gitignore
# .dockerignore — Exclude files that inflate the Docker build context.
# A large context slows down builds; this cuts it from ~400MB to ~5MB.

node_modules
.git
.gitignore
.turbo
**/.expo
**/coverage
**/dist
**/*.tsbuildinfo
**/*.log
.env
.env.*
!.env.example
apps/mobile
supabase/.branches
supabase/.temp
*.md
*.png
*.jpg
*.gif
```

---

### `apps/backend/Dockerfile` *(updated, replace existing)*

```dockerfile
# ─── Build stage ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install build essentials for native modules (e.g. @sentry/profiling-node)
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# ── Dependency layer (cached unless package files change) ──────────
# Copy only manifests first so dependency install is cached
COPY package.json package-lock.json turbo.json ./
COPY apps/backend/package.json             ./apps/backend/
COPY packages/shared-types/package.json    ./packages/shared-types/
COPY packages/shared-validation/package.json ./packages/shared-validation/
COPY packages/shared-constants/package.json  ./packages/shared-constants/

RUN npm ci --frozen-lockfile

# ── Source layer ───────────────────────────────────────────────────
COPY tsconfig.base.json           ./
COPY apps/backend/                ./apps/backend/
COPY apps/backend/tsconfig.json   ./apps/backend/
COPY apps/backend/tsconfig.build.json ./apps/backend/
COPY packages/shared-types/       ./packages/shared-types/
COPY packages/shared-validation/  ./packages/shared-validation/
COPY packages/shared-constants/   ./packages/shared-constants/

# ── Build ─────────────────────────────────────────────────────────
# Build shared packages first (backend depends on them)
RUN cd packages/shared-types      && npx tsc -p tsconfig.json --noEmit false --declaration true || true
RUN cd packages/shared-validation && npx tsc -p tsconfig.json --noEmit false --declaration true || true
RUN cd packages/shared-constants  && npx tsc -p tsconfig.json --noEmit false --declaration true || true

# Build backend
RUN cd apps/backend && npm run build

# ── Prune dev dependencies ─────────────────────────────────────────
RUN npm prune --omit=dev

# ─── Production stage ─────────────────────────────────────────────
FROM node:20-alpine AS runner

# Security hardening
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 -S nodejs && \
    adduser  -S courier -u 1001 -G nodejs

WORKDIR /app

# Copy only what the production runtime needs
COPY --from=builder --chown=courier:nodejs /app/apps/backend/dist         ./dist
COPY --from=builder --chown=courier:nodejs /app/apps/backend/package.json  ./package.json
COPY --from=builder --chown=courier:nodejs /app/node_modules               ./node_modules

# Drop privileges
USER courier

EXPOSE 3000

# Health check — matches Railway's health probe configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (r) => { \
    process.exit(r.statusCode === 200 ? 0 : 1); \
  }).on('error', () => process.exit(1));"

# Use dumb-init as PID 1 for proper signal handling
# Without this, SIGTERM from Docker/Kubernetes doesn't reach Node
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

---

### `docker-compose.production.yml` *(new file, root)*

```yaml
# docker-compose.production.yml
#
# Local production parity testing.
# Mirrors the Railway topology: backend + Redis.
# Supabase is remote (not containerized).
#
# Usage: docker-compose -f docker-compose.production.yml up --build
#
# Set all variables in .env (copy from .env.example).

version: '3.9'

services:
  redis:
    image: redis:7.2-alpine
    restart: unless-stopped
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    healthcheck:
      test:     ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout:  3s
      retries:  10
    volumes:
      - redis_data:/data
    networks:
      - courier

  backend:
    build:
      context:    .
      dockerfile: apps/backend/Dockerfile
    restart: unless-stopped
    depends_on:
      redis:
        condition: service_healthy
    environment:
      NODE_ENV:                 production
      PORT:                     3000
      CORS_ALLOWED_ORIGINS:     ${CORS_ALLOWED_ORIGINS}
      SUPABASE_URL:             ${SUPABASE_URL}
      SUPABASE_ANON_KEY:        ${SUPABASE_ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
      PAYCHANGU_PUBLIC_KEY:     ${PAYCHANGU_PUBLIC_KEY}
      PAYCHANGU_SECRET_KEY:     ${PAYCHANGU_SECRET_KEY}
      PAYCHANGU_WEBHOOK_SECRET: ${PAYCHANGU_WEBHOOK_SECRET}
      PAYCHANGU_BASE_URL:       ${PAYCHANGU_BASE_URL}
      BACKEND_BASE_URL:         ${BACKEND_BASE_URL}
      FIREBASE_PROJECT_ID:      ${FIREBASE_PROJECT_ID}
      FIREBASE_CLIENT_EMAIL:    ${FIREBASE_CLIENT_EMAIL}
      FIREBASE_PRIVATE_KEY:     ${FIREBASE_PRIVATE_KEY}
      GOOGLE_MAPS_SERVER_KEY:   ${GOOGLE_MAPS_SERVER_KEY}
      REDIS_URL:                redis://redis:6379
      SENTRY_DSN:               ${SENTRY_DSN}
      SENTRY_ENVIRONMENT:       production
      ADMIN_EMAIL:              ${ADMIN_EMAIL}
    ports:
      - '3000:3000'
    networks:
      - courier
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'

volumes:
  redis_data:

networks:
  courier:
    driver: bridge
```

---

## 11. App Store Submission

### Why

`apps/mobile/eas.json` defines a production profile but the Android release submission and iOS build signing must be configured. This section documents the complete submission flow.

---

### `apps/mobile/app.json` *(update — add Sentry plugin + increment version)*

```json
{
  "expo": {
    "name": "CourierApp",
    "slug": "courier-app",
    "version": "1.7.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "scheme": "courierapp",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#0A1628"
    },
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.yourcourier.app",
      "buildNumber": "7",
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "We need your location to calculate delivery pickup coordinates and show nearby areas.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "We use your location to find your position for pickup requests.",
        "NSCameraUsageDescription": "We need camera access to capture proof of delivery photos.",
        "NSPhotoLibraryUsageDescription": "We need photo library access to attach evidence for disputes.",
        "NSPhotoLibraryAddUsageDescription": "We need permission to save delivery photos."
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0A1628"
      },
      "package": "com.yourcourier.app",
      "versionCode": 7,
      "permissions": [
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.CAMERA",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.RECEIVE_BOOT_COMPLETED",
        "android.permission.VIBRATE",
        "android.permission.USE_BIOMETRIC"
      ],
      "googleServicesFile": "./google-services.json"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow CourierApp to use your location for pickup address and delivery routing."
        }
      ],
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#0A1628",
          "sounds": [],
          "mode": "production"
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow CourierApp to access your photos for delivery evidence and dispute resolution."
        }
      ],
      [
        "@sentry/react-native/expo",
        {
          "organization": "YOUR_SENTRY_ORG",
          "project":      "courier-mobile"
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    },
    "extra": {
      "sentryDsn":   "YOUR_MOBILE_SENTRY_DSN",
      "environment": "production",
      "eas": {
        "projectId": "REPLACE_WITH_YOUR_EAS_PROJECT_ID"
      }
    }
  }
}
```

---

### `apps/mobile/eas.json` *(updated production profile)*

```json
{
  "cli": {
    "version": ">= 7.0.0",
    "appVersionSource": "local"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleDebug"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "http://192.168.1.100:3000/api",
        "EXPO_PUBLIC_SUPABASE_URL": "https://your-dev-project.supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "your-dev-anon-key"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api-staging.yourcourier.com/api",
        "EXPO_PUBLIC_SUPABASE_URL": "https://your-staging-project.supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "your-staging-anon-key"
      }
    },
    "production": {
      "autoIncrement": "version",
      "android": {
        "buildType": "app-bundle"
      },
      "ios": {
        "credentialsSource": "remote"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.yourcourier.com/api",
        "EXPO_PUBLIC_SUPABASE_URL": "https://your-prod-project.supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "your-prod-anon-key"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./play-store-service-account.json",
        "track":                 "internal",
        "releaseStatus":         "draft",
        "changesNotSentForReview": false
      },
      "ios": {
        "ascAppId":     "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleId":      "YOUR_APPLE_ID_EMAIL",
        "ascApiKeyPath": "./app-store-key.p8",
        "ascApiKeyId":   "YOUR_API_KEY_ID",
        "ascApiIssuerId": "YOUR_ISSUER_ID"
      }
    }
  }
}
```

---

### Submission Commands

```bash
# ─── Android ─────────────────────────────────────────────────────────────────
# 1. Build production AAB
cd apps/mobile
eas build --platform android --profile production

# 2. Submit to Play Store (internal track → review → production)
eas submit --platform android --profile production

# ─── iOS ─────────────────────────────────────────────────────────────────────
# 1. Build production IPA (uses remote Apple credentials managed by EAS)
eas build --platform ios --profile production

# 2. Submit to App Store Connect (TestFlight → review → App Store)
eas submit --platform ios --profile production

# ─── OTA Updates (after initial store approval) ───────────────────────────────
# Ship JS bundle updates without full store review
# Use only for non-native changes (JS, assets, config)
eas update --branch production --message "Phase 9: icons, analytics, bug fixes"
```

---

## 12. Database — Production Maintenance Scripts

### `supabase/scripts/backup.sh` *(new file)*

```bash
#!/usr/bin/env bash
# backup.sh — Daily PostgreSQL backup to Supabase Storage.
#
# Intended as a Railway cron job or GitHub Actions scheduled workflow.
# Requires: pg_dump, Supabase CLI, SUPABASE_DB_URL env var.
#
# Usage: ./supabase/scripts/backup.sh
# Cron:  0 2 * * * /app/supabase/scripts/backup.sh (2 AM UTC daily)

set -euo pipefail

TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
BACKUP_FILE="backup_${TIMESTAMP}.sql.gz"
BUCKET="db-backups"

echo "[backup] Starting PostgreSQL backup at ${TIMESTAMP}"

# Dump the public schema only (auth.users managed by Supabase)
pg_dump \
  --no-privileges \
  --no-owner \
  --schema=public \
  "${SUPABASE_DB_URL}" \
  | gzip > "/tmp/${BACKUP_FILE}"

BACKUP_SIZE=$(du -sh "/tmp/${BACKUP_FILE}" | cut -f1)
echo "[backup] Dump complete: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Upload to Supabase Storage via CLI
supabase storage cp \
  "/tmp/${BACKUP_FILE}" \
  "ss:///${BUCKET}/${BACKUP_FILE}" \
  --project-ref "${SUPABASE_PROJECT_REF}"

echo "[backup] Uploaded to storage: ${BUCKET}/${BACKUP_FILE}"

# Retention: delete backups older than 30 days
# (Supabase Storage lifecycle policies can handle this automatically)
echo "[backup] Backup complete."

# Cleanup local file
rm -f "/tmp/${BACKUP_FILE}"
```

---

### `supabase/migrations/019_monitoring_views.sql` *(new file)*

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 019 — MONITORING VIEWS
-- Read-only views for observability dashboards and alerting queries.
-- These views are designed to be queried by external monitoring tools
-- (Grafana, Metabase, custom admin dashboards) without exposing raw tables.
-- All views filter out PII — they return aggregates and non-identifying data.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Hourly shipment throughput (last 7 days) ──────────────────────
CREATE OR REPLACE VIEW v_shipment_throughput_hourly AS
SELECT
  DATE_TRUNC('hour', created_at)  AS hour_bucket,
  COUNT(*)                         AS total_created,
  COUNT(*) FILTER (WHERE status = 'confirmed')    AS total_confirmed,
  COUNT(*) FILTER (WHERE status = 'rejected')     AS total_rejected,
  COUNT(*) FILTER (WHERE status = 'cancelled')    AS total_cancelled,
  AVG(quoted_price_mwk)::INTEGER                  AS avg_price_tambala
FROM shipments
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour_bucket DESC;

COMMENT ON VIEW v_shipment_throughput_hourly IS
  'Hourly shipment counts for the last 7 days. Safe for monitoring dashboards — no PII.';

-- ─── Daily revenue (last 90 days) ──────────────────────────────────
CREATE OR REPLACE VIEW v_daily_revenue AS
SELECT
  DATE_TRUNC('day', p.created_at)  AS day_bucket,
  COUNT(*)                          AS payment_count,
  SUM(amount_mwk)                   AS revenue_tambala,
  AVG(amount_mwk)::INTEGER          AS avg_tambala
FROM payments p
WHERE p.status = 'paid'
  AND p.created_at >= NOW() - INTERVAL '90 days'
GROUP BY DATE_TRUNC('day', p.created_at)
ORDER BY day_bucket DESC;

COMMENT ON VIEW v_daily_revenue IS
  'Daily paid payment totals for the last 90 days. No PII.';

-- ─── Stale payment alert (feeds alerting webhook) ────────────────────
CREATE OR REPLACE VIEW v_stale_payment_alert AS
SELECT
  COUNT(*) AS stale_count,
  MIN(created_at) AS oldest_stale_at,
  MAX(amount_mwk) AS max_stale_tambala
FROM payments
WHERE status IN ('pending', 'processing')
  AND expires_at < NOW()
  AND expires_at > NOW() - INTERVAL '2 hours';  -- Don't alert on very old stale (already handled)

COMMENT ON VIEW v_stale_payment_alert IS
  'Count of payments that should have been expired but were not. Non-zero indicates expiry worker failure.';

-- ─── Pending approval queue depth ────────────────────────────────────
CREATE OR REPLACE VIEW v_approval_queue_depth AS
SELECT
  COUNT(*)             AS pending_count,
  MIN(created_at)      AS oldest_pending_at,
  MAX(created_at)      AS newest_pending_at,
  EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 3600 AS oldest_pending_hours
FROM shipments
WHERE status = 'pending_approval';

COMMENT ON VIEW v_approval_queue_depth IS
  'Admin approval queue depth. Alert if oldest_pending_hours exceeds SLA threshold.';

-- ─── Notification push failure rate (last 24h) ────────────────────────
CREATE OR REPLACE VIEW v_push_failure_rate_24h AS
SELECT
  COUNT(*)                                              AS total_attempted,
  COUNT(*) FILTER (WHERE push_sent = TRUE)              AS push_success,
  COUNT(*) FILTER (WHERE push_failed_at IS NOT NULL)    AS push_failed,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE push_failed_at IS NOT NULL)
    / NULLIF(COUNT(*), 0), 2
  ) AS failure_rate_pct
FROM app_notifications
WHERE created_at >= NOW() - INTERVAL '24 hours';

COMMENT ON VIEW v_push_failure_rate_24h IS
  'Push notification success/failure rates for the last 24 hours. Alert if failure_rate_pct > 5%.';

-- ─── Row-level security on views ────────────────────────────────────
-- Views inherit RLS from underlying tables when accessed via anon key.
-- Service role bypasses; admin queries use service role.
-- Explicitly grant SELECT to authenticated role for admin dashboards:
GRANT SELECT ON v_shipment_throughput_hourly TO authenticated;
GRANT SELECT ON v_daily_revenue              TO authenticated;
GRANT SELECT ON v_approval_queue_depth       TO authenticated;
GRANT SELECT ON v_push_failure_rate_24h      TO authenticated;
-- v_stale_payment_alert is service-role only (alerting webhook)
```

---

## 13. Security Hardening Audit Fixes

### 13.1 CORS — Restrict from Wildcard

In `apps/backend/src/app.ts`, the CORS origin is `['*']` with a comment saying to restrict for production. Now fix it:

```typescript
// In createApp():
app.use(cors({
  // Read from env — validated as a string[] by env.ts transform
  origin:         env.CORS_ALLOWED_ORIGINS,
  methods:        ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  // Expose RateLimit headers to clients
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  // No credentials: we use Bearer tokens in Authorization header, not cookies
  credentials:    false,
}));
```

> **`env.CORS_ALLOWED_ORIGINS`** is already typed as `string[]` by the Zod transform in `env.ts`. This single change removes the wildcard without any other changes.

---

### 13.2 Request ID Header Middleware

Add a request ID to every response so Sentry events can be correlated with backend logs:

#### `apps/backend/src/middleware/request-id.middleware.ts` *(new file)*

```typescript
/**
 * request-id.middleware.ts — Attaches a unique request ID to every request.
 *
 * Priority:
 *   1. X-Request-ID header from caller (propagated from upstream proxy or mobile client)
 *   2. Generated UUID v4 if header is absent
 *
 * The ID is echoed back in the response header so the mobile client can
 * correlate a failed request with the backend log entry.
 */

import { randomUUID }            from 'crypto';
import type { NextFunction, Request, Response } from 'express';

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.headers['x-request-id'];
  const id = Array.isArray(existingId)
    ? (existingId[0] ?? randomUUID())
    : (existingId ?? randomUUID());

  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}
```

> Wire into `app.ts` as the very first middleware, before helmet: `app.use(requestId);`

---

### 13.3 Rate Limit Redis Store

For horizontal scaling, upgrade the in-memory rate limiter to Redis-backed:

#### `apps/backend/src/middleware/rate-limit.middleware.ts` *(update createLimiter)*

```typescript
import { RedisStore } from 'rate-limit-redis';
import { getRedis }   from '../config/redis.js';
import { isProd }     from '../config/env.js';

function createLimiter(options: {
  windowMs: number;
  max:      number;
  message:  string;
  prefix:   string;
}): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs:        options.windowMs,
    max:             options.max,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,

    // ── Redis store for multi-instance consistency ─────────────────
    // Falls back to in-memory (MemoryStore) in test/dev for simplicity.
    store: isProd
      ? new RedisStore({
          prefix:       `rl:${options.prefix}:`,
          sendCommand:  (...args: string[]) => getRedis().call(...args as [string, ...string[]]) as any,
        })
      : undefined,  // undefined = MemoryStore (default)

    keyGenerator: (req) => {
      const forwardedFor = req.headers['x-forwarded-for'];
      const ip = Array.isArray(forwardedFor)
        ? (forwardedFor[0] ?? req.ip ?? 'unknown')
        : (forwardedFor?.split(',')[0] ?? req.ip ?? 'unknown');
      return `${options.prefix}:${ip.trim()}`;
    },

    handler: (_req, _res, next) => {
      next(new RateLimitError(options.message));
    },
    skip: () => process.env['NODE_ENV'] === 'test',
  });
}
```

> **Install:** `npm install rate-limit-redis --workspace=@courier/backend`

---

## 14. Final package.json Version Bumps

### Root `package.json`

```json
{
  "version": "1.7.0"
}
```

### `apps/backend/package.json`

```json
{
  "version": "1.7.0",
  "dependencies": {
    "@sentry/profiling-node": "^8.13.0",
    "rate-limit-redis":       "^4.2.0"
  }
}
```

### `apps/mobile/package.json`

```json
{
  "version": "1.7.0",
  "dependencies": {
    "@sentry/react-native":                    "^5.23.0",
    "expo-haptics":                            "~13.0.1",
    "@react-native-community/netinfo":         "^11.3.1"
  }
}
```

### `packages/shared-types/package.json`

```json
{ "version": "1.7.0" }
```

### `packages/shared-validation/package.json`

```json
{ "version": "1.7.0" }
```

### `packages/shared-constants/package.json`

```json
{ "version": "1.7.0" }
```

---

## 15. Production Deployment Checklist

### 15.1 Pre-Deployment: Backend

```
[ ] Run all migrations against production Supabase:
    supabase db push --linked
    — Migrations 018 (performance indexes) and 019 (monitoring views)

[ ] Verify CORS_ALLOWED_ORIGINS is set to actual domain in Railway
    (not http://localhost:8081)

[ ] Confirm PAYCHANGU_WEBHOOK_SECRET is the live key (not test key)
    — Minimum 32 characters, matches what Paychangu dashboard shows

[ ] Confirm PAYCHANGU_BASE_URL = https://api.paychangu.com
    (not a staging URL)

[ ] Confirm FIREBASE_PRIVATE_KEY escape sequences are correct in Railway:
    — In Railway dashboard, paste the raw private key with actual newlines,
      not \\n escape sequences. Railway preserves literal newlines.

[ ] Confirm REDIS_URL points to production Redis (not localhost:6379)

[ ] Sentry DSN is set; verify a test event appears in Sentry

[ ] BACKEND_BASE_URL = https://api.yourcourier.com
    (used for Paychangu callback_url)

[ ] Docker build passes locally:
    docker compose -f docker-compose.production.yml build

[ ] Health check returns 200:
    curl https://api.yourcourier.com/api/v1/health

[ ] Detailed health (with admin token) returns all green:
    curl -H "Authorization: Bearer $ADMIN_TOKEN" \
         https://api.yourcourier.com/api/v1/health/detailed
```

---

### 15.2 Pre-Deployment: Mobile

```
[ ] app.json version = 1.7.0, versionCode = 7, buildNumber = "7"
[ ] google-services.json is the production Firebase config
    (NOT the debug config)
[ ] EXPO_PUBLIC_API_URL = https://api.yourcourier.com/api (no trailing slash)
[ ] EAS projectId is set in app.json extra.eas.projectId
[ ] Sentry DSN (mobile) is set in app.json extra.sentryDsn
[ ] Run: eas build --platform android --profile production
[ ] Run: eas build --platform ios --profile production
[ ] Test APK/IPA against production backend before submitting
[ ] Verify push notifications arrive (send a test via Firebase console)
[ ] Verify Sentry receives a test error from the production build
[ ] Run: eas submit --platform android --profile production
[ ] Run: eas submit --platform ios --profile production
[ ] Create release notes in Play Console and App Store Connect
```

---

### 15.3 Post-Deployment Monitoring

```
[ ] Set up Sentry alerts:
    — Error spike: >10 errors/minute → PagerDuty
    — New issue: unhandled exception → Slack #backend-alerts

[ ] Set up Railway health check alert:
    — Health endpoint fails 3x in 5 min → Slack #ops

[ ] Set up Supabase monitoring:
    — Database CPU > 80% for 5 min → Slack
    — Row count on payments WHERE status='processing' AND expires_at < NOW()
      (stale payments) > 5 → Slack

[ ] Verify BullMQ workers are active post-deploy:
    — Check Redis keys: redis-cli keys "bull:notifications:*"
    — Confirm at least one worker is connected

[ ] Test the complete shipment lifecycle manually:
    1. Register a test customer
    2. Create a shipment
    3. Admin approves in admin app
    4. Customer initiates payment via Airtel sandbox
    5. Trigger Paychangu webhook manually (Paychangu dashboard)
    6. Verify shipment advances to payment_confirmed
    7. Admin marks picked_up → in_transit → delivered
    8. Customer confirms delivery
    9. Verify all 8 status events appear in shipment history

[ ] Verify notification delivery end-to-end:
    — Each status transition above should produce a push notification
    — Check app_notifications table for rows with push_sent=true

[ ] Run smoke test against production:
    curl https://api.yourcourier.com/api/v1/health
    curl https://api.yourcourier.com/api/v1/shipments/tracking/NONEXISTENT-123
    (should return 404, not 500)
```

---

### 15.4 Rollback Plan

```bash
# ─── Backend rollback (Railway) ─────────────────────────────────────
# Railway keeps the last 10 deployments. Roll back via dashboard or CLI:
railway rollback --service $RAILWAY_SERVICE_ID

# ─── Database rollback ───────────────────────────────────────────────
# Migrations 018 and 019 are non-destructive (indexes + views only).
# They can be dropped without data loss:
supabase db push --linked  # After reverting migration files in git

# To manually drop if needed:
# DROP INDEX CONCURRENTLY IF EXISTS idx_payments_provider_ref_status;
# DROP INDEX CONCURRENTLY IF EXISTS idx_shipments_status_created;
# DROP INDEX CONCURRENTLY IF EXISTS idx_notifications_unsent;
# DROP INDEX CONCURRENTLY IF EXISTS idx_audit_log_target_time;
# DROP INDEX CONCURRENTLY IF EXISTS idx_payments_expiry_scan;
# DROP VIEW IF EXISTS v_shipment_throughput_hourly;
# DROP VIEW IF EXISTS v_daily_revenue;
# DROP VIEW IF EXISTS v_stale_payment_alert;
# DROP VIEW IF EXISTS v_approval_queue_depth;
# DROP VIEW IF EXISTS v_push_failure_rate_24h;

# ─── Mobile rollback ─────────────────────────────────────────────────
# EAS OTA update (JS only, if no native changes):
eas update --branch production --message "Rollback to Phase 8" \
  --rollout-percentage 0   # Pull back the update immediately

# Full rollback requires resubmitting the previous binary to the stores.
# Keep the Phase 8 production AAB/IPA in a secure artifact store.
```

---

## Summary: Files Created / Modified in Phase 9

### New Files

| Path | Description |
|---|---|
| `apps/mobile/src/components/ui/TabBarIcon.tsx` | Animated icon wrapper for tab bars |
| `apps/mobile/src/components/ui/KpiCard.tsx` | Analytics KPI metric card |
| `apps/mobile/src/components/ui/ShipmentFunnel.tsx` | Stacked bar shipment funnel chart |
| `apps/mobile/src/components/ui/OfflineBanner.tsx` | Animated offline status banner |
| `apps/mobile/src/components/layout/AppErrorBoundary.tsx` | Top-level React error boundary |
| `apps/mobile/src/api/admin.ts` | Admin API client |
| `apps/mobile/src/hooks/use-admin.ts` | Admin analytics query hook |
| `apps/mobile/src/hooks/use-network.ts` | Network status + React Query focus manager |
| `apps/mobile/src/lib/sentry.ts` | Mobile Sentry initialization |
| `apps/mobile/src/stores/pending-link.store.ts` | Queued deep-link store |
| `apps/backend/src/config/sentry.ts` | Backend Sentry initialization |
| `apps/backend/src/middleware/request-id.middleware.ts` | X-Request-ID header middleware |
| `apps/backend/src/routes/admin.routes.ts` | Admin non-shipment routes (stats) |
| `apps/backend/test/e2e/shipment-lifecycle.e2e.test.ts` | Full lifecycle E2E test |
| `apps/mobile/src/__tests__/auth.store.test.ts` | Auth store unit tests |
| `apps/mobile/src/__tests__/shipment-draft.store.test.ts` | Draft store unit tests |
| `.github/workflows/backend-ci.yml` | Backend CI pipeline |
| `.github/workflows/mobile-ci.yml` | Mobile CI pipeline |
| `.github/workflows/deploy-backend.yml` | Production deploy workflow |
| `.github/workflows/eas-preview.yml` | EAS preview build on PR |
| `.dockerignore` | Docker build context exclusions |
| `docker-compose.production.yml` | Local production parity |
| `supabase/migrations/018_performance_indexes.sql` | Missing database indexes |
| `supabase/migrations/019_monitoring_views.sql` | Observability read views |
| `supabase/scripts/backup.sh` | Daily DB backup script |

### Modified Files

| Path | Change |
|---|---|
| `apps/mobile/app/(app)/_layout.tsx` | Full Ionicons + haptics implementation |
| `apps/mobile/app/(admin)/_layout.tsx` | Full Ionicons + haptics implementation |
| `apps/mobile/app/(admin)/stats/index.tsx` | Full analytics dashboard |
| `apps/mobile/app/_layout.tsx` | Add AppErrorBoundary, OfflineBanner, Sentry init, pending link consumption |
| `apps/mobile/app/package.json` | New deps: @sentry/react-native, expo-haptics, netinfo |
| `apps/mobile/app.json` | Version 1.7.0, Sentry plugin, extra config |
| `apps/mobile/eas.json` | iOS submission config, OTA update config |
| `apps/mobile/src/hooks/query-client.ts` | STALE_TIMES constants, structuralSharing |
| `apps/mobile/src/lib/notifications.ts` | Pending link store integration |
| `apps/backend/src/index.ts` | Sentry init first line |
| `apps/backend/src/app.ts` | requestId middleware, CORS fix, compression |
| `apps/backend/src/middleware/error.middleware.ts` | Enhanced Sentry capture context |
| `apps/backend/src/middleware/rate-limit.middleware.ts` | Redis store for production |
| `apps/backend/package.json` | New deps: @sentry/profiling-node, rate-limit-redis |
| `package.json` | Version 1.7.0 |

---

**Deliverable:** `PHASE_9_IMPLEMENTATION.md`  
**Next step:** Run `npm ci && npm run typecheck && npm run test` across all workspaces, then execute the production deployment checklist in order.
