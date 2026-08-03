import {
  buildGoogleReviewUrlFromPlaceId,
  hasUsableGoogleReviewLink,
  normaliseGoogleReviewUrl,
} from '@/lib/reviews/google-review-link';

/**
 * Google review link resolution (web parity: `lib/reviews/google-review-link.ts`).
 * The server validates identically and remains the authority; these pin the app's
 * copy so a bad paste is caught before it fails a save, and so the two agree on
 * what counts as a review target.
 */

const PLACE_ID = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

describe('normaliseGoogleReviewUrl — accepted forms', () => {
  it('turns a bare Place ID into a write-review link', () => {
    expect(normaliseGoogleReviewUrl(PLACE_ID)).toBe(
      `https://search.google.com/local/writereview?placeid=${PLACE_ID}`,
    );
  });

  it('canonicalises an existing write-review link', () => {
    expect(
      normaliseGoogleReviewUrl(
        `https://search.google.com/local/writereview?placeid=${PLACE_ID}&hl=en`,
      ),
    ).toBe(`https://search.google.com/local/writereview?placeid=${PLACE_ID}`);
  });

  it('accepts a g.page short link, and completes one missing /review', () => {
    expect(normaliseGoogleReviewUrl('https://g.page/r/CX9alnDqPlYGEBM/review')).toBe(
      'https://g.page/r/CX9alnDqPlYGEBM/review',
    );
    expect(normaliseGoogleReviewUrl('https://g.page/r/CX9alnDqPlYGEBM')).toBe(
      'https://g.page/r/CX9alnDqPlYGEBM/review',
    );
  });

  it('tolerates a missing scheme, www, and surrounding whitespace', () => {
    expect(normaliseGoogleReviewUrl('  www.g.page/r/CX9alnDqPlYGEBM/review  ')).toBe(
      'https://g.page/r/CX9alnDqPlYGEBM/review',
    );
  });
});

describe('normaliseGoogleReviewUrl — rejected forms', () => {
  it('rejects a Maps link, which names the business but opens no review box', () => {
    // The whole reason the venue has to paste something specific.
    expect(normaliseGoogleReviewUrl('https://www.google.com/maps/place/Aura+Hair+Studio')).toBeNull();
    expect(normaliseGoogleReviewUrl('https://maps.app.goo.gl/abcdefg')).toBeNull();
  });

  it('rejects a g.page profile link that is not a review target', () => {
    expect(normaliseGoogleReviewUrl('https://g.page/aura-hair-studio')).toBeNull();
  });

  it('rejects a write-review link whose place id is missing or too short', () => {
    expect(normaliseGoogleReviewUrl('https://search.google.com/local/writereview')).toBeNull();
    expect(normaliseGoogleReviewUrl('https://search.google.com/local/writereview?placeid=abc')).toBeNull();
  });

  it('rejects a short bare string that is not a plausible Place ID', () => {
    expect(normaliseGoogleReviewUrl('aura')).toBeNull();
  });

  it('rejects non-http schemes and unparseable input', () => {
    expect(normaliseGoogleReviewUrl('javascript:alert(1)')).toBeNull();
    expect(normaliseGoogleReviewUrl('http://')).toBeNull();
  });

  it('is null for empty, whitespace and missing values', () => {
    expect(normaliseGoogleReviewUrl('')).toBeNull();
    expect(normaliseGoogleReviewUrl('   ')).toBeNull();
    expect(normaliseGoogleReviewUrl(null)).toBeNull();
    expect(normaliseGoogleReviewUrl(undefined)).toBeNull();
  });
});

describe('buildGoogleReviewUrlFromPlaceId', () => {
  it('encodes the place id', () => {
    expect(buildGoogleReviewUrlFromPlaceId('a b&c')).toBe(
      'https://search.google.com/local/writereview?placeid=a%20b%26c',
    );
  });
});

describe('hasUsableGoogleReviewLink', () => {
  it('mirrors whether the value resolves', () => {
    expect(hasUsableGoogleReviewLink(PLACE_ID)).toBe(true);
    expect(hasUsableGoogleReviewLink('https://www.google.com/maps/place/X')).toBe(false);
    expect(hasUsableGoogleReviewLink(null)).toBe(false);
  });
});
