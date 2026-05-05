// src/components/ui/Button.tsx
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

import { colors, spacing, radius, typography, TOUCH_TARGET } from '../../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size    = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  variant?:   Variant;
  size?:      Size;
  isLoading?: boolean;
  children:   React.ReactNode;
  fullWidth?: boolean;
  style?:     ViewStyle;
}

export function Button({
  variant   = 'primary',
  size      = 'md',
  isLoading = false,
  disabled,
  children,
  fullWidth = false,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ busy: isLoading, disabled: isDisabled }}
      {...rest}
    >
      {isLoading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.text.inverse : colors.brand.accent}
        />
      ) : (
        <Text
          style={[
            styles.label,
            styles[`${variant}Label` as keyof typeof styles],
            styles[`${size}Label` as keyof typeof styles],
          ]}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight:      TOUCH_TARGET,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    flexDirection:  'row',
    gap:            spacing.sm,
  },
  fullWidth: { width: '100%' },
  pressed:   { opacity: 0.8 },
  disabled:  { opacity: 0.45 },

  // Variants
  primary: {
    backgroundColor: colors.brand.accent,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth:     1.5,
    borderColor:     colors.brand.accent,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: colors.semantic.danger,
  },

  // Size: padding
  sm: { paddingHorizontal: spacing.md,   paddingVertical: spacing.sm },
  md: { paddingHorizontal: spacing.lg,   paddingVertical: spacing.md },
  lg: { paddingHorizontal: spacing.xl,   paddingVertical: spacing.base },

  // Labels
  label:          { ...typography.bodyBold },
  primaryLabel:   { color: colors.text.inverse },
  secondaryLabel: { color: colors.brand.accent },
  ghostLabel:     { color: colors.brand.accent },
  dangerLabel:    { color: colors.text.inverse },
  smLabel:        { fontSize: 13 },
  mdLabel:        { fontSize: 15 },
  lgLabel:        { fontSize: 16 },
});
