/**
 * How a member business reads beside a person (22 Nov 2026, full review decision 7). Mirrors web
 * `src/lib/venues/person-at-business.ts`; both tests run the same table of cases.
 *
 * A business in a collective has one label, for clients and staff alike: the name it goes by in the
 * collective when it has one ("Jenny at Aura"), else its own name, told apart from a look-alike in
 * the collective by its people ("Aura Hair Studio (Jenny)"). The server builds that label. Beside a person already named, the person is never named twice: "Blow Dry with Jenny
 * at Aura Hair Studio", never "Jenny at Aura Hair Studio (Jenny)" or "Jenny at Jenny at Aura".
 */

function tidy(value: string | null | undefined): string | null {
  const v = (value ?? '').replace(/\s+/g, ' ').trim();
  return v ? v : null;
}

function key(value: string): string {
  return value.toLocaleLowerCase('en-GB');
}

/** The words of a name, lower case, so "Jenny" is found in "(Sophie, Jenny and 2 more)". */
function nameWords(value: string): string[] {
  return value.toLocaleLowerCase('en-GB').split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean);
}

function namesPerson(text: string, person: string): boolean {
  const hay = nameWords(text);
  const needle = nameWords(person);
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= hay.length; i += 1) {
    if (needle.every((w, j) => hay[i + j] === w)) return true;
  }
  return false;
}

/**
 * A member business's label as it reads beside a person already named (22 Nov 2026), so the person
 * is never named twice:
 * - a chosen name that starts with the person ("Jenny at Aura") reads as the rest ("Aura");
 * - a label told apart by its people ("Aura Hair Studio (Jenny)") drops the brackets when they name
 *   that person.
 * Any other label is kept whole. For copy that puts the two together itself ("{calendar} at {venue}").
 */
export function businessBesidePerson(person: string | null | undefined, business: string | null | undefined): string {
  const b = tidy(business) ?? '';
  const p = tidy(person);
  if (!p || !b) return b;
  const prefix = `${key(p)} at `;
  if (key(b).startsWith(prefix) && b.length > prefix.length) return b.slice(prefix.length);
  const bracket = /^(.*\S)\s*\(([^()]*)\)$/.exec(b);
  return bracket && namesPerson(bracket[2]!, p) ? bracket[1]! : b;
}

/**
 * "Jenny at Aura Hair Studio": a person at a member business, naming the person once. A label that
 * already starts with the person ("Jenny at Aura", an older name chosen in a collective) is used as
 * it is.
 */
export function personAtBusiness(person: string | null | undefined, business: string | null | undefined): string {
  const p = tidy(person);
  const b = tidy(business);
  if (!p) return b ?? '';
  if (!b) return p;
  // A chosen name that starts with the person is the phrase already: "Jenny at Aura".
  if (key(b) === key(p) || key(b).startsWith(`${key(p)} at `)) return b;
  return `${p} at ${businessBesidePerson(p, b)}`;
}

/**
 * "Blow Dry with Jenny at Aura Hair Studio", or "Blow Dry at Aura Hair Studio" when no person is
 * named: one part of a visit at another business, as partner lines list it.
 */
export function serviceWithPersonAt(
  service: string | null | undefined,
  person: string | null | undefined,
  business: string | null | undefined,
): string {
  const s = tidy(service) ?? 'Appointment';
  const p = tidy(person);
  const b = tidy(business);
  if (p) return `${s} with ${personAtBusiness(p, b)}`;
  return b ? `${s} at ${b}` : s;
}

/**
 * Whether a partner's column or booking carries the "Linked" pill. A business in the caller's
 * collective is a member, named like any other (the web shows no pill there); only a plain account
 * link outside the collective keeps it. `memberVenueIds` is the staff collective's members, or null
 * while it loads or when the venue is in none.
 */
export function showsLinkedPill(
  venueId: string | null | undefined,
  memberVenueIds: readonly string[] | null | undefined,
): boolean {
  if (!venueId) return true;
  return !(memberVenueIds ?? []).includes(venueId);
}
