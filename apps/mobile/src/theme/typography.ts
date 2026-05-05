// src/theme/typography.ts
import { Platform } from 'react-native';

// Using system fonts: SF Pro (iOS), Roboto (Android)
// Elevated via tight tracking and deliberate weight contrast

export const typography = {
  // Display — shipment tracking numbers, amounts, large stats
  display: {
    fontSize:       32,
    fontWeight:     '700' as const,
    letterSpacing: -0.5,
    lineHeight:     40,
  },

  // Heading 1 — screen titles
  h1: {
    fontSize:       24,
    fontWeight:     '700' as const,
    letterSpacing: -0.3,
    lineHeight:     32,
  },

  // Heading 2 — section headers
  h2: {
    fontSize:       18,
    fontWeight:     '600' as const,
    letterSpacing: -0.2,
    lineHeight:     28,
  },

  // Heading 3 — card titles
  h3: {
    fontSize:       16,
    fontWeight:     '600' as const,
    letterSpacing:  0,
    lineHeight:     24,
  },

  // Body — primary content
  body: {
    fontSize:       15,
    fontWeight:     '400' as const,
    letterSpacing:  0,
    lineHeight:     24,
  },

  // Body Bold — label values
  bodyBold: {
    fontSize:       15,
    fontWeight:     '600' as const,
    letterSpacing:  0,
    lineHeight:     24,
  },

  // Caption — metadata, timestamps
  caption: {
    fontSize:       12,
    fontWeight:     '400' as const,
    letterSpacing:  0.1,
    lineHeight:     18,
  },

  // Mono — tracking numbers, amounts
  mono: {
    fontSize:       14,
    fontWeight:     '500' as const,
    letterSpacing:  0.5,
    lineHeight:     20,
    fontFamily:     Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },

  // Label — form labels, tab labels
  label: {
    fontSize:       13,
    fontWeight:     '500' as const,
    letterSpacing:  0.3,
    lineHeight:     20,
  },
} as const;
