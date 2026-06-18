/**
 * Per-calendar staff service overrides — pure helpers shared by the
 * StaffServiceOverrideSheet and its tests. Mirrors the web
 * `StaffServiceOverrideModal.buildPatch` (null-when-equals-base diffing) and
 * `mergeAppointmentServiceWithPractitionerLink` (effective values for the form).
 *
 * The PATCH body is sent to /api/venue/practitioner-service-overrides (Bearer
 * via B1). Each `custom_*` field is sent ONLY when its `staff_may_customize_*`
 * flag is on; the value is `null` when it equals the venue base (which clears
 * the override server-side) and the typed value otherwise.
 *
 * @see C:\Resneo\src\app\dashboard\appointment-services\StaffServiceOverrideModal.tsx
 * @see C:\Resneo\src\lib\appointments\merge-service-with-overrides.ts
 */
import type { ManagedService, PractitionerServiceLink } from '@/types/services-manage';

/** Which fields a non-admin may override, derived from the service's flags. */
export interface StaffMayCustomize {
  name: boolean;
  description: boolean;
  duration: boolean;
  buffer: boolean;
  price: boolean;
  deposit: boolean;
  colour: boolean;
}

/** Read the seven `staff_may_customize_*` flags off a service into a tidy object. */
export function staffMayCustomizeFlags(service: ManagedService): StaffMayCustomize {
  return {
    name: service.staff_may_customize_name === true,
    description: service.staff_may_customize_description === true,
    duration: service.staff_may_customize_duration === true,
    buffer: service.staff_may_customize_buffer === true,
    price: service.staff_may_customize_price === true,
    deposit: service.staff_may_customize_deposit === true,
    colour: service.staff_may_customize_colour === true,
  };
}

/** True when the admin enabled at least one override field on the service. */
export function staffMayCustomizeAny(service: ManagedService): boolean {
  const f = staffMayCustomizeFlags(service);
  return f.name || f.description || f.duration || f.buffer || f.price || f.deposit || f.colour;
}

/**
 * Effective service definition for a calendar: venue base merged with the
 * per-calendar override link (each `custom_*` wins when non-null). Used to seed
 * the override sheet's fields. Mirrors the web's
 * `mergeAppointmentServiceWithPractitionerLink`.
 */
export function mergeServiceWithOverride(
  base: ManagedService,
  link: PractitionerServiceLink | null | undefined,
): {
  name: string;
  description: string;
  duration_minutes: number;
  buffer_minutes: number;
  price_pence: number | null;
  deposit_pence: number | null;
  colour: string;
} {
  return {
    name: link?.custom_name ?? base.name,
    description: link?.custom_description ?? base.description ?? '',
    duration_minutes: link?.custom_duration_minutes ?? base.duration_minutes,
    buffer_minutes: link?.custom_buffer_minutes ?? base.buffer_minutes ?? 0,
    price_pence: link?.custom_price_pence ?? base.price_pence ?? null,
    deposit_pence: link?.custom_deposit_pence ?? base.deposit_pence ?? null,
    colour: link?.custom_colour ?? base.colour ?? '#3B82F6',
  };
}

/** The user-entered draft the sheet edits (strings for text inputs). */
export interface ServiceOverrideDraft {
  name: string;
  description: string;
  durationMinutes: number;
  bufferMinutes: number;
  /** Pounds as typed, e.g. "12.50" or "" (cleared). */
  price: string;
  requireDeposit: boolean;
  deposit: string;
  colour: string;
}

/** PATCH body for /api/venue/practitioner-service-overrides. */
export interface ServiceOverridePatch {
  service_id: string;
  /** Sent only when the staff member manages more than one calendar. */
  calendar_id?: string;
  custom_name?: string | null;
  custom_description?: string | null;
  custom_duration_minutes?: number | null;
  custom_buffer_minutes?: number | null;
  custom_price_pence?: number | null;
  custom_deposit_pence?: number | null;
  custom_colour?: string | null;
}

/** Parse a pounds string to integer pence, or null when blank/invalid (≥ 0). */
export function poundsToPenceOrNull(pounds: string): number | null {
  const trimmed = pounds.trim();
  if (!trimmed) return null;
  const num = Number.parseFloat(trimmed);
  if (Number.isNaN(num) || num < 0) return null;
  return Math.round(num * 100);
}

/**
 * Build the override PATCH body, diffing each permitted field to `null` when it
 * equals the venue base (clearing the override). Only fields whose
 * `staff_may_customize_*` flag is on are included. Verbatim port of the web
 * modal's `buildPatch` (StaffServiceOverrideModal.tsx L108-153) plus the
 * optional `calendar_id` it appends when the staff member has >1 calendar.
 */
export function buildServiceOverridePatch(args: {
  service: ManagedService;
  draft: ServiceOverrideDraft;
  /** When the staff member manages several calendars, the chosen one. */
  calendarId?: string | null;
  /** True when the sheet shows a calendar picker (>1 calendar). */
  multipleCalendars?: boolean;
}): ServiceOverridePatch {
  const { service, draft } = args;
  const flags = staffMayCustomizeFlags(service);
  const patch: ServiceOverridePatch = { service_id: service.id };

  if (args.multipleCalendars && args.calendarId) {
    patch.calendar_id = args.calendarId;
  }

  if (flags.name) {
    const base = service.name.trim();
    const next = draft.name.trim();
    patch.custom_name = next === base ? null : next;
  }
  if (flags.description) {
    const base = service.description ?? '';
    const next = draft.description.trim();
    patch.custom_description = next === base ? null : next || null;
  }
  if (flags.duration) {
    patch.custom_duration_minutes =
      draft.durationMinutes === service.duration_minutes ? null : draft.durationMinutes;
  }
  if (flags.buffer) {
    const base = service.buffer_minutes ?? 0;
    patch.custom_buffer_minutes = draft.bufferMinutes === base ? null : draft.bufferMinutes;
  }
  if (flags.price) {
    const next = poundsToPenceOrNull(draft.price);
    const base = service.price_pence ?? null;
    patch.custom_price_pence = next === base ? null : next;
  }
  if (flags.deposit) {
    const base = service.deposit_pence ?? 0;
    if (!draft.requireDeposit) {
      // Clearing a deposit: 0 when the base had one (so it's overridden off),
      // else null (no override needed). Matches the web modal exactly.
      patch.custom_deposit_pence = base > 0 ? 0 : null;
    } else {
      const next = poundsToPenceOrNull(draft.deposit) ?? 0;
      patch.custom_deposit_pence = next === base ? null : next;
    }
  }
  if (flags.colour) {
    const base = service.colour ?? '#3B82F6';
    patch.custom_colour = draft.colour === base ? null : draft.colour;
  }

  return patch;
}
