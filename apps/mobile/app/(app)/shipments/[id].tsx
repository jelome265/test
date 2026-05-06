// app/(app)/shipments/[id].tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { tambalaToMwk } from '@courier/shared-constants';

import { Button }       from '../../../src/components/ui/Button';
import { ErrorState }   from '../../../src/components/ui/ErrorState';
import { LoadingState } from '../../../src/components/ui/LoadingState';
import { StatusBadge }  from '../../../src/components/ui/StatusBadge';
import {
  useShipment,
  useConfirmDeliveryMutation,
  useCancelShipmentMutation,
} from '../../../src/hooks/use-shipments';
import { colors, spacing, typography, radius } from '../../../src/theme';

export default function ShipmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: shipment, isLoading, isError, refetch } = useShipment(id ?? '');
  const { mutate: confirm, isPending: isConfirming }    = useConfirmDeliveryMutation(id ?? '');
  const { mutate: cancel,  isPending: isCancelling }    = useCancelShipmentMutation(id ?? '');

  if (isLoading) return <LoadingState />;
  if (isError || !shipment) return <ErrorState onRetry={() => void refetch()} />;

  const priceMwk = tambalaToMwk(shipment.final_price_mwk ?? shipment.quoted_price_mwk);

  const handleCancel = () => {
    Alert.alert(
      'Cancel Shipment',
      'Are you sure you want to cancel this request?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Cancel', style: 'destructive', onPress: () => cancel(undefined) },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => void refetch()}
            tintColor={colors.brand.accent}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Button variant="ghost" size="sm" onPress={() => router.back()}>← Back</Button>
          <StatusBadge status={shipment.status} />
        </View>

        <Text style={styles.trackingNumber}>{shipment.tracking_number}</Text>
        <Text style={styles.route}>{shipment.pickup_city} → {shipment.delivery_city}</Text>

        {/* Action Button Section */}
        <View style={styles.actionBox}>
          {shipment.status === 'approved' && (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onPress={() => router.push(`/(app)/payments/${shipment.id}` as any)}
            >
              Pay MWK {priceMwk.toLocaleString('en-MW')}
            </Button>
          )}

          {shipment.status === 'delivered' && (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isConfirming}
              onPress={() => confirm()}
            >
              Confirm Receipt
            </Button>
          )}

          {['pending_approval', 'approved', 'payment_confirmed'].includes(shipment.status) && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isCancelling}
              onPress={handleCancel}
            >
              Cancel Request
            </Button>
          )}
        </View>

        {/* Info Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SHIPMENT DETAILS</Text>
          <View style={styles.card}>
            <DetailRow label="Contents" value={shipment.package_description} />
            <DetailRow label="Weight"   value={`${shipment.weight_kg}kg`} />
            <DetailRow label="Size"     value={shipment.package_size} />
            <DetailRow label="Fragile"  value={shipment.is_fragile ? 'Yes' : 'No'} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SENDER</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{shipment.sender_name}</Text>
            <Text style={styles.cardText}>{shipment.sender_phone}</Text>
            <Text style={styles.cardText}>{shipment.sender_address}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RECEIVER</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{shipment.receiver_name}</Text>
            <Text style={styles.cardText}>{shipment.receiver_phone}</Text>
            <Text style={styles.cardText}>{shipment.receiver_address}</Text>
          </View>
        </View>

        {shipment.rejection_reason && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.semantic.danger }]}>
              REJECTION REASON
            </Text>
            <View style={[styles.card, { borderColor: colors.semantic.danger }]}>
              <Text style={styles.cardText}>{shipment.rejection_reason}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={drStyles.row}>
      <Text style={drStyles.label}>{label}</Text>
      <Text style={drStyles.value}>{value}</Text>
    </View>
  );
}

const drStyles = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  label: { ...typography.caption, color: colors.text.secondary, letterSpacing: 0.5 },
  value: { ...typography.bodyBold, color: colors.text.primary },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  scroll:    { flex: 1 },
  content:   { padding: spacing.base, gap: spacing.lg, paddingBottom: spacing.xxxl },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trackingNumber: { ...typography.display, fontSize: 24, color: colors.text.primary, fontFamily: 'monospace' },
  route:     { ...typography.h3, color: colors.text.secondary },
  actionBox: { gap: spacing.md, marginTop: spacing.xs },
  section:   { gap: spacing.xs },
  sectionTitle: { ...typography.caption, color: colors.text.tertiary, letterSpacing: 1.5 },
  card: {
    backgroundColor: colors.surface.card, borderRadius: radius.lg,
    padding: spacing.base, borderWidth: 1, borderColor: colors.surface.border,
  },
  cardTitle: { ...typography.bodyBold, color: colors.text.primary, marginBottom: 2 },
  cardText:  { ...typography.body, color: colors.text.secondary },
});
