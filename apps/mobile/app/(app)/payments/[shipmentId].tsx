// app/(app)/payments/[shipmentId].tsx
/**
 * Payment screen.
 */

import { tambalaToMwk } from '@courier/shared-constants';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState, useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';


import type { PaymentMethod } from '../../../src/api/payments';
import { Button }              from '../../../src/components/ui/Button';
import { ErrorState }          from '../../../src/components/ui/ErrorState';
import { Input }               from '../../../src/components/ui/Input';
import { LoadingState }        from '../../../src/components/ui/LoadingState';
import { useInitiatePaymentMutation, useShipmentPayments } from '../../../src/hooks/use-payments';
import { useShipment }         from '../../../src/hooks/use-shipments';
import { colors, spacing, typography, radius } from '../../../src/theme';

type FormValues = {
  method:       PaymentMethod;
  phone_number: string;
};

const PAYMENT_METHODS: Array<{
  key:   PaymentMethod;
  label: string;
  emoji: string;
  requiresPhone: boolean;
}> = [
  { key: 'airtel_money',  label: 'Airtel Money',  emoji: '📱', requiresPhone: true },
  { key: 'tnm_mpamba',    label: 'TNM Mpamba',    emoji: '📲', requiresPhone: true },
  { key: 'bank_transfer', label: 'Bank Transfer', emoji: '🏦', requiresPhone: false },
  { key: 'card',          label: 'Card',          emoji: '💳', requiresPhone: false },
];

export default function PaymentScreen() {
  const { shipmentId } = useLocalSearchParams<{ shipmentId: string }>();
  const router = useRouter();

  const [idemKey] = useState(() =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }),
  );

  const { data: shipment, isLoading: isShipmentLoading, isError } = useShipment(shipmentId ?? '');
  const { data: payments } = useShipmentPayments(shipmentId ?? '');
  const { mutate: initiatePayment, isPending } = useInitiatePaymentMutation();

  const [initiated,    setInitiated]    = useState(false);
  const [ussdPrompted, setUssdPrompted] = useState(false);

  const { control, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: { method: 'airtel_money', phone_number: '' },
  });

  const selectedMethod = watch('method');
  const selectedDef    = PAYMENT_METHODS.find((m) => m.key === selectedMethod);

  // Watch for payment resolution via polling
  useEffect(() => {
    const latestPayment = payments?.[0];
    if (latestPayment?.status === 'paid') {
      const shipmentRoute: Href = {
        pathname: '/(app)/shipments/[id]',
        params: { id: shipmentId ?? '' },
      };
      router.replace(shipmentRoute);
    }
  }, [payments, shipmentId]);

  if (isShipmentLoading) return <LoadingState />;
  if (isError || !shipment) return <ErrorState />;

  const priceMwk = tambalaToMwk(shipment.final_price_mwk ?? shipment.quoted_price_mwk);

  const onPay = (data: FormValues) => {
    initiatePayment(
      {
        shipment_id:     shipmentId ?? '',
        method:          data.method,
        phone_number:    selectedDef?.requiresPhone ? data.phone_number : undefined,
        idempotency_key: idemKey,
      },
      {
        onSuccess: () => {
          setInitiated(true);
          if (selectedDef?.requiresPhone) setUssdPrompted(true);
        },
      },
    );
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Button variant="ghost" size="sm" onPress={() => router.back()}>← Back</Button>
        <Text style={styles.title}>Payment</Text>
      </View>

      <View style={styles.amountCard}>
        <Text style={styles.amountLabel}>AMOUNT DUE</Text>
        <Text style={styles.amount}>MWK {priceMwk.toLocaleString('en-MW')}</Text>
        <Text style={styles.amountFor}>
          {shipment.pickup_city} → {shipment.delivery_city} · {shipment.tracking_number}
        </Text>
      </View>

      {ussdPrompted && (
        <View style={styles.ussdBox}>
          <Text style={styles.ussdTitle}>📱 Check your phone</Text>
          <Text style={styles.ussdBody}>
            A USSD prompt has been sent to your phone.
            Approve the payment by entering your mobile money PIN.
          </Text>
          <Text style={styles.ussdPoll}>Waiting for confirmation…</Text>
        </View>
      )}

      {!initiated && (
        <>
          <Text style={styles.sectionTitle}>Select payment method</Text>

          <Controller
            control={control}
            name="method"
            render={({ field: { value, onChange } }) => (
              <View style={styles.methodGrid}>
                {PAYMENT_METHODS.map((method) => (
                  <MethodCardSelectable
                    key={method.key}
                    label={method.label}
                    emoji={method.emoji}
                    selected={value === method.key}
                    onSelect={() => onChange(method.key)}
                  />
                ))}
              </View>
            )}
          />

          {selectedDef?.requiresPhone && (
            <Controller
              control={control}
              name="phone_number"
              rules={{
                required: 'Phone number is required',
                pattern:  { value: /^\+?[0-9]{9,15}$/, message: 'Invalid phone number' },
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={`${selectedDef.label} phone number`}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.phone_number?.message}
                  placeholder="+265991234567"
                  keyboardType="phone-pad"
                />
              )}
            />
          )}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isPending}
            disabled={isPending}
            onPress={() => {
              void handleSubmit(onPay)();
            }}
          >
            Pay MWK {priceMwk.toLocaleString('en-MW')}
          </Button>
        </>
      )}

      {initiated && !ussdPrompted && (
        <View style={styles.processingBox}>
          <LoadingState message="Processing payment..." />
        </View>
      )}
    </ScrollView>
  );
}

function MethodCardSelectable(props: {
  label:    string;
  emoji:    string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={props.onSelect}
      style={[mcStyles.card, props.selected && mcStyles.selected]}
    >
      <Text style={mcStyles.emoji}>{props.emoji}</Text>
      <Text style={mcStyles.label}>{props.label}</Text>
    </Pressable>
  );
}

const mcStyles = StyleSheet.create({
  card: {
    flexBasis: '48%', padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.surface.border,
    alignItems: 'center', gap: spacing.xs,
  },
  selected: { borderColor: colors.brand.accent, backgroundColor: `${colors.brand.accent}08` },
  emoji:    { fontSize: 28 },
  label:    { ...typography.label, color: colors.text.primary, textAlign: 'center' },
});

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: colors.surface.background },
  container: { padding: spacing.base, gap: spacing.lg, paddingBottom: spacing.xxxl },
  header:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title:     { ...typography.h2, color: colors.text.primary },
  amountCard: {
    backgroundColor: colors.brand.primary, borderRadius: radius.lg,
    padding: spacing.xl, alignItems: 'center', gap: spacing.xs,
  },
  amountLabel: { ...typography.caption, color: colors.text.inverse, opacity: 0.6, letterSpacing: 2 },
  amount:      { fontSize: 40, fontWeight: '800', color: colors.text.inverse },
  amountFor:   { ...typography.caption, color: colors.text.inverse, opacity: 0.6, textAlign: 'center' },
  ussdBox: {
    backgroundColor: `${colors.semantic.info}12`, borderRadius: radius.lg,
    padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: `${colors.semantic.info}30`,
  },
  ussdTitle:   { ...typography.h3, color: colors.semantic.info },
  ussdBody:    { ...typography.body, color: colors.text.secondary },
  ussdPoll:    { ...typography.caption, color: colors.text.tertiary },
  sectionTitle:{ ...typography.h3, color: colors.text.primary },
  methodGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  processingBox: { flex: 1, minHeight: 200 },
});
