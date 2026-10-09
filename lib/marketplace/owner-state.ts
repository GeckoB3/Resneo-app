/**
 * The ResNeo marketplace card in Booking page settings, web parity with
 * `src/app/dashboard/settings/sections/MarketplaceSection.tsx`, `src/lib/marketplace/owner-state.ts`
 * and the card preview in `src/components/marketplace/MarketplaceCard.tsx`.
 *
 *   GET   /api/venue/marketplace   the listing as the owner sees it (any staff member, Bearer)
 *   PATCH /api/venue/marketplace   `{ listed?, categories? }`, admin only
 *
 * Everything here is pure so the screen and its tests share one source of truth.
 */

export const MARKETPLACE_MAX_CATEGORIES = 3;

export type MarketplaceModel = 'appointments' | 'classes' | 'events' | 'resources';
export type MarketplaceDelivery = 'venue' | 'comes_to_you' | 'online';

/** The venue's card as customers see it (web `MarketplaceCardData`). */
export interface MarketplaceCardData {
  listing_key: string;
  kind: 'venue' | 'collective';
  href: string;
  name: string;
  categories: string[];
  primary_category: string | null;
  town: string | null;
  town_key?: string | null;
  postcode_district?: string | null;
  about: string | null;
  has_bio: boolean;
  cover_photo_url: string | null;
  logo_url: string | null;
  models: MarketplaceModel[];
  delivery: MarketplaceDelivery[];
  price_from_pence: number | null;
  currency: string | null;
}

/** The GET/PATCH payload (web `MarketplaceOwnerState`). */
export interface MarketplaceOwnerState {
  /** False until the marketplace migration is applied; the card then hides itself. */
  available: boolean;
  listed: boolean;
  categories: string[];
  category_source: 'suggested' | 'owner' | null;
  /** Shown on the marketplace right now (directly, or through a collective's card). */
  showing: boolean;
  reasons: { code: string; text: string; fix_href: string | null }[];
  card: MarketplaceCardData | null;
  collective: { public_name: string; public_path: string; is_host: boolean } | null;
  category_options: { value: string; label: string; examples: string }[];
}

export interface MarketplacePatch {
  listed?: boolean;
  categories?: string[];
}

/** Ticks or unticks a category; a fourth is refused while three are ticked. */
export function toggleMarketplaceCategory(draft: readonly string[], value: string): string[] {
  if (draft.includes(value)) return draft.filter((v) => v !== value);
  if (draft.length >= MARKETPLACE_MAX_CATEGORIES) return [...draft];
  return [...draft, value];
}

/** Moves a ticked category to the front, where it becomes the main one. */
export function makeMainMarketplaceCategory(draft: readonly string[], value: string): string[] {
  return [value, ...draft.filter((v) => v !== value)].slice(0, MARKETPLACE_MAX_CATEGORIES);
}

/** The status line beside the switch. */
export function marketplaceStatusLabel(state: Pick<MarketplaceOwnerState, 'showing' | 'listed'>): string {
  if (state.showing) return 'Showing on the marketplace';
  return state.listed ? 'Not showing yet' : 'Switched off';
}

/** The line under the status when appointments are listed through a collective's card. */
export function marketplaceCollectiveLine(collective: MarketplaceOwnerState['collective']): string | null {
  if (!collective) return null;
  return collective.is_host
    ? `Your appointments are listed through ${collective.public_name}, which uses your photos, About text and categories.`
    : `Your appointments are listed through ${collective.public_name}. Its listing is managed by the host venue.`;
}

/** The reasons to list: only while listed and not showing, and never the "switched off" one. */
export function visibleMarketplaceReasons(state: MarketplaceOwnerState): MarketplaceOwnerState['reasons'] {
  if (!state.listed || state.showing) return [];
  return state.reasons.filter((r) => r.code !== 'opted_out');
}

/** True while the categories are ResNeo's suggestion and the owner has not confirmed them. */
export function isSuggestedCategories(state: Pick<MarketplaceOwnerState, 'category_source' | 'categories'>): boolean {
  return state.category_source === 'suggested' && state.categories.length > 0;
}

export function marketplaceCategoryLabel(state: Pick<MarketplaceOwnerState, 'category_options'>, value: string): string {
  return state.category_options.find((o) => o.value === value)?.label ?? value;
}

/** The hint under "Your card": what would make it stronger. */
export function marketplaceCardHint(card: Pick<MarketplaceCardData, 'has_bio' | 'cover_photo_url'>): string {
  return [
    'This is how customers see you.',
    !card.has_bio ? 'Add an About text on this page to tell them about your business in your own words.' : null,
    !card.cover_photo_url ? 'A cover photo helps your card stand out.' : null,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Where a reason's "Go there" leads in the app. The server sends web dashboard paths; each maps to
 * the app screen that fixes the same thing. A path the app has no screen for opens on the web, and
 * a fix that lives on this very screen (the cover photo or logo) gets no link.
 */
export type MarketplaceFixTarget = { kind: 'route'; target: string } | { kind: 'web'; target: string } | null;

const FIX_ROUTES: Record<string, string | null> = {
  '/dashboard/support': '/support',
  '/dashboard/settings': '/manage/plan',
  '/dashboard/settings?tab=plan': '/manage/plan',
  '/dashboard/settings?tab=booking-settings': '/manage/booking-settings',
  '/dashboard/appointment-services': '/manage/services',
  '/dashboard/settings?tab=booking-page': null,
  '/dashboard/settings?tab=profile': '/manage/venue-profile',
};

export function marketplaceFixTarget(fixHref: string | null | undefined): MarketplaceFixTarget {
  if (!fixHref) return null;
  if (Object.prototype.hasOwnProperty.call(FIX_ROUTES, fixHref)) {
    const route = FIX_ROUTES[fixHref];
    return route ? { kind: 'route', target: route } : null;
  }
  return fixHref.startsWith('/') ? { kind: 'web', target: fixHref } : null;
}

// ── The card preview (web `MarketplaceCard`, `listing.ts`) ─────────────────────

const CATEGORY_CARD_WORDS: Record<string, { singular: string; booked: string }> = {
  hair: { singular: 'Hair salon', booked: 'hair appointments' },
  barber: { singular: 'Barber', booked: 'barber appointments' },
  beauty: { singular: 'Beauty salon', booked: 'beauty treatments' },
  nails: { singular: 'Nail salon', booked: 'nail appointments' },
  'brows-and-lashes': { singular: 'Brows and lashes', booked: 'brow and lash appointments' },
  aesthetics: { singular: 'Aesthetics clinic', booked: 'aesthetic treatments' },
  'massage-and-spa': { singular: 'Massage and spa', booked: 'massages and treatments' },
  'wellness-and-therapy': { singular: 'Wellness and therapy', booked: 'sessions' },
  'health-clinic': { singular: 'Health clinic', booked: 'appointments' },
  'fitness-and-classes': { singular: 'Fitness and classes', booked: 'classes and sessions' },
  'tattoo-and-piercing': { singular: 'Tattoo and piercing', booked: 'tattoo and piercing appointments' },
  pets: { singular: 'Pet grooming and care', booked: 'grooming appointments' },
  'tuition-and-lessons': { singular: 'Tuition and lessons', booked: 'lessons' },
  'experiences-and-events': { singular: 'Experiences and events', booked: 'experiences and tickets' },
  'spaces-and-hire': { singular: 'Spaces and hire', booked: 'spaces to hire' },
  other: { singular: 'Business', booked: 'appointments' },
};

const MODEL_LABEL: Record<MarketplaceModel, string> = {
  appointments: 'Appointments',
  classes: 'Classes',
  events: 'Events',
  resources: 'Hire',
};

/** About text for a card: whitespace collapsed, cut at a word near `max` characters. */
export function cardAbout(raw: string | null | undefined, max = 140): string | null {
  const flat = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:]+$/, '')}…`;
}

/** The line a card shows when the venue has written no About text. */
export function generatedCardLine(card: Pick<MarketplaceCardData, 'name' | 'primary_category' | 'town' | 'models'>): string {
  const words = card.primary_category ? CATEGORY_CARD_WORDS[card.primary_category] : undefined;
  const booked =
    words && card.primary_category !== 'other'
      ? words.booked
      : card.models[0] === 'classes'
        ? 'classes'
        : card.models[0] === 'events'
          ? 'tickets'
          : card.models[0] === 'resources'
            ? 'spaces to hire'
            : 'appointments';
  const where = card.town ? ` in ${card.town}` : '';
  return `Book ${booked} online with ${card.name}${where}.`;
}

/** "From £25" for a card; null when there is no price to show. */
export function formatPriceFrom(pence: number | null | undefined, currency: string | null | undefined): string | null {
  if (typeof pence !== 'number' || !Number.isFinite(pence) || pence <= 0) return null;
  const code = (currency ?? 'GBP').toUpperCase();
  try {
    const amount = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(pence / 100);
    return `From ${amount}`;
  } catch {
    return `From ${(pence / 100).toFixed(2)}`;
  }
}

/** Everything the card preview draws, worked out once. */
export function marketplaceCardView(card: MarketplaceCardData): {
  about: string;
  price: string | null;
  where: string;
  chips: string[];
  initials: string;
} {
  const words = card.primary_category ? CATEGORY_CARD_WORDS[card.primary_category] : undefined;
  return {
    about: cardAbout(card.about) ?? generatedCardLine(card),
    price: formatPriceFrom(card.price_from_pence, card.currency),
    where: [words && card.primary_category !== 'other' ? words.singular : null, card.town]
      .filter(Boolean)
      .join(' · '),
    chips: [
      ...card.models.map((m) => MODEL_LABEL[m]).filter(Boolean),
      ...(card.delivery.includes('comes_to_you') ? ['Comes to you'] : []),
      ...(card.delivery.includes('online') ? ['Online'] : []),
    ],
    initials: card.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join(''),
  };
}
