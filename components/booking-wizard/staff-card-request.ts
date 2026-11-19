/**
 * The staff booking form's card choices (web Docs/card-on-file-plan.md §6.2, §4.9, §10), shared by
 * every staff create surface: the appointment confirm step, the group flow, and the class, event
 * and resource confirm.
 *
 * - A card on file found for the chosen client protects the booking unless staff tap "Don't use
 *   the card for this booking" (`use_card_on_file: false`).
 * - No card: "Send a card request", ON by default (C2), sent explicitly as `require_card_hold`
 *   (false makes the hold Card not needed, so a card the client adds later still protects it).
 * - The optional tick "Cancel if no card is added within 24 hours" (`cancel_if_no_card`), off by
 *   default, offered only for a phone booking whose client has an email or mobile (§4.9).
 * - Card not possible: nothing is asked for, and the create says so (`require_card_hold: false`).
 */
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export interface StaffCardRequestState {
  /** "Send a card request" (C2: on by default). */
  requestCard: boolean;
  /** "Cancel if no card is added within 24 hours" (D26: off by default). */
  cancelIfNoCard: boolean;
  /** "Don't use the card for this booking" was tapped under a found card. */
  dontUseCard: boolean;
}

export const DEFAULT_STAFF_CARD_REQUEST: StaffCardRequestState = {
  requestCard: true,
  cancelIfNoCard: false,
  dontUseCard: false,
};

export interface StaffCardRequestFields {
  require_card_hold: boolean;
  use_card_on_file?: false;
  cancel_if_no_card?: true;
}

/**
 * The create fields for the card line (plan §10). `require_card_hold` is always sent for a
 * card-hold booking: an omitted value keeps an older app's meaning (no request) on the server.
 */
export function staffCardRequestFields(
  state: StaffCardRequestState,
  opts: { cardFound: boolean; tickAllowed: boolean; notPossible?: boolean },
): StaffCardRequestFields {
  if (opts.notPossible) return { require_card_hold: false };
  const usingCard = opts.cardFound && !state.dontUseCard;
  return {
    require_card_hold: state.requestCard,
    ...(opts.cardFound && state.dontUseCard ? { use_card_on_file: false as const } : {}),
    ...(!usingCard && state.requestCard && opts.tickAllowed && state.cancelIfNoCard
      ? { cancel_if_no_card: true as const }
      : {}),
  };
}

/** A card on file found for the chosen client (from the client record's Card on file section). */
export interface StaffFoundCard {
  brand: string | null;
  last4: string | null;
  label: string;
  savedWith: string;
  scope: 'business' | 'collective';
}

export interface StaffCardLookup {
  card: StaffFoundCard | null;
  /** False when the business cannot take card payments; null when unknown. */
  canTakeCards: boolean | null;
  /** Where a card added now is kept (for "Add card now"). */
  addSavesWith: { scope: 'business' | 'collective'; name: string } | null;
  /** Read again (after "Add card now" saved a card). */
  refresh: () => void;
}

interface CardOnFileBody {
  card?: {
    label?: string;
    brand?: string | null;
    last4?: string | null;
    saved_with?: string;
    scope?: 'business' | 'collective';
  } | null;
  can_take_cards?: boolean;
  add_saves_with?: { scope: 'business' | 'collective'; name: string } | null;
}

/** Narrow the client record's Card on file answer to what the form needs. */
export function parseStaffCardLookup(body: unknown): Omit<StaffCardLookup, 'refresh'> {
  const b = (body && typeof body === 'object' ? body : {}) as CardOnFileBody;
  const c = b.card;
  const card: StaffFoundCard | null = c
    ? {
        brand: c.brand ?? null,
        last4: c.last4 ?? null,
        label: c.label ?? '',
        savedWith: c.saved_with ?? '',
        scope: c.scope === 'collective' ? 'collective' : 'business',
      }
    : null;
  return {
    card,
    canTakeCards: typeof b.can_take_cards === 'boolean' ? b.can_take_cards : null,
    addSavesWith: b.add_saves_with ?? null,
  };
}

/**
 * Which business the card line answers for, and whether that is another business than the
 * signed-in one.
 *
 * - `lookupVenueId`: sent as `booking_venue_id` to the client's Card on file and with a desk
 *   session started before the booking. In the collective form `ownerVenueId` is the COLLECTIVE,
 *   never a business, so the business is the member the booking is at, or the signed-in business
 *   when it is its own (2026-11-19: a client picked from another member's records was answered for
 *   that member).
 * - `partnerVenueId`: the booking is at another business (a collective partner, or a linked
 *   calendar). "Add card now" then waits for the confirmation, since the card must be saved for
 *   the client record the booking makes there.
 */
export function staffCardVenues(opts: {
  collectiveForm: boolean;
  bookingVenueId: string | null | undefined;
  ownerVenueId: string | null | undefined;
  signedInVenueId: string | null | undefined;
}): { lookupVenueId: string | null; partnerVenueId: string | null } {
  if (opts.collectiveForm) {
    const partner = opts.bookingVenueId && opts.bookingVenueId !== opts.signedInVenueId ? opts.bookingVenueId : null;
    return { lookupVenueId: partner ?? opts.signedInVenueId ?? null, partnerVenueId: partner };
  }
  const partner = opts.bookingVenueId ?? opts.ownerVenueId ?? null;
  return { lookupVenueId: partner, partnerVenueId: partner };
}

/**
 * The member business a collective group booking is at: every attendee's calendar belongs to one
 * business (the server refuses a group across businesses). Null when that is the signed-in
 * business, or when it cannot be told yet (no attendees, or calendars of more than one business).
 */
export function groupBookedAtVenueId(
  people: readonly { practitionerId: string }[],
  practitioners: readonly { id: string; owning_venue_id?: string }[],
  signedInVenueId: string | null | undefined,
): string | null {
  const owners = new Set<string>();
  for (const person of people) {
    const owner = practitioners.find((p) => p.id === person.practitionerId)?.owning_venue_id;
    if (owner) owners.add(owner);
  }
  if (owners.size !== 1) return null;
  const [only] = [...owners];
  return only && only !== signedInVenueId ? only : null;
}

const EMPTY: Omit<StaffCardLookup, 'refresh'> = { card: null, canTakeCards: null, addSavesWith: null };

/**
 * GET /api/venue/guests/[guestId]/card-on-file for the chosen client, only when the booking takes
 * a card hold. Any failure (an older server without the route, a refusal) reads as "no card found",
 * so the form always works and falls back to the request switch.
 *
 * A plain request rather than the cached `useGuestCardOnFile` query: the booking forms render
 * outside a query client in many of their tests, and this needs no cache.
 */
export function useStaffCardLookup(
  guestId: string | null | undefined,
  enabled: boolean,
  /**
   * The business the booking is made at, when it is not the signed-in one (a collective partner's or
   * a linked calendar). The answer is then for a booking there: a card saved for this business only
   * cannot protect it, and "can take cards" and "saved with" are that business's.
   */
  bookingVenueId: string | null = null,
): StaffCardLookup {
  const accessToken = useAccessToken();
  // The answer is kept with the client it is for, so a different client (or none) reads as nothing
  // found until its own answer lands.
  const key = `${guestId ?? ''}|${bookingVenueId ?? ''}`;
  const [result, setResult] = useState<{ key: string; value: Omit<StaffCardLookup, 'refresh'> } | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const active = enabled && Boolean(guestId) && Boolean(accessToken) && isBackendConfigured();

  useEffect(() => {
    if (!active || !guestId || !accessToken) return;
    let cancelled = false;
    const query = bookingVenueId ? `?booking_venue_id=${encodeURIComponent(bookingVenueId)}` : '';
    apiFetch<unknown>(`/api/venue/guests/${encodeURIComponent(guestId)}/card-on-file${query}`, { accessToken })
      .then((body) => {
        if (!cancelled) setResult({ key, value: parseStaffCardLookup(body) });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, value: EMPTY });
      });
    return () => {
      cancelled = true;
    };
  }, [active, guestId, bookingVenueId, key, accessToken, version]);

  const value = active && result && result.key === key ? result.value : EMPTY;
  return { ...value, refresh };
}
