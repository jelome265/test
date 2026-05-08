// app/(app)/shipments/create/step-1.tsx
import { SUPPORTED_CITIES } from '@courier/shared-constants';
import type { SupportedCity } from '@courier/shared-types';
import { SenderSchema } from '@courier/shared-validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, Text, View } from 'react-native';


import { Button }  from '../../../../src/components/ui/Button';
import { Input }   from '../../../../src/components/ui/Input';
import { useDraftStore } from '../../../../src/stores/shipment-draft.store';
import { colors, spacing, typography, radius } from '../../../../src/theme';

type FormValues = {
  full_name:    string;
  phone_number: string;
  email?:       string;
  address:      string;
  city:         SupportedCity;
};

export default function CreateStep1() {
  const router    = useRouter();
  const setSender = useDraftStore((s) => s.setSender);
  const saved     = useDraftStore((s) => s.sender);

  const { control, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormValues>({
    resolver: zodResolver(SenderSchema.omit({ coordinates: true })),
    defaultValues: {
      full_name:    saved.full_name,
      phone_number: saved.phone_number,
      email:        saved.email ?? '',
      address:      saved.address,
      city:         (saved.city as SupportedCity) || 'Lilongwe',
    },
  });

  const selectedCity = watch('city');

  const onNext = (data: FormValues) => {
    setSender({ ...data, email: data.email || undefined });
    router.push('/(app)/shipments/create/step-2');
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Progress indicator */}
      <View style={styles.progress}>
        <View style={[styles.progressStep, styles.progressActive]} />
        <View style={styles.progressStep} />
        <View style={styles.progressStep} />
      </View>

      <Text style={styles.stepLabel}>STEP 1 OF 3</Text>
      <Text style={styles.title}>Sender details</Text>
      <Text style={styles.subtitle}>Who is sending the package?</Text>

      <View style={styles.form}>
        <Controller
          control={control}
          name="full_name"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Full name"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.full_name?.message}
              placeholder="Chisomo Banda"
              autoCapitalize="words"
            />
          )}
        />

        <Controller
          control={control}
          name="phone_number"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Phone number"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.phone_number?.message}
              placeholder="+265991234567"
              keyboardType="phone-pad"
            />
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Email address (optional)"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.email?.message}
              placeholder="optional@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          )}
        />

        <Controller
          control={control}
          name="address"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Pickup address"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.address?.message}
              placeholder="House number, street, area"
              multiline
              numberOfLines={2}
            />
          )}
        />

        {/* City picker */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Pickup city</Text>
          <View style={styles.cityRow}>
            {SUPPORTED_CITIES.map((city) => (
              <CityChip
                key={city}
                label={city}
                selected={selectedCity === city}
                onPress={() => setValue('city', city as SupportedCity, { shouldValidate: true })}
              />
            ))}
          </View>
          {errors.city && <Text style={styles.errorText}>{errors.city.message}</Text>}
        </View>
      </View>

      <View style={styles.actions}>
        <Button variant="ghost" onPress={() => router.back()}>← Cancel</Button>
        <Button variant="primary" size="lg" style={styles.nextBtn} onPress={handleSubmit(onNext)}>
          Next →
        </Button>
      </View>
    </ScrollView>
  );
}

function CityChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <View
      style={[chipStyles.chip, selected && chipStyles.selected]}
    >
      <Text
        style={[chipStyles.text, selected && chipStyles.selectedText]}
        onPress={onPress}
      >
        {label}
      </Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.surface.border,
    alignItems: 'center',
  },
  selected:      { borderColor: colors.brand.accent, backgroundColor: `${colors.brand.accent}10` },
  text:          { ...typography.bodyBold, color: colors.text.secondary },
  selectedText:  { color: colors.brand.accent },
});

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: colors.surface.background },
  container: { padding: spacing.base, gap: spacing.lg, paddingBottom: spacing.xxxl },
  progress:  { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  progressStep:   { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.surface.border },
  progressActive: { backgroundColor: colors.brand.accent },
  stepLabel: { ...typography.caption, color: colors.text.tertiary, letterSpacing: 2 },
  title:     { ...typography.h1, color: colors.text.primary },
  subtitle:  { ...typography.body, color: colors.text.secondary },
  form:      { gap: spacing.base },
  fieldGroup:{ gap: spacing.xs },
  fieldLabel:{ ...typography.label, color: colors.text.secondary },
  cityRow:   { flexDirection: 'row', gap: spacing.sm },
  errorText: { ...typography.caption, color: colors.semantic.danger },
  actions:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  nextBtn:   { flex: 1, marginLeft: spacing.md },
});
