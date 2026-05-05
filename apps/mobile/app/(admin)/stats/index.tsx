// app/(admin)/stats/index.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../../src/theme';
import { EmptyState } from '../../../src/components/ui/EmptyState';

export default function AdminStatsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Platform Stats</Text>
      </View>
      
      <EmptyState
        emoji="📊"
        title="Coming Soon"
        description="Phase 9 will include detailed analytics and performance charts."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  header: {
    paddingHorizontal: spacing.base, paddingTop: spacing.xl, paddingBottom: spacing.md,
    backgroundColor: colors.surface.background,
  },
  title: { ...typography.h1, color: colors.text.primary },
});
