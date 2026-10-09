/**
 * The "Services and staff" step's rules, as pure functions. Port of what the web's
 * `ReferencesStepClient` decides: which tabs show, what a reference can be matched to, what
 * "Add as new" sends, and what the bulk create sends.
 */
import type { BookingReference, ReferenceCatalog, ReferenceDefault, CatalogEntity } from '@/lib/import/types';

export const KNOWN_REFERENCE_TYPES = ['service', 'staff', 'event', 'class', 'resource'] as const;
export const OTHER_TAB = '_other';

export function isKnownReferenceType(t: string): boolean {
  return (KNOWN_REFERENCE_TYPES as readonly string[]).includes(t);
}

/** Tabs for the unmatched references, in the web's order, with "Other" for unknown types. */
export function referenceTabs(refs: BookingReference[]): string[] {
  const unresolved = refs.filter((r) => !r.is_resolved);
  const types = new Set(unresolved.map((r) => r.reference_type));
  const ordered: string[] = KNOWN_REFERENCE_TYPES.filter((t) => types.has(t));
  if (unresolved.some((r) => !isKnownReferenceType(r.reference_type))) ordered.push(OTHER_TAB);
  return ordered;
}

/** The references listed under a tab (every unmatched one when none could be grouped). */
export function referencesForTab(refs: BookingReference[], tab: string, tabCount: number): BookingReference[] {
  const unresolved = refs.filter((r) => !r.is_resolved);
  if (unresolved.length > 0 && tabCount === 0) return unresolved;
  if (tab === OTHER_TAB) return unresolved.filter((r) => !isKnownReferenceType(r.reference_type));
  return refs.filter((r) => r.reference_type === tab);
}

export function referenceTabLabel(t: string): string {
  const labels: Record<string, string> = {
    service: 'Services',
    staff: 'Staff',
    event: 'Events',
    class: 'Classes',
    resource: 'Resources',
    [OTHER_TAB]: 'Other',
  };
  return labels[t] ?? t;
}

export type EntityType =
  | 'service_item'
  | 'appointment_service'
  | 'unified_calendar'
  | 'practitioner'
  | 'event_session'
  | 'class_instance';

const isPractitionerModel = (catalog: ReferenceCatalog | null) => catalog?.bookingModel === 'practitioner_appointment';

export function entityTypeForReference(ref: Pick<BookingReference, 'reference_type'>, catalog: ReferenceCatalog | null): EntityType | undefined {
  switch (ref.reference_type) {
    case 'service':
      return isPractitionerModel(catalog) ? 'appointment_service' : 'service_item';
    case 'staff':
      return isPractitionerModel(catalog) ? 'practitioner' : 'unified_calendar';
    case 'event':
      return 'event_session';
    case 'class':
      return 'class_instance';
    case 'resource':
      return 'unified_calendar';
    default:
      return undefined;
  }
}

/** What a reference can be matched to on this venue. */
export function optionsForReference(ref: Pick<BookingReference, 'reference_type'>, catalog: ReferenceCatalog | null): CatalogEntity[] {
  if (!catalog) return [];
  switch (ref.reference_type) {
    case 'service':
      return isPractitionerModel(catalog) ? catalog.appointmentServices : catalog.serviceItems;
    case 'staff':
      return isPractitionerModel(catalog) ? catalog.practitioners : catalog.calendars;
    case 'event':
      return catalog.eventSessions ?? [];
    case 'class':
      return catalog.classInstances ?? [];
    case 'resource':
      return catalog.resourceCalendars ?? [];
    default:
      return [];
  }
}

/** The "Add as new" button, for the types that can be created here. */
export function createLabelForReference(ref: Pick<BookingReference, 'reference_type'>, catalog: ReferenceCatalog | null): string | null {
  if (ref.reference_type === 'service') return 'Add as new service';
  if (ref.reference_type === 'staff') return isPractitionerModel(catalog) ? 'Add as new practitioner' : 'Add as bookable staff';
  return null;
}

export function staffNounFor(catalog: ReferenceCatalog | null): string {
  return isPractitionerModel(catalog) ? 'practitioner' : 'team member';
}

export type CreateDraft = { name: string; duration: string; price: string };

/** A create form seeded from the booking data: its name, a suggested length (60 by default) and price. */
export function defaultCreateDraft(ref: Pick<BookingReference, 'raw_value'>, suggestion: ReferenceDefault | undefined): CreateDraft {
  return {
    name: ref.raw_value,
    duration: suggestion?.suggested_duration_minutes ? String(suggestion.suggested_duration_minutes) : '60',
    price: suggestion?.suggested_price_pence != null ? (suggestion.suggested_price_pence / 100).toFixed(2) : '',
  };
}

/** Minutes typed into the length box, or null when it is not a positive whole number. */
export function parseDurationMinutes(text: string): number | null {
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A typed price in the minor unit (pence, cents), or null when the box is empty or not a
 * price. Any currency sign or space is ignored, as on the web, and a decimal comma ("12,50")
 * is read as a decimal point; a thousands comma ("1,200") is dropped.
 */
export function parsePriceMinor(text: string): number | null {
  let clean = text.replace(/[^\d.,]/g, '');
  if (!clean.includes('.') && /,\d{1,2}$/.test(clean)) clean = clean.replace(',', '.');
  clean = clean.replace(/,/g, '');
  if (clean === '' || !/\d/.test(clean)) return null;
  const value = Number.parseFloat(clean);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

/** The PATCH body for "Add as new" on one reference. */
export function createReferenceBody(ref: Pick<BookingReference, 'reference_type' | 'raw_value'>, draft: CreateDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    resolution_action: 'create',
    create_label: draft.name.trim() || ref.raw_value,
  };
  if (ref.reference_type === 'service') {
    const duration = parseDurationMinutes(draft.duration);
    if (duration) body.create_duration_minutes = duration;
    const price = parsePriceMinor(draft.price);
    if (price != null) body.create_price_pence = price;
  }
  return body;
}

export type BulkRow = { reference_id: string; selected: boolean; name: string; duration: string; price: string };

export function bulkRowsFor(refs: BookingReference[], type: 'service' | 'staff', defaults: Record<string, ReferenceDefault>): BulkRow[] {
  return refs
    .filter((r) => !r.is_resolved && r.reference_type === type)
    .map((r) => ({ reference_id: r.id, selected: true, ...defaultCreateDraft(r, defaults[r.id]) }));
}

/** The `references/bulk` operations for the ticked rows. */
export function bulkCreateOperations(rows: BulkRow[], type: 'service' | 'staff', catalog: ReferenceCatalog | null): Record<string, unknown>[] {
  const isService = type === 'service';
  const resolved_entity_type = entityTypeForReference({ reference_type: type }, catalog);
  return rows
    .filter((r) => r.selected && r.name.trim())
    .map((row) => {
      const op: Record<string, unknown> = {
        reference_id: row.reference_id,
        action: 'create',
        resolved_entity_type,
        create_label: row.name.trim(),
      };
      if (isService) {
        op.create_duration_minutes = parseDurationMinutes(row.duration);
        op.create_price_pence = parsePriceMinor(row.price);
      }
      return op;
    });
}

/** How many services or staff the venue already has. */
export function existingCountForType(type: 'service' | 'staff', catalog: ReferenceCatalog | null): number {
  if (!catalog) return 0;
  if (type === 'service') return (isPractitionerModel(catalog) ? catalog.appointmentServices : catalog.serviceItems).length;
  return (isPractitionerModel(catalog) ? catalog.practitioners : catalog.calendars).length;
}

/**
 * A venue with few or no services whose bookings name several: lead with "set them all up in
 * one step" rather than one at a time (the web's build-from-bookings hero).
 */
export function servicesLookFresh(refs: BookingReference[], catalog: ReferenceCatalog | null): boolean {
  if (!catalog) return false;
  const unmatched = refs.filter((r) => !r.is_resolved && r.reference_type === 'service').length;
  return unmatched >= 3 && existingCountForType('service', catalog) <= unmatched;
}

/** The symbol shown beside a price box (GBP, EUR and USD by symbol, any other by its code). */
export function currencySymbolFor(code: string | null | undefined): string {
  const upper = (code ?? 'GBP').toUpperCase();
  const symbols: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' };
  return symbols[upper] ?? upper;
}
