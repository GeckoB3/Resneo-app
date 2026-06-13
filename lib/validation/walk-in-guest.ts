import { z } from 'zod';

/** Fields the appointment guest-details step can surface an error against. */
export type GuestField = 'first_name' | 'last_name' | 'phone' | 'email';

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || z.string().email().safeParse(value).success, {
    message: 'Enter a valid email',
  });

/**
 * Guest schema for the appointment booking wizard. Mirrors the web DetailsStep:
 * names + email are always optional; phone is required for phone bookings but
 * optional for walk-ins (walk-ins have NO mandatory fields). Unknown keys (e.g.
 * `special_requests`) are ignored by the object parse.
 */
export function buildGuestSchema(isWalkIn: boolean) {
  return z.object({
    first_name: z.string().trim().max(100, 'First name is too long').optional(),
    last_name: z.string().trim().max(100, 'Surname is too long').optional(),
    phone: isWalkIn
      ? z.string().trim().max(24, 'Phone is too long').optional()
      : z.string().trim().min(1, 'Phone is required').max(24, 'Phone is too long'),
    email: optionalEmail,
  });
}

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
