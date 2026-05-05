// src/components/layout/ScreenContainer.tsx
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { colors, spacing } from '../../theme';

interface ScreenContainerProps {
  children:       React.ReactNode;
  scrollable?:    boolean;
  padded?:        boolean;
  style?:         ViewStyle;
}

export function ScreenContainer({
  children,
  scrollable  = false,
  padded      = true,
  style,
}: ScreenContainerProps) {
  const content = scrollable ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, padded && styles.padded, style]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, padded && styles.padded, style]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: colors.surface.background },
  kav:           { flex: 1 },
  content:       { flex: 1 },
  scrollContent: { flexGrow: 1 },
  padded:        { padding: spacing.base },
});
