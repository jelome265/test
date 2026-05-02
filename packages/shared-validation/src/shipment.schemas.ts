import { z } from 'zod';

// ─── Canonical city list (single source of truth) ─────────────────
export const SUPPORTED_CITIES = ['Lilongwe', 'Blantyre', 'Mzuzu'] as const;

// ─── Business constraints ──────────────────────────────────────────
export const MAX_WEIGHT_KG   = 10.0;
export const MIN_WEIGHT_KG   = 0.1;
export const MAX_DESCRIPTION = 300;

// ─── Building blocks ──────────────────────────────────────────────
const PhoneSchema = z
  .string()
  .regex(/^\+?[0-9]{9,15}$/, 'Enter a valid phone number');

const GeoPointSchema = z.object({
  latitude:  z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

// ─── Sender details ───────────────────────────────────────────────
export const SenderSchema = z.object({
  full_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100)
    .trim(),
  phone_number: PhoneSchema,
  email: z.string().email().nullable().optional(),
  address: z
    .string()
    .min(5, 'Please enter a complete address')
    .max(500)
    .trim(),
  city: z.enum(SUPPORTED_CITIES, {
    errorMap: () => ({
      message: `City must be one of: ${SUPPORTED_CITIES.join(', ')}`,
    }),
  }),
  coordinates: GeoPointSchema.nullable().optional(),
});

// ─── Receiver details ─────────────────────────────────────────────
// Same shape as sender — separate schema for independent validation messages
export const ReceiverSchema = z.object({
  full_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100)
    .trim(),
  phone_number: PhoneSchema,
  email: z.string().email().nullable().optional(),
  address: z
    .string()
    .min(5, 'Please enter a complete address')
    .max(500)
    .trim(),
  city: z.enum(SUPPORTED_CITIES, {
    errorMap: () => ({
      message: `City must be one of: ${SUPPORTED_CITIES.join(', ')}`,
    }),
  }),
  coordinates: GeoPointSchema.nullable().optional(),
});

// ─── Package details ──────────────────────────────────────────────
export const PackageSchema = z.object({
  weight_kg: z
    .number({
      required_error: 'Package weight is required',
      invalid_type_error: 'Weight must be a number',
    })
    .min(MIN_WEIGHT_KG, `Minimum weight is ${MIN_WEIGHT_KG}kg`)
    .max(MAX_WEIGHT_KG, `Maximum weight is ${MAX_WEIGHT_KG}kg`)
    // Allow one decimal place only (0.1kg precision)
    .refine((v) => Math.round(v * 10) / 10 === v, {
      message: 'Weight must have at most one decimal place (e.g. 2.5)',
    }),
  size: z.enum(['small', 'medium', 'large']),
  description: z
    .string()
    .min(3, 'Please describe the package contents')
    .max(MAX_DESCRIPTION)
    .trim(),
  is_fragile: z.boolean().default(false),
  declared_value_mwk: z
    .number()
    .min(0)
    .max(100_000_000)   // 1 million MWK in tambala
    .nullable()
    .optional(),
});

// ─── Full create shipment schema ───────────────────────────────────
export const CreateShipmentSchema = z
  .object({
    sender:        SenderSchema,
    receiver:      ReceiverSchema,
    package:       PackageSchema,
    delivery_notes: z.string().max(500).trim().optional(),
  })
  .refine(
    (data) => data.sender.city === data.receiver.city
      || SUPPORTED_CITIES.includes(data.receiver.city),
    {
      message: 'Delivery city is not in a supported region',
      path: ['receiver', 'city'],
    },
  );

// ─── Quote schema (no auth required) ─────────────────────────────
export const QuoteSchema = z.object({
  pickup_city:   z.enum(SUPPORTED_CITIES),
  delivery_city: z.enum(SUPPORTED_CITIES),
  weight_kg:     z.coerce.number().min(MIN_WEIGHT_KG).max(MAX_WEIGHT_KG),
  is_fragile:    z.coerce.boolean().optional().default(false),
});

// ─── Admin status update ───────────────────────────────────────────
export const AdminStatusUpdateSchema = z.object({
  status: z.enum([
    'approved',
    'rejected',
    'picked_up',
    'in_transit',
    'delivered',
    'cancelled',
  ]),
  notes:            z.string().max(500).trim().optional(),
  rejection_reason: z.string().max(500).trim().optional(),
});

export type CreateShipmentInput  = z.infer<typeof CreateShipmentSchema>;
export type QuoteInput           = z.infer<typeof QuoteSchema>;
export type AdminStatusUpdateInput = z.infer<typeof AdminStatusUpdateSchema>;
