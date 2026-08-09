/**
 * Framing helpers for the booking-page editor (web parity R11-1,
 * `service_photo_crops` / team `photo_crop`).
 *
 * `framingTransform` mirrors the web's
 * `translate((x-50)%, (y-50)%) scale(zoom)` on a cover image, where each
 * translate % is of the element box on that axis — the rect variant matters
 * because the service-photo list thumb is 72×56, not square.
 *
 * `servicePhotoCropsForSave` mirrors the web editor's
 * `servicePhotoCropsForConfig`: framing only travels for services that
 * currently have a photo, centred/unzoomed framing collapses away, and an
 * empty result becomes `null` so the server deletes the key.
 */
import {
  framingTransform,
  logoFramingTransform,
  normalizeLogoFraming,
  servicePhotoCropsForSave,
} from '@/lib/booking/bookingPageConfig';

describe('framingTransform', () => {
  it('is identity at the centred default', () => {
    expect(framingTransform(null, 72, 56)).toEqual({ translateX: 0, translateY: 0, scale: 1 });
  });

  it('translates each axis by its own frame dimension', () => {
    // x=75 → +25% of width; y=25 → −25% of height.
    expect(framingTransform({ x: 75, y: 25, zoom: 2 }, 72, 56)).toEqual({
      translateX: 18,
      translateY: -14,
      scale: 2,
    });
  });

  it('clamps out-of-range values like the resolver', () => {
    const t = framingTransform({ x: 500, y: -10, zoom: 99 }, 100, 100);
    expect(t).toEqual({ translateX: 50, translateY: -50, scale: 3 });
  });

  it('logoFramingTransform is the square special case', () => {
    expect(logoFramingTransform({ x: 60, y: 40, zoom: 1.5 }, 240)).toEqual(
      framingTransform({ x: 60, y: 40, zoom: 1.5 }, 240, 240),
    );
  });
});

describe('servicePhotoCropsForSave', () => {
  const CROP = { x: 60, y: 40, zoom: 1.5 };

  it('keeps framing only for services that currently have a photo', () => {
    expect(
      servicePhotoCropsForSave({ a: CROP, gone: CROP }, { a: 'https://img/a.jpg' }),
    ).toEqual({ a: CROP });
  });

  it('collapses centred/unzoomed framing away', () => {
    expect(
      servicePhotoCropsForSave({ a: { x: 50, y: 50, zoom: 1 } }, { a: 'https://img/a.jpg' }),
    ).toBeNull();
  });

  it('returns null when nothing survives (server deletes the key on null)', () => {
    expect(servicePhotoCropsForSave({}, { a: 'https://img/a.jpg' })).toBeNull();
    expect(servicePhotoCropsForSave(null, null)).toBeNull();
    expect(servicePhotoCropsForSave({ a: CROP }, {})).toBeNull();
  });

  it('treats a blank photo URL as no photo', () => {
    expect(servicePhotoCropsForSave({ a: CROP }, { a: '   ' })).toBeNull();
  });

  it('normalises framing on the way through (clamp + round, like the server)', () => {
    expect(
      servicePhotoCropsForSave({ a: { x: 500, y: -10, zoom: 99 } }, { a: 'https://img/a.jpg' }),
    ).toEqual({ a: { x: 100, y: 0, zoom: 3 } });
  });
});

describe('normalizeLogoFraming (shared by all framing saves)', () => {
  it('yields null for the centred default and a rounded object otherwise', () => {
    expect(normalizeLogoFraming({ x: 50, y: 50, zoom: 1 })).toBeNull();
    // Rounds to one decimal — a hair off centre collapses to the default.
    expect(normalizeLogoFraming({ x: 50.04, y: 50, zoom: 1.049 })).toBeNull();
    expect(normalizeLogoFraming({ x: 61.26, y: 39.99, zoom: 1.055 })).toEqual({
      x: 61.3,
      y: 40,
      zoom: 1.1,
    });
  });
});
