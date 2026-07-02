/**
 * More-tab destination index + gating — extracted as a pure module so the
 * bento / grouped-list / search all derive from one source AND the gating can be
 * unit-tested without dragging in the screen's heavy transitive imports
 * (react-query, the API client, netinfo, …). `settings.tsx` re-exports these.
 *
 * Mirrors the web `DashboardSidebar` gating: model links (Classes/Events/
 * Resources) are model-driven (NOT role-gated); Compliance follows the
 * appointment-tier + records flag (shown to staff AND admin); Waitlist /
 * Calendar availability follow model eligibility rather than role.
 *
 * Layout intent (read by settings.tsx): the daily-driver tools live in
 * `workspace` — one `primary` hero tile plus the `featured` bento grid — and
 * everything else is grouped by how it's used (`LIST_GROUPS`), so the old
 * fourteen-row "Manage" dump becomes a set of short, scannable sections.
 * @see _reference/Resneo/src/app/dashboard/DashboardSidebar.tsx
 */
import type { SymbolViewProps } from 'expo-symbols';

import { isAppointmentPlanTier } from '@/lib/venue/venue-experience';
import type { BookingModel } from '@/types/venue';

/** Icon-tile hues — a curated ramp so each destination feels distinct. */
export const TILE = {
  amber: '#D97706',
  teal: '#0D9488',
  sky: '#0369A1',
  navy: '#003B6F',
  indigo: '#4F46E5',
  emerald: '#059669',
  rose: '#BE123C',
  slate: '#475569',
  violet: '#7C3AED',
  orange: '#EA580C',
};

export type DestKind = 'route' | 'web';
export type DestGroup =
  | 'workspace'
  | 'setup'
  | 'people'
  | 'growth'
  | 'network'
  | 'bookingTypes'
  | 'app'
  | 'account';

/** One navigable surface — the single source of truth for the bento, the grouped
 *  list and search. Role/enablement filtering happens in `buildDestinations`. */
export type Destination = {
  id: string;
  label: string;
  hint: string;
  icon: SymbolViewProps['name'];
  tile: string;
  group: DestGroup;
  kind: DestKind;
  /** Route path (kind 'route') or web dashboard path (kind 'web'). */
  target?: string;
  /** Show in the "Quick actions" bento grid. */
  featured?: boolean;
  /** The single most-used tool — rendered as the full-width hero tile above the
   *  grid. Implies `featured` for filtering purposes. */
  primary?: boolean;
  /** Opens an external surface — shows the "open" glyph. */
  external?: boolean;
  /**
   * Search synonyms so users searching the web's vocabulary land on the right
   * row (e.g. "payments"/"stripe" → Plan & payments, "SMS"/"templates" →
   * Communications). Matched alongside the visible label & hint. Not rendered.
   */
  keywords?: string[];
};

/** Groups rendered as inset lists, in order. (`workspace` → bento; `account` →
 *  hero.) Each is a short, single-purpose section so nothing is a catch-all. */
export const LIST_GROUPS: { key: DestGroup; title: string }[] = [
  { key: 'setup', title: 'Your venue' },
  { key: 'people', title: 'Team & clients' },
  { key: 'bookingTypes', title: 'Booking types' },
  { key: 'growth', title: 'Billing & growth' },
  { key: 'network', title: 'Linked venues' },
  { key: 'app', title: 'App & support' },
];

/**
 * Secondary booking models. Classes/Events/Resources have in-app screens;
 * setup & products still live on the web. Tables remain web-only.
 */
export const SECONDARY_MODEL_ROWS: {
  model: BookingModel;
  label: string;
  hint: string;
  appRoute?: string;
  webPath: string;
  icon: SymbolViewProps['name'];
  tile: string;
}[] = [
  { model: 'class_session', label: 'Classes', hint: 'Timetable & session rosters', appRoute: '/classes', webPath: '/dashboard/class-timetable', icon: { ios: 'figure.run', android: 'fitness_center', web: 'fitness_center' }, tile: TILE.emerald },
  { model: 'event_ticket', label: 'Events', hint: 'Events & attendee rosters', appRoute: '/events', webPath: '/dashboard/event-manager', icon: { ios: 'ticket.fill', android: 'confirmation_number', web: 'confirmation_number' }, tile: TILE.violet },
  { model: 'resource_booking', label: 'Resources', hint: 'Resource day view', appRoute: '/resources', webPath: '/dashboard/resource-timeline', icon: { ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' }, tile: TILE.slate },
  { model: 'table_reservation', label: 'Tables', hint: 'Table & floor plan setup', webPath: '/dashboard/tables', icon: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' }, tile: TILE.orange },
];

/** Inputs the destinations builder reads. Derived from venue bootstrap + role. */
export type DestinationsContext = {
  isAdmin: boolean;
  /** Every booking model this venue has enabled (primary + active + enabled). */
  enabledModels: Set<BookingModel>;
  pricingTier: string | null | undefined;
  /** `feature_flags.resolved.compliance_records_enabled`. */
  complianceEnabled: boolean;
  /** `feature_flags.resolved.waitlist_v2`. */
  waitlistEnabled: boolean;
};

/**
 * Build the full, role- and eligibility-aware destination index. Pure so the
 * gating can be unit-tested without rendering. Destinations are pushed grouped
 * and in display order, so each `LIST_GROUPS` section reads top-to-bottom.
 */
export function buildDestinations(ctx: DestinationsContext): Destination[] {
  const { isAdmin, enabledModels, pricingTier, complianceEnabled, waitlistEnabled } = ctx;

  const hasModel = (...models: BookingModel[]) => models.some((m) => enabledModels.has(m));
  const isAppointmentTier = isAppointmentPlanTier(pricingTier);
  /** Appointment-scheduling venues (or any non-table model) get the diary tools. */
  const isSchedulingExperience =
    isAppointmentTier ||
    hasModel(
      'practitioner_appointment',
      'unified_scheduling',
      'class_session',
      'event_ticket',
      'resource_booking',
    );

  const list: Destination[] = [];

  // Account — reached via the hero; indexed here so search can surface it.
  list.push({ id: 'account', label: 'Account settings', hint: 'Name, sign-in email, phone & password', icon: { ios: 'person.circle.fill', android: 'account_circle', web: 'account_circle' }, tile: TILE.navy, group: 'account', kind: 'route', target: '/manage/account', keywords: ['settings', 'profile', 'password', 'sign in', 'email', 'phone'] });

  // ── Workspace — the daily-driver tools. `today` is the hero tile; the rest
  //    fill the bento grid. Ordered by how often staff reach for them. ────────
  list.push({ id: 'today', label: 'Today', hint: 'KPIs, forecast & arrivals at a glance', icon: { ios: 'sun.max.fill', android: 'wb_sunny', web: 'wb_sunny' }, tile: TILE.amber, group: 'workspace', kind: 'route', target: '/today', featured: true, primary: true, keywords: ['home', 'dashboard', 'overview'] });
  if (isSchedulingExperience) {
    list.push({ id: 'availability', label: 'Calendar availability', hint: 'Block time & book leave', icon: { ios: 'calendar', android: 'edit_calendar', web: 'edit_calendar' }, tile: TILE.sky, group: 'workspace', kind: 'route', target: '/availability', featured: true, keywords: ['time off', 'leave', 'blocks', 'closures'] });
  }
  // Waitlist — web shows it to table venues always, appointment/hybrid when the
  // waitlist feature is enabled. (Screen degrades to an empty state otherwise.)
  if (waitlistEnabled || hasModel('table_reservation')) {
    list.push({ id: 'waitlist', label: 'Waitlist', hint: 'Offer & confirm waiting clients', icon: { ios: 'hourglass', android: 'hourglass_empty', web: 'hourglass_empty' }, tile: TILE.teal, group: 'workspace', kind: 'route', target: '/waitlist', featured: true });
  }
  if (isAdmin) {
    list.push({ id: 'reports', label: 'Reports', hint: 'Bookings, no-shows, deposits & insights', icon: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }, tile: TILE.indigo, group: 'workspace', kind: 'route', target: '/reports', featured: true, keywords: ['analytics', 'insights', 'stats'] });
  }
  // Notifications — reached from the hero bell; indexed (not featured) for search.
  list.push({ id: 'notifications', label: 'Notifications', hint: 'In-app notification feed', icon: { ios: 'bell.fill', android: 'notifications', web: 'notifications' }, tile: TILE.rose, group: 'workspace', kind: 'route', target: '/notifications' });

  // ── Your venue — how the business is set up & what it offers. ──────────────
  list.push({ id: 'services', label: 'Services', hint: 'Review & edit your appointment services', icon: { ios: 'scissors', android: 'content_cut', web: 'content_cut' }, tile: TILE.navy, group: 'setup', kind: 'route', target: '/manage/services', keywords: ['treatments', 'pricing', 'duration'] });
  list.push({ id: 'hours', label: 'Business hours', hint: 'Weekly opening hours & closures', icon: { ios: 'clock.fill', android: 'access_time', web: 'access_time' }, tile: TILE.sky, group: 'setup', kind: 'route', target: '/manage/hours', keywords: ['settings', 'opening', 'closures', 'exceptions'] });
  if (isAdmin) {
    list.push({ id: 'booking-settings', label: 'Booking settings', hint: 'Booking types & guest accounts', icon: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }, tile: TILE.slate, group: 'setup', kind: 'route', target: '/manage/booking-settings', keywords: ['settings', 'guests', 'waitlist', 'deposits'] });
    list.push({ id: 'booking-page', label: 'Booking page', hint: 'Branding, colours, fonts & public tabs', icon: { ios: 'globe', android: 'public', web: 'public' }, tile: TILE.indigo, group: 'setup', kind: 'route', target: '/manage/booking-page', keywords: ['settings', 'branding', 'public', 'embed', 'widget'] });
    list.push({ id: 'venue-profile', label: 'Venue profile', hint: 'Name, contact details & address', icon: { ios: 'building.2.fill', android: 'storefront', web: 'storefront' }, tile: TILE.teal, group: 'setup', kind: 'route', target: '/manage/venue-profile', keywords: ['settings', 'business', 'location'] });
  }
  // Compliance — appointment tier + records flag, shown to staff AND admin (web parity).
  if (isAppointmentTier && complianceEnabled) {
    list.push({ id: 'compliance', label: 'Compliance', hint: 'Check-ins, expiries & outstanding forms', icon: { ios: 'checkmark.shield.fill', android: 'verified_user', web: 'verified_user' }, tile: TILE.emerald, group: 'setup', kind: 'route', target: '/manage/compliance', keywords: ['consent', 'forms', 'documents', 'certificates', 'requirements', 'check-in', 'expiring'] });
  }
  // Compliance settings — the web Settings → Compliance tab (Templates /
  // Requirements / General). Admin + appointment tier, NOT gated on the records
  // flag (web SettingsView parity) so admins can turn compliance on from here.
  if (isAdmin && isAppointmentTier) {
    list.push({ id: 'compliance-settings', label: 'Compliance settings', hint: 'Templates, service requirements & defaults', icon: { ios: 'checklist', android: 'rule', web: 'rule' }, tile: TILE.slate, group: 'setup', kind: 'route', target: '/manage/compliance-settings', keywords: ['settings', 'consent', 'forms', 'templates', 'requirements', 'general', 'enforcement'] });
  }

  // ── Team & clients — people, messaging & client data. ──────────────────────
  if (isAdmin) {
    list.push({ id: 'team', label: 'Team', hint: 'Staff logins & roles', icon: { ios: 'person.2.fill', android: 'group', web: 'group' }, tile: TILE.emerald, group: 'people', kind: 'route', target: '/manage/team', keywords: ['settings', 'staff', 'roles', 'permissions'] });
    list.push({ id: 'communications', label: 'Communications', hint: 'Confirmations, reminders & alerts', icon: { ios: 'envelope.fill', android: 'mail', web: 'mail' }, tile: TILE.amber, group: 'people', kind: 'route', target: '/manage/communications', keywords: ['settings', 'SMS', 'email', 'templates', 'reminders', 'notifications'] });
    list.push({ id: 'import-contacts', label: 'Import contacts', hint: 'Upload a CSV of clients on the web', icon: { ios: 'square.and.arrow.down', android: 'upload_file', web: 'upload_file' }, tile: TILE.sky, group: 'people', kind: 'web', target: '/dashboard/import', external: true, keywords: ['csv', 'upload', 'bulk', 'clients', 'guests', 'bookings', 'data'] });
  }

  // ── Booking types — only the models this venue has enabled. Model-driven, NOT
  //    role-gated (web parity): staff at a class/event/resource venue reach them.
  for (const row of SECONDARY_MODEL_ROWS) {
    if (!enabledModels.has(row.model)) continue;
    list.push({ id: `model-${row.model}`, label: row.label, hint: row.hint, icon: row.icon, tile: row.tile, group: 'bookingTypes', kind: row.appRoute ? 'route' : 'web', target: row.appRoute ?? row.webPath, external: !row.appRoute });
  }

  // ── Billing & growth. ──────────────────────────────────────────────────────
  if (isAdmin) {
    list.push({ id: 'plan', label: 'Plan & payments', hint: 'Subscription tier & Stripe', icon: { ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' }, tile: TILE.violet, group: 'growth', kind: 'route', target: '/manage/plan', keywords: ['settings', 'payments', 'stripe', 'billing', 'subscription', 'invoice'] });
    list.push({ id: 'refer-earn', label: 'Refer & Earn', hint: 'Share your link & track rewards', icon: { ios: 'gift.fill', android: 'card_giftcard', web: 'card_giftcard' }, tile: TILE.rose, group: 'growth', kind: 'route', target: '/manage/refer-earn', keywords: ['referral', 'rewards', 'credit', 'invite'] });
  }

  // ── Linked venues — cross-venue calendars & combined booking pages. ────────
  list.push({ id: 'linked-calendar', label: 'Linked calendar', hint: 'View bookings at venues linked to yours', icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }, tile: TILE.teal, group: 'network', kind: 'route', target: '/linked-venues/calendar', keywords: ['linked accounts', 'cross-venue'] });
  if (isAdmin) {
    list.push({ id: 'linked-venues', label: 'Linked venues', hint: 'Share calendars & cross-venue bookings', icon: { ios: 'link', android: 'link', web: 'link' }, tile: TILE.teal, group: 'network', kind: 'route', target: '/linked-venues', keywords: ['settings', 'linked accounts', 'partners'] });
    list.push({ id: 'collectives', label: 'Venue collectives', hint: 'A combined booking page across linked venues', icon: { ios: 'person.2.wave.2.fill', android: 'groups', web: 'groups' }, tile: TILE.sky, group: 'network', kind: 'route', target: '/collectives', keywords: ['combined', 'linked venues'] });
  }

  // ── App & support. ─────────────────────────────────────────────────────────
  list.push({ id: 'support', label: 'Support', hint: 'Contact the Resneo team', icon: { ios: 'questionmark.circle.fill', android: 'help', web: 'help' }, tile: TILE.teal, group: 'app', kind: 'route', target: '/support', keywords: ['help', 'contact'] });
  list.push({ id: 'push', label: 'Push notifications', hint: 'Alerts this device shows & what for', icon: { ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }, tile: TILE.rose, group: 'app', kind: 'route', target: '/manage/notification-preferences', keywords: ['alerts', 'reminders'] });
  list.push({ id: 'web-dashboard', label: 'Web dashboard', hint: 'Open the full dashboard in your browser', icon: { ios: 'desktopcomputer', android: 'computer', web: 'computer' }, tile: TILE.slate, group: 'app', kind: 'web', target: '/dashboard', external: true });

  return list;
}
