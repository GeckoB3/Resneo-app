import {
  cardAbout,
  formatPriceFrom,
  generatedCardLine,
  isSuggestedCategories,
  makeMainMarketplaceCategory,
  marketplaceCardHint,
  marketplaceCardView,
  marketplaceCollectiveLine,
  marketplaceFixTarget,
  marketplaceStatusLabel,
  toggleMarketplaceCategory,
  visibleMarketplaceReasons,
  type MarketplaceCardData,
  type MarketplaceOwnerState,
} from '@/lib/marketplace/owner-state';

const card = (over: Partial<MarketplaceCardData> = {}): MarketplaceCardData => ({
  listing_key: 'venue:v1',
  kind: 'venue',
  href: '/book/studio-nine',
  name: 'Studio Nine',
  categories: ['hair'],
  primary_category: 'hair',
  town: 'Belfast',
  about: null,
  has_bio: false,
  cover_photo_url: null,
  logo_url: null,
  models: ['appointments'],
  delivery: ['venue'],
  price_from_pence: 2500,
  currency: 'GBP',
  ...over,
});

const state = (over: Partial<MarketplaceOwnerState> = {}): MarketplaceOwnerState => ({
  available: true,
  listed: true,
  categories: [],
  category_source: null,
  showing: false,
  reasons: [],
  card: null,
  collective: null,
  category_options: [],
  ...over,
});

describe('marketplace categories', () => {
  it('ticks up to three and refuses a fourth', () => {
    expect(toggleMarketplaceCategory([], 'hair')).toEqual(['hair']);
    expect(toggleMarketplaceCategory(['hair', 'nails', 'beauty'], 'barber')).toEqual(['hair', 'nails', 'beauty']);
    expect(toggleMarketplaceCategory(['hair', 'nails'], 'hair')).toEqual(['nails']);
  });

  it('moves a category to the front as the main one', () => {
    expect(makeMainMarketplaceCategory(['hair', 'nails', 'beauty'], 'beauty')).toEqual(['beauty', 'hair', 'nails']);
  });

  it('treats only a non-empty suggestion as one to confirm', () => {
    expect(isSuggestedCategories({ category_source: 'suggested', categories: ['hair'] })).toBe(true);
    expect(isSuggestedCategories({ category_source: 'suggested', categories: [] })).toBe(false);
    expect(isSuggestedCategories({ category_source: 'owner', categories: ['hair'] })).toBe(false);
  });
});

describe('marketplace status', () => {
  it('reads as the web does', () => {
    expect(marketplaceStatusLabel({ showing: true, listed: true })).toBe('Showing on the marketplace');
    expect(marketplaceStatusLabel({ showing: false, listed: true })).toBe('Not showing yet');
    expect(marketplaceStatusLabel({ showing: false, listed: false })).toBe('Switched off');
  });

  it('names the collective that lists the appointments', () => {
    expect(marketplaceCollectiveLine(null)).toBeNull();
    expect(marketplaceCollectiveLine({ public_name: 'Glow', public_path: '/book/glow', is_host: true })).toBe(
      'Your appointments are listed through Glow, which uses your photos, About text and categories.',
    );
    expect(marketplaceCollectiveLine({ public_name: 'Glow', public_path: '/book/glow', is_host: false })).toBe(
      'Your appointments are listed through Glow. Its listing is managed by the host venue.',
    );
  });

  it('lists what blocks the listing only while listed and not showing, without the switched-off reason', () => {
    const reasons = [
      { code: 'opted_out', text: 'You have switched your listing off.', fix_href: null },
      { code: 'no_town', text: 'Add your town to your business address.', fix_href: '/dashboard/settings?tab=profile' },
    ];
    expect(visibleMarketplaceReasons(state({ reasons }))).toEqual([reasons[1]]);
    expect(visibleMarketplaceReasons(state({ reasons, listed: false }))).toEqual([]);
    expect(visibleMarketplaceReasons(state({ reasons, showing: true }))).toEqual([]);
  });
});

describe('marketplace fix links', () => {
  it('maps each web fix to the app screen that does the same job', () => {
    expect(marketplaceFixTarget('/dashboard/support')).toEqual({ kind: 'route', target: '/support' });
    expect(marketplaceFixTarget('/dashboard/settings?tab=plan')).toEqual({ kind: 'route', target: '/manage/plan' });
    expect(marketplaceFixTarget('/dashboard/settings')).toEqual({ kind: 'route', target: '/manage/plan' });
    expect(marketplaceFixTarget('/dashboard/settings?tab=booking-settings')).toEqual({
      kind: 'route',
      target: '/manage/booking-settings',
    });
    expect(marketplaceFixTarget('/dashboard/appointment-services')).toEqual({ kind: 'route', target: '/manage/services' });
    expect(marketplaceFixTarget('/dashboard/settings?tab=profile')).toEqual({
      kind: 'route',
      target: '/manage/venue-profile',
    });
  });

  it('gives no link for a fix on this screen, or none at all', () => {
    expect(marketplaceFixTarget('/dashboard/settings?tab=booking-page')).toBeNull();
    expect(marketplaceFixTarget(null)).toBeNull();
  });

  it('opens anything else on the web', () => {
    expect(marketplaceFixTarget('/onboarding')).toEqual({ kind: 'web', target: '/onboarding' });
  });
});

describe('marketplace card preview', () => {
  it('writes a line when there is no About text', () => {
    expect(generatedCardLine(card())).toBe('Book hair appointments online with Studio Nine in Belfast.');
    expect(generatedCardLine(card({ primary_category: 'other', models: ['classes'], town: null }))).toBe(
      'Book classes online with Studio Nine.',
    );
  });

  it('cuts a long About text at a word', () => {
    const long = 'word '.repeat(60);
    const cut = cardAbout(long)!;
    expect(cut.length).toBeLessThanOrEqual(140);
    expect(cut.endsWith('…')).toBe(true);
    expect(cardAbout('  ')).toBeNull();
  });

  it('prices from the cheapest service', () => {
    expect(formatPriceFrom(2500, 'GBP')).toBe('From £25');
    expect(formatPriceFrom(2550, 'GBP')).toBe('From £25.50');
    expect(formatPriceFrom(0, 'GBP')).toBeNull();
  });

  it('builds the where line, chips and initials', () => {
    const view = marketplaceCardView(card({ delivery: ['venue', 'online'], models: ['appointments', 'resources'] }));
    expect(view.where).toBe('Hair salon · Belfast');
    expect(view.chips).toEqual(['Appointments', 'Hire', 'Online']);
    expect(view.initials).toBe('SN');
    expect(view.about).toBe('Book hair appointments online with Studio Nine in Belfast.');
  });

  it('suggests what would make the card stronger', () => {
    expect(marketplaceCardHint({ has_bio: false, cover_photo_url: null })).toBe(
      'This is how customers see you. Add an About text on this page to tell them about your business in your own words. A cover photo helps your card stand out.',
    );
    expect(marketplaceCardHint({ has_bio: true, cover_photo_url: 'x' })).toBe('This is how customers see you.');
  });
});
