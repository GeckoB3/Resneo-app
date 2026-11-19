/**
 * Card on file, staff side (web Docs/card-on-file-plan.md §6, §10). Every route takes the app's
 * Bearer token.
 *
 *   client record section   GET    /api/venue/guests/[guestId]/card-on-file
 *   remove (admin, reason)  DELETE /api/venue/guests/[guestId]/card-on-file
 *   Add card (desk screen)  POST   /api/venue/cards/desk-session   { guest_id, booking_id?, mode }
 *   waiting for the client  GET    /api/venue/cards/desk-session?id=
 *   staff cancel            DELETE /api/venue/cards/desk-session?id=
 *   confirm without a card  POST   /api/venue/bookings/confirm-without-card (ids or filter; undo)
 *   send card requests      POST   /api/venue/bookings/card-requests        (ids or filter)
 *   their counts first      POST   /api/venue/bookings/card-requests        (same, preview: true)
 *   visit no-show charge    GET/POST /api/venue/visits/[groupBookingId]/charge-no-show
 *
 * Explicit ids go in chunks of 100 (the routes' limit). "Select all" sends the filter with the
 * count the screen showed; a different count comes back as 409 CARD_COUNT_CHANGED with `count`,
 * which {@link cardCountChangedFrom} reads so the screen can ask again.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiFetch, isApiErrorBody } from '@/lib/api/client';
import {
  bookingsCountLabel,
  cardRequestsPreviewMessage,
  cardRequestsResultMessage,
  type CardRequestCounts,
} from '@/lib/booking/card-hold';
import { isBackendConfigured } from '@/lib/env';
import { invalidateBookingCaches } from '@/lib/queries/useBookingMutations';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/* ------------------------------------------------------------------ */
/* Client record: Card on file (plan §6.6)                             */
/* ------------------------------------------------------------------ */

export interface GuestCardOnFile {
  card: {
    id: string;
    label: string;
    brand?: string | null;
    last4?: string | null;
    expiry: string | null;
    cardholder_name: string | null;
    saved_at: string;
    scope: 'business' | 'collective';
    saved_with: string;
    members: { venue_id: string; name: string }[];
    linked_by: string | null;
    protects_upcoming: number;
  } | null;
  till_cards: { id: string; label: string; expiry: string | null; protects_bookings: boolean }[];
  history: { id: string; at: string; text: string }[];
  can_take_cards: boolean;
  can_remove: boolean;
  removal_text: string | null;
  /** Where a card added now is kept (absent from older servers). */
  add_saves_with?: { scope: 'business' | 'collective'; name: string } | null;
}

export type CardRemoveReason = 'client_asked' | 'lost_or_stolen' | 'other';

export interface RemoveGuestCardResult {
  ok: boolean;
  status: 'removed' | 'stopped';
  returned_bookings: number;
}

export const guestCardOnFileKey = (accessToken: string | null, guestId: string | null | undefined) =>
  [...queryKeys.guests.all(), 'card-on-file', keyScope(accessToken), guestId ?? null] as const;

/** GET the client record's Card on file section. Null on a server without the route (404). */
export function useGuestCardOnFile(guestId: string | null | undefined, enabled = true) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: guestCardOnFileKey(accessToken, guestId),
    enabled: enabled && isBackendConfigured() && accessToken !== null && Boolean(guestId),
    queryFn: async (): Promise<GuestCardOnFile | null> => {
      try {
        const body = await apiFetch<Partial<GuestCardOnFile>>(
          `/api/venue/guests/${encodeURIComponent(guestId!)}/card-on-file`,
          { accessToken: accessToken! },
        );
        return {
          card: body.card ?? null,
          till_cards: body.till_cards ?? [],
          history: body.history ?? [],
          can_take_cards: body.can_take_cards ?? false,
          can_remove: body.can_remove ?? false,
          removal_text: body.removal_text ?? null,
          add_saves_with: body.add_saves_with ?? null,
        };
      } catch (error) {
        // An older server has no such route: the section is simply not shown.
        if (error instanceof ApiError && error.status === 404 && !isApiErrorBody(error.body)) return null;
        throw error;
      }
    },
  });
}

/** DELETE the client's card (admin, with a reason). "Card lost or stolen" stops it. */
export function useRemoveGuestCard(guestId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reason: CardRemoveReason; note?: string }): Promise<RemoveGuestCardResult> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<RemoveGuestCardResult>(`/api/venue/guests/${encodeURIComponent(guestId)}/card-on-file`, {
        accessToken,
        method: 'DELETE',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: guestCardOnFileKey(accessToken, guestId) });
      // A stopped card sends its bookings back to Waiting for card.
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
    },
  });
}

/** The words after a removal (web ContactCardOnFileSection). */
export function removeGuestCardMessage(result: RemoveGuestCardResult, clientFirstName: string): string {
  if (result.status === 'stopped') {
    const n = result.returned_bookings;
    return n > 0
      ? `Card stopped. ${n} booking${n === 1 ? '' : 's'} went back to Waiting for card and ${clientFirstName || 'the client'} has been sent a card request.`
      : 'Card stopped. It no longer protects any booking.';
  }
  return 'Card removed. It will not be used for new bookings.';
}

/* ------------------------------------------------------------------ */
/* Add card: the desk screen, a code, or a message (plan §6.7)         */
/* ------------------------------------------------------------------ */

export type DeskMode = 'handover' | 'qr' | 'message';

export interface DeskSessionCreated {
  session_id: string;
  url: string;
  expires_at: string;
  mode: 'handover' | 'qr';
}

export interface DeskMessageSent {
  sent: true;
  email: boolean;
  sms: boolean;
}

export interface DeskSessionStatus {
  id: string;
  mode: 'handover' | 'qr';
  status: 'open' | 'saved' | 'cancelled' | 'expired';
  opened: boolean;
  expires_at: string;
  card: { brand: string | null; last4: string | null } | null;
  declined: boolean;
}

/** POST a desk session (handover / qr) or send the card request (message). */
export function useCreateDeskSession() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async (input: {
      guestId: string;
      bookingId?: string | null;
      /**
       * Before a booking exists (the booking form's "Add card now"): the business the booking will
       * be at, so the card is saved for that business rather than the client record's own. Sent only
       * when known; a server that does not read it ignores it.
       */
      bookingVenueId?: string | null;
      mode: DeskMode;
    }): Promise<DeskSessionCreated | DeskMessageSent> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<DeskSessionCreated | DeskMessageSent>('/api/venue/cards/desk-session', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({
          guest_id: input.guestId,
          booking_id: input.bookingId ?? null,
          ...(input.bookingVenueId && !input.bookingId ? { booking_venue_id: input.bookingVenueId } : {}),
          mode: input.mode,
        }),
      });
    },
  });
}

export const deskSessionKey = (accessToken: string | null, sessionId: string | null) =>
  ['cardDeskSession', keyScope(accessToken), sessionId] as const;

/** Poll a desk session every 3 seconds while staff wait (stops once it is no longer open). */
export function useDeskSessionStatus(sessionId: string | null, enabled = true) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: deskSessionKey(accessToken, sessionId),
    enabled: enabled && accessToken !== null && Boolean(sessionId),
    queryFn: () =>
      apiFetch<DeskSessionStatus>(`/api/venue/cards/desk-session?id=${encodeURIComponent(sessionId!)}`, {
        accessToken: accessToken!,
      }),
    refetchInterval: (query) => {
      const data = query.state.data as DeskSessionStatus | undefined;
      return data && data.status !== 'open' ? false : 3000;
    },
    gcTime: 0,
  });
}

/** DELETE (cancel) a waiting desk session. */
export function useCancelDeskSession() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async (sessionId: string): Promise<{ ok: boolean; cancelled: boolean }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ ok: boolean; cancelled: boolean }>(
        `/api/venue/cards/desk-session?id=${encodeURIComponent(sessionId)}`,
        { accessToken, method: 'DELETE' },
      );
    },
  });
}

/* ------------------------------------------------------------------ */
/* Confirm without a card and Send card requests (plan §4.16, §6.4)    */
/* ------------------------------------------------------------------ */

/** The routes' limit on explicit ids per request. */
export const CARD_BULK_CHUNK = 100;

export type CardBulkSelection =
  | { bookingIds: string[] }
  | {
      filter: { card_state: 'waiting' | 'not_needed'; from_date?: string; to_date?: string };
      /** "Select all {n} bookings": the n the screen showed. */
      expectedCount: number;
    };

function selectionBodies(selection: CardBulkSelection): Record<string, unknown>[] {
  if ('bookingIds' in selection) {
    const ids = [...new Set(selection.bookingIds)];
    const bodies: Record<string, unknown>[] = [];
    for (let i = 0; i < ids.length; i += CARD_BULK_CHUNK) {
      bodies.push({ booking_ids: ids.slice(i, i + CARD_BULK_CHUNK) });
    }
    return bodies;
  }
  return [{ filter: selection.filter, expected_count: selection.expectedCount }];
}

/** The new count on a 409 CARD_COUNT_CHANGED ("The number of bookings has changed"), else null. */
export function cardCountChangedFrom(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const body = error.body as { code?: unknown; count?: unknown } | undefined;
  if (!body || body.code !== 'CARD_COUNT_CHANGED' || typeof body.count !== 'number') return null;
  return body.count;
}

export interface CardBulkSkipped {
  booking_id: string;
  reason: string;
  message: string;
}

interface ConfirmWithoutCardResponse {
  changed: number;
  booking_ids: string[];
  unit_extra: number;
  moved_to_booked: number;
  skipped: CardBulkSkipped[];
  skipped_count: number;
  action_id: string | null;
  undo_until: string | null;
  message: string;
}

export interface ConfirmWithoutCardResult {
  changed: number;
  bookingIds: string[];
  unitExtra: number;
  skipped: CardBulkSkipped[];
  /** One per request sent; Undo sends each back. */
  actionIds: string[];
  undoUntil: string | null;
  message: string;
}

function invalidateCardBulk(queryClient: ReturnType<typeof useQueryClient>, accessToken: string | null, ids: string[]) {
  // `bookings.all()` covers every list, range and detail; the first id fans out the rest.
  if (ids.length > 0) {
    invalidateBookingCaches(queryClient, accessToken, ids[0]);
  } else {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
  }
}

/** The result message for one or several chunks. */
function confirmMessage(responses: ConfirmWithoutCardResponse[]): string {
  if (responses.length === 1) return responses[0].message;
  const changed = responses.reduce((n, r) => n + (r.changed ?? 0), 0);
  const extra = responses.reduce((n, r) => n + (r.unit_extra ?? 0), 0);
  const noPermission = responses.reduce(
    (n, r) => n + (r.skipped ?? []).filter((s) => s.reason === 'no_permission').length,
    0,
  );
  const parts = [
    extra > 0
      ? `${bookingsCountLabel(changed)}, including ${extra} other ${extra === 1 ? 'service' : 'services'} in the same visits, confirmed without a card.`
      : `${bookingsCountLabel(changed)} confirmed without a card.`,
  ];
  if (noPermission > 0) parts.push(`${noPermission} skipped: you can't change those bookings.`);
  return parts.join(' ');
}

/** POST confirm-without-card: one booking or many (chunks of 100), or a whole filter. */
export function useConfirmWithoutCard() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (selection: CardBulkSelection): Promise<ConfirmWithoutCardResult> => {
      if (!accessToken) throw new Error('Missing access token');
      const responses: ConfirmWithoutCardResponse[] = [];
      for (const body of selectionBodies(selection)) {
        responses.push(
          await apiFetch<ConfirmWithoutCardResponse>('/api/venue/bookings/confirm-without-card', {
            accessToken,
            method: 'POST',
            body: JSON.stringify(body),
          }),
        );
      }
      return {
        changed: responses.reduce((n, r) => n + (r.changed ?? 0), 0),
        bookingIds: responses.flatMap((r) => r.booking_ids ?? []),
        unitExtra: responses.reduce((n, r) => n + (r.unit_extra ?? 0), 0),
        skipped: responses.flatMap((r) => r.skipped ?? []),
        actionIds: responses.map((r) => r.action_id).filter((id): id is string => Boolean(id)),
        undoUntil: responses.map((r) => r.undo_until).filter(Boolean).sort()[0] ?? null,
        message: confirmMessage(responses),
      };
    },
    onSuccess: (result) => invalidateCardBulk(queryClient, accessToken, result.bookingIds),
  });
}

/** Undo a Confirm without a card (5 minutes): every action it made, restored exactly. */
export function useUndoConfirmWithoutCard() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (actionIds: string[]): Promise<{ restored: number; kept: number }> => {
      if (!accessToken) throw new Error('Missing access token');
      let restored = 0;
      let kept = 0;
      for (const actionId of actionIds) {
        const r = await apiFetch<{ undone: boolean; restored: number; kept: number }>(
          '/api/venue/bookings/confirm-without-card',
          { accessToken, method: 'POST', body: JSON.stringify({ undo: true, action_id: actionId }) },
        );
        restored += r.restored ?? 0;
        kept += r.kept ?? 0;
      }
      return { restored, kept };
    },
    onSuccess: () => invalidateCardBulk(queryClient, accessToken, []),
  });
}

interface SendCardRequestsResponse {
  /** Set when the server counted only (`preview: true`); absent on a send. */
  preview?: boolean;
  clients: number;
  emails: number;
  texts: number;
  reopened: number;
  skipped_no_contact: number;
  skipped_already_today: number;
  failed_clients: number;
  skipped: CardBulkSkipped[];
  message: string;
}

export interface SendCardRequestsResult {
  clients: number;
  emails: number;
  texts: number;
  reopened: number;
  skipped: CardBulkSkipped[];
  message: string;
}

function cardRequestCounts(responses: SendCardRequestsResponse[]): CardRequestCounts {
  const sum = (pick: (r: SendCardRequestsResponse) => number | undefined) => responses.reduce((n, r) => n + (pick(r) ?? 0), 0);
  return {
    clients: sum((r) => r.clients),
    emails: sum((r) => r.emails),
    texts: sum((r) => r.texts),
    skippedNoContact: sum((r) => r.skipped_no_contact),
    skippedAlreadyToday: sum((r) => r.skipped_already_today),
    failedClients: sum((r) => r.failed_clients),
  };
}

export interface CardRequestsPreview extends SendCardRequestsResult {
  /**
   * False when the server sent instead of counting (one older than the `preview` flag): the first
   * chunk went, and `message` says what was sent.
   */
  supported: boolean;
}

/**
 * POST card-requests with `preview: true`: the counts a send would give (clients, emails, texts,
 * skipped), with nothing sent. The question shows them before staff send (plan §4.16). A 409
 * CARD_COUNT_CHANGED comes back as an ApiError, as for the send.
 */
export function usePreviewCardRequests() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (selection: CardBulkSelection): Promise<CardRequestsPreview> => {
      if (!accessToken) throw new Error('Missing access token');
      const responses: SendCardRequestsResponse[] = [];
      for (const body of selectionBodies(selection)) {
        const r = await apiFetch<SendCardRequestsResponse>('/api/venue/bookings/card-requests', {
          accessToken,
          method: 'POST',
          body: JSON.stringify({ ...body, preview: true }),
        });
        responses.push(r);
        // An older server sent this chunk rather than counting it: never send the rest this way.
        if (r.preview !== true) break;
      }
      const supported = responses.every((r) => r.preview === true);
      const counts = cardRequestCounts(responses);
      const message =
        responses.length === 1
          ? responses[0].message
          : supported
            ? cardRequestsPreviewMessage(counts)
            : cardRequestsResultMessage(counts);
      return {
        supported,
        clients: counts.clients,
        emails: counts.emails,
        texts: counts.texts,
        reopened: responses.reduce((n, r) => n + (r.reopened ?? 0), 0),
        skipped: responses.flatMap((r) => r.skipped ?? []),
        message,
      };
    },
    onSuccess: (result) => {
      if (!result.supported) invalidateCardBulk(queryClient, accessToken, []);
    },
  });
}

/** POST card-requests: one request per client, for ids (chunks of 100) or a whole filter. */
export function useSendCardRequests() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (selection: CardBulkSelection): Promise<SendCardRequestsResult> => {
      if (!accessToken) throw new Error('Missing access token');
      const responses: SendCardRequestsResponse[] = [];
      for (const body of selectionBodies(selection)) {
        responses.push(
          await apiFetch<SendCardRequestsResponse>('/api/venue/bookings/card-requests', {
            accessToken,
            method: 'POST',
            body: JSON.stringify(body),
          }),
        );
      }
      const counts = cardRequestCounts(responses);
      const message = responses.length === 1 ? responses[0].message : cardRequestsResultMessage(counts);
      return {
        clients: counts.clients,
        emails: counts.emails,
        texts: counts.texts,
        reopened: responses.reduce((n, r) => n + (r.reopened ?? 0), 0),
        skipped: responses.flatMap((r) => r.skipped ?? []),
        message,
      };
    },
    onSuccess: () => invalidateCardBulk(queryClient, accessToken, []),
  });
}

/* ------------------------------------------------------------------ */
/* Charging no-show fees for a visit (plan §4.10, §6.8)                */
/* ------------------------------------------------------------------ */

export interface NoShowChargeLine {
  booking_id: string;
  hold_id: string;
  service_name: string | null;
  person_label: string | null;
  booking_date: string;
  booking_time: string;
  status: string;
  fee_pence: number;
  currency: string;
  chargeable: boolean;
  refusal: string | null;
  refusal_message: string | null;
}

export interface NoShowChargeGroup {
  key: string;
  kind: 'card_on_file' | 'till_card' | 'booking_customer';
  brand: string | null;
  last4: string | null;
  cardholder_name: string | null;
  found_by: string | null;
  found_by_label: string | null;
  total_pence: number;
  lines: NoShowChargeLine[];
}

export interface NoShowChargeView {
  groups: NoShowChargeGroup[];
  unchargeable: NoShowChargeLine[];
}

export interface NoShowChargeOutcome {
  key: string;
  kind: string;
  charge_id: string | null;
  status: 'succeeded' | 'pending' | 'failed';
  amount_pence: number;
  currency: string;
  booking_ids: string[];
  failure_code: string | null;
  message: string | null;
  brand: string | null;
  last4: string | null;
}

export interface NoShowChargeResult {
  charges: NoShowChargeOutcome[];
  skipped: { booking_id: string; refusal: string; message: string }[];
}

export const noShowChargesKey = (accessToken: string | null, visitId: string | null | undefined) =>
  [...queryKeys.bookings.all(), 'noShowCharges', keyScope(accessToken), visitId ?? null] as const;

/**
 * GET the visit's chargeable services grouped by card. `visitId` is the booking's
 * `group_booking_id`, or its own id for a single booking (a visit of one).
 */
export function useNoShowCharges(visitId: string | null | undefined, enabled = true) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: noShowChargesKey(accessToken, visitId),
    enabled: enabled && isBackendConfigured() && accessToken !== null && Boolean(visitId),
    queryFn: async (): Promise<NoShowChargeView> => {
      const body = await apiFetch<Partial<NoShowChargeView>>(
        `/api/venue/visits/${encodeURIComponent(visitId!)}/charge-no-show`,
        { accessToken: accessToken! },
      );
      return { groups: body.groups ?? [], unchargeable: body.unchargeable ?? [] };
    },
  });
}

/** POST charge: the given lines (lowered amounts), or every chargeable line at its fee. */
export function useChargeNoShowFees(visitId: string, bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      lines?: { booking_id: string; amount_pence?: number }[];
    }): Promise<NoShowChargeResult> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<NoShowChargeResult>(`/api/venue/visits/${encodeURIComponent(visitId)}/charge-no-show`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input.lines ? { lines: input.lines } : {}),
      });
    },
    onSuccess: () => invalidateBookingCaches(queryClient, accessToken, bookingId),
  });
}

/** POST refund of a visit charge, whole or by line. */
export function useRefundNoShowCharge(visitId: string, bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      chargeId: string;
      lines?: { line_id: string; amount_pence?: number }[];
    }): Promise<{ refunded_pence: number }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ refunded_pence: number }>(
        `/api/venue/visits/${encodeURIComponent(visitId)}/charge-no-show`,
        {
          accessToken,
          method: 'POST',
          body: JSON.stringify({ action: 'refund', charge_id: input.chargeId, ...(input.lines ? { lines: input.lines } : {}) }),
        },
      );
    },
    onSuccess: () => invalidateBookingCaches(queryClient, accessToken, bookingId),
  });
}
