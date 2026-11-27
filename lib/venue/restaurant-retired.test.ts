import { isRetiredRestaurantVenue } from '@/lib/venue/restaurant-retired';

describe('isRetiredRestaurantVenue', () => {
  it('is true for the restaurant and Founding Partner tiers', () => {
    expect(isRetiredRestaurantVenue({ pricing_tier: 'restaurant', booking_model: 'table_reservation' })).toBe(true);
    expect(isRetiredRestaurantVenue({ pricing_tier: 'founding', booking_model: 'unified_scheduling' })).toBe(true);
  });

  it('is true for a table booking model outside the Appointments tiers', () => {
    expect(isRetiredRestaurantVenue({ pricing_tier: null, booking_model: 'table_reservation' })).toBe(true);
  });

  it('is false for an Appointments venue, even one whose booking model is the old default', () => {
    expect(isRetiredRestaurantVenue({ pricing_tier: 'appointments', booking_model: 'unified_scheduling' })).toBe(false);
    expect(isRetiredRestaurantVenue({ pricing_tier: 'light', booking_model: 'table_reservation' })).toBe(false);
  });

  it('is false while the venue has not loaded', () => {
    expect(isRetiredRestaurantVenue(null)).toBe(false);
  });
});
