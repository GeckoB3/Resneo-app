import { z } from 'zod';

/** Sign-in email field — mirrors POST /api/auth/send-magic-link body shape. */
export const signInEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
});

export type SignInEmailInput = z.infer<typeof signInEmailSchema>;

/** Email + password sign-in — same credentials as the ReserveNI website. */
export const signInPasswordSchema = signInEmailSchema.extend({
  password: z.string().min(1, 'Password is required'),
});

export type SignInPasswordInput = z.infer<typeof signInPasswordSchema>;
