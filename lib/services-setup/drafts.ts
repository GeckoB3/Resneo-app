/**
 * Drafts for the AI services setup review (web parity, `src/lib/services-setup/drafts.ts`).
 *
 * @see _reference/Resneo/src/lib/services-setup/drafts.ts
 *
 * Each service the AI found becomes a `ServiceDraft` the owner can edit, add or skip. Numbers
 * are kept as the strings the inputs hold, so a half-typed price is not lost. `draftIssues` says
 * what must be fixed before a draft can be added and what is worth a second look.
 *
 * Where the web builds its Add service form's values and runs them through
 * `appointmentServiceFormToPayload`, the app builds the same small form here
 * (`draftToForm`) and `formToCreateBody` turns it into exactly the body that function would
 * send for it, so an AI-made service is created the same way from either side.
 */

import type { ExtractedPriceKind, ExtractedService } from './types';

export type DraftStatus = 'pending' | 'added' | 'skipped';

export interface DraftOption {
  key: string;
  name: string;
  /** Minutes, as typed. Blank means "same as the service". */
  duration: string;
  /** Major units, as typed ("32.50"). Blank means no price. */
  price: string;
  description: string;
}

export type DraftOutcome =
  | { kind: 'service' }
  | { kind: 'addon'; groupId: string }
  | {
      kind: 'updated';
      serviceId: string;
      /** What the service said before, so Undo can put it back. */
      before: { durationMinutes: number; pricePence: number | null };
    };

export interface ServiceDraft {
  key: string;
  status: DraftStatus;
  /** The service's id once added, so the owner can undo it. */
  createdServiceId: string | null;
  name: string;
  /** Heading name, '' for none. Created on add when the venue does not have it yet. */
  category: string;
  description: string;
  /** Minutes, as typed. */
  duration: string;
  /** True until the owner touches the length when the source gave none. */
  durationEstimated: boolean;
  /** Major units, as typed. Blank means no price shown. */
  price: string;
  priceKind: ExtractedPriceKind;
  options: DraftOption[];
  notes: string[];
  looksLikeAddon: boolean;
  /** Where the owner gave us this service (a file name, a site, "Your typed list"). */
  sources: string[];
  /** The last add failure, shown on the card until the next attempt. */
  error: string | null;
  /** Calendars chosen for this service alone; null follows its heading, then the setup's choice. */
  calendarIds: string[] | null;
  /** How an added draft went in: as a service, as an add-on option, or as an update to one the venue had. */
  outcome: DraftOutcome | null;
}

/** A service the venue already has, as the duplicate check and "update" need it. */
export interface ExistingServiceRef {
  id: string;
  name: string;
  durationMinutes: number;
  pricePence: number | null;
  hasVariants: boolean;
}

/** Old saved drafts (before these fields existed) get their defaults. */
export function normaliseStoredDraft(d: ServiceDraft): ServiceDraft {
  return {
    ...d,
    error: null,
    calendarIds: Array.isArray(d.calendarIds) ? d.calendarIds : null,
    outcome: d.outcome ?? (d.status === 'added' ? { kind: 'service' } : null),
  };
}

export type DraftIssueLevel = 'fix' | 'check' | 'info';

export interface DraftIssue {
  level: DraftIssueLevel;
  /** A stable id, for tests and for choosing an icon. */
  kind:
    | 'name_missing'
    | 'duration_invalid'
    | 'price_invalid'
    | 'option_invalid'
    | 'duration_estimated'
    | 'price_missing'
    | 'price_on_request'
    | 'price_from'
    | 'option_price_missing'
    | 'duplicate'
    | 'addon'
    | 'note';
  text: string;
}

export const DRAFT_MIN_MINUTES = 5;
export const DRAFT_MAX_MINUTES = 480;

/** "Cut & Blow-Dry!" and "cut and blow dry" are the same service. */
export function normaliseServiceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function penceToInput(pence: number | null): string {
  if (pence === null) return '';
  return pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2);
}

/**
 * The price box accepts what people type: "£35", "35.00", "35,50", "1,200". Returns the
 * cleaned number string, '' for blank, or null when it is not a price.
 */
export function cleanPriceInput(raw: string): string | null {
  let s = raw.trim().replace(/[£$€\s]/g, '').replace(/^(gbp|eur|usd)/i, '');
  if (!s) return '';
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return s;
}

export function parseMinutesInput(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  return Number.parseInt(s, 10);
}

function validMinutes(n: number | null): n is number {
  return n !== null && n >= DRAFT_MIN_MINUTES && n <= DRAFT_MAX_MINUTES;
}

export function draftFromExtracted(service: ExtractedService, sourceLabel: string, key: string): ServiceDraft {
  const duration = service.duration_minutes ?? service.suggested_duration_minutes;
  return {
    key,
    status: 'pending',
    createdServiceId: null,
    name: service.name,
    category: service.category ?? '',
    description: service.description ?? '',
    duration: String(duration),
    durationEstimated: service.duration_minutes === null && service.options.every((o) => o.duration_minutes === null),
    price: penceToInput(service.price_pence),
    priceKind: service.price_kind,
    options: service.options.map((o, i) => ({
      key: `${key}-o${i}`,
      name: o.name,
      duration: o.duration_minutes !== null ? String(o.duration_minutes) : '',
      price: penceToInput(o.price_pence),
      description: o.description ?? '',
    })),
    notes: [...service.notes],
    looksLikeAddon: service.looks_like_addon,
    sources: [sourceLabel],
    error: null,
    calendarIds: null,
    outcome: null,
  };
}

/**
 * Add a new source's services to the list. A service already there (by name, under the same
 * heading) is filled in where it was blank, never overwritten, and only while it is still
 * waiting for review.
 */
export function mergeIntoDrafts(
  existing: ServiceDraft[],
  incoming: ExtractedService[],
  sourceLabel: string,
  makeKey: () => string,
): { drafts: ServiceDraft[]; added: number; alreadyListed: number } {
  const drafts = existing.map((d) => ({ ...d }));
  // "Full head" under Tint and "Full head" under Highlights are two services. A name matches
  // one already listed under the same heading, or one where either side has no heading (the
  // same service read from a photo without headings and a page with them).
  const findMatch = (norm: string, heading: string): number => {
    let loose = -1;
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i]!;
      if (normaliseServiceName(d.name) !== norm) continue;
      const dh = d.category.trim().toLowerCase();
      if (dh === heading) return i;
      if (loose < 0 && (!dh || !heading)) loose = i;
    }
    return loose;
  };
  let added = 0;
  let alreadyListed = 0;
  for (const service of incoming) {
    const norm = normaliseServiceName(service.name);
    const at = findMatch(norm, (service.category ?? '').trim().toLowerCase());
    if (at < 0) {
      drafts.push(draftFromExtracted(service, sourceLabel, makeKey()));
      added++;
      continue;
    }
    alreadyListed++;
    const d = drafts[at]!;
    if (!d.sources.includes(sourceLabel)) d.sources = [...d.sources, sourceLabel];
    if (d.status !== 'pending') continue;
    const incomingDraft = draftFromExtracted(service, sourceLabel, 'tmp');
    if (!d.category && incomingDraft.category) d.category = incomingDraft.category;
    if (!d.description && incomingDraft.description) d.description = incomingDraft.description;
    if (d.durationEstimated && !incomingDraft.durationEstimated) {
      d.duration = incomingDraft.duration;
      d.durationEstimated = false;
    }
    if (!d.price && incomingDraft.price) {
      d.price = incomingDraft.price;
      d.priceKind = incomingDraft.priceKind;
    }
    if (d.options.length === 0 && incomingDraft.options.length > 0) {
      d.options = incomingDraft.options.map((o, i) => ({ ...o, key: `${d.key}-o${i}` }));
    }
    for (const n of incomingDraft.notes) if (!d.notes.includes(n) && d.notes.length < 3) d.notes = [...d.notes, n];
  }
  return { drafts, added, alreadyListed };
}

export interface DraftIssueContext {
  /** Normalised names of services the venue already has (excluding ones this setup added). */
  existingServiceNames: ReadonlySet<string>;
  currencySymbol: string;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

/** What stands between this draft and a clean add, most important first. */
export function draftIssues(draft: ServiceDraft, ctx: DraftIssueContext): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const usesOptions = draft.options.length > 0;

  if (!draft.name.trim()) issues.push({ level: 'fix', kind: 'name_missing', text: 'Give this service a name.' });

  const minutes = parseMinutesInput(draft.duration);
  if (!validMinutes(minutes)) {
    issues.push({
      level: 'fix',
      kind: 'duration_invalid',
      text: `Set how long it takes, between ${DRAFT_MIN_MINUTES} minutes and 8 hours.`,
    });
  }
  if (!usesOptions && cleanPriceInput(draft.price) === null) {
    issues.push({ level: 'fix', kind: 'price_invalid', text: 'The price is not a number. Use something like 35 or 32.50.' });
  }
  if (usesOptions) {
    draft.options.forEach((o, i) => {
      const label = o.name.trim() || `Option ${i + 1}`;
      if (!o.name.trim()) issues.push({ level: 'fix', kind: 'option_invalid', text: `Option ${i + 1} needs a name.` });
      if (o.duration.trim() && !validMinutes(parseMinutesInput(o.duration))) {
        issues.push({ level: 'fix', kind: 'option_invalid', text: `${label}: set a length between 5 minutes and 8 hours.` });
      }
      if (cleanPriceInput(o.price) === null) {
        issues.push({ level: 'fix', kind: 'option_invalid', text: `${label}: the price is not a number.` });
      }
    });
  }

  if (draft.durationEstimated && validMinutes(minutes)) {
    issues.push({
      level: 'check',
      kind: 'duration_estimated',
      text: `Your list did not say how long this takes, so we suggested ${formatMinutes(minutes)}. Check it is right.`,
    });
  }
  const priceText = cleanPriceInput(draft.price);
  if (!usesOptions && priceText === '') {
    issues.push(
      draft.priceKind === 'on_request'
        ? {
            level: 'check',
            kind: 'price_on_request',
            text: 'Your list said the price is on request. Leave it blank to show no price, or add one.',
          }
        : {
            level: 'check',
            kind: 'price_missing',
            text: 'No price was listed. Add one, or leave it blank to show no price.',
          },
    );
  }
  if (usesOptions) {
    const unpriced = draft.options.filter((o) => cleanPriceInput(o.price) === '').length;
    if (unpriced > 0) {
      const servicePrice = cleanPriceInput(draft.price);
      issues.push({
        level: 'check',
        kind: 'option_price_missing',
        text:
          unpriced === draft.options.length && servicePrice
            ? `Your list gave one price (${ctx.currencySymbol}${servicePrice}) but not a price for each option. Add them, or clients will see no price.`
            : `${unpriced} ${unpriced === 1 ? 'option has' : 'options have'} no price, so clients will see no price for ${unpriced === 1 ? 'it' : 'them'}.`,
      });
    }
  }
  if (!usesOptions && draft.priceKind === 'from' && priceText) {
    issues.push({
      level: 'check',
      kind: 'price_from',
      text: `Your list showed a starting price. Clients will see ${ctx.currencySymbol}${priceText}. If the price depends on length or size, add options.`,
    });
  }
  if (draft.status === 'pending' && ctx.existingServiceNames.has(normaliseServiceName(draft.name))) {
    issues.push({
      level: 'check',
      kind: 'duplicate',
      text: 'You already have a service with this name. Adding it makes a second one.',
    });
  }
  if (draft.looksLikeAddon) {
    issues.push({
      level: 'check',
      kind: 'addon',
      text: 'This looks like an extra added to another service. Make it an add-on so clients can pick it when they book.',
    });
  }
  for (const note of draft.notes) issues.push({ level: 'info', kind: 'note', text: note });
  return issues;
}

export function draftCanBeAdded(issues: DraftIssue[]): boolean {
  return !issues.some((i) => i.level === 'fix');
}

/** "Add all" takes drafts that need no decision: no fixes, not a duplicate, not an extra. */
export function draftReadyForBulkAdd(draft: ServiceDraft, issues: DraftIssue[]): boolean {
  return (
    draft.status === 'pending' &&
    draftCanBeAdded(issues) &&
    !issues.some((i) => i.kind === 'duplicate' || i.kind === 'addon')
  );
}

// ---------------------------------------------------------------------------
// Defaults applied to every service the setup adds
// ---------------------------------------------------------------------------

/** Online payment the owner chose for every service this setup adds. */
export type PaymentDefault =
  | { kind: 'none' }
  | { kind: 'deposit_fixed'; amount: string }
  | { kind: 'deposit_percent'; percent: string }
  | { kind: 'full' };

/** Settings applied to every service the setup adds, on top of what each card says. */
export interface SetupDefaults {
  bufferMinutes: number;
  payment: PaymentDefault;
}

export const DEFAULT_SETUP_DEFAULTS: SetupDefaults = { bufferMinutes: 0, payment: { kind: 'none' } };

/** A deposit is at least £1 (a card hold's floor too), so a small percentage never rounds to nothing. */
const MIN_DEPOSIT_PENCE = 100;

function pence(input: string): number | null {
  const clean = cleanPriceInput(input);
  if (clean === null || clean === '') return null;
  return Math.round(Number(clean) * 100);
}

function poundsString(p: number): string {
  return p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2);
}

function percentOf(pricePence: number, percent: number): number {
  return Math.max(MIN_DEPOSIT_PENCE, Math.round((pricePence * percent) / 100));
}

/** Is this payment choice complete enough to apply? A blank amount or percentage is not. */
export function paymentDefaultValid(payment: PaymentDefault): boolean {
  if (payment.kind === 'deposit_fixed') return (pence(payment.amount) ?? 0) >= MIN_DEPOSIT_PENCE;
  if (payment.kind === 'deposit_percent') {
    const n = Number(payment.percent.trim());
    return /^\d{1,3}$/.test(payment.percent.trim()) && n >= 1 && n <= 100;
  }
  return true;
}

// ---------------------------------------------------------------------------
// The service a draft becomes
// ---------------------------------------------------------------------------

/** One option row of `SetupServiceForm` (web `AppointmentServiceVariantFormRow`, the fields the setup sets). */
export interface SetupOptionForm {
  name: string;
  description: string;
  duration_minutes: number;
  buffer_minutes: number;
  price: string;
  deposit: string;
}

/**
 * The Add service form's values for a draft (the subset of web `AppointmentServiceFormValues`
 * the setup sets; everything else takes the form's defaults in `formToCreateBody`).
 */
export interface SetupServiceForm {
  name: string;
  description: string;
  duration_minutes: number;
  buffer_minutes: number;
  price: string;
  deposit: string;
  payment_requirement: 'none' | 'deposit' | 'full_payment';
  colour: string;
  category_id: string | null;
  practitioner_ids: string[];
  variants: SetupOptionForm[];
}

/**
 * Apply the online payment choice to one service's form. A service it cannot apply to (no
 * price for a percentage deposit or full payment, or an option without a price under full
 * payment) is left with no online payment rather than made unsaveable.
 */
export function applyPaymentDefault(form: SetupServiceForm, payment: PaymentDefault): SetupServiceForm {
  if (payment.kind === 'none' || !paymentDefaultValid(payment)) return form;
  const priced = form.variants.length > 0 ? form.variants.map((v) => pence(v.price)) : [pence(form.price)];
  if (payment.kind === 'deposit_fixed') {
    return { ...form, payment_requirement: 'deposit', deposit: poundsString(pence(payment.amount)!) };
  }
  if (payment.kind === 'deposit_percent') {
    const percent = Number(payment.percent.trim());
    const firstPriced = priced.find((p): p is number => p !== null && p > 0);
    if (firstPriced === undefined) return form;
    return {
      ...form,
      payment_requirement: 'deposit',
      deposit: poundsString(percentOf(firstPriced, percent)),
      // Each option takes the same share of its own price.
      variants: form.variants.map((v) => {
        const p = pence(v.price);
        return p !== null && p > 0 ? { ...v, deposit: poundsString(percentOf(p, percent)) } : v;
      }),
    };
  }
  // Full payment needs a price on the service, or on every option clients can pick.
  if (priced.some((p) => p === null || p <= 0)) return form;
  return { ...form, payment_requirement: 'full_payment' };
}

/** The form for a draft (web `draftToFormValues`), with the setup's defaults applied when given. */
export function draftToForm(
  draft: ServiceDraft,
  opts: { categoryId: string | null; calendarIds: string[]; colour: string; defaults?: SetupDefaults },
): SetupServiceForm {
  const minutes = parseMinutesInput(draft.duration) ?? 30;
  const price = cleanPriceInput(draft.price) ?? '';
  const buffer = opts.defaults?.bufferMinutes ?? 0;
  const form: SetupServiceForm = {
    name: draft.name.trim(),
    description: draft.description.trim(),
    duration_minutes: minutes,
    buffer_minutes: buffer,
    price,
    deposit: '',
    payment_requirement: 'none',
    colour: opts.colour,
    category_id: opts.categoryId,
    practitioner_ids: [...opts.calendarIds],
    variants: draft.options.map((o) => ({
      name: o.name.trim(),
      description: o.description.trim(),
      duration_minutes: parseMinutesInput(o.duration) ?? minutes,
      buffer_minutes: buffer,
      price: cleanPriceInput(o.price) ?? '',
      deposit: '',
    })),
  };
  return opts.defaults ? applyPaymentDefault(form, opts.defaults.payment) : form;
}

/** Web form defaults the setup never changes (`DEFAULT_APPOINTMENT_SERVICE_FORM_VALUES`). */
const FORM_DEFAULTS = {
  max_advance_booking_days: 90,
  min_booking_notice_hours: 1,
  cancellation_notice_hours: 48,
  allow_same_day_booking: true,
  booking_interval_minutes: 15,
} as const;

/** Web `poundsToPence`: blank or not a number is null. */
function poundsToPence(pounds: string): number | null {
  const trimmed = pounds.trim();
  if (!trimmed) return null;
  const num = Number.parseFloat(trimmed);
  if (Number.isNaN(num) || num < 0) return null;
  return Math.round(num * 100);
}

export type CreateBodyResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

/**
 * The `POST /api/venue/appointment-services` body for a setup form: what the web's
 * `appointmentServiceFormToPayload(form, { isAdmin: true })` sends for the same values, with
 * the rest of the form at its defaults. The drafts' own checks run first, so the refusals here
 * are the form's last line of defence, in its words.
 */
export function formToCreateBody(form: SetupServiceForm): CreateBodyResult {
  if (!form.name.trim()) return { ok: false, error: 'Service name is required' };
  if (form.duration_minutes < 5) return { ok: false, error: 'Duration must be at least 5 minutes' };
  if (form.payment_requirement === 'deposit') {
    const d = poundsToPence(form.deposit);
    if (d === null || d <= 0) return { ok: false, error: 'Enter a valid deposit amount' };
  }
  const usesVariants = form.variants.length > 0;
  if (form.payment_requirement === 'full_payment') {
    if (usesVariants) {
      for (const v of form.variants) {
        const p = poundsToPence(v.price);
        if (p === null || p <= 0) {
          return { ok: false, error: `Option "${v.name.trim()}": set a price, full online payment applies to each option.` };
        }
      }
    } else {
      const p = poundsToPence(form.price);
      if (p === null || p <= 0) return { ok: false, error: 'Set a price when charging full payment online' };
    }
  }
  for (let i = 0; i < form.variants.length; i++) {
    const v = form.variants[i]!;
    if (!v.name.trim()) return { ok: false, error: `Option ${i + 1}: name is required` };
    if (v.duration_minutes < 5 || v.duration_minutes > 480) {
      return { ok: false, error: `Option "${v.name.trim()}" duration must be between 5 and 480 minutes` };
    }
    if (v.price.trim() && poundsToPence(v.price) === null) {
      return { ok: false, error: `Option "${v.name.trim()}" has an invalid price` };
    }
  }

  const primary = usesVariants ? form.variants[0]! : null;
  const body: Record<string, unknown> = {
    name: form.name.trim(),
    description: form.description.trim() || null,
    duration_minutes: primary ? primary.duration_minutes : form.duration_minutes,
    buffer_minutes: primary ? primary.buffer_minutes : form.buffer_minutes,
    price_pence: poundsToPence(primary ? primary.price : form.price) ?? undefined,
    payment_requirement: form.payment_requirement,
    deposit_pence: form.payment_requirement === 'deposit' ? (poundsToPence(form.deposit) ?? 0) : 0,
    colour: form.colour,
    is_active: true,
    practitioner_ids: form.practitioner_ids,
    max_advance_booking_days: FORM_DEFAULTS.max_advance_booking_days,
    min_booking_notice_hours: FORM_DEFAULTS.min_booking_notice_hours,
    cancellation_notice_hours: FORM_DEFAULTS.cancellation_notice_hours,
    allow_same_day_booking: FORM_DEFAULTS.allow_same_day_booking,
    booking_interval_minutes: FORM_DEFAULTS.booking_interval_minutes,
    booking_minute_marks: null,
    booking_start_times: null,
    staff_may_customize_name: false,
    staff_may_customize_description: false,
    staff_may_customize_duration: false,
    staff_may_customize_buffer: false,
    staff_may_customize_price: false,
    staff_may_customize_deposit: false,
    staff_may_customize_colour: false,
    category_id: form.category_id ?? null,
    is_bookable_online: true,
    custom_availability_enabled: false,
    custom_working_hours: null,
    processing_time_blocks: [],
    variants: form.variants.map((v, idx) => ({
      name: v.name.trim(),
      description: v.description.trim() || null,
      duration_minutes: v.duration_minutes,
      buffer_minutes: v.buffer_minutes,
      price_pence: poundsToPence(v.price),
      deposit_pence: poundsToPence(v.deposit),
      sort_order: idx,
      is_active: true,
      processing_time_blocks: [],
    })),
    addon_group_links: [],
    location_type: 'business_venue',
    online_meeting_url: null,
    online_meeting_info: null,
  };
  // JSON drops `undefined`, as the web's `fetch` body does: no price means the key is absent.
  if (body.price_pence === undefined) delete body.price_pence;
  return { ok: true, body };
}

/**
 * The venue's service this draft duplicates, when "update it instead" makes sense: both are
 * a single offering (options are too different to merge), and the length or price differs.
 */
export function updatableDuplicate(draft: ServiceDraft, existing: ExistingServiceRef[]): ExistingServiceRef | null {
  if (draft.options.length > 0) return null;
  const norm = normaliseServiceName(draft.name);
  const match = existing.find((s) => normaliseServiceName(s.name) === norm);
  if (!match || match.hasVariants) return null;
  const minutes = parseMinutesInput(draft.duration);
  const price = pence(draft.price);
  const lengthDiffers = minutes !== null && minutes !== match.durationMinutes;
  const priceDiffers = price !== null && price !== match.pricePence;
  return lengthDiffers || priceDiffers ? match : null;
}

/** One line for the collapsed card: "45 min · £35" or "3 options · from £30". */
export function draftSummary(draft: ServiceDraft, currencySymbol: string): string {
  if (draft.options.length > 0) {
    const prices = draft.options
      .map((o) => cleanPriceInput(o.price))
      .filter((p): p is string => Boolean(p))
      .map(Number);
    const low = prices.length > 0 ? Math.min(...prices) : null;
    const lowText = low === null ? '' : ` · from ${currencySymbol}${Number.isInteger(low) ? low : low.toFixed(2)}`;
    return `${draft.options.length} options${lowText}`;
  }
  const minutes = parseMinutesInput(draft.duration);
  const parts: string[] = [];
  if (validMinutes(minutes)) parts.push(formatMinutes(minutes));
  const price = cleanPriceInput(draft.price);
  if (price === null) parts.push('Price needs fixing');
  else if (price !== '' && Number(price) === 0) parts.push('Free');
  else if (price) parts.push(`${draft.priceKind === 'from' ? 'from ' : ''}${currencySymbol}${price}`);
  else parts.push('No price');
  return parts.join(' · ');
}

/** The venue's own summary for "Yours now: 45 min · £35". */
export function existingSummary(s: ExistingServiceRef, currencySymbol: string): string {
  const price =
    s.pricePence === null
      ? 'no price'
      : s.pricePence === 0
        ? 'Free'
        : `${currencySymbol}${(s.pricePence / 100).toFixed(s.pricePence % 100 === 0 ? 0 : 2)}`;
  return `${formatMinutes(s.durationMinutes)} · ${price}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' };

/** The symbol the setup shows before a price (the app's venues charge in GBP, EUR or USD). */
export function currencySymbolFor(code: string | null | undefined): string {
  const upper = (code ?? 'GBP').toUpperCase();
  return CURRENCY_SYMBOLS[upper] ?? `${upper} `;
}
