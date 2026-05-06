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
