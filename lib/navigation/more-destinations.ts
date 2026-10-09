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
  | 'checkoutSetup'
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
   * The web's vocabulary for this destination, kept from the settings search
   * the More tab used to carry (Ask ResNeo stands in its place since R27). Not
   * rendered, and nothing filters on it today: it is the mapping to restore if
   * a find-a-screen field comes back
   * (e.g. "payments"/"stripe" → Plan & payments, "SMS"/"templates" →
   * Communications).
   */
  keywords?: string[];
};

/** Groups rendered as inset lists, in order. (`workspace` → bento; `account` →
 *  hero.) Each is a short, single-purpose section so nothing is a catch-all. */
export const LIST_GROUPS: { key: DestGroup; title: string }[] = [
  { key: 'setup', title: 'Your venue' },
  { key: 'people', title: 'Team & clients' },
  { key: 'bookingTypes', title: 'Booking types' },
  // Checkout's set-up screens, all in the app (owner, 2026-10-09: full parity with the web; this
  // group used to open the web). Beside the venue's other set-up, with In-person payments drawn
  // straight after it. Only POS venues have rows here, and an empty group is not drawn, so every
  // other venue's More tab is unchanged.
  { key: 'checkoutSetup', title: 'Checkout set-up' },
  { key: 'growth', title: 'Billing & growth' },
  { key: 'network', title: 'Linked venues' },
  // Help and the app itself come last.
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
  /**
   * The live shared-services collective this venue is in, when there is one: the Collective area
   * is offered under its name (web sidebar, 2026-09-17).
   */
  collectiveArea?: { name: string } | null;
  /**
   * `feature_flags.resolved.pos_enabled` (POS plan §4.22): the Checkout tile and Checkout's web
   * rows. Absent or false keeps the More tab exactly as it was before app step 1.
   */
  posEnabled?: boolean;
  /**
   * `feature_flags.resolved.pos_loyalty_enabled` (Pass LC): the loyalty card's web row. Resolves
   * off whenever `pos_enabled` is.
   */
  loyaltyEnabled?: boolean;
  /**
   * Orders (POS app step 5, UX spec §13.7 `app.tile.orders`): Checkout on, the login holds
   * `manage_orders`, and the shop is on or paid orders are waiting.
   */
  ordersEnabled?: boolean;
  /** New paid orders, shown on the Orders tile (`nav.orders.badgeSr`). */
  ordersNewCount?: number | null;
  /** `feature_flags.resolved.pos_online_shop_enabled`: the shop settings row, for admins. */
  shopEnabled?: boolean;
  /** `feature_flags.resolved.pos_gift_vouchers_enabled`: the gift voucher settings row, for admins. */
  vouchersEnabled?: boolean;
  /**
   * What this login may do at Checkout, from the POS bootstrap. Admins hold every capability; a team
   * member with `manage_settings` reaches Checkout settings and one with `view_reports` the records.
   */
  posCan?: { manage_settings?: boolean; view_reports?: boolean; import_products?: boolean };
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
  // Checkout (POS app step 1, UX spec §13.3 `app.tile.checkout`): only with the POS switch on.
  if (ctx.posEnabled === true) {
    list.push({ id: 'checkout', label: 'Checkout', hint: "Take payments and see today's sales", icon: { ios: 'creditcard.fill', android: 'point_of_sale', web: 'point_of_sale' }, tile: TILE.emerald, group: 'workspace', kind: 'route', target: '/checkout', featured: true, keywords: ['till', 'pos', 'sale', 'payment', 'pay', 'receipt', 'refund'] });
    // Products and stock (app step 4, UX spec §13.6 `app.tile.stock`): every team member; staff
    // without `manage_products` see products read only, and the stock tabs follow Track stock.
    // Orders (app step 5, UX spec §13.7 `app.tile.orders`), with the count of new orders.
    if (ctx.ordersEnabled === true) {
      const fresh = ctx.ordersNewCount ?? 0;
      list.push({ id: 'orders', label: 'Orders', hint: fresh > 0 ? `${fresh} new orders` : 'Online orders to prepare, send or hand over', icon: { ios: 'shippingbox.and.arrow.backward.fill', android: 'local_shipping', web: 'local_shipping' }, tile: TILE.sky, group: 'workspace', kind: 'route', target: '/orders', featured: true, keywords: ['orders', 'shop', 'online', 'collection', 'delivery', 'pickup'] });
    }
    list.push({ id: 'stock', label: 'Products and stock', hint: 'Stock levels, stocktakes and deliveries', icon: { ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' }, tile: TILE.amber, group: 'workspace', kind: 'route', target: '/stock', featured: true, keywords: ['products', 'retail', 'stock', 'stocktake', 'barcode', 'inventory'] });
  }
  if (isSchedulingExperience) {
    list.push({ id: 'availability', label: 'Calendar availability', hint: 'Hours, breaks, closures & amended hours', icon: { ios: 'calendar', android: 'edit_calendar', web: 'edit_calendar' }, tile: TILE.sky, group: 'workspace', kind: 'route', target: '/availability', featured: true, keywords: ['time off', 'leave', 'closures', 'amended hours', 'breaks', 'calendars'] });
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

  // ── Linked venues — cross-venue calendars & combined booking pages. Linked venues' bookings are
  // on the Calendar tab as their own columns, so there is no separate linked-calendar page (web
  // parity, 2026-09-19).
  if (isAdmin) {
    list.push({ id: 'linked-venues', label: 'Linked venues', hint: 'Share calendars & cross-venue bookings', icon: { ios: 'link', android: 'link', web: 'link' }, tile: TILE.teal, group: 'network', kind: 'route', target: '/linked-venues', keywords: ['settings', 'linked accounts', 'partners'] });
    if (ctx.collectiveArea) {
      list.push({ id: 'collective-area', label: 'Manage Collective', hint: `Services, venues and history of ${ctx.collectiveArea.name}`, icon: { ios: 'square.grid.3x3.fill', android: 'grid_view', web: 'grid_view' }, tile: TILE.indigo, group: 'network', kind: 'route', target: '/collective-area', keywords: ['collective', 'shared services', 'combined'] });
    }
    list.push({ id: 'collectives', label: 'Venue collectives', hint: 'A combined booking page across linked venues', icon: { ios: 'person.2.wave.2.fill', android: 'groups', web: 'groups' }, tile: TILE.sky, group: 'network', kind: 'route', target: '/collectives', keywords: ['combined', 'linked venues'] });
  }

  // ── App & support. ─────────────────────────────────────────────────────────
  list.push({ id: 'support', label: 'Support', hint: 'Contact the ResNeo team', icon: { ios: 'questionmark.circle.fill', android: 'help', web: 'help' }, tile: TILE.teal, group: 'app', kind: 'route', target: '/support', keywords: ['help', 'contact'] });
  list.push({ id: 'push', label: 'Push notifications', hint: 'Alerts this device shows & what for', icon: { ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }, tile: TILE.rose, group: 'app', kind: 'route', target: '/manage/notification-preferences', keywords: ['alerts', 'reminders'] });
  // ── Checkout set-up: every screen is in the app (owner, 2026-10-09: full parity with the web).
  if (ctx.posEnabled === true) {
    const canSettings = isAdmin || ctx.posCan?.manage_settings === true;
    const canRecords = isAdmin || ctx.posCan?.view_reports === true;
    if (canSettings) {
      list.push({ id: 'checkout-settings', label: 'Checkout settings', hint: 'Tills, tips, receipts and discounts', icon: { ios: 'gearshape.fill', android: 'settings', web: 'settings' }, tile: TILE.slate, group: 'checkoutSetup', kind: 'route', target: '/checkout-settings', keywords: ['checkout', 'till', 'tax', 'VAT', 'receipts', 'tips', 'discounts', 'payment types', 'tills', 'cash', 'float', 'card readers', 'business details', 'permissions'] });
    }
    if (isAdmin && ctx.vouchersEnabled === true) {
      list.push({ id: 'voucher-settings', label: 'Gift voucher settings', hint: 'Amounts, expiry, terms and selling online', icon: { ios: 'gift.fill', android: 'card_giftcard', web: 'card_giftcard' }, tile: TILE.rose, group: 'checkoutSetup', kind: 'route', target: '/checkout-settings/gift-vouchers', keywords: ['gift voucher', 'gift card', 'import vouchers'] });
    }
    if (isAdmin && ctx.loyaltyEnabled === true) {
      list.push({ id: 'loyalty-setup', label: 'Loyalty card set-up', hint: 'Visits, reward and how long it lasts', icon: { ios: 'star.circle.fill', android: 'loyalty', web: 'loyalty' }, tile: TILE.rose, group: 'checkoutSetup', kind: 'route', target: '/checkout-settings/loyalty', keywords: ['loyalty', 'stamps', 'reward'] });
    }
    if (isAdmin && ctx.shopEnabled === true) {
      list.push({ id: 'shop-settings', label: 'Online shop settings', hint: 'Opening, delivery, collection and policies', icon: { ios: 'cart.fill', android: 'shopping_cart', web: 'shopping_cart' }, tile: TILE.teal, group: 'checkoutSetup', kind: 'route', target: '/checkout-settings/shop', keywords: ['shop', 'delivery', 'collection', 'zones', 'policies'] });
    }
    if (isAdmin) {
      list.push({ id: 'commission-rates', label: 'Commission rates', hint: 'Rates for everyone, by category or per person', icon: { ios: 'percent', android: 'percent', web: 'percent' }, tile: TILE.violet, group: 'checkoutSetup', kind: 'route', target: '/checkout-settings/commission', keywords: ['commission', 'pay', 'rates'] });
    }
    // Products and stock set-up.
    if (isAdmin) {
      list.push({ id: 'stock-setup', label: 'Suppliers and stock set-up', hint: 'Suppliers, movements, stock reports', icon: { ios: 'shippingbox', android: 'inventory', web: 'inventory' }, tile: TILE.amber, group: 'checkoutSetup', kind: 'route', target: '/stock?tab=suppliers', keywords: ['suppliers', 'vendor', 'movements', 'stock reports', 'bulk'] });
    }
    if (isAdmin || ctx.posCan?.import_products === true) {
      list.push({ id: 'import-products', label: 'Import products', hint: 'Add products from a CSV file', icon: { ios: 'square.and.arrow.down', android: 'upload_file', web: 'upload_file' }, tile: TILE.sky, group: 'checkoutSetup', kind: 'route', target: '/stock/import', keywords: ['import', 'CSV', 'spreadsheet', 'products'] });
    }
    // Records last: what has happened, with the files to export.
    if (canRecords) {
      list.push({ id: 'pos-records', label: 'Records, reports and exports', hint: 'Takings, sales, tip records and CSV files', icon: { ios: 'doc.text.fill', android: 'description', web: 'description' }, tile: TILE.indigo, group: 'checkoutSetup', kind: 'route', target: '/reports?tab=takings', keywords: ['tip records', 'VAT', 'export', 'CSV', 'takings', 'sales', 'cash-ups', 'payouts'] });
    }
    if (isAdmin) {
      list.push({ id: 'commission-report', label: 'Commission report', hint: 'What each person earned, with CSV files', icon: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }, tile: TILE.violet, group: 'checkoutSetup', kind: 'route', target: '/reports?tab=commission', keywords: ['commission', 'pay', 'report', 'export'] });
    }
  }


  list.push({ id: 'web-dashboard', label: 'Web dashboard', hint: 'Open the full dashboard in your browser', icon: { ios: 'desktopcomputer', android: 'computer', web: 'computer' }, tile: TILE.slate, group: 'app', kind: 'web', target: '/dashboard', external: true });

  return list;
}
