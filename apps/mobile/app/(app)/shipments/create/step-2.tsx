// app/(app)/shipments/create/step-2.tsx
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';

import { SUPPORTED_CITIES } from '@courier/shared-constants';
import type { SupportedCity, PackageSize } from '@courier/shared-types';

import { Button } from '../../../../src/components/ui/Button';
import { Input }  from '../../../../src/components/ui/Input';
import { useDraftStore } from '../../../../src/stores/shipment-draft.store';
import { colors, spacing, typography, radius } from '../../../../src/theme';

type FormValues = {
  // Receiver
  receiver_full_name:    string;
  receiver_phone_number: string;
  receiver_address:      string;
  receiver_city:         SupportedCity;
  // Package
  weight_kg:    string;  // String for text input, parsed on submit
  size:         PackageSize;
  description:  string;
  is_fragile:   boolean;
};

export default function CreateStep2() {
  const router      = useRouter();
  const { receiver: savedReceiver, package: savedPkg, setReceiver, setPackage } = useDraftStore();

  const { control, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormValues>({
    defaultValues: {
      receiver_full_name:    savedReceiver.full_name,
      receiver_phone_number: savedReceiver.phone_number,
      receiver_address:      savedReceiver.address,
      receiver_city:         (savedReceiver.city as SupportedCity) || 'Blantyre',
      weight_kg:             savedPkg.weight_kg !== '' ? String(savedPkg.weight_kg) : '',
      size:                  (savedPkg.size as PackageSize) || 'medium',
      description:           savedPkg.description,
      is_fragile:            savedPkg.is_fragile,
    },
  });

  const selectedReceiverCity = watch('receiver_city');
  const selectedSize         = watch('size');
  const isFragile            = watch('is_fragile');

  const onNext = (data: FormValues) => {
    const weightNum = parseFloat(data.weight_kg);
    if (isNaN(weightNum) || weightNum <= 0 || weightNum > 10) {
      return; // Validation handled by form errors below
    }

    setReceiver({
      full_name:    data.receiver_full_name,
      phone_number: data.receiver_phone_number,
      address:      data.receiver_address,
      city:         data.receiver_city,
    });
    setPackage({
      weight_kg:   weightNum,
      size:        data.size,
      description: data.description,
      is_fragile:  data.is_fragile,
    });
    router.push('/(app)/shipments/create/step-3');
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Progress */}
      <View style={styles.progress}>
        <View style={[styles.progressStep, styles.progressDone]} />
        <View style={[styles.progressStep, styles.progressActive]} />
        <View style={styles.progressStep} />
      </View>

      <Text style={styles.stepLabel}>STEP 2 OF 3</Text>
      <Text style={styles.title}>Receiver & Package</Text>

      {/* Receiver section */}
      <Text style={styles.sectionTitle}>Receiver</Text>
      <View style={styles.form}>
        <Controller
          control={control}
          name="receiver_full_name"
          rules={{ required: 'Name is required', minLength: { value: 2, message: 'Too short' } }}
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Full name"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.receiver_full_name?.message}
              placeholder="Receiver's full name"
              autoCapitalize="words"
            />
          )}
        />

        <Controller
          control={control}
          name="receiver_phone_number"
          rules={{ required: 'Phone is required', pattern: { value: /^\+?[0-9]{9,15}$/, message: 'Invalid phone' } }}
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Phone number"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.receiver_phone_number?.message}
              placeholder="+265881234567"
              keyboardType="phone-pad"
            />
          )}
        />

        <Controller
          control={control}
          name="receiver_address"
          rules={{ required: 'Address is required', minLength: { value: 5, message: 'Too short' } }}
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Delivery address"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.receiver_address?.message}
              placeholder="Delivery address"
              multiline
              numberOfLines={2}
            />
          )}
        />

        {/* Receiver city */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Delivery city</Text>
          <View style={styles.cityRow}>
            {SUPPORTED_CITIES.map((city) => (
              <View
                key={city}
                style={[styles.chip, selectedReceiverCity === city && styles.chipSelected]}
              >
                <Text
                  style={[styles.chipText, selectedReceiverCity === city && styles.chipTextSelected]}
                  onPress={() => setValue('receiver_city', city as SupportedCity)}
                >
                  {city}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Package section */}
      <Text style={styles.sectionTitle}>Package</Text>
      <View style={styles.form}>
        <Controller
          control={control}
          name="weight_kg"
          rules={{
            required: 'Weight is required',
            validate: (v) => {
              const n = parseFloat(v);
              if (isNaN(n)) return 'Must be a number';
              if (n < 0.1)  return 'Minimum 0.1kg';
              if (n > 10)   return 'Maximum 10kg';
              return true;
            },
          }}
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Weight (kg) — max 10kg"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.weight_kg?.message}
              placeholder="e.g. 2.5"
              keyboardType="decimal-pad"
            />
          )}
        />

        {/* Size picker */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Package size</Text>
          <View style={styles.sizeRow}>
            {(['small', 'medium', 'large'] as PackageSize[]).map((s) => (
              <View key={s} style={[styles.sizeChip, selectedSize === s && styles.chipSelected]}>
                <Text
                  style={[styles.chipText, selectedSize === s && styles.chipTextSelected]}
                  onPress={() => setValue('size', s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
                <Text style={styles.sizeHint}>
                  {s === 'small' ? '≤1kg' : s === 'medium' ? '1–5kg' : '5–10kg'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Controller
          control={control}
          name="description"
          rules={{ required: 'Description is required', minLength: { value: 3, message: 'Too short' } }}
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Package contents"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.description?.message}
              placeholder="e.g. Books, clothes, electronics"
              multiline
            />
          )}
        />

        {/* Fragile toggle */}
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Fragile package</Text>
            <Text style={styles.toggleHint}>Handle with care — adds MWK 500 surcharge</Text>
          </View>
          <Switch
            value={isFragile}
            onValueChange={(v) => setValue('is_fragile', v)}
            trackColor={{ false: colors.surface.border, true: `${colors.brand.accent}50` }}
            thumbColor={isFragile ? colors.brand.accent : colors.text.tertiary}
          />
        </View>
      </View>

      <View style={styles.actions}>
        <Button variant="ghost" onPress={() => router.back()}>← Back</Button>
        <Button variant="primary" size="lg" style={styles.nextBtn} onPress={handleSubmit(onNext)}>
          Review →
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: colors.surface.background },
  container: { padding: spacing.base, gap: spacing.lg, paddingBottom: spacing.xxxl },
  progress:  { flexDirection: 'row', gap: spacing.sm },
  progressStep:   { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.surface.border },
  progressActive: { backgroundColor: colors.brand.accent },
  progressDone:   { backgroundColor: colors.semantic.success },
  stepLabel:    { ...typography.caption, color: colors.text.tertiary, letterSpacing: 2 },
  title:        { ...typography.h1, color: colors.text.primary },
  sectionTitle: { ...typography.h3, color: colors.text.primary },
  form:         { gap: spacing.base },
  fieldGroup:   { gap: spacing.xs },
  fieldLabel:   { ...typography.label, color: colors.text.secondary },
  cityRow:      { flexDirection: 'row', gap: spacing.sm },
  sizeRow:      { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.surface.border, alignItems: 'center',
  },
  sizeChip: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.surface.border, alignItems: 'center', gap: 2,
  },
  chipSelected:     { borderColor: colors.brand.accent, backgroundColor: `${colors.brand.accent}10` },
  chipText:         { ...typography.bodyBold, color: colors.text.secondary },
  chipTextSelected: { color: colors.brand.accent },
  sizeHint:         { ...typography.caption, color: colors.text.tertiary },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface.card, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.surface.border,
  },
  toggleLabel: { ...typography.bodyBold, color: colors.text.primary },
  toggleHint:  { ...typography.caption, color: colors.text.secondary },
  actions:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  nextBtn:     { flex: 1, marginLeft: spacing.md },
});
