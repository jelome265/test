// src/components/layout/AppErrorBoundary.tsx
/**
 * Top-level React error boundary.
 * Catches JS errors that bubble up from the component tree.
 * Reports to Sentry (if configured) before showing the fallback UI.
 */

import React, { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';

import { colors, spacing, typography } from '../../theme';

interface Props  { children: ReactNode }
interface State  { hasError: boolean; eventId: string | null }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, eventId: null };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const eventId = Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
    this.setState({ eventId: eventId ?? null });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, eventId: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>💥</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>
          The app encountered an unexpected error. The team has been notified.
        </Text>
        {this.state.eventId && (
          <Text style={styles.eventId}>
            Error ID: {this.state.eventId.slice(0, 8).toUpperCase()}
          </Text>
        )}
        <Pressable style={styles.button} onPress={this.handleReset}>
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    padding:         spacing.xxl,
    backgroundColor: colors.surface.background,
    gap:             spacing.md,
  },
  emoji:     { fontSize: 48 },
  title:     { ...typography.h2, color: colors.text.primary, textAlign: 'center' },
  subtitle:  { ...typography.body, color: colors.text.secondary, textAlign: 'center' },
  eventId:   { ...typography.caption, color: colors.text.tertiary, fontFamily: 'monospace' },
  button: {
    backgroundColor: colors.brand.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical:   spacing.md,
    borderRadius:      8,
    marginTop:         spacing.md,
  },
  buttonText: { ...typography.bodyBold, color: colors.text.inverse },
});
