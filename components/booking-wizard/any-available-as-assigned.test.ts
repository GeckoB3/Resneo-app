/**
 * "Any available" quoted as the assigned person offers it (web review 22 Nov 2026, APP-6).
 */
import { anyAvailableAsAssigned } from '@/components/booking-wizard/PractitionerStep';
import {
  ANY_AVAILABLE_PRACTITIONER_ID,
  type AppointmentCatalogPractitioner,
  type AppointmentServiceOption,
} from '@/types/appointment-catalog';

const person = (id: string, name: string, price: number, deposit: number | null, variants: unknown[] = []) =>
  ({
    id,
    name,
    services: [
      {
        id: 'svc-cut',
        name: 'Cut',
        duration_minutes: id === 'jenny' ? 45 : 30,
        buffer_minutes: 0,
        processing_time_blocks: [],
        price_pence: price,
        deposit_pence: deposit,
        payment_requirement: deposit ? 'deposit' : 'none',
        addon_groups: [],
        variants,
      },
    ],
  }) as unknown as AppointmentCatalogPractitioner;

const anyOption = {
  serviceId: 'svc-cut',
  serviceName: 'Cut',
  practitionerId: ANY_AVAILABLE_PRACTITIONER_ID,
  practitionerName: 'Any available',
  candidatePractitionerIds: ['aisha', 'jenny'],
  durationMinutes: 30,
  buffer_minutes: 0,
  processing_time_blocks: [],
  pricePence: 3000,
  depositPence: null,
  paymentRequirement: 'none',
  addonGroups: [],
  variants: [],
} as unknown as AppointmentServiceOption;

const people = [person('aisha', 'Aisha', 3000, null), person('jenny', 'Jenny', 3500, 1000)];

describe('anyAvailableAsAssigned', () => {
  it('quotes the price, length and deposit of the person the time gave', () => {
    const { service } = anyAvailableAsAssigned(anyOption, null, 'jenny', people);
    expect(service).toMatchObject({ pricePence: 3500, depositPence: 1000, durationMinutes: 45, paymentRequirement: 'deposit' });
  });

  it('stays an "Any available" pick, so the create still sends the person the time gave', () => {
    const { service } = anyAvailableAsAssigned(anyOption, null, 'jenny', people);
    expect(service.practitionerId).toBe(ANY_AVAILABLE_PRACTITIONER_ID);
    expect(service.candidatePractitionerIds).toEqual(['aisha', 'jenny']);
  });

  it('takes the assigned person own copy of the chosen option, matched by id then by name', () => {
    const chosen = { id: 'v-long-aisha', name: 'Long', price_pence: 4000 };
    const jenny = person('jenny', 'Jenny', 3500, 1000, [{ id: 'v-long-jenny', name: 'long ', price_pence: 4600 }]);
    const { variant } = anyAvailableAsAssigned(anyOption, chosen, 'jenny', [people[0]!, jenny]);
    expect(variant).toMatchObject({ id: 'v-long-jenny', price_pence: 4600 });
  });

  it('leaves the pick alone when the person is unknown or does not offer the service', () => {
    expect(anyAvailableAsAssigned(anyOption, null, 'nobody', people).service).toBe(anyOption);
    expect(anyAvailableAsAssigned(anyOption, null, null, people).service).toBe(anyOption);
  });
});

describe('a card hold set as a percentage', () => {
  it("carries the percentage with the person's own price", () => {
    const holdPerson = (id: string, name: string, price: number) => {
      const p = person(id, name, price, null);
      Object.assign(p.services[0]!, { payment_requirement: 'card_hold', card_hold_fee_percent: 50 });
      return p;
    };
    const { service } = anyAvailableAsAssigned(anyOption, null, 'jenny', [holdPerson('aisha', 'Aisha', 3000), holdPerson('jenny', 'Jenny', 3500)]);
    expect(service).toMatchObject({ pricePence: 3500, paymentRequirement: 'card_hold', cardHoldFeePercent: 50 });
  });
});
