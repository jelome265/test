// src/components/ui/ShipmentFunnel.tsx
/**
 * Horizontal bar chart representing the shipment lifecycle funnel.
 * Each status is a proportional bar segment, color-coded.
 * Uses pure RN View layout — no chart library dependency.
 */

import { useMemo } from 'react';
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
