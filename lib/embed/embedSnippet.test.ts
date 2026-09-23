/**
 * Unit tests for the pure embed-snippet helpers (ported from the web
 * `lib/embed/accent-colour.ts`). These mirror the web's own vitest suite
 * (`C:\Resneo/src/lib/embed/accent-colour.test.ts`) so the app's snippet output
 * stays byte-for-byte compatible with the web dashboard's.
 */
import {
  EMBED_IFRAME_DEFAULT_HEIGHT_PX,
  buildCollectiveEmbedSnippet,
  buildVenueEmbedSnippet,
  embedAccentSearchParam,
  normalizeEmbedAccentHex,
} from '@/lib/embed/embedSnippet';

describe('normalizeEmbedAccentHex', () => {
  it('accepts hex with or without a leading hash and lowercases it', () => {
    expect(normalizeEmbedAccentHex('#4F46E5')).toBe('4f46e5');
    expect(normalizeEmbedAccentHex('5c4033')).toBe('5c4033');
    expect(normalizeEmbedAccentHex('  #ABCDEF  ')).toBe('abcdef');
  });

  it('rejects empty, malformed, wrong-length or non-string values', () => {
    expect(normalizeEmbedAccentHex('')).toBeNull();
    expect(normalizeEmbedAccentHex('   ')).toBeNull();
    expect(normalizeEmbedAccentHex('abc')).toBeNull(); // 3 chars
    expect(normalizeEmbedAccentHex('gggggg')).toBeNull(); // non-hex
    expect(normalizeEmbedAccentHex('1234567')).toBeNull(); // 7 chars
    expect(normalizeEmbedAccentHex(null)).toBeNull();
    expect(normalizeEmbedAccentHex(undefined)).toBeNull();
  });
});

describe('embedAccentSearchParam', () => {
  it('returns the ?accent= query for a valid colour', () => {
    expect(embedAccentSearchParam('#4F46E5')).toBe('?accent=4f46e5');
  });

  it('returns an empty string when unset or invalid', () => {
    expect(embedAccentSearchParam(null)).toBe('');
    expect(embedAccentSearchParam('')).toBe('');
    expect(embedAccentSearchParam('nope')).toBe('');
  });
});

describe('buildVenueEmbedSnippet', () => {
  it('builds the iframe + resize.js snippet from origin + slug', () => {
    const { embedUrl, snippet, accentHex } = buildVenueEmbedSnippet({
      baseUrl: 'https://app.example.com',
      venueSlug: 'plus-1',
    });
    expect(embedUrl).toBe('https://app.example.com/embed/plus-1');
    expect(accentHex).toBeNull();
    expect(snippet).toContain('<iframe src="https://app.example.com/embed/plus-1"');
    expect(snippet).toContain(`height="${EMBED_IFRAME_DEFAULT_HEIGHT_PX}"`);
    expect(snippet).toContain('id="reserveni-widget"');
    expect(snippet).toContain('<script src="https://app.example.com/embed/resize.js"></script>');
  });

  it('threads a normalised accent colour into the iframe src', () => {
    const { embedUrl, snippet, accentHex } = buildVenueEmbedSnippet({
      baseUrl: 'https://app.example.com',
      venueSlug: 'plus-1',
      accentHex: '#4F46E5',
    });
    expect(accentHex).toBe('4f46e5');
    expect(embedUrl).toBe('https://app.example.com/embed/plus-1?accent=4f46e5');
    expect(snippet).toContain('?accent=4f46e5');
  });

  it('strips a trailing slash from the base URL so paths never double up', () => {
    const { embedUrl, snippet } = buildVenueEmbedSnippet({
      baseUrl: 'https://app.example.com/',
      venueSlug: 'plus-1',
    });
    expect(embedUrl).toBe('https://app.example.com/embed/plus-1');
    expect(snippet).toContain('https://app.example.com/embed/resize.js');
    expect(snippet).not.toContain('com//embed');
  });

  it('omits the accent query for an invalid colour', () => {
    const { embedUrl } = buildVenueEmbedSnippet({
      baseUrl: 'https://app.example.com',
      venueSlug: 'plus-1',
      accentHex: 'not-a-colour',
    });
    expect(embedUrl).toBe('https://app.example.com/embed/plus-1');
  });
});

describe('buildCollectiveEmbedSnippet', () => {
  it('points at the collective embed, not the unframeable /book/c page', () => {
    const { embedUrl, snippet } = buildCollectiveEmbedSnippet({
      baseUrl: 'https://app.example.com/',
      collectiveSlug: 'aura-hair-studio',
      accentHex: '#D0C0B0',
    });
    expect(embedUrl).toBe('https://app.example.com/embed/c/aura-hair-studio?accent=d0c0b0');
    expect(snippet).not.toContain('/book/c/');
    expect(snippet).toContain('id="reserveni-widget"');
    expect(snippet).toContain('https://app.example.com/embed/resize.js');
  });

  it('leaves a half-typed accent out, so the page falls back to its own colour', () => {
    const { embedUrl } = buildCollectiveEmbedSnippet({
      baseUrl: 'https://app.example.com',
      collectiveSlug: 'aura-hair-studio',
      accentHex: '#d0c',
    });
    expect(embedUrl).toBe('https://app.example.com/embed/c/aura-hair-studio');
  });

  it('matches the venue snippet apart from the embed path', () => {
    const venue = buildVenueEmbedSnippet({ baseUrl: 'https://app.example.com', venueSlug: 'x', accentHex: '#123456' });
    const collective = buildCollectiveEmbedSnippet({
      baseUrl: 'https://app.example.com',
      collectiveSlug: 'x',
      accentHex: '#123456',
    });
    expect(collective.snippet).toBe(venue.snippet.replace('/embed/x', '/embed/c/x'));
  });
});
