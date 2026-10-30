/**
 * One calendar's own price, length, buffer and deposit for a service (web
 * `CollectiveCalendarValuesDialog.tsx`, 2026-10-28): the rules the "Edit values" step follows,
 * pure so they are tested without rendering.
 *
 * Two ways to save, as on the web:
 *   host  the collective's host, on any venue's calendar for a page service:
 *         PUT /api/venue/collectives/[id]/calendar-values { calendar_id, service_id, values }.
 *         Price, length and buffer are always offered (and deposit, when the service takes one):
 *         a value for a field calendars may not set yet turns that setting on for the service, at
 *         every venue, and the route says which (`flags_turned_on`).
 *   own   a venue's admin on its own calendars: PATCH /api/venue/practitioner-service-overrides
 *         { service_id, calendar_id, ...values }, only the fields the service lets calendars set.
 *
 * A blank field is the service's standard value (null). Only the fields that changed are sent.
 */
import { areaCopy } from '@/lib/collective-area/copy';
import type { CollectiveCalendarGroup } from '@/lib/collective-area/model';
import type { PractitionerServiceLink } from '@/types/services-manage';

export type CalendarValueKey =
  | 'custom_price_pence'
  | 'custom_duration_minutes'
  | 'custom_buffer_minutes'
  | 'custom_deposit_pence';

export type CalendarValueFlag = 'price' | 'duration' | 'buffer' | 'deposit';

export type CalendarValueFlags = Record<CalendarValueFlag, boolean>;

export type CalendarValues = Record<CalendarValueKey, number | null>;

export type CalendarValuesMode = 'host' | 'own';

/** Which calendar, at which venue, and the service at that venue (the host's own, or its copy). */
export interface CalendarValuesTarget {
  calendarId: string;
  calendarName: string;
  venueName: string;
  serviceId: string;
  /** The calendar's own values now, null where it keeps the standard. */
  current: CalendarValues;
}

/** The service's own values, shown as the standard a blank field means. */
export interface CalendarValueDefaults {
  durationMinutes: number | null;
  bufferMinutes: number | null;
  pricePence: number | null;
  depositPence: number | null;
}

export interface CalendarValueField {
  key: CalendarValueKey;
  flag: CalendarValueFlag;
  money: boolean;
  /** "Price", "Length (minutes)". */
  label: string;
  /** How the turns-on note names it: "price", "length". */
  short: string;
}

export const CALENDAR_VALUE_FIELDS: readonly CalendarValueField[] = [
  { key: 'custom_price_pence', flag: 'price', money: true, label: areaCopy('values.field.price'), short: areaCopy('values.short.price') },
  {
    key: 'custom_duration_minutes',
    flag: 'duration',
    money: false,
    label: areaCopy('values.field.duration'),
    short: areaCopy('values.short.duration'),
  },
  { key: 'custom_buffer_minutes', flag: 'buffer', money: false, label: areaCopy('values.field.buffer'), short: areaCopy('values.short.buffer') },
  { key: 'custom_deposit_pence', flag: 'deposit', money: true, label: areaCopy('values.field.deposit'), short: areaCopy('values.short.deposit') },
];

/** The service's "staff may customise" setting each flag stands for, as the route names them. */
const SETTING_FOR_FLAG: Record<CalendarValueFlag, string> = {
  price: 'staff_may_customize_price',
  duration: 'staff_may_customize_duration',
  buffer: 'staff_may_customize_buffer',
  deposit: 'staff_may_customize_deposit',
};

export const NO_CALENDAR_VALUE_FLAGS: CalendarValueFlags = { price: false, duration: false, buffer: false, deposit: false };

/** The flags of a service row, as the step wants them (web `calendarValueFlags`). */
export function calendarValueFlags(
  service:
    | {
        staff_may_customize_duration?: boolean | null;
        staff_may_customize_buffer?: boolean | null;
        staff_may_customize_price?: boolean | null;
        staff_may_customize_deposit?: boolean | null;
      }
    | null
    | undefined,
): CalendarValueFlags {
  return {
    duration: service?.staff_may_customize_duration === true,
    buffer: service?.staff_may_customize_buffer === true,
    price: service?.staff_may_customize_price === true,
    deposit: service?.staff_may_customize_deposit === true,
  };
}

export const anyCalendarValueFlag = (flags: CalendarValueFlags): boolean =>
  flags.duration || flags.buffer || flags.price || flags.deposit;

/**
 * The service's saved values as the standard. A deposit counts only while the service takes one
 * (`payment_requirement` 'deposit'), as the web's dialog reads it: a card hold's fee is not a deposit.
 */
export function calendarValueDefaults(
  service:
    | {
        duration_minutes?: number | null;
        buffer_minutes?: number | null;
        price_pence?: number | null;
        deposit_pence?: number | null;
        payment_requirement?: string | null;
      }
    | null
    | undefined,
): CalendarValueDefaults {
  return {
    durationMinutes: service?.duration_minutes ?? null,
    bufferMinutes: service?.buffer_minutes ?? null,
    pricePence: service?.price_pence ?? null,
    depositPence: service?.payment_requirement === 'deposit' ? (service?.deposit_pence ?? null) : null,
  };
}

/**
 * The fields the step shows. A member admin sees only what the service lets calendars set (D56).
 * The host sees price, length and buffer whatever the settings say, and deposit when the service
 * takes one: saving one turns its setting on.
 */
export function shownCalendarValueFields(
  mode: CalendarValuesMode,
  flags: CalendarValueFlags,
  defaults: CalendarValueDefaults | null | undefined,
  /**
   * The service has active options (CQ-12, Rule B): each option sets its own price, length and
   * buffer, the same on every calendar, so only a deposit can be a calendar's own.
   */
  hasOptions = false,
): CalendarValueField[] {
  const takesDeposit = (defaults?.depositPence ?? 0) > 0;
  return CALENDAR_VALUE_FIELDS.filter(
    (f) =>
      !(hasOptions && OPTION_SET_FLAGS.includes(f.flag)) &&
      (flags[f.flag] || (mode === 'host' && (f.flag !== 'deposit' || takesDeposit))),
  );
}

/** What each option sets for itself, so no calendar has its own (web `OPTION_LOCKED_STAFF_MAY_KEYS`). */
export const OPTION_SET_FLAGS: readonly CalendarValueFlag[] = ['price', 'duration', 'buffer'];

/** The shown fields whose setting is still off: saving a value for one turns it on. */
export function fieldsTurnedOnBySaving(shown: readonly CalendarValueField[], flags: CalendarValueFlags): CalendarValueField[] {
  return shown.filter((f) => !flags[f.flag]);
}

/**
 * What a save would clear, for the question asked before it (web `calendarValuesClearedByFlagChange`):
 * each calendar holding its own value under a permission the save turns off.
 */
const VALUES_CLEARED_WHEN_FLAG_OFF = [
  { flag: 'staff_may_customize_price', column: 'custom_price_pence', label: 'price' },
  { flag: 'staff_may_customize_deposit', column: 'custom_deposit_pence', label: 'deposit' },
  { flag: 'staff_may_customize_duration', column: 'custom_duration_minutes', label: 'length' },
  { flag: 'staff_may_customize_buffer', column: 'custom_buffer_minutes', label: 'buffer' },
] as const;

export interface CalendarValuesCleared {
  calendarId: string;
  calendarName: string;
  fields: string[];
}

export function calendarValuesClearedByFlagChange(params: {
  before: object;
  after: object;
  links: readonly ({ calendar_id: string } & object)[];
  calendarName: (calendarId: string) => string;
}): CalendarValuesCleared[] {
  const before = params.before as Record<string, unknown>;
  const after = params.after as Record<string, unknown>;
  const turnedOff = VALUES_CLEARED_WHEN_FLAG_OFF.filter((f) => before[f.flag] === true && after[f.flag] !== true);
  if (turnedOff.length === 0) return [];
  const out: CalendarValuesCleared[] = [];
  for (const link of params.links) {
    const row = link as Record<string, unknown>;
    const fields = turnedOff.filter((f) => typeof row[f.column] === 'number').map((f) => f.label as string);
    if (fields.length > 0) {
      out.push({ calendarId: link.calendar_id, calendarName: params.calendarName(link.calendar_id), fields });
    }
  }
  return out;
}

/** "price", "price and length", "price, length and buffer". */
export function andList(words: readonly string[]): string {
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** "price", "price or length", "price, length or buffer". */
export function orList(words: readonly string[]): string {
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}

/** What the box shows for a stored value: pounds for money, whole minutes otherwise. */
export function calendarValueText(value: number | null, money: boolean): string {
  return value == null ? '' : money ? (value / 100).toFixed(2) : String(value);
}

/** Blank is the standard (null); anything else must be a number in the range the server takes. */
export function parseCalendarValue(text: string, key: CalendarValueKey): { ok: true; value: number | null } | { ok: false } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  if (key === 'custom_price_pence' || key === 'custom_deposit_pence') return { ok: true, value: Math.round(n * 100) };
  const minutes = Math.round(n);
  if (key === 'custom_duration_minutes' && (minutes < 5 || minutes > 480)) return { ok: false };
  if (key === 'custom_buffer_minutes' && minutes > 120) return { ok: false };
  return { ok: true, value: minutes };
}

/**
 * The values to send: only the shown fields that changed. The first field that is not a value the
 * calendar can take stops it, and is named.
 */
export function calendarValuesPatch(
  shown: readonly CalendarValueField[],
  text: Readonly<Record<CalendarValueKey, string>>,
  current: CalendarValues,
): { ok: true; values: Partial<CalendarValues> } | { ok: false; field: CalendarValueField } {
  const values: Partial<CalendarValues> = {};
  for (const field of shown) {
    const parsed = parseCalendarValue(text[field.key], field.key);
    if (!parsed.ok) return { ok: false, field };
    if (parsed.value !== current[field.key]) values[field.key] = parsed.value;
  }
  return { ok: true, values };
}

/** The boxes, seeded with the calendar's own values. */
export function calendarValuesText(current: CalendarValues): Record<CalendarValueKey, string> {
  return {
    custom_price_pence: calendarValueText(current.custom_price_pence, true),
    custom_duration_minutes: calendarValueText(current.custom_duration_minutes, false),
    custom_buffer_minutes: calendarValueText(current.custom_buffer_minutes, false),
    custom_deposit_pence: calendarValueText(current.custom_deposit_pence, true),
  };
}

/** "Standard: £40.00", "Standard: 30 min"; null when the service has no value to show. */
export function standardValueText(
  key: CalendarValueKey,
  defaults: CalendarValueDefaults | null | undefined,
  currencySymbol: string,
): string | null {
  const money = (pence: number | null | undefined) =>
    pence == null ? null : `${currencySymbol}${(pence / 100).toFixed(2)}`;
  if (key === 'custom_price_pence') return money(defaults?.pricePence);
  if (key === 'custom_deposit_pence') return money(defaults?.depositPence);
  const minutes = key === 'custom_duration_minutes' ? defaults?.durationMinutes : defaults?.bufferMinutes;
  return minutes == null ? null : areaCopy('values.minutes', { count: minutes });
}

/** What the step needs about one calendar, read from the collective's calendars (web `calendarValuesTarget`). */
export function calendarValuesTarget(
  groups: readonly CollectiveCalendarGroup[],
  itemId: string | null | undefined,
  venueId: string,
  calendarId: string,
): CalendarValuesTarget | null {
  const group = groups.find((g) => g.venue_id === venueId);
  const calendar = group?.calendars.find((c) => c.id === calendarId);
  const assignment = calendar?.assigned.find((a) => a.item_id === itemId);
  if (!group || !calendar || !assignment) return null;
  return {
    calendarId,
    calendarName: calendar.name,
    venueName: group.venue_name,
    serviceId: assignment.service_id,
    current: {
      custom_price_pence: assignment.values.custom_price_pence ?? null,
      custom_duration_minutes: assignment.values.custom_duration_minutes ?? null,
      custom_buffer_minutes: assignment.values.custom_buffer_minutes ?? null,
      custom_deposit_pence: assignment.values.custom_deposit_pence ?? null,
    },
  };
}

/** One of the venue's own calendars, from its link to the service (the `practitioner_services` row). */
export function ownCalendarValuesTarget(
  calendar: { id: string; name: string },
  serviceId: string,
  link: PractitionerServiceLink | null | undefined,
): CalendarValuesTarget {
  return {
    calendarId: calendar.id,
    calendarName: calendar.name,
    venueName: '',
    serviceId,
    current: {
      custom_price_pence: link?.custom_price_pence ?? null,
      custom_duration_minutes: link?.custom_duration_minutes ?? null,
      custom_buffer_minutes: link?.custom_buffer_minutes ?? null,
      custom_deposit_pence: link?.custom_deposit_pence ?? null,
    },
  };
}

/** The flags once the route has turned some on (`flags_turned_on`: "staff_may_customize_price"). */
export function flagsTurnedOn(turnedOn: readonly string[] | null | undefined): CalendarValueFlag[] {
  const names = new Set(turnedOn ?? []);
  return (Object.keys(SETTING_FOR_FLAG) as CalendarValueFlag[]).filter((flag) => names.has(SETTING_FOR_FLAG[flag]));
}
