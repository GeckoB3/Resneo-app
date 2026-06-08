import { z } from 'zod';

/** Guest details collected on step 4 of the walk-in wizard. */
export const walkInGuestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  phone: z.string().trim().min(1, 'Phone is required').max(24, 'Phone is too long'),
  email: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || value === '' || z.string().email().safeParse(value).success, {
      message: 'Enter a valid email',
    }),
});

export type WalkInGuestInput = z.infer<typeof walkInGuestSchema>;

/** Split a single display name into API first/last fields. */
export function splitGuestName(name: string): { first_name: string; last_name: string } {
  const trimmed = name.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { first_name: trimmed, last_name: '' };
  }
  return {
    first_name: trimmed.slice(0, spaceIndex),
    last_name: trimmed.slice(spaceIndex + 1).trim(),
  };
}
