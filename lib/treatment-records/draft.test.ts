/**
 * The treatment record editor's draft rules (web plan §8 and §9): what an autosave sends, when
 * Copy from last record is offered, the booking card's summary line, and which photos upload.
 */
import {
  bookingSummaryLine,
  canOfferCopy,
  changesBetween,
  emptyProduct,
  photoMimeType,
  recordListLines,
  savedProducts,
} from '@/lib/treatment-records/draft';
import { formatYmd, isPastDay, ymdIn } from '@/lib/treatment-records/format';
import type { TreatmentRecordSummary } from '@/types/treatment-records';

function summary(overrides: Partial<TreatmentRecordSummary> = {}): TreatmentRecordSummary {
  return {
    id: 'r-1',
    treated_at: '2026-10-22T13:00:00Z',
    created_at: '2026-10-22T13:32:00Z',
    service_item_id: 's-1',
    service_name: 'Lip filler',
    booking_id: 'b-1',
    practitioner_calendar_id: 'c-1',
    practitioner_name: 'Sam',
    author_name: 'Sam',
    author_venue_id: 'v-1',
    author_venue_name: null,
    last_edited_by_name: 'Sam',
    last_edited_at: '2026-10-22T13:32:00Z',
    version_count: 0,
    product_count: 2,
    photo_count: 1,
    first_photo_preview_url: null,
    ...overrides,
  };
}

describe('savedProducts', () => {
  it('drops lines with no product name and trims the rest', () => {
    expect(
      savedProducts([
        { ...emptyProduct(), product_name: '  Juvederm  ', batch_number: ' JV-1 ', area: ' Lips ', amount: 1, unit: 'ml' },
        { ...emptyProduct(), product_name: '   ' },
      ]),
    ).toEqual([{ product_name: 'Juvederm', batch_number: 'JV-1', expiry_date: null, amount: 1, unit: 'ml', area: 'Lips' }]);
  });
});

describe('changesBetween', () => {
  const saved = { note: 'Areas treated:', products: [] };

  it('sends nothing when nothing changed', () => {
    expect(changesBetween(saved, { note: 'Areas treated:', products: [{ ...emptyProduct() }] })).toBeNull();
  });

  it('sends the note alone when only the note changed', () => {
    expect(changesBetween(saved, { note: 'Areas treated: top lip', products: [] })).toEqual({ note: 'Areas treated: top lip' });
  });

  it('sends the whole product list when a line changed', () => {
    const products = [{ ...emptyProduct(), product_name: 'Juvederm' }];
    expect(changesBetween(saved, { note: saved.note, products })).toEqual({
      products: [{ product_name: 'Juvederm', batch_number: null, expiry_date: null, amount: null, unit: null, area: null }],
    });
  });
});

describe('canOfferCopy', () => {
  it('offers the copy on an empty record or one holding only the starter text', () => {
    expect(canOfferCopy({ note: '', products: [] }, null)).toBe(true);
    expect(canOfferCopy({ note: 'Areas treated:', products: [] }, 'Areas treated:')).toBe(true);
  });

  it('stops offering it once something is typed', () => {
    expect(canOfferCopy({ note: 'Areas treated: top lip', products: [] }, 'Areas treated:')).toBe(false);
    expect(canOfferCopy({ note: '', products: [{ ...emptyProduct(), product_name: 'Juvederm' }] }, null)).toBe(false);
  });
});

describe('bookingSummaryLine', () => {
  it('reads as the web does', () => {
    expect(bookingSummaryLine([], 'Europe/London')).toBe('No record for this visit yet');
    expect(bookingSummaryLine([summary()], 'Europe/London')).toBe('Record by Sam, 22 Oct 2026 at 14:32');
    expect(bookingSummaryLine([summary({ version_count: 1, last_edited_by_name: 'Jo' })], 'Europe/London')).toBe('Record by Sam, edited by Jo');
    expect(bookingSummaryLine([summary(), summary({ id: 'r-2' })], 'Europe/London')).toBe('2 records');
  });

  it('lists a record with what it holds', () => {
    expect(recordListLines(summary(), 'Europe/London')).toEqual({ title: '22 Oct 2026: Lip filler', meta: 'Sam · Sam · 2 products · 1 photo' });
  });
});

describe('photoMimeType', () => {
  it('takes JPEG and PNG, from the picker or the file name, and refuses the rest', () => {
    expect(photoMimeType('image/jpeg', 'file:///a.jpg')).toBe('image/jpeg');
    expect(photoMimeType(undefined, 'file:///cache/ImagePicker/abc.JPG')).toBe('image/jpeg');
    expect(photoMimeType(null, 'file:///a.png?x=1')).toBe('image/png');
    expect(photoMimeType('image/heic', 'file:///a.heic')).toBeNull();
    expect(photoMimeType(undefined, 'file:///a.webp')).toBeNull();
  });
});

describe('dates', () => {
  it('formats an expiry date without a time zone shift', () => {
    expect(formatYmd('2027-03-31')).toBe('31 Mar 2027');
  });

  it('reads the day in the venue’s zone', () => {
    expect(ymdIn('2026-10-22T23:30:00Z', 'Europe/London')).toBe('2026-10-23');
    expect(isPastDay('2000-01-01', 'Europe/London')).toBe(true);
    expect(isPastDay('2999-01-01', 'Europe/London')).toBe(false);
  });
});
