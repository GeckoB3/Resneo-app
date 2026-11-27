// GENERATED from the web's src/lib/api/response-schemas.ts by `npm run copy:response-schemas`
// in the web repo. Do not edit by hand: change the web file and run the script, which also updates
// response-schemas.sha256 here, which response-schemas.sync.test.ts checks.
// ---- copied from the web below this line ----
/**
 * Response schemas: what the web's routes answer and the ResNeo app reads (codebase standards plan
 * P4.5). The app's API client is typed by hand (`data as T`), so a route that drops or renames a
 * field the app reads breaks a screen with nothing to say why. These schemas are the contract.
 *
 * - Each schema describes what its route returns TODAY, success and refusal both.
 * - Objects are passthrough: the web may add fields without breaking older app builds.
 * - A field is required only when the app reads it with no fallback. Everything else is optional,
 *   so a schema never fails on a field the app does not depend on.
 *
 * The web's route tests parse every response against these (`response-schemas.create.test.ts`,
 * `response-schemas.app-routes.test.ts`). The app's `apiFetch` checks them in development and
 * tests, never in production.
 *
 * This file is COPIED to the app (`lib/api/response-schemas.ts`) by
 * `scripts/sync-response-schemas.mjs`, with its hash beside each copy. So it imports nothing but
 * zod, and every edit here is followed by running that script.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------------------------

/** An object that keeps fields the schema does not name: the web may add, never take away. */
function obj<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).passthrough();
}

const str = z.string();
const strN = z.string().nullable();
const num = z.number();
const numN = z.number().nullable();
const bool = z.boolean();
/** Optional and nullable: a field the app reads with a fallback. */
const opt = <T extends z.ZodTypeAny>(t: T) => t.nullable().optional();

/**
 * A refusal. The app shows `error`, or `message` when a route answers `{ code, message }` with no
 * `error` (the no-show fee charge does), so one of the two must be a string
 * (`getApiErrorMessage` in the app's `lib/api/client.ts`).
 */
export const apiErrorSchema = z.union([
  obj({ error: str, code: str.optional() }),
  obj({ message: str, code: str.optional() }),
]);

// ---------------------------------------------------------------------------------------------
// Create routes
// ---------------------------------------------------------------------------------------------

const bookingStatus = z.enum(['Pending', 'Booked']);
const paymentMode = z.enum(['payment', 'setup', 'payment_with_setup', 'linked']);

const complianceWarning = obj({
  compliance_type_id: str,
  compliance_type_name: str,
  enforcement: str,
  state: str,
  severity: str.optional(),
});

/** Card on file (plan §10). The app reads it through `parseStaffCreateCardOnFile`, which tolerates any shape. */
const cardOnFile = obj({ state: str.optional(), covered: bool.optional() });

/** Optional fields every staff create may carry. */
const staffCreateExtras = {
  payment_url: str.optional(),
  payment_link_sent: bool.optional(),
  card_on_file: cardOnFile.optional(),
  card_hold_requested: bool.optional(),
  guest_id: str.optional(),
  compliance_warnings: z.array(complianceWarning).optional(),
  availability_override_warnings: z.array(str).optional(),
};

/** POST /api/booking/create: the public booking page (the app does not call it). */
export const bookingCreateSchema = obj({
  booking_id: str,
  status: bookingStatus,
  requires_deposit: bool,
  payment_mode: paymentMode,
  deposit_amount_pence: num.optional(),
  cancellation_notice_hours: num.optional(),
  client_secret: str.optional(),
  stripe_account_id: str.optional(),
  card_hold_fee_pence: opt(num),
  manage_booking_url: str.optional(),
  ...staffCreateExtras,
});

/** POST /api/booking/create-multi-service and create-group: the app's `GroupedBookingResponse`. */
export const groupedCreateSchema = obj({
  group_booking_id: str,
  booking_ids: z.array(str),
  primary_booking_id: str.optional(),
  requires_deposit: bool,
  total_deposit_pence: num,
  status: bookingStatus,
  client_secret: str.optional(),
  stripe_account_id: str.optional(),
  cancellation_notice_hours: num.optional(),
  payment_mode: paymentMode.optional(),
  card_hold_fee_pence: opt(num),
  linked_checkout: obj({ id: str, payment_url: strN }).optional(),
  linked_visit_id: str.optional(),
  /** Each business's part of a visit across businesses; the app does not read inside them yet. */
  parts: z.array(obj({})).optional(),
  ...staffCreateExtras,
});

/** POST /api/venue/bookings: the app's `CreateBookingResponse`. */
export const venueBookingCreateSchema = obj({
  booking_id: str,
  message: str.optional(),
  deposit_kept: bool.optional(),
  deposit_cancel_at: opt(str),
  ...staffCreateExtras,
});

const chargeKind = z.enum(['none', 'deposit', 'full_payment', 'card_hold']);

/**
 * POST /api/venue/bookings/quote (plan P4.2): what a staff booking would come to. The app reads a
 * quote only when `quote_version` is there, and its own rules otherwise.
 */
export const bookingQuoteSchema = obj({
  quote_version: num,
  mode: z.enum(['single', 'visit', 'group']),
  cancellation_notice_hours: num,
  card_payments_available: bool,
  items: z.array(
    obj({
      index: num,
      service_id: str,
      calendar_id: str,
      date: str,
      start: str,
      end: str,
      duration_minutes: num,
      buffer_minutes: num,
      processing_tail_minutes: num,
      estimated_end_time: strN,
      processing_blocks: z.array(obj({ start_minute: num, duration_minutes: num })),
      price: obj({ service_pence: numN, addons_pence: num, total_pence: num }),
      charge: obj({
        kind: chargeKind,
        amount_pence: num,
        card_hold_fee_pence: numN,
        offered_kind: chargeKind,
        offered_amount_pence: num,
        card_hold_percent: numN,
      }),
    }),
  ),
  totals: obj({
    price_pence: num,
    duration_minutes: num,
    starts_at: str,
    ends_at: str,
    charge_now_pence: num,
    offered_charge_pence: num,
    card_hold_fee_pence: num,
  }),
  deposit: obj({
    required: bool,
    amount_pence: num,
    offered_amount_pence: num,
    word: z.enum(['deposit', 'payment']),
    cancel_choice: bool,
    deadline_text: strN,
    cancel_label: strN,
    kept: bool.nullable(),
    cancel_at: strN,
    outcome_line: strN,
  }),
  card_hold: obj({
    required: bool,
    fee_pence: num,
    consent_text: strN,
    percent: numN,
    percent_label: strN,
  }),
});

// ---------------------------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------------------------

const timelineEvent = obj({ id: str, event_type: str, created_at: str });
const communication = obj({ id: str, message_type: str, channel: str, status: str, created_at: str });

/** GET /api/venue/bookings/[id]: the app's `BookingDetail`. */
export const bookingDetailSchema = obj({
  id: str,
  status: str,
  booking_date: str,
  booking_time: str,
  party_size: num,
  guest_id: strN,
  guest: obj({ id: str, first_name: strN, last_name: strN, email: opt(str), phone: opt(str) }).nullable(),
  booking_end_time: opt(str),
  estimated_end_time: opt(str),
  deposit_status: opt(str),
  deposit_amount_pence: opt(num),
  group_booking_id: opt(str),
  linked_visit_id: opt(str),
  practitioner_name: opt(str),
  inferred_booking_model: opt(str),
  table_assignments: z.array(obj({ id: str, name: str })).optional(),
  addons: z.array(obj({})).optional(),
  events: z.array(timelineEvent).optional(),
  communications: z.array(communication).optional(),
  card_hold: opt(obj({})),
  booking_total_price_pence: opt(num),
  amount_paid_pence: opt(num),
  balance_due_pence: opt(num),
  payment_state: opt(str),
  visit_payment: opt(obj({ booking_ids: z.array(str), total_pence: num, balance_due_pence: num })),
  visit_pay_link: opt(obj({ checkout_id: str })),
  viewer_link: opt(obj({ venue_id: str, act: str, pii: bool })),
  payments: z.array(obj({})).optional(),
  can_delete: bool.optional(),
  /** P4.3: the owed-deposit line and "Keep without deposit", from the server (absent on older ones). */
  deposit_owed_line: opt(str),
  can_keep_without_deposit: bool.optional(),
  keep_without_deposit: opt(obj({ label: str, title: str, message: str, confirm_label: str })),
});

/** One row of GET /api/venue/bookings/list: the app's `BookingListRow`. */
const bookingListRow = obj({
  id: str,
  booking_date: str,
  booking_time: strN,
  party_size: num,
  status: str,
  guest_name: str,
  deposit_status: strN,
  guest_id: opt(str),
  group_booking_id: opt(str),
  calendar_id: opt(str),
  practitioner_id: opt(str),
  booking_end_time: opt(str),
  estimated_end_time: opt(str),
  booking_addon_labels: z.array(str).optional(),
  visit_service_names: z.array(str).optional(),
  // A word, not an object: protected, waiting, not_needed or charged (BookingCardState); null otherwise.
  card_state: opt(z.enum(['protected', 'waiting', 'not_needed', 'charged'])),
});

export const bookingsListSchema = obj({ bookings: z.array(bookingListRow) });

/** POST /api/venue/bookings/[id]/charge: cash or external (`success`), or a card attempt (the intent). */
export const bookingChargeSchema = z.union([
  obj({ success: bool, amount_pence: num.optional(), balance_due_pence: opt(num), replayed: bool.optional() }),
  obj({ payment_intent_id: str, client_secret: strN, amount_pence: num }),
]);

const noShowLine = obj({
  booking_id: str,
  hold_id: str,
  booking_date: str,
  booking_time: str,
  fee_pence: num,
  chargeable: bool,
  refusal: strN,
});

/** GET /api/venue/visits/[groupBookingId]/charge-no-show. The app falls back to `[]` for both arrays. */
export const noShowChargesSchema = obj({
  groups: z.array(obj({ key: str, kind: str, total_pence: num, lines: z.array(noShowLine) })).optional(),
  unchargeable: z.array(noShowLine).optional(),
});

/**
 * POST /api/venue/visits/[groupBookingId]/charge-no-show. When every charge fails the route answers
 * 402 with this same body, which the app reads as an answer, so the refusal schema allows it too.
 */
export const noShowChargeResultSchema = obj({
  charges: z.array(obj({ key: str, kind: str })),
  skipped: z.array(obj({ booking_id: str, refusal: str, message: str })).optional(),
});

// ---------------------------------------------------------------------------------------------
// Venue, services and calendars
// ---------------------------------------------------------------------------------------------

/** GET /api/venue: the app's `VenueBootstrap`. */
export const venueBootstrapSchema = obj({
  id: str,
  name: str,
  slug: str,
  timezone: str,
  currency: str,
  booking_model: str,
  active_booking_models: z.array(str),
  enabled_models: z.array(str),
  pricing_tier: strN,
  current_user_role: str,
  feature_flags: obj({ raw: obj({}).nullable().optional(), resolved: obj({}) }),
  logo_url: opt(str),
  terminology: opt(obj({})),
  current_user_permissions: opt(obj({})),
  opening_hours: opt(obj({})),
  booking_page_config: opt(obj({})),
  login_emails: z.array(str).optional(),
  dismissed_prompts: opt(z.array(str)),
  feature_offers: opt(obj({})),
});

const categoryRef = obj({ id: str, name: str, sort_order: num });

/** GET /api/venue/appointment-services: the app's `ManagedServicesResponse`. */
export const appointmentServicesSchema = obj({
  services: z.array(
    obj({
      id: str,
      name: str,
      duration_minutes: num,
      price_pence: opt(num),
      is_active: bool.optional(),
      category_id: opt(str),
      variants: z.array(obj({ id: str, name: str })).optional(),
      // Each group answers as { group: { id, name, ... }, addons: [...] } (loadAddonGroupsForServices).
      addon_groups: z.array(obj({ group: obj({ id: str, name: str }), addons: z.array(obj({ id: str })).optional() })).optional(),
      processing_time_blocks: opt(z.array(obj({}))),
    }),
  ),
  practitioner_services: z.array(obj({ practitioner_id: str, service_id: str })).optional(),
  categories: z.array(categoryRef).optional(),
  collective_calendars: z.array(obj({})).optional(),
});

const hoursRange = obj({ start: str, end: str });

/** GET /api/venue/practitioners (and `?roster=1`, `?staff_assignable=1`): the app's `PractitionersResponse`. */
export const practitionersSchema = obj({
  practitioners: z.array(
    obj({
      id: str,
      name: str,
      sort_order: num,
      is_active: bool,
      colour: opt(str),
      calendar_type: opt(str),
      working_hours: opt(z.record(str, z.array(hoursRange))),
      break_times: z.array(hoursRange).optional(),
      days_off: opt(z.array(str)),
    }),
  ),
});

/** GET /api/venue/service-categories. */
export const serviceCategoriesSchema = obj({ categories: z.array(categoryRef) });

/** POST and PATCH /api/venue/service-categories: the heading written. */
export const serviceCategoryWriteSchema = obj({ category: categoryRef });

/** PATCH /api/venue/addon-groups/[id]: the app's `AddonGroupUpsertResponse`. */
export const addonGroupUpsertSchema = obj({
  group: obj({
    id: str,
    name: str,
    prompt_to_client: strN,
    description: strN,
    selection_type: z.enum(['single', 'multi']),
    min_select: num,
    max_select: numN,
    hidden_from_online: bool,
    is_active: bool,
    sort_order: num,
  }),
  addons: z.array(
    obj({
      id: str,
      addon_group_id: str,
      name: str,
      additional_price_pence: num,
      additional_duration_minutes: num,
      is_active: bool,
      sort_order: num,
    }),
  ),
});

/** DELETE /api/venue/addon-groups/[id]. */
export const addonGroupDeleteSchema = obj({ success: bool.optional(), archived: bool.optional() });

/** GET /api/venue/calendar-amended-hours?from&to. The app falls back to `[]`. */
export const amendedHoursSchema = obj({
  entries: z
    .array(
      obj({
        kind: z.enum(['hours', 'closed']),
        date_start: str,
        date_end: str,
        periods: z.array(obj({})),
        reason: strN,
        calendar_id: str,
        calendar_name: str,
      }),
    )
    .optional(),
});

/** GET /api/venue/practitioner-leave?from&to: the app's `PractitionerLeaveResponse`. */
export const practitionerLeaveSchema = obj({
  periods: z.array(
    obj({
      id: str,
      practitioner_id: str,
      start_date: str,
      end_date: str,
      leave_type: str,
      notes: strN,
      practitioner_name: str.optional(),
      unavailable_start_time: opt(str),
      unavailable_end_time: opt(str),
    }),
  ),
});

/** GET /api/venue/collectives/[id]/offerings?source_venue_id: a member's own services. The app falls back to `[]`. */
export const collectiveOfferingsSchema = obj({
  services: z.array(obj({ id: str, name: str, duration_minutes: numN, price_pence: numN })).optional(),
});

// ---------------------------------------------------------------------------------------------
// Classes, events and resources
// ---------------------------------------------------------------------------------------------

/** GET /api/venue/classes: the app's `ManagedClassesResponse`. */
export const classesSchema = obj({
  class_types: z.array(obj({ id: str, name: str, duration_minutes: num, capacity: num })),
  timetable: z.array(obj({ id: str, class_type_id: str, day_of_week: num, start_time: str, is_active: bool })),
  instances: z.array(obj({ id: str, class_type_id: str, instance_date: str, start_time: str, is_cancelled: bool })),
  unified_calendars: z.array(obj({ id: str, name: str })).optional(),
  practitioners: z.array(obj({ id: str, name: str })).optional(),
});

/** GET /api/venue/experience-events: the app's `ManagedEventsResponse`. */
export const experienceEventsSchema = obj({
  events: z.array(
    obj({
      id: str,
      name: str,
      description: strN,
      event_date: str,
      start_time: str,
      end_time: str,
      capacity: num,
      image_url: strN,
      calendar_id: strN,
      payment_requirement: str,
      deposit_amount_pence: numN,
      ticket_types: z.array(obj({ name: str, price_pence: num })),
    }),
  ),
});

/** GET /api/venue/resources: the app's `ResourcesManageResponse`. */
export const resourcesSchema = obj({
  resources: z.array(
    obj({
      id: str,
      name: str,
      resource_type: strN,
      display_on_calendar_id: strN,
      slot_interval_minutes: num,
      min_booking_minutes: num,
      max_booking_minutes: num,
      price_per_slot_pence: numN,
      payment_requirement: str,
      deposit_amount_pence: numN,
      is_active: bool,
      availability_hours: obj({}).nullable(),
      sort_order: num,
    }),
  ),
});

// ---------------------------------------------------------------------------------------------
// Compliance, reports, profile and notifications
// ---------------------------------------------------------------------------------------------

/** GET /api/venue/compliance/requirements (every filter): the app's `ComplianceRequirementRow[]`. */
export const complianceRequirementsSchema = obj({
  requirements: z.array(
    obj({
      id: str,
      compliance_type_id: str,
      enforcement: str,
      lock_period_hours: numN,
      online_collection: str,
      appointment_service_id: strN,
      service_item_id: strN,
      compliance_type_name: str,
      compliance_type_category: str,
      compliance_type_is_active: bool,
      scope: str.optional(),
      compliance_type_client_form_can_meet: bool.optional(),
    }),
  ),
});

/** GET /api/venue/compliance/types/[id]: the app's `ComplianceTypeWithVersion` and `ComplianceTemplateDetail`. */
export const complianceTypeSchema = obj({
  type: obj({
    id: str,
    name: str,
    category: str,
    result_type: str,
    validity_period_days: numN,
    is_active: bool,
  }),
  version: obj({ id: str, version_number: num, form_schema: obj({}).nullable() }).nullable(),
  result_type_locked: bool.optional(),
});

const payout = obj({
  id: str,
  amount_pence: num,
  currency: str,
  arrival_date: str,
  created_at: str,
  status: str,
  automatic: bool,
  fees_pence: numN,
  payments_pence: numN,
  refunds_pence: numN,
  other_pence: numN,
  items_count: numN,
});

/** GET /api/venue/reports/payouts: the list (`PosPayoutsReport`) or, with `?payout=`, one payout (`PosPayoutDetail`). */
export const payoutsSchema = z.union([
  obj({ from: str, to: str, currency: str, connected: bool, payouts: z.array(payout), truncated: bool }),
  obj({ currency: str, payout, items: z.array(obj({})) }),
]);

/** GET and PATCH /api/v1/me/profile: the customer's profile, null before one is saved. */
export const meProfileSchema = obj({
  profile: obj({
    display_name: opt(str),
    first_name: opt(str),
    last_name: opt(str),
    phone: opt(str),
    notification_preferences: opt(obj({})),
  }).nullable(),
  user: obj({ id: str.optional(), email: opt(str) }).nullable().optional(),
});

/** GET and PATCH /api/venue/notifications/preferences: the app resolves `prefs` with defaults. */
export const notificationPreferencesSchema = obj({ prefs: obj({}).nullable() });

// ---------------------------------------------------------------------------------------------
// The registry: which schema answers which request
// ---------------------------------------------------------------------------------------------

export type ContractMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ResponseContract {
  method: ContractMethod;
  /** The route's path as its folder names it: `/api/venue/bookings/[id]`. */
  path: string;
  /** For a 2xx or 3xx answer. */
  success: z.ZodTypeAny;
  /** For a 4xx or 5xx answer. */
  error: z.ZodTypeAny;
}

const contract = (method: ContractMethod, path: string, success: z.ZodTypeAny, error: z.ZodTypeAny = apiErrorSchema): ResponseContract => ({
  method,
  path,
  success,
  error,
});

/** The create routes (the table walk-in went in P5.1 step 4), then the app's twenty most used routes (plan P4.5, in its order). */
export const RESPONSE_CONTRACTS: readonly ResponseContract[] = [
  contract('POST', '/api/booking/create', bookingCreateSchema),
  contract('POST', '/api/booking/create-group', groupedCreateSchema),
  contract('POST', '/api/booking/create-multi-service', groupedCreateSchema),
  contract('POST', '/api/venue/bookings', venueBookingCreateSchema),
  contract('POST', '/api/venue/bookings/quote', bookingQuoteSchema),
  contract('GET', '/api/venue/bookings/[id]', bookingDetailSchema),
  contract('GET', '/api/venue/appointment-services', appointmentServicesSchema),
  contract('GET', '/api/venue/practitioners', practitionersSchema),
  contract('GET', '/api/venue/bookings/list', bookingsListSchema),
  contract('GET', '/api/venue', venueBootstrapSchema),
  contract('GET', '/api/venue/compliance/requirements', complianceRequirementsSchema),
  contract('GET', '/api/venue/calendar-amended-hours', amendedHoursSchema),
  contract('GET', '/api/venue/practitioner-leave', practitionerLeaveSchema),
  contract('GET', '/api/venue/visits/[groupBookingId]/charge-no-show', noShowChargesSchema),
  contract(
    'POST',
    '/api/venue/visits/[groupBookingId]/charge-no-show',
    noShowChargeResultSchema,
    z.union([noShowChargeResultSchema, apiErrorSchema]),
  ),
  contract('GET', '/api/venue/classes', classesSchema),
  contract('GET', '/api/venue/service-categories', serviceCategoriesSchema),
  contract('POST', '/api/venue/service-categories', serviceCategoryWriteSchema),
  contract('PATCH', '/api/venue/service-categories', serviceCategoryWriteSchema),
  contract('GET', '/api/venue/reports/payouts', payoutsSchema),
  contract('PATCH', '/api/venue/addon-groups/[id]', addonGroupUpsertSchema),
  contract('DELETE', '/api/venue/addon-groups/[id]', addonGroupDeleteSchema),
  contract('GET', '/api/venue/collectives/[id]/offerings', collectiveOfferingsSchema),
  contract('GET', '/api/venue/compliance/types/[id]', complianceTypeSchema),
  contract('GET', '/api/v1/me/profile', meProfileSchema),
  contract('PATCH', '/api/v1/me/profile', meProfileSchema),
  contract('GET', '/api/venue/experience-events', experienceEventsSchema),
  contract('GET', '/api/venue/notifications/preferences', notificationPreferencesSchema),
  contract('PATCH', '/api/venue/notifications/preferences', notificationPreferencesSchema),
  contract('GET', '/api/venue/resources', resourcesSchema),
  contract('POST', '/api/venue/bookings/[id]/charge', bookingChargeSchema),
];

/** `/api/venue/bookings/abc?x=1` or a full URL, as its path segments. */
function pathSegments(pathOrUrl: string): string[] {
  const noOrigin = pathOrUrl.replace(/^[a-z]+:\/\/[^/]+/i, '');
  const path = noOrigin.split(/[?#]/)[0] ?? '';
  return path.split('/').filter((s) => s !== '');
}

/** How many of a pattern's segments are `[param]`s; null when it does not match. */
function dynamicSegmentsMatched(pattern: string, segments: string[]): number | null {
  const parts = pattern.split('/').filter((s) => s !== '');
  if (parts.length !== segments.length) return null;
  let dynamic = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (/^\[[^\]]+\]$/.test(part)) {
      dynamic++;
      continue;
    }
    if (part !== segments[i]) return null;
  }
  return dynamic;
}

/**
 * The contract for a request: same method, and the path pattern that matches with the fewest
 * `[param]` segments, so `/bookings/list` wins over `/bookings/[id]`. Null when none is written.
 */
export function findResponseContract(method: string, pathOrUrl: string): ResponseContract | null {
  const verb = method.toUpperCase();
  const segments = pathSegments(pathOrUrl);
  let best: ResponseContract | null = null;
  let bestDynamic = Infinity;
  for (const c of RESPONSE_CONTRACTS) {
    if (c.method !== verb) continue;
    const dynamic = dynamicSegmentsMatched(c.path, segments);
    if (dynamic !== null && dynamic < bestDynamic) {
      best = c;
      bestDynamic = dynamic;
    }
  }
  return best;
}

export interface ResponseMismatch {
  contract: ResponseContract;
  /** `path.to.field: message`, one per zod issue. */
  issues: string[];
}

/**
 * Check one answer against its contract: the success schema below 400, the refusal schema from
 * 400. Null when it matches, or when no contract covers the request.
 */
export function checkResponse(method: string, pathOrUrl: string, status: number, body: unknown): ResponseMismatch | null {
  const found = findResponseContract(method, pathOrUrl);
  if (!found) return null;
  const parsed = (status >= 400 ? found.error : found.success).safeParse(body);
  if (parsed.success) return null;
  const issues = parsed.error.issues.map((i) => `${i.path.length ? i.path.map(String).join('.') : '(body)'}: ${i.message}`);
  return { contract: found, issues };
}
