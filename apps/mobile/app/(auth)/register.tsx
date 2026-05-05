// app/(auth)/register.tsx
import { Link } from 'expo-router';
import React, { useRef } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { RegisterSchema, type RegisterInput } from '@courier/shared-validation';

import { Button }              from '../../src/components/ui/Button';
import { Input }               from '../../src/components/ui/Input';
import { useRegisterMutation } from '../../src/hooks/use-auth';
import { colors, spacing, typography } from '../../src/theme';

export default function RegisterScreen() {
  const fullNameRef = useRef<TextInput>(null);
  const phoneRef    = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const { mutate: register, isPending } = useRegisterMutation();

  const { control, handleSubmit, formState: { errors } } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { email: '', password: '', full_name: '', phone_number: '' },
  });

  const onSubmit = (data: RegisterInput) => register(data);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.logo}>COURIER</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>
          Send packages across Lilongwe, Blantyre, and Mzuzu.
        </Text>

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Email address"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.email?.message}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
              onSubmitEditing={() => fullNameRef.current?.focus()}
            />
          )}
        />

        <Controller
          control={control}
          name="full_name"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              ref={fullNameRef}
              label="Full name"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.full_name?.message}
              placeholder="Chisomo Banda"
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
            />
          )}
        />

        <Controller
          control={control}
          name="phone_number"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              ref={phoneRef}
              label="Phone number"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.phone_number?.message}
              placeholder="+265991234567"
              keyboardType="phone-pad"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              ref={passwordRef}
              label="Password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
              placeholder="Min 8 chars, 1 uppercase, 1 number, 1 symbol"
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
          Create account
        </Button>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Link href="/(auth)/login" asChild>
          <Text style={styles.link}>Sign in</Text>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: colors.brand.primary },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.xl },
  header:    { alignItems: 'center' },
  logo:      { fontSize: 32, fontWeight: '800', letterSpacing: 6, color: colors.text.inverse },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius:    16,
    padding:         spacing.xl,
    gap:             spacing.base,
  },
  title:    { ...typography.h2, color: colors.text.primary },
  subtitle: { ...typography.body, color: colors.text.secondary },
  footer:   { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { ...typography.body, color: colors.text.inverse, opacity: 0.7 },
  link:     { ...typography.bodyBold, color: colors.text.inverse, textDecorationLine: 'underline' },
});
