// src/theme/colors.ts
export const colors = {
  // Brand — deep navy anchors trust
  brand: {
    primary:   '#0A1628',   // Ink Navy — primary actions, headers
    accent:    '#2563EB',   // Electric Blue — CTAs, active states
    accentMid: '#3B82F6',   // Lighter blue for hover equivalents
  },

  // Semantic
  semantic: {
    success:  '#16A34A',
    warning:  '#D97706',
    danger:   '#DC2626',
    info:     '#0284C7',
  },

  // Status — shipment lifecycle colours
  status: {
    pending_approval:  '#9CA3AF',  // Gray — waiting
    approved:          '#2563EB',  // Blue — action required
    payment_pending:   '#D97706',  // Amber — money in motion
    payment_confirmed: '#059669',  // Teal — money safe
    picked_up:         '#7C3AED',  // Purple — in system
    in_transit:        '#7C3AED',  // Purple — moving
    delivered:         '#16A34A',  // Green — nearby
    confirmed:         '#15803D',  // Dark green — done
    rejected:          '#DC2626',  // Red — failed
    cancelled:         '#6B7280',  // Gray — stopped
    failed:            '#DC2626',  // Red — failed
  },

  // Surface
  surface: {
    background: '#F9FAFB',
    card:       '#FFFFFF',
    border:     '#E5E7EB',
    divider:    '#F3F4F6',
    input:      '#FFFFFF',
    inputBorder:'#D1D5DB',
    overlay:    'rgba(0,0,0,0.5)',
  },

  // Text
  text: {
    primary:   '#111827',
    secondary: '#6B7280',
    tertiary:  '#9CA3AF',
    inverse:   '#FFFFFF',
    link:      '#2563EB',
    danger:    '#DC2626',
  },
} as const;

export type ColorKey = keyof typeof colors;
