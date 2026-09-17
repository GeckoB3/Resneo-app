import { calendarSetupSections, venueActiveModels } from '@/lib/booking/venue-models';

describe('venueActiveModels (web resolveActiveBookingModels)', () => {
  it('uses the explicit active list when there is one', () => {
    expect([
      ...venueActiveModels({
        booking_model: 'unified_scheduling',
        active_booking_models: ['unified_scheduling', 'class_session'],
        enabled_models: ['resource_booking'],
      }),
    ]).toEqual(['unified_scheduling', 'class_session']);
  });

  it('falls back to the primary model and enabled_models when the list is empty', () => {
    expect([
      ...venueActiveModels({ booking_model: 'unified_scheduling', active_booking_models: [], enabled_models: ['event_ticket'] }),
    ]).toEqual(['unified_scheduling', 'event_ticket']);
    expect(venueActiveModels(null).size).toBe(0);
  });
});

describe('calendarSetupSections', () => {
  it('shows only the switched-on sections', () => {
    expect(calendarSetupSections({ booking_model: 'unified_scheduling', active_booking_models: ['unified_scheduling'] })).toEqual({
      classes: false,
      resources: false,
      events: false,
    });
    expect(
      calendarSetupSections({ active_booking_models: ['unified_scheduling', 'resource_booking', 'event_ticket'] }),
    ).toEqual({ classes: false, resources: true, events: true });
  });

  it('shows everything until the venue has loaded', () => {
    expect(calendarSetupSections(null)).toEqual({ classes: true, resources: true, events: true });
  });
});
