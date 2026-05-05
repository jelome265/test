// src/components/ui/Input.tsx
import React, { forwardRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, spacing, radius, typography } from '../../theme';

interface InputProps extends TextInputProps {
  label?:       string;
  error?:       string;
  hint?:        string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, hint, leftElement, rightElement, ...rest }, ref) => {
    const [focused, setFocused] = useState(false);
    const hasError = !!error;

    return (
      <View style={styles.wrapper}>
        {label && <Text style={styles.label}>{label}</Text>}

        <View
          style={[
            styles.container,
            focused && styles.containerFocused,
            hasError && styles.containerError,
          ]}
        >
          {leftElement && <View style={styles.sideElement}>{leftElement}</View>}

          <TextInput
            ref={ref}
            style={styles.input}
            placeholderTextColor={colors.text.tertiary}
            selectionColor={colors.brand.accent}
            onFocus={(e) => {
              setFocused(true);
              rest.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              rest.onBlur?.(e);
            }}
            {...rest}
          />

          {rightElement && <View style={styles.sideElement}>{rightElement}</View>}
        </View>

        {(error || hint) && (
          <Text style={[styles.hint, hasError && styles.hintError]}>
            {error ?? hint}
          </Text>
        )}
      </View>
    );
  },
);

Input.displayName = 'Input';

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: {
    ...typography.label,
    color: colors.text.secondary,
  },
  container: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: colors.surface.input,
    borderWidth:     1.5,
    borderColor:     colors.surface.inputBorder,
    borderRadius:    radius.md,
    minHeight:       48,
    paddingHorizontal: spacing.md,
    gap:             spacing.sm,
  },
  containerFocused: {
    borderColor: colors.brand.accent,
  },
  containerError: {
    borderColor: colors.semantic.danger,
  },
  input: {
    flex:      1,
    ...typography.body,
    color:     colors.text.primary,
    padding:   0,
  },
  sideElement: {
    alignItems:      'center',
    justifyContent:  'center',
  },
  hint: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  hintError: {
    color: colors.semantic.danger,
  },
});
