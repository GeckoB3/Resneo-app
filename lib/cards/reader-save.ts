/**
 * Saving a card with Tap to Pay on this phone or the Bluetooth reader, with no charge (web
 * Docs/card-on-file-plan.md §4.12, C12, §6.7, §16.1). The card is a till card: it protects
 * bookings at this business only.
 *
 *   options   GET  /api/venue/cards/reader-save?guest_id=     reach words, the collective question
 *   start     POST /api/venue/cards/reader-save/setup-intent  { guest_id, device, confirm_business_only? }
 *             201 { save, client_secret, setup_intent_id, consent_text, allow_redisplay }
 *             409 CARD_ALREADY_SAVED_COLLECTIVE: `error` is the question; ask it, then send again
 *             with confirm_business_only: true
 *   answer    POST /api/venue/cards/reader-save  { id, agreed, consent_text }
 *   poll      GET  /api/venue/cards/reader-save?id=   { save } until save.open is false
 *   cancel    POST /api/venue/cards/reader-save  { id, action: 'cancel' }
 *
 * Between the answer and the poll the phone runs the Terminal SDK's `retrieveSetupIntent` and
 * `processSetupIntent` (SDK 0.0.1-beta.33 has both natively, so this ships over the air).
 * `save.text` is the progress or the outcome in words, shown as it is.
 */
import { ApiError, apiFetch, isApiErrorBody } from '@/lib/api/client';
import { terminalErrorMessage } from '@/lib/payments/terminal-sdk';

export type ReaderSaveDevice = 'tap_to_pay' | 'bluetooth_reader';

export type ReaderSaveStatus =
  | 'asking'
  | 'agreed'
  | 'declined'
  | 'processing'
  | 'saved'
  | 'not_saved'
  | 'failed'
  | 'cancelled'
  | 'expired';

export interface ReaderSaveDto {
  id: string;
  status: ReaderSaveStatus;
  outcome: string | null;
  /** The progress or the outcome in words. */
  text: string;
  channel: string;
  reader_label: string | null;
  card: { brand: string | null; last4: string | null } | null;
  setup_intent_id: string | null;
  open: boolean;
}

export interface ReaderSaveOptions {
  can_save: boolean;
  business_name: string;
  scope: 'business' | 'collective';
  collective_name: string | null;
  client_first_name: string | null;
  collective_card: { label: string } | null;
  collective_card_question: string | null;
  /** "Saves the card for {business} only." */
  reader_reach: string;
  screen_reach: string;
  consent_text: string;
}

export interface ReaderSaveStarted {
  save: ReaderSaveDto;
  client_secret: string | null;
  setup_intent_id: string | null;
  consent_text: string;
  allow_redisplay?: 'always' | 'limited' | 'unspecified';
}

export const READER_SAVE_COLLECTIVE_CODE = 'CARD_ALREADY_SAVED_COLLECTIVE';

const BASE = '/api/venue/cards/reader-save';

/** The calls, bound to a token. */
export function readerSaveApi(accessToken: string) {
  return {
    options: async (guestId: string): Promise<ReaderSaveOptions | null> => {
      try {
        return await apiFetch<ReaderSaveOptions>(`${BASE}?guest_id=${encodeURIComponent(guestId)}`, { accessToken });
      } catch (error) {
        // An older server has no route: the reader options stay hidden.
        if (error instanceof ApiError && (error.status === 404 || error.status === 405)) return null;
        throw error;
      }
    },
    start: (input: { guestId: string; device: ReaderSaveDevice; confirmBusinessOnly?: boolean }) =>
      apiFetch<ReaderSaveStarted>(`${BASE}/setup-intent`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({
          guest_id: input.guestId,
          device: input.device,
          ...(input.confirmBusinessOnly ? { confirm_business_only: true } : {}),
        }),
      }),
    answer: (input: { id: string; agreed: boolean; consentText: string }) =>
      apiFetch<{ save: ReaderSaveDto; allow_redisplay?: 'always' | 'limited' | 'unspecified' }>(BASE, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ id: input.id, agreed: input.agreed, consent_text: input.consentText }),
      }),
    read: (id: string) => apiFetch<{ save: ReaderSaveDto }>(`${BASE}?id=${encodeURIComponent(id)}`, { accessToken }),
    cancel: (id: string) =>
      apiFetch<{ save: ReaderSaveDto }>(BASE, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ id, action: 'cancel' }),
      }),
  };
}

export type ReaderSaveApi = ReturnType<typeof readerSaveApi>;

/** What the flow needs from `useStripeTerminal()` (SDK beta.33). */
export interface ReaderSaveTerminal {
  retrieveSetupIntent: (clientSecret: string) => Promise<{ setupIntent?: unknown; error?: { code?: string; message?: string } }>;
  processSetupIntent: (params: {
    setupIntent: never;
    allowRedisplay?: 'always' | 'limited' | 'unspecified';
  }) => Promise<{ setupIntent?: unknown; error?: { code?: string; message?: string } }>;
  cancelProcessSetupIntent?: () => Promise<unknown>;
}

export interface ReaderSaveHooks {
  /** "{client} already has a card saved with {collective}. Save another for {business} only?" */
  confirmBusinessOnly: (question: string) => Promise<boolean>;
  /** The client's answer on the handed-over screen; null when staff stopped before an answer. */
  askConsent: (consentText: string) => Promise<boolean | null>;
  /** Progress words for staff while the card is read. */
  onProgress: (text: string) => void;
}

export type ReaderSaveResultKind = 'saved' | 'not_saved' | 'declined' | 'cancelled' | 'failed' | 'waiting';

export interface ReaderSaveResult {
  kind: ReaderSaveResultKind;
  /** The words to show staff, as the server gave them where it did. */
  text: string;
  save: ReaderSaveDto | null;
}

const NOT_STARTED = 'The card reader could not be started. Please try again.';
const STOPPED = 'No card was saved.';

function kindOf(save: ReaderSaveDto): ReaderSaveResultKind {
  switch (save.status) {
    case 'saved':
      return 'saved';
    case 'declined':
      return 'declined';
    case 'cancelled':
      return 'cancelled';
    case 'not_saved':
    case 'expired':
      return 'not_saved';
    case 'failed':
      return 'failed';
    default:
      return 'waiting';
  }
}

function result(save: ReaderSaveDto): ReaderSaveResult {
  return { kind: kindOf(save), text: save.text, save };
}

/** Poll until the save is no longer open, or the tries run out. */
async function pollSave(
  api: ReaderSaveApi,
  id: string,
  opts: { tries: number; intervalMs: number; sleep: (ms: number) => Promise<void> },
): Promise<ReaderSaveDto | null> {
  let last: ReaderSaveDto | null = null;
  for (let i = 0; i < opts.tries; i += 1) {
    try {
      last = (await api.read(id)).save;
      if (!last.open) return last;
    } catch {
      // Keep trying: a slow network is not the outcome.
    }
    await opts.sleep(opts.intervalMs);
  }
  return last;
}

async function cancelQuietly(api: ReaderSaveApi, id: string): Promise<ReaderSaveDto | null> {
  try {
    return (await api.cancel(id)).save;
  } catch {
    return null;
  }
}

export interface RunReaderSaveOptions {
  /** Poll attempts after the card is read (default 20, every 1.5 seconds). */
  tries?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The whole save, start to outcome. The reader must already be connected (Tap to Pay or the
 * Bluetooth reader); the caller does that with the app's existing connection hooks.
 */
export async function runReaderSave(
  api: ReaderSaveApi,
  terminal: ReaderSaveTerminal,
  input: { guestId: string; device: ReaderSaveDevice },
  hooks: ReaderSaveHooks,
  opts: RunReaderSaveOptions = {},
): Promise<ReaderSaveResult> {
  const pollOpts = {
    tries: opts.tries ?? 20,
    intervalMs: opts.intervalMs ?? 1500,
    sleep: opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
  };

  // 1. Start, asking the collective question first when the server needs it.
  let started: ReaderSaveStarted;
  try {
    started = await api.start(input);
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 409 &&
      isApiErrorBody(error.body) &&
      error.body.code === READER_SAVE_COLLECTIVE_CODE
    ) {
      const yes = await hooks.confirmBusinessOnly(error.body.error);
      if (!yes) return { kind: 'cancelled', text: STOPPED, save: null };
      started = await api.start({ ...input, confirmBusinessOnly: true });
    } else {
      throw error;
    }
  }
  const id = started.save.id;
  if (!started.client_secret) {
    const save = await cancelQuietly(api, id);
    return { kind: 'failed', text: NOT_STARTED, save };
  }

  // 2. The client's answer on the handed-over screen.
  const agreed = await hooks.askConsent(started.consent_text);
  if (agreed === null) {
    const save = await cancelQuietly(api, id);
    return save ? result(save) : { kind: 'cancelled', text: STOPPED, save: null };
  }
  const answered = await api.answer({ id, agreed, consentText: started.consent_text });
  if (!agreed) return result(answered.save);
  hooks.onProgress(answered.save.text || 'Waiting for the client to tap or insert their card...');

  // 3. Read the card on this phone or the Bluetooth reader.
  const retrieved = await terminal.retrieveSetupIntent(started.client_secret);
  if (retrieved.error || !retrieved.setupIntent) {
    const save = await cancelQuietly(api, id);
    return {
      kind: 'failed',
      text: terminalErrorMessage(retrieved.error as never, NOT_STARTED),
      save,
    };
  }
  const processed = await terminal.processSetupIntent({
    setupIntent: retrieved.setupIntent as never,
    allowRedisplay: answered.allow_redisplay ?? started.allow_redisplay ?? 'always',
  });
  if (processed.error) {
    if (processed.error.code === 'CANCELED') {
      const save = await cancelQuietly(api, id);
      return save ? result(save) : { kind: 'cancelled', text: STOPPED, save: null };
    }
    // The webhook may already know why (a bank decline, a card that can't be kept).
    const known = await pollSave(api, id, { ...pollOpts, tries: Math.min(3, pollOpts.tries) });
    if (known && !known.open) return result(known);
    const save = await cancelQuietly(api, id);
    return { kind: 'failed', text: terminalErrorMessage(processed.error as never, STOPPED), save };
  }

  // 4. The outcome, as the server words it.
  const done = await pollSave(api, id, pollOpts);
  if (!done) return { kind: 'waiting', text: 'Saving the card...', save: null };
  return result(done);
}
