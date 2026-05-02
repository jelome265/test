import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z
    .string()
    .email('Enter a valid email address')
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
  full_name: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name is too long')
    .trim(),
  phone_number: z
    .string()
    .regex(/^\+?[0-9]{9,15}$/, 'Enter a valid phone number (9-15 digits)'),
});

export const LoginSchema = z.object({
  email: z.string().email('Enter a valid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

export const UpdateFCMTokenSchema = z.object({
  // null clears the token (user revoked push permissions)
  // string updates/replaces the current token
  fcm_token: z.string().min(1).max(500).nullable(),
});

export const RefreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});

export const ChangePasswordSchema = z
  .object({
    current_password: z.string().min(1),
    new_password: z
      .string()
      .min(8)
      .regex(/[A-Z]/)
      .regex(/[0-9]/)
      .regex(/[^A-Za-z0-9]/),
    confirm_password: z.string().min(1),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export type RegisterInput       = z.infer<typeof RegisterSchema>;
export type LoginInput          = z.infer<typeof LoginSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
