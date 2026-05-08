// src/components/ui/StatusBadge.tsx

import { STATUS_LABELS } from '@courier/shared-constants';
import type { ShipmentStatus } from '@courier/shared-types';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, radius, typography } from '../../theme';

interface StatusBadgeProps {
  status: ShipmentStatus;
  size?:  'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const bgColor = `${colors.status[status]}20`; // 12% opacity background
  const fgColor = colors.status[status];
  const label   = STATUS_LABELS[status];

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }, size === 'sm' && styles.sm]}>
      <View style={[styles.dot, { backgroundColor: fgColor }]} />
      <Text style={[styles.text, { color: fgColor }, size === 'sm' && styles.textSm]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing.xs,
    paddingVertical:   spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius:   radius.full,
    alignSelf:      'flex-start',
  },
  sm: {
    paddingVertical:   2,
    paddingHorizontal: spacing.sm - 2,
  },
  dot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  text: {
    ...typography.label,
    fontWeight: '600',
  },
  textSm: {
    fontSize: 11,
  },
});
