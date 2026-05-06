// app/(app)/profile/change-password.tsx
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { ChangePasswordSchema, type ChangePasswordInput } from '@courier/shared-validation';

import { Button }                     from '../../../src/components/ui/Button';
import { Input }                      from '../../../src/components/ui/Input';
import { useChangePasswordMutation } from '../../../src/hooks/use-auth';
import { colors, spacing, typography } from '../../../src/theme';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const newPasswordRef     = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const { mutate: changePassword, isPending } = useChangePasswordMutation();

  const { control, handleSubmit, formState: { errors } } = useForm<ChangePasswordInput>({
    resolver: zodResolver(ChangePasswordSchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  });

  const onSubmit = (data: ChangePasswordInput) => changePassword(data);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Button variant="ghost" size="sm" onPress={() => router.back()}>← Back</Button>
        <Text style={styles.title}>Change Password</Text>
      </View>

      <Text style={styles.subtitle}>
        After changing your password, you will be signed out from all devices.
      </Text>

      <View style={styles.card}>
        <Controller
          control={control}
          name="current_password"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Current password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.current_password?.message}
              secureTextEntry
              returnKeyType="next"
              onSubmitEditing={() => newPasswordRef.current?.focus()}
            />
          )}
        />

        <Controller
          control={control}
          name="new_password"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              ref={newPasswordRef}
              label="New password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.new_password?.message}
              secureTextEntry
              returnKeyType="next"
              onSubmitEditing={() => confirmPasswordRef.current?.focus()}
            />
          )}
        />

        <Controller
          control={control}
          name="confirm_password"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              ref={confirmPasswordRef}
              label="Confirm new password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.confirm_password?.message}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSubmit(onSubmit)}
            />
          )}
        />

        <Button
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isPending}
          disabled={isPending}
          onPress={handleSubmit(onSubmit)}
        >
          Update Password
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: colors.surface.background },
  container: { padding: spacing.base, gap: spacing.lg },
  header:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl },
  title:     { ...typography.h2, color: colors.text.primary },
  subtitle:  { ...typography.body, color: colors.text.secondary },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius:    16,
    padding:         spacing.xl,
    gap:             spacing.base,
    borderWidth:     1,
    borderColor:     colors.surface.border,
  },
});
