/** Mirror of the web's `visit-people.test.ts`, run under jest. */
import {
  addressExclusionLine,
  layVisitStarts,
  leadingSamePersonCount,
  nobodyHereLine,
  pruneLaterChoices,
  peopleForService,
  peopleOfferingAll,
  planLine,
  visitPersonMode,
  visitTraderLine,
  waitLine,
  type VisitPerson,
} from './visit-people';

const person = (id: string, services: string[], venue?: string, group?: string[]): VisitPerson => ({
  id,
  name: id,
  services: services.map((s) => ({ id: s })),
  ...(venue ? { owning_venue_id: venue } : {}),
  ...(group ? { share_group_ids: group } : {}),
});

describe('visitPersonMode (6.1)', () => {
  it('leaves one service alone', () => {
    expect(visitPersonMode([person('a', ['cut'])], ['cut'])).toBe('single_service');
  });

  it('adds no step where only one person could do any of it', () => {
    expect(visitPersonMode([person('a', ['cut', 'blow'])], ['cut', 'blow'])).toBe('one_person');
    // Another person who offers none of the chosen services changes nothing.
    expect(visitPersonMode([person('a', ['cut', 'blow']), person('b', ['nails'])], ['cut', 'blow'])).toBe('one_person');
  });

  it('offers "someone different for each" when one person offers all and others offer some', () => {
    expect(visitPersonMode([person('a', ['cut', 'blow']), person('b', ['blow'])], ['cut', 'blow'])).toBe('choose');
  });

  it('offers it too when two people each offer everything', () => {
    expect(visitPersonMode([person('a', ['cut', 'blow']), person('b', ['cut', 'blow'])], ['cut', 'blow'])).toBe('choose');
  });

  it('goes straight to a person per service when nobody offers everything', () => {
    expect(visitPersonMode([person('a', ['cut']), person('b', ['blow'])], ['cut', 'blow'])).toBe('per_service');
  });

  it('says when a service has nobody at all', () => {
    expect(visitPersonMode([person('a', ['cut'])], ['cut', 'blow'])).toBe('unavailable');
  });
});

describe('peopleOfferingAll', () => {
  it('keeps only people who offer every service', () => {
    const people = [person('a', ['cut', 'blow']), person('b', ['cut'])];
    expect(peopleOfferingAll(people, ['cut', 'blow']).map((p) => p.id)).toEqual(['a']);
  });
});

describe('peopleForService (8.2: the address test is pairwise)', () => {
  // Studio and Nails share an address, Nails and Lashes share one, Studio and Lashes do not.
  const people = [
    person('alex', ['cut'], 'studio', ['studio', 'nails']),
    person('bea', ['mani', 'polish'], 'nails', ['studio', 'nails', 'lashes']),
    person('cal', ['lift', 'polish'], 'lashes', ['nails', 'lashes']),
    person('dee', ['polish'], 'away', ['away']),
  ];

  it('lists everyone offering the service before anything is chosen', () => {
    const out = peopleForService({ people, serviceId: 'polish', chosen: [], isCollective: true });
    expect(out.people.map((p) => p.id)).toEqual(['bea', 'cal', 'dee']);
    expect(out.excluded).toEqual([]);
  });

  it("leaves out people whose business does not share an address with every business chosen", () => {
    const afterAlex = peopleForService({ people, serviceId: 'polish', chosen: [{ personId: 'alex' }], isCollective: true });
    expect(afterAlex.people.map((p) => p.id)).toEqual(['bea']);
    expect(afterAlex.excluded.map((p) => p.id)).toEqual(['cal', 'dee']);
    // Nails shares with both Studio and Lashes, but Cal (Lashes) does not share with Studio.
    const afterAlexAndBea = peopleForService({
      people,
      serviceId: 'lift',
      chosen: [{ personId: 'alex' }, { personId: 'bea' }],
      isCollective: true,
    });
    expect(afterAlexAndBea.people).toEqual([]);
    expect(afterAlexAndBea.excluded.map((p) => p.id)).toEqual(['cal']);
  });

  it('does not let "any" constrain the list', () => {
    const out = peopleForService({ people, serviceId: 'polish', chosen: [{ any: true }], isCollective: true });
    expect(out.people.map((p) => p.id)).toEqual(['bea', 'cal', 'dee']);
  });

  it('keeps only the same business when the catalogue carries no groups', () => {
    const older = [person('alex', ['cut'], 'studio'), person('bea', ['mani'], 'nails'), person('sam', ['mani'], 'studio')];
    const out = peopleForService({ people: older, serviceId: 'mani', chosen: [{ personId: 'alex' }], isCollective: true });
    expect(out.people.map((p) => p.id)).toEqual(['sam']);
  });

  it('applies no address test on a venue page', () => {
    const out = peopleForService({ people, serviceId: 'polish', chosen: [{ personId: 'alex' }], isCollective: false });
    expect(out.people.map((p) => p.id)).toEqual(['bea', 'cal', 'dee']);
  });
});

describe('lines and the month view', () => {
  const seg = { service_id: 's', practitioner_id: 'p', practitioner_name: 'Steph', start_time: '10:00:00', wait_before_minutes: 5 };
  it('reads each service as the client sees it', () => {
    expect(planLine(seg, 'Gel Manicure')).toBe('10:00 Gel Manicure with Steph');
    expect(waitLine(seg)).toBe('5 minute wait');
    expect(waitLine({ ...seg, wait_before_minutes: 1 })).toBe('1 minute wait');
    expect(waitLine({ ...seg, wait_before_minutes: 0 })).toBeNull();
  });

  it('asks the month view about the first person and their following services only', () => {
    expect(leadingSamePersonCount([{ personId: 'a' }, { personId: 'a' }, { personId: 'b' }, { personId: 'a' }])).toBe(2);
    expect(leadingSamePersonCount([{ any: true }, { personId: 'a' }])).toBe(1);
    expect(leadingSamePersonCount([])).toBe(1);
  });
});

describe('the address lines (D11)', () => {
  it('names one person, then several, and says nothing when nobody was left out', () => {
    expect(addressExclusionLine(['Demi'])).toBe('Demi works at a different address, so please book Demi separately.');
    expect(addressExclusionLine(['Demi', 'Sam'])).toBe('Demi and Sam work at a different address, so please book them separately.');
    expect(addressExclusionLine(['Demi', 'Sam', 'Lee', 'Sam'])).toBe(
      'Demi, Sam and Lee work at a different address, so please book them separately.',
    );
    expect(addressExclusionLine([])).toBeNull();
    expect(nobodyHereLine('Facial')).toBe('Nobody at this address offers Facial. Please book it separately.');
  });

  it('never uses an em-dash', () => {
    for (const line of [addressExclusionLine(['A']), addressExclusionLine(['A', 'B']), nobodyHereLine('X')]) {
      expect(line).not.toContain(String.fromCharCode(0x2014));
    }
  });
});

describe('pruneLaterChoices', () => {
  const ANY = '__any__';
  const people = [
    person('alex', ['cut'], 'studio', ['studio', 'nails']),
    person('bea', ['mani', 'polish'], 'nails', ['studio', 'nails', 'lashes']),
    person('cal', ['lift', 'polish'], 'lashes', ['nails', 'lashes']),
  ];

  it('clears a later person whose business no longer fits, and keeps "any" and people who still fit', () => {
    // Polish with Cal, then the client chooses Alex for the cut: Cal (Lashes) does not share with Studio.
    expect(
      pruneLaterChoices({ people, serviceIds: ['cut', 'polish', 'mani'], choices: ['alex', 'cal', 'bea'], changedIndex: 0, isCollective: true, anyId: ANY }),
    ).toEqual(['alex', null, 'bea']);
    expect(
      pruneLaterChoices({ people, serviceIds: ['cut', 'polish'], choices: ['alex', ANY], changedIndex: 0, isCollective: true, anyId: ANY }),
    ).toEqual(['alex', ANY]);
  });

  it('leaves a venue page alone', () => {
    expect(
      pruneLaterChoices({ people, serviceIds: ['cut', 'polish'], choices: ['alex', 'cal'], changedIndex: 0, isCollective: false, anyId: ANY }),
    ).toEqual(['alex', 'cal']);
  });
});

describe('layVisitStarts (7.1, Override)', () => {
  it("is today's chain for one person: end, processing tail, then buffer", () => {
    expect(
      layVisitStarts(
        [
          { personId: 'a', durationMinutes: 60, bufferMinutes: 10, processingTailMinutes: 15 },
          { personId: 'a', durationMinutes: 30, bufferMinutes: 5 },
        ],
        600,
      ),
    ).toEqual([600, 685]);
  });

  it("starts another person at the end plus the processing tail, without the first person's buffer", () => {
    expect(
      layVisitStarts(
        [
          { personId: 'a', durationMinutes: 60, bufferMinutes: 10, processingTailMinutes: 15 },
          { personId: 'b', durationMinutes: 30, bufferMinutes: 5 },
        ],
        600,
      ),
    ).toEqual([600, 675]);
  });

  it('holds a person coming back for their own buffer', () => {
    // a 10:00-10:30 (buffer 20), b 10:30-10:35, a again: free from 10:50, not 10:35.
    expect(
      layVisitStarts(
        [
          { personId: 'a', durationMinutes: 30, bufferMinutes: 20 },
          { personId: 'b', durationMinutes: 5, bufferMinutes: 0 },
          { personId: 'a', durationMinutes: 30, bufferMinutes: 0 },
        ],
        600,
      ),
    ).toEqual([600, 630, 650]);
  });
});

describe('visitTraderLine (counsel text 2.2)', () => {
  it('names each business with its services, then the shared address', () => {
    expect(
      visitTraderLine([
        { name: 'The Beauty Parlour', address: '17 King Street, Winterton, DN15 9TP', serviceNames: ['Gel Manicure'] },
        { name: 'Beauty By Steph', address: '17 King Street, Winterton, DN15 9TP', serviceNames: ['Brow Wax'] },
      ]),
    ).toBe(
      'You are booking with The Beauty Parlour (Gel Manicure) and Beauty By Steph (Brow Wax), 17 King Street, Winterton, DN15 9TP. Each business provides, charges for and refunds its own services.',
    );
  });

  it('puts each address after its business when they are typed differently', () => {
    expect(
      visitTraderLine([
        { name: 'SV Studio', address: '10 High Street, Holywood', serviceNames: ['Cut', 'Colour'] },
        { name: 'SV Nails', address: 'Suite 2, 10 High Street, Holywood', serviceNames: ['Pedicure'] },
      ]),
    ).toBe(
      'You are booking with SV Studio (Cut and Colour), 10 High Street, Holywood, and SV Nails (Pedicure), Suite 2, 10 High Street, Holywood. Each business provides, charges for and refunds its own services.',
    );
  });

  it('leaves the address out when no business has one', () => {
    expect(
      visitTraderLine([
        { name: 'A', address: null, serviceNames: ['x'] },
        { name: 'B', address: '', serviceNames: ['y'] },
        { name: 'C', address: null, serviceNames: ['z'] },
      ]),
    ).toBe('You are booking with A (x), B (y) and C (z). Each business provides, charges for and refunds its own services.');
  });
});
