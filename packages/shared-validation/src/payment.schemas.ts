import { z } from 'zod';

export const InitiatePaymentSchema = z.object({
  shipment_id: z
    .string()
    .uuid('Invalid shipment ID'),
  method: z.enum(
    ['airtel_money', 'tnm_mpamba', 'bank_transfer', 'card'],
    { errorMap: () => ({ message: 'Please select a payment method' }) },
  ),
  phone_number: z
    .string()
    .regex(/^\+?[0-9]{9,15}$/, 'Enter a valid phone number')
    .optional(),
});

export const DisputeCreateSchema = z.object({
  shipment_id: z.string().uuid(),
  category: z.enum([
    'package_damaged',
    'package_lost',
    'not_delivered',
    'wrong_delivery',
    'payment_issue',
    'other',
  ]),
  description: z
    .string()
    .min(20, 'Please provide at least 20 characters describing the issue')
    .max(2000)
    .trim(),
  evidence_urls: z.array(z.string().url()).max(5).optional().default([]),
});

export type InitiatePaymentInput = z.infer<typeof InitiatePaymentSchema>;
export type DisputeCreateInput   = z.infer<typeof DisputeCreateSchema>;
