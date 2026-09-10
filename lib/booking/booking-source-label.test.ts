import { bookingSourceLabel } from '@/lib/booking/booking-source-label';

describe('bookingSourceLabel', () => {
  it('maps the storage names to staff words (web #190)', () => {
    expect(bookingSourceLabel('booking_page')).toBe('Online');
    expect(bookingSourceLabel('widget')).toBe('Online');
    expect(bookingSourceLabel('walk-in')).toBe('Walk-in');
    expect(bookingSourceLabel('walk_in')).toBe('Walk-in');
    expect(bookingSourceLabel('Phone')).toBe('Phone');
    expect(bookingSourceLabel('staff')).toBe('Staff');
    expect(bookingSourceLabel('recurring')).toBe('Recurring');
  });
  it('capitalises anything else and hides nothing', () => {
    expect(bookingSourceLabel('import_ai')).toBe('Import ai');
    expect(bookingSourceLabel('')).toBeNull();
    expect(bookingSourceLabel(null)).toBeNull();
    expect(bookingSourceLabel(undefined)).toBeNull();
  });
});
