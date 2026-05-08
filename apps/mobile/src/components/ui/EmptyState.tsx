// src/components/ui/EmptyState.tsx
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography, radius } from '../../theme';

import { Button } from './Button';

interface EmptyStateProps {
  emoji:        string;
  title:        string;
  description?: string;
  action?:      { label: string; onPress: () => void };
}

export function EmptyState({ emoji, title, description, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.emojiBox}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {action && (
        <Button variant="primary" onPress={action.onPress}>{action.label}</Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: spacing.xxl, gap: spacing.md,
  },
  emojiBox: {
    width: 80, height: 80, borderRadius: radius.xl,
    backgroundColor: colors.surface.divider,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji:       { fontSize: 36 },
  title:       { ...typography.h3, color: colors.text.primary, textAlign: 'center' },
  description: { ...typography.body, color: colors.text.secondary, textAlign: 'center' },
});
