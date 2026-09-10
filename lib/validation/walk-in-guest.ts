import { z } from 'zod';

import { normalizeToE164 } from '@/lib/phone/e164';

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
 * Guest schema for the staff booking wizard. Mirrors the web DetailsStep since
 * web #190 (2026-09-10): EVERY contact field is optional for every staff source,
 * so a booking taken at the desk or over the phone is never held up by a detail
 * the staff member does not have. A booking without a phone gets no text
 * reminder and one without an email gets no confirmation; the server accepts
 * both (`POST /api/venue/bookings` dropped its per-model "Phone number is
 * required" checks). A phone that IS typed must be a real number for its
 * country (the same libphonenumber verdict the server gives, web
 * `buildDetailsSchemaStaff`); the country picker hands up E.164 when it is,
 * and a composed "+cc digits" when it is not, which this refuses. Unknown
 * keys (e.g. `special_requests`) are ignored by the object parse. `isWalkIn`
 * is kept for callers; it no longer changes the rule.
 */
export function buildGuestSchema(_isWalkIn = false) {
  return z.object({
    first_name: z.string().trim().max(100, 'First name is too long').optional(),
    last_name: z.string().trim().max(100, 'Surname is too long').optional(),
    phone: z
      .string()
      .trim()
      .max(24, 'Phone is too long')
      .optional()
      .refine((v) => !v || normalizeToE164(v) !== null, 'Enter a valid mobile number or leave blank'),
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
