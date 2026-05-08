// app/(admin)/shipments/[id].tsx
import { ALLOWED_TRANSITIONS } from '@courier/shared-constants';
import type { ShipmentStatus } from '@courier/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';


import { Button }      from '../../../src/components/ui/Button';
import { ErrorState }  from '../../../src/components/ui/ErrorState';
import { LoadingState } from '../../../src/components/ui/LoadingState';
import { StatusBadge } from '../../../src/components/ui/StatusBadge';
import { useShipmentHistory, useAdminTransitionMutation } from '../../../src/hooks/use-shipments';
import { colors, spacing, typography, radius } from '../../../src/theme';

export default function AdminShipmentDetailScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();

  const { data: histResult, isLoading, isError, refetch } = useShipmentHistory(id ?? '');
  const { mutate: transition, isPending } = useAdminTransitionMutation(id ?? '');

  const [showModal,        setShowModal]        = useState(false);
  const [targetStatus,     setTargetStatus]     = useState<ShipmentStatus | null>(null);
  const [notes,            setNotes]            = useState('');
  const [rejectionReason,  setRejectionReason]  = useState('');

  if (isLoading) return <LoadingState />;
  if (isError || !histResult) return <ErrorState onRetry={() => void refetch()} />;

  const { shipment, events } = histResult;
  const allowedTransitions   = ALLOWED_TRANSITIONS[shipment.status] ?? [];

  const handleTransition = () => {
    if (!targetStatus) return;
    transition(
      {
        status:           targetStatus,
        notes:            notes || undefined,
        rejection_reason: rejectionReason || undefined,
      },
      {
        onSuccess: () => {
          setShowModal(false);
          setTargetStatus(null);
          setNotes('');
          setRejectionReason('');
        },
      },
    );
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Button variant="ghost" size="sm" onPress={() => router.back()}>← Back</Button>
          <StatusBadge status={shipment.status} />
        </View>

        {/* Tracking */}
        <Text style={styles.trackingNumber}>{shipment.tracking_number}</Text>
        <Text style={styles.route}>{shipment.pickup_city} → {shipment.delivery_city}</Text>

        {/* Admin transition buttons */}
        {allowedTransitions.length > 0 && (
          <View style={styles.transitionSection}>
            <Text style={styles.sectionTitle}>Transition Status</Text>
            <View style={styles.transitionGrid}>
              {allowedTransitions.map((status) => (
                <Button
                  key={status}
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    setTargetStatus(status);
                    setShowModal(true);
                  }}
                >
                  → {status.replace(/_/g, ' ')}
                </Button>
              ))}
            </View>
          </View>
        )}

        {/* Status timeline */}
        <Text style={styles.sectionTitle}>Status Timeline</Text>
        {events.map((event, i) => (
          <View key={event.id} style={styles.eventRow}>
            <View style={styles.eventLine}>
              <View style={styles.eventDot} />
              {i < events.length - 1 && <View style={styles.eventConnector} />}
            </View>
            <View style={styles.eventContent}>
              <Text style={styles.eventStatus}>{event.to_status.replace(/_/g, ' ')}</Text>
              <Text style={styles.eventMeta}>
                {event.actor_role} · {new Date(event.created_at).toLocaleString('en-MW')}
              </Text>
              {event.notes && <Text style={styles.eventNotes}>{event.notes}</Text>}
            </View>
          </View>
        ))}

        {/* Shipment details */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Sender</Text>
          <Text style={styles.detailText}>{shipment.sender_name} · {shipment.sender_phone}</Text>
          <Text style={styles.detailText}>{shipment.sender_address}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Receiver</Text>
          <Text style={styles.detailText}>{shipment.receiver_name} · {shipment.receiver_phone}</Text>
          <Text style={styles.detailText}>{shipment.receiver_address}</Text>
        </View>
      </ScrollView>

      {/* Transition Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={modal.container}>
          <Text style={modal.title}>
            Transition to: {targetStatus?.replace(/_/g, ' ')}
          </Text>

          <TextInput
            style={modal.input}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional notes for this transition"
            placeholderTextColor={colors.text.tertiary}
            multiline
          />

          {targetStatus === 'rejected' && (
            <TextInput
              style={[modal.input, modal.required]}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholder="Rejection reason (required)"
              placeholderTextColor={colors.semantic.danger}
              multiline
            />
          )}

          <View style={modal.actions}>
            <Button variant="ghost" onPress={() => setShowModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              isLoading={isPending}
              disabled={isPending || (targetStatus === 'rejected' && !rejectionReason.trim())}
              onPress={handleTransition}
            >
              Confirm
            </Button>
          </View>
        </View>
      </Modal>
    </>
  );
}

const modal = StyleSheet.create({
  container: {
    flex: 1, padding: spacing.xl, gap: spacing.lg,
    backgroundColor: colors.surface.background, paddingTop: spacing.xxxl,
  },
  title:    { ...typography.h2, color: colors.text.primary },
  input: {
    backgroundColor: colors.surface.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.surface.border,
    padding: spacing.md, ...typography.body, color: colors.text.primary,
    minHeight: 80, textAlignVertical: 'top',
  },
  required: { borderColor: colors.semantic.danger },
  actions:  { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
});

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: colors.surface.background },
  container: { padding: spacing.base, gap: spacing.lg, paddingBottom: spacing.xxxl },
  topRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trackingNumber: { ...typography.display, fontSize: 20, color: colors.text.primary, fontFamily: 'monospace' },
  route:         { ...typography.h3, color: colors.text.secondary },
  sectionTitle:  { ...typography.label, color: colors.text.tertiary, letterSpacing: 1.5, textTransform: 'uppercase' },
  transitionSection: { gap: spacing.sm },
  transitionGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  eventRow:   { flexDirection: 'row', gap: spacing.md },
  eventLine:  { width: 20, alignItems: 'center' },
  eventDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand.accent, marginTop: 4 },
  eventConnector: { flex: 1, width: 2, backgroundColor: colors.surface.border, marginTop: 4 },
  eventContent:   { flex: 1, gap: 2, paddingBottom: spacing.md },
  eventStatus:    { ...typography.bodyBold, color: colors.text.primary, textTransform: 'capitalize' },
  eventMeta:      { ...typography.caption, color: colors.text.tertiary },
  eventNotes:     { ...typography.caption, color: colors.text.secondary },
  card: {
    backgroundColor: colors.surface.card, borderRadius: radius.lg,
    padding: spacing.base, gap: spacing.xs, borderWidth: 1, borderColor: colors.surface.border,
  },
  detailText: { ...typography.body, color: colors.text.secondary },
});
