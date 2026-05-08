// app/(app)/shipments/create/step-3.tsx
import { tambalaToMwk } from '@courier/shared-constants';
import type { CreateShipmentInput } from '@courier/shared-validation';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';


import { Button }                    from '../../../../src/components/ui/Button';
import { useCreateShipmentMutation , useQuote } from '../../../../src/hooks/use-shipments';
import { useDraftStore }             from '../../../../src/stores/shipment-draft.store';
import { colors, spacing, typography, radius } from '../../../../src/theme';

export default function CreateStep3() {
  const router  = useRouter();
  const draft   = useDraftStore();
  const { mutate: createShipment, isPending } = useCreateShipmentMutation();

  const { data: quote, isLoading: isQuoteLoading } = useQuote(
    draft.sender.city && draft.receiver.city && draft.package.weight_kg !== ''
      ? {
          pickup_city:   draft.sender.city,
          delivery_city: draft.receiver.city,
          weight_kg:     draft.package.weight_kg,
          is_fragile:    draft.package.is_fragile,
        }
      : null,
  );

  useEffect(() => {
    if (quote) {
      draft.setQuotedPrice(quote.total_mwk);
    }
  }, [quote]);

  const onSubmit = () => {
    if (
      !draft.sender.city
      || !draft.receiver.city
      || draft.package.weight_kg === ''
      || draft.package.size === ''
    ) {
      return;
    }

    const payload: CreateShipmentInput = {
      sender: {
        full_name:    draft.sender.full_name,
        phone_number: draft.sender.phone_number,
        email:        draft.sender.email,
        address:      draft.sender.address,
        city:         draft.sender.city,
      },
      receiver: {
        full_name:    draft.receiver.full_name,
        phone_number: draft.receiver.phone_number,
        email:        draft.receiver.email,
        address:      draft.receiver.address,
        city:         draft.receiver.city,
      },
      package: {
        weight_kg:   draft.package.weight_kg,
        size:        draft.package.size,
        description: draft.package.description,
        is_fragile:  draft.package.is_fragile,
      },
      delivery_notes: draft.delivery_notes,
    };

    createShipment(payload);
  };

  const priceMwk = quote ? tambalaToMwk(quote.total_mwk) : null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Progress */}
      <View style={styles.progress}>
        <View style={[styles.progressStep, styles.progressDone]} />
        <View style={[styles.progressStep, styles.progressDone]} />
        <View style={[styles.progressStep, styles.progressActive]} />
      </View>

      <Text style={styles.stepLabel}>STEP 3 OF 3</Text>
      <Text style={styles.title}>Review & Confirm</Text>

      {/* Route summary */}
      <View style={styles.routeCard}>
        <Text style={styles.routeFrom}>{draft.sender.city}</Text>
        <Text style={styles.routeArrow}>→</Text>
        <Text style={styles.routeTo}>{draft.receiver.city}</Text>
      </View>

      {/* Summary rows */}
      <View style={styles.card}>
        <ReviewRow label="From"     value={`${draft.sender.full_name}\n${draft.sender.address}`} />
        <ReviewRow label="To"       value={`${draft.receiver.full_name}\n${draft.receiver.address}`} />
        <ReviewRow label="Weight"   value={`${draft.package.weight_kg}kg`} />
        <ReviewRow label="Size"     value={String(draft.package.size)} />
        <ReviewRow label="Fragile"  value={draft.package.is_fragile ? 'Yes' : 'No'} />
        <ReviewRow label="Contents" value={draft.package.description} />
      </View>

      {/* Price estimate */}
      <View style={styles.priceCard}>
        <Text style={styles.priceLabel}>ESTIMATED PRICE</Text>
        {isQuoteLoading ? (
          <ActivityIndicator size="small" color={colors.brand.accent} />
        ) : priceMwk !== null ? (
          <>
            <Text style={styles.price}>MWK {priceMwk.toLocaleString('en-MW')}</Text>
            {quote && (
              <Text style={styles.priceBreakdown}>
                Base + {quote.distance_km}km route + weight + surcharges
              </Text>
            )}
          </>
        ) : (
          <Text style={styles.priceUnavailable}>Price will be calculated</Text>
        )}
        <Text style={styles.priceNote}>
          Final price may be adjusted by admin before payment.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button variant="ghost" onPress={() => router.back()}>← Back</Button>
        <Button
          variant="primary"
          size="lg"
          style={styles.submitBtn}
          isLoading={isPending}
          disabled={isPending || isQuoteLoading}
          onPress={onSubmit}
        >
          Submit Request
        </Button>
      </View>
    </ScrollView>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={rrStyles.row}>
      <Text style={rrStyles.label}>{label}</Text>
      <Text style={rrStyles.value}>{value}</Text>
    </View>
  );
}

const rrStyles = StyleSheet.create({
  row:   { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
  label: { ...typography.body, color: colors.text.secondary, width: 72 },
  value: { ...typography.bodyBold, color: colors.text.primary, flex: 1 },
});

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: colors.surface.background },
  container: { padding: spacing.base, gap: spacing.lg, paddingBottom: spacing.xxxl },
  progress:  { flexDirection: 'row', gap: spacing.sm },
  progressStep:   { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.surface.border },
  progressActive: { backgroundColor: colors.brand.accent },
  progressDone:   { backgroundColor: colors.semantic.success },
  stepLabel: { ...typography.caption, color: colors.text.tertiary, letterSpacing: 2 },
  title:     { ...typography.h1, color: colors.text.primary },
  routeCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.md, backgroundColor: colors.brand.primary,
    borderRadius: radius.lg, padding: spacing.lg,
  },
  routeFrom:  { ...typography.h2, color: colors.text.inverse },
  routeArrow: { ...typography.h2, color: colors.text.inverse, opacity: 0.5 },
  routeTo:    { ...typography.h2, color: colors.text.inverse },
  card: {
    backgroundColor: colors.surface.card, borderRadius: radius.lg,
    padding: spacing.base, gap: spacing.sm,
    borderWidth: 1, borderColor: colors.surface.border,
  },
  priceCard: {
    backgroundColor: colors.surface.card, borderRadius: radius.lg,
    padding: spacing.lg, gap: spacing.xs, alignItems: 'center',
    borderWidth: 2, borderColor: colors.brand.accent,
  },
  priceLabel:       { ...typography.caption, color: colors.text.tertiary, letterSpacing: 2 },
  price:            { ...typography.display, color: colors.brand.accent },
  priceBreakdown:   { ...typography.caption, color: colors.text.secondary, textAlign: 'center' },
  priceUnavailable: { ...typography.body, color: colors.text.tertiary },
  priceNote:        { ...typography.caption, color: colors.text.tertiary, textAlign: 'center' },
  actions:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  submitBtn: { flex: 1, marginLeft: spacing.md },
});
