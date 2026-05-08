// app/(app)/shipments/track/[trackingNumber].tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button }       from '../../../../src/components/ui/Button';
import { ErrorState }   from '../../../../src/components/ui/ErrorState';
import { LoadingState } from '../../../../src/components/ui/LoadingState';
import { StatusBadge }  from '../../../../src/components/ui/StatusBadge';
import { useTrackShipment } from '../../../../src/hooks/use-shipments';
import { colors, spacing, typography, radius } from '../../../../src/theme';
import type { ShipmentStatus } from '@courier/shared-types';

export default function PublicTrackingScreen() {
  const { trackingNumber } = useLocalSearchParams<{ trackingNumber: string }>();
  const router = useRouter();

  const { data: shipment, isLoading, isError, refetch } = useTrackShipment(trackingNumber ?? '');

  if (isLoading) return <LoadingState />;
  if (isError || !shipment) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Button variant="ghost" size="sm" onPress={() => router.back()}>← Back</Button>
          <Text style={styles.title}>Track Shipment</Text>
        </View>

        <View style={styles.trackingCard}>
          <Text style={styles.trackingLabel}>TRACKING NUMBER</Text>
          <Text style={styles.trackingNumber}>{shipment.tracking_number}</Text>
          {shipment.status && (
            <View style={styles.badgeRow}>
              <StatusBadge status={shipment.status as ShipmentStatus} />
            </View>
          )}
        </View>

        <View style={styles.infoCard}>
          <View style={styles.routeRow}>
            <View style={styles.routeItem}>
              <Text style={styles.routeLabel}>FROM</Text>
              <Text style={styles.routeCity}>{shipment.pickup_city}</Text>
            </View>
            <Text style={styles.routeArrow}>→</Text>
            <View style={styles.routeItem}>
              <Text style={styles.routeLabel}>TO</Text>
              <Text style={styles.routeCity}>{shipment.delivery_city}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Contents</Text>
            <Text style={styles.detailValue}>{shipment.package_description}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Weight</Text>
            <Text style={styles.detailValue}>{shipment.weight_kg}kg</Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          For full details and history, please sign in to your account.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  content:   { padding: spacing.base, gap: spacing.lg },
  header:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl },
  title:     { ...typography.h2, color: colors.text.primary },
  trackingCard: {
    backgroundColor: colors.brand.primary, borderRadius: radius.lg,
    padding: spacing.xl, gap: spacing.xs,
  },
  trackingLabel: { ...typography.caption, color: colors.text.inverse, opacity: 0.6, letterSpacing: 2 },
  trackingNumber: { ...typography.display, fontSize: 24, color: colors.text.inverse, fontFamily: 'monospace' },
  badgeRow:  { marginTop: spacing.sm },
  infoCard: {
    backgroundColor: colors.surface.card, borderRadius: radius.lg,
    padding: spacing.base, borderWidth: 1, borderColor: colors.surface.border,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  routeItem: { flex: 1 },
  routeLabel: { ...typography.caption, color: colors.text.tertiary, letterSpacing: 1 },
  routeCity:  { ...typography.h3, color: colors.text.primary },
  routeArrow: { ...typography.h2, color: colors.text.tertiary, paddingHorizontal: spacing.sm },
  divider:    { height: 1, backgroundColor: colors.surface.divider, marginVertical: spacing.sm },
  detailRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  detailLabel: { ...typography.caption, color: colors.text.secondary },
  detailValue: { ...typography.bodyBold, color: colors.text.primary },
  disclaimer:  { ...typography.caption, color: colors.text.tertiary, textAlign: 'center', marginTop: spacing.md },
});
