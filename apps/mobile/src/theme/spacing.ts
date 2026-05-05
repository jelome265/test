// src/theme/spacing.ts
export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  base:16,
  lg:  20,
  xl:  24,
  xxl: 32,
  xxxl:48,
} as const;

export const radius = {
  sm:   6,
  md:  10,
  lg:  14,
  xl:  20,
  full:9999,
} as const;

// Touch target minimum: 44×44pt (Apple HIG)
export const TOUCH_TARGET = 44;
