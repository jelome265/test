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

import { tambalaToMwk } from '@courier/shared-constants';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';


import { ErrorState }      from '../../../src/components/ui/ErrorState';
import { KpiCard }         from '../../../src/components/ui/KpiCard';
import { LoadingState }    from '../../../src/components/ui/LoadingState';
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
