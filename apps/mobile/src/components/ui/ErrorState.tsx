// src/components/ui/ErrorState.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';
import { Button } from './Button';

interface ErrorStateProps {
  title?:   string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title   = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconBox}>
        <Text style={styles.icon}>⚠</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <Button variant="secondary" onPress={onRetry}>Try Again</Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl, gap: spacing.md,
  },
  iconBox: {
    width: 64, height: 64, borderRadius: radius.xl,
    backgroundColor: `${colors.semantic.danger}15`,
    alignItems: 'center', justifyContent: 'center',
  },
  icon:    { fontSize: 28 },
  title:   { ...typography.h3, color: colors.text.primary, textAlign: 'center' },
  message: { ...typography.body, color: colors.text.secondary, textAlign: 'center' },
});
