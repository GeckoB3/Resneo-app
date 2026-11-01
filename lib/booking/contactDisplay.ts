/**
 * What a booking page shows of a business's contact details, and where (web
 * `src/lib/booking/booking-page-contact.ts`). The details are one copy on the venue; these are the
 * page's choices about them, stored in its `booking_page_config`. Nothing stored means what guests
 * have always seen: address, phone and website in both places, and no email.
 */
export const CONTACT_DETAILS = ['address', 'phone', 'email', 'website'] as const;
export type ContactDetail = (typeof CONTACT_DETAILS)[number];
export type ContactPlace = 'top' | 'about';
export type ContactPlaceChoices = Record<ContactDetail, boolean>;
export type ContactDisplay = Record<ContactPlace, ContactPlaceChoices>;
/** As the server stores it: only what differs from the defaults. */
export type StoredContactDisplay = Partial<Record<ContactPlace, Partial<ContactPlaceChoices>>>;

const DEFAULTS: ContactPlaceChoices = { address: true, phone: true, email: false, website: true };

function readPlace(raw: unknown): ContactPlaceChoices {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULTS };
  for (const detail of CONTACT_DETAILS) {
    const value = src[detail];
    if (typeof value === 'boolean') out[detail] = value;
  }
  return out;
}

/** The address guests see and reply to: the venue's guest email, else its main one. */
export function venuePublicEmail(venue: { reply_to_email?: string | null; email?: string | null } | null | undefined): string | null {
  const email = (venue?.reply_to_email ?? venue?.email ?? '').trim();
  return email || null;
}

/** Whether an address is one people sign in to the venue with (`login_emails` on GET /api/venue). */
export function isLoginEmail(address: string | null | undefined, loginEmails: readonly string[] | null | undefined): boolean {
  const email = (address ?? '').trim().toLowerCase();
  return Boolean(email && loginEmails?.includes(email));
}

/** The page's choices in full, from a stored config or anything else. */
export function resolveContactDisplay(config: { contact_display?: unknown } | null | undefined): ContactDisplay {
  const src = (config?.contact_display ?? {}) as Record<string, unknown>;
  return { top: readPlace(src?.top), about: readPlace(src?.about) };
}
