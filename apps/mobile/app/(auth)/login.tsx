// app/(auth)/login.tsx
import { LoginSchema, type LoginInput } from '@courier/shared-validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type {
  TextInput} from 'react-native';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';


import { Button }           from '../../src/components/ui/Button';
import { Input }            from '../../src/components/ui/Input';
import { useLoginMutation } from '../../src/hooks/use-auth';
import { colors, spacing, typography } from '../../src/theme';

export default function LoginScreen() {
  const passwordRef = useRef<TextInput>(null);
  const { mutate: login, isPending } = useLoginMutation();

  const { control, handleSubmit, formState: { errors } } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = (data: LoginInput) => login(data);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Wordmark */}
      <View style={styles.header}>
        <Text style={styles.logo}>COURIER</Text>
        <Text style={styles.tagline}>Malawi's regional delivery platform</Text>
      </View>

      {/* Form card */}
      <View style={styles.card}>
        <Text style={styles.title}>Sign in</Text>

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
              autoComplete="email"
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
              placeholder="Your password"
              secureTextEntry
              autoComplete="password"
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
          Sign in
        </Button>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Don't have an account? </Text>
        <Link href="/(auth)/register" asChild>
          <Text style={styles.link}>Create account</Text>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: colors.brand.primary },
  container: {
    flexGrow:        1,
    justifyContent:  'center',
    padding:         spacing.xl,
    gap:             spacing.xl,
  },
  header: {
    alignItems: 'center',
    gap:        spacing.xs,
  },
  logo: {
    fontSize:      36,
    fontWeight:    '800',
    letterSpacing: 6,
    color:         colors.text.inverse,
  },
  tagline: {
    ...typography.caption,
    color:         colors.text.inverse,
    opacity:       0.6,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius:    16,
    padding:         spacing.xl,
    gap:             spacing.base,
  },
  title: {
    ...typography.h2,
    color:        colors.text.primary,
    marginBottom: spacing.xs,
  },
  footer: {
    flexDirection:  'row',
    justifyContent: 'center',
    alignItems:     'center',
  },
  footerText: {
    ...typography.body,
    color: colors.text.inverse,
    opacity: 0.7,
  },
  link: {
    ...typography.bodyBold,
    color: colors.text.inverse,
    textDecorationLine: 'underline',
  },
});
