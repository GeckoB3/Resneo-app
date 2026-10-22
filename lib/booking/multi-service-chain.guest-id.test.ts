/**
 * The chosen client on the visit and group creates (web roles plan A2, §5.6): a picked client goes
 * as `guest_id` on `POST /api/booking/create-multi-service` and `POST /api/booking/create-group`,
 * which join the booking to that client and fill a phone or email the form left blank. With it, a
 * group on the `phone` source needs no typed phone.
 */
import {
  buildGroupPayload,
  buildMultiServicePayload,
  recomputeMultiServiceChain,
  type GroupPerson,
  type MultiServiceSegment,
} from '@/lib/booking/multi-service-chain';

const segments = recomputeMultiServiceChain(
  [
    {
      serviceId: 'a',
      serviceName: 'A',
      practitionerId: 'prac',
      practitionerName: 'Pat',
      startTime: '09:00',
      durationMinutes: 30,
      naturalDurationMinutes: 30,
      bufferMinutes: 0,
      pricePence: 1000,
    } as MultiServiceSegment,
    {
      serviceId: 'b',
      serviceName: 'B',
      practitionerId: 'prac',
      practitionerName: 'Pat',
      startTime: '09:30',
      durationMinutes: 30,
      naturalDurationMinutes: 30,
      bufferMinutes: 0,
      pricePence: 1000,
    } as MultiServiceSegment,
  ],
  '09:00',
);

const people: GroupPerson[] = [
  {
    label: 'Ana',
    practitionerId: 'prac',
    serviceId: 'svc-1',
    bookingDate: '2026-11-02',
    bookingTime: '10:00:00',
  } as GroupPerson,
];

describe('buildMultiServicePayload with a chosen client', () => {
  it('sends guest_id, and no phone or email when none was typed', () => {
    const payload = buildMultiServicePayload({
      venueId: 'venue-1',
      bookingDate: '2026-11-02',
      contact: { first_name: 'Ana', last_name: 'Lopez', phone: '', email: '', guest_id: 'g-1' },
      source: 'phone',
      segments,
    });
    expect(payload.guest_id).toBe('g-1');
    expect(payload).not.toHaveProperty('phone');
    expect(payload).not.toHaveProperty('email');
  });

  it('sends no guest_id for a new client', () => {
    const payload = buildMultiServicePayload({
      venueId: 'venue-1',
      bookingDate: '2026-11-02',
      contact: { first_name: 'New', last_name: 'Client', email: 'new@example.com' },
      source: 'walk-in',
      segments,
    });
    expect(payload).not.toHaveProperty('guest_id');
  });
});

describe('buildGroupPayload with a chosen organiser', () => {
  it('sends guest_id on a phone source with no typed phone, which the server accepts', () => {
    const payload = buildGroupPayload({
      venueId: 'venue-1',
      contact: { first_name: 'Ana', last_name: 'Lopez', phone: '', email: '', guest_id: 'g-1' },
      source: 'phone',
      people,
    });
    expect(payload).toMatchObject({ guest_id: 'g-1', source: 'phone', first_name: 'Ana', last_name: 'Lopez' });
    expect(payload).not.toHaveProperty('phone');
    expect(payload.people[0]).toMatchObject({ booking_time: '10:00', appointment_service_id: 'svc-1' });
  });

  it('sends no guest_id for a typed organiser', () => {
    const payload = buildGroupPayload({
      venueId: 'venue-1',
      contact: { first_name: 'New', last_name: 'Client', phone: '+447700900123' },
      source: 'phone',
      people,
    });
    expect(payload).not.toHaveProperty('guest_id');
    expect(payload.phone).toBe('+447700900123');
  });
});
