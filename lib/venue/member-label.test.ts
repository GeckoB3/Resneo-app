/**
 * Web parity (22 Nov 2026): these two tables are copied from web
 * `src/lib/venues/person-at-business.test.ts`, which runs them against the web helpers. Keep the
 * two files' tables identical, so a member business reads the same on both platforms.
 */
import {
  businessBesidePerson,
  personAtBusiness,
  serviceWithPersonAt,
  showsLinkedPill,
} from '@/lib/venue/member-label';

/** [person, business label, personAtBusiness, businessBesidePerson]. Same table as the web. */
const PERSON_AT_BUSINESS_CASES: readonly (readonly [string | null, string | null, string, string])[] = [
  ['Jenny', 'Aura Hair Studio (Jenny)', 'Jenny at Aura Hair Studio', 'Aura Hair Studio'],
  ['Jenny', 'Aura Hair Studio', 'Jenny at Aura Hair Studio', 'Aura Hair Studio'],
  ['Jenny', 'Jenny at Aura', 'Jenny at Aura', 'Aura'],
  ['jenny', 'Jenny at Aura', 'Jenny at Aura', 'Aura'],
  ['Andrew', 'Jenny at Aura', 'Andrew at Jenny at Aura', 'Jenny at Aura'],
  ['Jenny', 'Jenny at', 'Jenny at Jenny at', 'Jenny at'],
  ['Aisha', 'Aura Hair Studio (Sophie, Aisha and 2 more)', 'Aisha at Aura Hair Studio', 'Aura Hair Studio'],
  ['Jenny', 'Aura Hair Studio (Sophie, Aisha and 2 more)', 'Jenny at Aura Hair Studio (Sophie, Aisha and 2 more)', 'Aura Hair Studio (Sophie, Aisha and 2 more)'],
  ['Jen', 'Aura Hair Studio (Jenny)', 'Jen at Aura Hair Studio (Jenny)', 'Aura Hair Studio (Jenny)'],
  ['Jenny Smith', 'Aura Hair Studio (Jenny Smith)', 'Jenny Smith at Aura Hair Studio', 'Aura Hair Studio'],
  ['Andrew', 'Light 16', 'Andrew at Light 16', 'Light 16'],
  ['Andrew', 'Aura Hair Studio in Holywood', 'Andrew at Aura Hair Studio in Holywood', 'Aura Hair Studio in Holywood'],
  ['Room 1', 'Studio (East)', 'Room 1 at Studio (East)', 'Studio (East)'],
  ['  Jenny ', '  Aura Hair Studio  (Jenny) ', 'Jenny at Aura Hair Studio', 'Aura Hair Studio'],
  ['Jenny', 'Jenny', 'Jenny', 'Jenny'],
  [null, 'Aura Hair Studio (Jenny)', 'Aura Hair Studio (Jenny)', 'Aura Hair Studio (Jenny)'],
  ['Jenny', null, 'Jenny', ''],
  ['', '', '', ''],
];

/** [service, person, business label, serviceWithPersonAt]. Same table as the web. */
const SERVICE_WITH_PERSON_AT_CASES: readonly (readonly [string | null, string | null, string | null, string])[] = [
  ['Blow Dry', 'Jenny', 'Aura Hair Studio (Jenny)', 'Blow Dry with Jenny at Aura Hair Studio'],
  ['Root Tint', 'Jenny', 'Jenny at Aura', 'Root Tint with Jenny at Aura'],
  ['Blow Dry', 'jenny', 'Jenny at Aura', 'Blow Dry with Jenny at Aura'],
  ['Blow Dry', null, 'Jenny at Aura', 'Blow Dry at Jenny at Aura'],
  ['Balayage', 'Andrew', 'Light 16', 'Balayage with Andrew at Light 16'],
  ['Balayage', null, 'Aura Hair Studio (Jenny)', 'Balayage at Aura Hair Studio (Jenny)'],
  ['Balayage', 'Andrew', null, 'Balayage with Andrew'],
  [null, null, null, 'Appointment'],
];

describe('personAtBusiness / businessBesidePerson (web parity)', () => {
  it.each(PERSON_AT_BUSINESS_CASES)('%s + %s', (person, business, at, beside) => {
    expect(personAtBusiness(person, business)).toBe(at);
    expect(businessBesidePerson(person, business)).toBe(beside);
  });
});

describe('serviceWithPersonAt (web parity)', () => {
  it.each(SERVICE_WITH_PERSON_AT_CASES)('%s + %s + %s', (service, person, business, expected) => {
    expect(serviceWithPersonAt(service, person, business)).toBe(expected);
  });
});

describe('showsLinkedPill', () => {
  it('drops the pill for a member of the same collective and keeps it for a plain link', () => {
    expect(showsLinkedPill('v-jenny', ['v-host', 'v-jenny'])).toBe(false);
    expect(showsLinkedPill('v-partner', ['v-host', 'v-jenny'])).toBe(true);
    expect(showsLinkedPill('v-partner', null)).toBe(true);
    expect(showsLinkedPill(null, ['v-host'])).toBe(true);
  });
});
