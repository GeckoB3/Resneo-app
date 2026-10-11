import { normalizePhone } from '@/lib/phone/normalize';
import { buildAddress, parseAddress } from '@/lib/venue/addressFormat';
import type { UpdateVenueInput } from '@/lib/queries/useVenueSettings';
import type { PosAddress, PosCheckoutSettings } from '@/types/pos-settings';

/**
 * OB5: the receipt's business details follow the venue profile (the web's contract,
 * `PosBusinessDetailsView`). The profile (`venues.name`, `address`, `email`, `phone`) is the source,
 * edited here through `PATCH /api/venue` like the Venue profile screen does, which also changes
 * the booking page. Checkout keeps a receipt-only value only where the venue sets one
 * (`trading_name`, `business_address`, `public_contact_email`, `public_contact_phone`; null means
 * "use the profile"). Pure, so W5 and Checkout settings' Business details share and test it. (What
 * receipts then show is the server's `business_details` on GET /api/venue/pos/settings.)
 */

type ProfileVenue = { name?: string | null; address?: string | null; email?: string | null; phone?: string | null };
type ReceiptSettings = Pick<PosCheckoutSettings, 'trading_name' | 'business_address' | 'public_contact_email' | 'public_contact_phone'>;

/** The profile's name, address, email and phone as the form edits them. */
export interface ProfileDraft {
  name: string;
  /** The building or venue name the profile's address starts with. Kept, not shown here. */
  building: string;
  street: string;
  town: string;
  postcode: string;
  email: string;
  phone: string;
}

/** Receipt-only values: off means every one follows the profile. */
export interface ReceiptDraft {
  on: boolean;
  name: string;
  line1: string;
  line2: string;
  town: string;
  postcode: string;
  email: string;
  phone: string;
}

export function profileDraftFrom(venue: ProfileVenue | null | undefined): ProfileDraft {
  const a = parseAddress(venue?.address ?? null);
  return {
    name: venue?.name ?? '',
    building: a.name,
    street: a.street,
    town: a.town,
    postcode: a.postcode,
    email: venue?.email ?? '',
    phone: venue?.phone ?? '',
  };
}

/** The profile's address as the Venue profile screen stores it ("Building, Street, Town, Postcode"). */
export function profileAddress(draft: ProfileDraft): string {
  // A blank building name is filled with the business name once there is a street (the Venue
  // profile screen's rule, so the booking page's map finds the business, not a bare street).
  return buildAddress({
    name: draft.building.trim() || (draft.street.trim() ? draft.name.trim() : ''),
    street: draft.street.trim(),
    town: draft.town.trim(),
    postcode: draft.postcode.trim(),
  });
}

/**
 * What changed in the profile, for `PATCH /api/venue`. Empty when nothing did: a box left as it was
 * sends nothing, even where saving it would tidy it (a phone written another way, an address with
 * no building name), so opening the form and pressing Continue never changes the booking page.
 */
export function profilePatch(draft: ProfileDraft, venue: ProfileVenue | null | undefined): UpdateVenueInput {
  const out: UpdateVenueInput = {};
  const before = profileDraftFrom(venue);
  if (draft.name.trim() !== (venue?.name ?? '').trim()) out.name = draft.name.trim();
  const addressChanged =
    draft.street.trim() !== before.street || draft.town.trim() !== before.town || draft.postcode.trim() !== before.postcode;
  if (addressChanged) out.address = profileAddress(draft);
  if (draft.email.trim() !== (venue?.email ?? '').trim()) out.email = draft.email.trim();
  if (draft.phone.trim() !== (venue?.phone ?? '').trim()) out.phone = normalizePhone(draft.phone);
  return out;
}

/** The profile's checks before saving (the Venue profile screen's): a name, and an email that is one. */
export function profileErrors(draft: ProfileDraft): { name?: 'required'; email?: 'invalid' } {
  const out: { name?: 'required'; email?: 'invalid' } = {};
  if (!draft.name.trim()) out.name = 'required';
  if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) out.email = 'invalid';
  return out;
}

export function receiptDraftFrom(settings: ReceiptSettings | null | undefined): ReceiptDraft {
  const a = settings?.business_address ?? null;
  const name = settings?.trading_name ?? '';
  const email = settings?.public_contact_email ?? '';
  const phone = settings?.public_contact_phone ?? '';
  return {
    on: Boolean(name || email || phone || a),
    name,
    line1: a?.line1 ?? '',
    line2: a?.line2 ?? '',
    town: a?.town ?? '',
    postcode: a?.postcode ?? '',
    email,
    phone,
  };
}

const orNull = (text: string) => (text.trim() ? text.trim() : null);

/** The receipt-only address, or null when every box is empty (so receipts use the profile's). */
export function receiptAddress(draft: ReceiptDraft): PosAddress | null {
  const address: PosAddress = {
    line1: orNull(draft.line1),
    line2: orNull(draft.line2),
    town: orNull(draft.town),
    postcode: orNull(draft.postcode),
  };
  return Object.values(address).some((v) => v !== null) ? address : null;
}

/** Field by field (empty is null), whatever order or extra keys the stored address has. */
function sameAddress(a: PosAddress | null, b: PosAddress | null): boolean {
  const keys: (keyof PosAddress)[] = ['line1', 'line2', 'town', 'postcode'];
  const value = (x: PosAddress | null, k: keyof PosAddress) => (x?.[k] ?? '').trim() || null;
  if ((a === null) !== (b === null)) return keys.every((k) => value(a, k) === null && value(b, k) === null);
  return keys.every((k) => value(a, k) === value(b, k));
}

/**
 * What changed in the receipt-only values, for `PATCH /api/venue/pos/settings`: null wherever the
 * switch is off or a box is empty, so the receipt follows the profile there. Empty when nothing
 * changed.
 */
export function receiptPatch(draft: ReceiptDraft, settings: ReceiptSettings): Partial<PosCheckoutSettings> {
  const out: Partial<PosCheckoutSettings> = {};
  const name = draft.on ? orNull(draft.name) : null;
  const address = draft.on ? receiptAddress(draft) : null;
  const email = draft.on ? orNull(draft.email) : null;
  const phone = draft.on ? orNull(draft.phone) : null;
  if (name !== (settings.trading_name ?? null)) out.trading_name = name;
  if (!sameAddress(address, settings.business_address ?? null)) out.business_address = address;
  if (email !== (settings.public_contact_email ?? null)) out.public_contact_email = email;
  if (phone !== (settings.public_contact_phone ?? null)) out.public_contact_phone = phone;
  return out;
}

/** W0's "Your business details are ready from your profile": a name and an address. */
export function profileReady(venue: ProfileVenue | null | undefined): boolean {
  return Boolean(venue?.name?.trim() && venue?.address?.trim());
}
