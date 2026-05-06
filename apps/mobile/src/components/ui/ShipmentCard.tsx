// src/components/ui/ShipmentCard.tsx
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Shipment } from '@courier/shared-types';
import { tambalaToMwk } from '@courier/shared-constants';

import { colors, spacing, radius, typography } from '../../theme';
import { StatusBadge } from './StatusBadge';

interface ShipmentCardProps {
  shipment:  Shipment;
  adminMode?: boolean;
}

export function ShipmentCard({ shipment, adminMode = false }: ShipmentCardProps) {
  const router = useRouter();

  const basePath = adminMode ? '/(admin)/shipments' : '/(app)/shipments';
  const price    = shipment.final_price_mwk ?? shipment.quoted_price_mwk;
  const priceMwk = tambalaToMwk(price);

  return (
    <Pressable
      onPress={() => router.push(`${basePath}/${shipment.id}` as any)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Shipment ${shipment.tracking_number}`}
    >
      {/* Header row */}
      <View style={styles.header}>
        <Text style={styles.trackingNumber} numberOfLines={1}>
          {shipment.tracking_number}
        </Text>
        <StatusBadge status={shipment.status} size="sm" />
      </View>

      {/* Route row */}
      <View style={styles.route}>
        <Text style={styles.city} numberOfLines={1}>{shipment.pickup_city}</Text>
        <Text style={styles.arrow}>→</Text>
        <Text style={styles.city} numberOfLines={1}>{shipment.delivery_city}</Text>
      </View>

      {/* Meta row */}
      <View style={styles.meta}>
        <Text style={styles.metaItem}>
          {shipment.weight_kg}kg · {shipment.package_size}
        </Text>
        <Text style={styles.price}>
          MWK {priceMwk.toLocaleString('en-MW')}
        </Text>
      </View>

      {/* Date */}
      <Text style={styles.date}>
        {new Date(shipment.created_at).toLocaleDateString('en-MW', {
          day: 'numeric', month: 'short', year: 'numeric',
        })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface.card,
    borderRadius:    radius.lg,
    padding:         spacing.base,
    borderWidth:     1,
    borderColor:     colors.surface.border,
    gap:             spacing.sm,
  },
  cardPressed: {
    backgroundColor: colors.surface.divider,
  },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            spacing.sm,
  },
  trackingNumber: {
    ...typography.mono,
    color:      colors.text.primary,
    flex:       1,
  },
  route: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  city: {
    ...typography.bodyBold,
    color: colors.text.primary,
    flex:  1,
  },
  arrow: {
    ...typography.body,
    color: colors.text.tertiary,
  },
  meta: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  metaItem: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  price: {
    ...typography.bodyBold,
    color: colors.brand.accent,
  },
  date: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
});
