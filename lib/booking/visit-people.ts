/**
 * Who does each service of a visit (web Docs/split-staff-visit-plan.md 6.1, 6.2, 8.2): the booking
 * flow's person logic, kept out of the component so every rule is tested on its own.
 *
 * Mirror of the web's `src/lib/booking/visit-people.ts`; keep the two in step. The copy is inlined
 * here word for word (the web reads it from `collective-copy.ts`).
 *
 * Words: a "person" is a calendar in the catalogue. On a collective page each person belongs to a
 * member business (`owning_venue_id`) and carries the businesses it may share a visit with
 * (`share_group_ids`, computed on the server with the shared-address test, D11 and D15).
 */
/** The longest wait between two people's services in one visit, in minutes (web D7). */
export const MAX_VISIT_GAP_MINUTES = 30;

export interface VisitPerson {
  id: string;
  name: string;
  services: readonly { id: string }[];
  owning_venue_id?: string | null;
  /** Collective pages: the businesses this person's business may share a visit with, itself included. */
  share_group_ids?: readonly string[] | null;
}

/** What the person step offers once several services are ticked (6.1). */
export type VisitPersonMode =
  /** One service: today's step, unchanged. */
  | 'single_service'
  /** Only one person could do any of it (most single-calendar venues): today's step, no new choice. */
  | 'one_person'
  /** Someone offers everything and others offer some: today's list plus "someone different for each". */
  | 'choose'
  /** Nobody offers everything: straight to choosing a person for each service. */
  | 'per_service'
  /** A service nobody offers at all: nothing can be booked; the flow says so. */
  | 'unavailable';

export function offersService(person: VisitPerson, serviceId: string): boolean {
  return person.services.some((s) => s.id === serviceId);
}

/** The people who offer every one of the services, as today's single-person visit needs. */
export function peopleOfferingAll<P extends VisitPerson>(people: readonly P[], serviceIds: readonly string[]): P[] {
  return people.filter((p) => serviceIds.every((id) => offersService(p, id)));
}

export function visitPersonMode(people: readonly VisitPerson[], serviceIds: readonly string[]): VisitPersonMode {
  if (serviceIds.length <= 1) return 'single_service';
  if (serviceIds.some((id) => !people.some((p) => offersService(p, id)))) return 'unavailable';
  const all = peopleOfferingAll(people, serviceIds);
  if (all.length === 0) return 'per_service';
  // A split needs a second person offering at least one of the services (they may offer them all).
  const offeringAny = people.filter((p) => serviceIds.some((id) => offersService(p, id)));
  return offeringAny.length > 1 ? 'choose' : 'one_person';
}

/**
 * Whether a person's business may share a visit with every business in `venueIds` (pairwise, D11,
 * D15). Without the server's groups (an older catalogue) only the same business is safe.
 */
export function personFitsBusinesses(person: VisitPerson, venueIds: readonly string[]): boolean {
  if (venueIds.length === 0) return true;
  const venue = person.owning_venue_id ?? null;
  if (!venue) return false;
  const group = person.share_group_ids ?? [venue];
  return venueIds.every((v) => v === venue || group.includes(v));
}

/** A choice so far: a person, or "any" (whose business is not known until a time is chosen). */
export type PersonChoice = { personId: string } | { any: true };

/**
 * The people who may take `serviceId` given the services already chosen. On a collective page a
 * person is kept only when their business may share a visit with EVERY business already chosen (the
 * test is pairwise, not transitive). "Any" choices do not constrain the list: their business is
 * settled by the server when the time is chosen, which applies the same test.
 *
 * `excluded` lists the people left out because of the address, for the D11 line.
 */
export function peopleForService<P extends VisitPerson>(params: {
  people: readonly P[];
  serviceId: string;
  chosen: readonly PersonChoice[];
  isCollective: boolean;
}): { people: P[]; excluded: P[] } {
  const offering = params.people.filter((p) => offersService(p, params.serviceId));
  if (!params.isCollective) return { people: offering, excluded: [] };
  const byId = new Map(params.people.map((p) => [p.id, p]));
  const chosenVenues = [
    ...new Set(
      params.chosen
        .map((c) => ('personId' in c ? byId.get(c.personId)?.owning_venue_id ?? null : null))
        .filter((v): v is string => !!v),
    ),
  ];
  if (chosenVenues.length === 0) return { people: offering, excluded: [] };
  const kept: P[] = [];
  const excluded: P[] = [];
  for (const p of offering) {
    (personFitsBusinesses(p, chosenVenues) ? kept : excluded).push(p);
  }
  return { people: kept, excluded };
}

/** One service of a chosen time, as the availability route spells it out. */
export interface PlannedSegment {
  service_id: string;
  practitioner_id: string;
  practitioner_name: string;
  start_time: string;
  end_time?: string;
  wait_before_minutes?: number;
}

/** "10:00 Gel Manicure with Steph". */
export function planLine(seg: PlannedSegment, serviceName: string): string {
  return `${seg.start_time.slice(0, 5)} ${serviceName} with ${seg.practitioner_name}`;
}

/** "5 minute wait" before a service, or null when the client goes straight in. */
export function waitLine(seg: PlannedSegment): string | null {
  const m = Math.round(seg.wait_before_minutes ?? 0);
  if (m <= 0) return null;
  return m === 1 ? '1 minute wait' : `${m} minute wait`;
}

/**
 * The month view stays approximate (8.3): it asks the first person for the first service plus every
 * following service with the same person, not the whole visit, which would grey out days where the
 * first person has time only for their own part.
 */
export function leadingSamePersonCount(choices: readonly PersonChoice[]): number {
  const first = choices[0];
  if (!first || !('personId' in first)) return 1;
  let n = 1;
  while (n < choices.length) {
    const next = choices[n]!;
    if (!('personId' in next) || next.personId !== first.personId) break;
    n += 1;
  }
  return n;
}

/** "Demi and Sam" / "Demi, Sam and Lee". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The D11 line under a service whose list left people out for the address (6.1): "Demi works at a
 * different address, so please book Demi separately." Null when nobody was left out.
 */
export function addressExclusionLine(names: readonly string[]): string | null {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) return null;
  if (unique.length === 1) return `${unique[0]} works at a different address, so please book ${unique[0]} separately.`;
  return `${joinNames(unique)} work at a different address, so please book them separately.`;
}

/** "Nobody at this address offers Facial. Please book it separately." (6.1) */
export function nobodyHereLine(serviceName: string): string {
  return `Nobody at this address offers ${serviceName}. Please book it separately.`;
}

/** A choice as the flow stores it: a calendar id, the flow's "any available" id, or not chosen yet. */
export type StoredPersonChoice = string | null;

/**
 * The choices so far as {@link peopleForService} reads them. `anyId` is the flow's own "any
 * available" id; a choice not made yet ends the list, since later services are not constrained by it.
 */
export function choicesAsPersonChoices(choices: readonly StoredPersonChoice[], anyId: string): PersonChoice[] {
  const out: PersonChoice[] = [];
  for (const c of choices) {
    if (!c) continue;
    out.push(c === anyId ? { any: true } : { personId: c });
  }
  return out;
}

/**
 * After service `changedIndex` changes hands, every later choice is checked again and cleared when
 * it no longer fits: a person whose business no longer shares an address with every business
 * chosen before them, or who no longer offers the service. "Any" always stays.
 */
export function pruneLaterChoices<P extends VisitPerson>(params: {
  people: readonly P[];
  serviceIds: readonly string[];
  choices: readonly StoredPersonChoice[];
  changedIndex: number;
  isCollective: boolean;
  anyId: string;
}): StoredPersonChoice[] {
  const next = [...params.choices];
  for (let i = params.changedIndex + 1; i < params.serviceIds.length; i += 1) {
    const choice = next[i];
    if (!choice || choice === params.anyId) continue;
    const { people } = peopleForService({
      people: params.people,
      serviceId: params.serviceIds[i]!,
      chosen: choicesAsPersonChoices(next.slice(0, i), params.anyId),
      isCollective: params.isCollective,
    });
    if (!people.some((p) => p.id === choice)) next[i] = null;
  }
  return next;
}

/** One service of a visit laid out by hand (staff "Override availability"). */
export interface LaidSegment {
  /** The calendar; the same person is the same calendar here (one business, or one calendar). */
  personId: string;
  durationMinutes: number;
  bufferMinutes: number;
  /** Processing that runs past the service's end, which the client sits through. */
  processingTailMinutes?: number;
}

/**
 * Start minutes for each service of a visit laid back to back by hand (7.1, Override): the next
 * service starts once the client is free, at the previous end plus its processing tail; when it is
 * with someone who already had a service in the visit, it also waits for that person's buffer after
 * it. One person throughout is exactly today's chain.
 */
export function layVisitStarts(segments: readonly LaidSegment[], firstStartMinutes: number): number[] {
  const starts: number[] = [];
  const personFreeAt = new Map<string, number>();
  let clientFreeAt = firstStartMinutes;
  for (const seg of segments) {
    const start = Math.max(clientFreeAt, personFreeAt.get(seg.personId) ?? clientFreeAt);
    starts.push(start);
    const end = start + seg.durationMinutes;
    clientFreeAt = end + (seg.processingTailMinutes ?? 0);
    personFreeAt.set(seg.personId, clientFreeAt + seg.bufferMinutes);
  }
  return starts;
}

/** One business of a visit across businesses, as the trader line names it. */
export interface VisitTraderPart {
  name: string;
  address: string | null;
  serviceNames: readonly string[];
}

/** Counsel's sentence after the businesses (Docs/split-visit-counsel-texts.md 2.2). */
export const VISIT_TRADER_RESPONSIBILITY = 'Each business provides, charges for and refunds its own services.';

/**
 * Who the client contracts with on a visit across businesses (counsel text 2.2, word for word):
 * "You are booking with The Beauty Parlour (Gel Manicure) and Beauty By Steph (Brow Wax), 17 King
 * Street, Winterton, DN15 9TP. Each business provides, charges for and refunds its own services."
 * When the businesses' addresses are typed differently, each business's address follows its name.
 */
export function visitTraderLine(parts: readonly VisitTraderPart[]): string {
  const named = parts.map((p) => `${p.name} (${joinNames([...p.serviceNames])})`);
  const addresses = [...new Set(parts.map((p) => (p.address ?? '').trim()).filter(Boolean))];
  const sameAddress = addresses.length <= 1 && parts.every((p) => (p.address ?? '').trim() === (addresses[0] ?? ''));
  if (sameAddress) {
    const where = addresses[0];
    return `You are booking with ${joinNames(named)}${where ? `, ${where}` : ''}. ${VISIT_TRADER_RESPONSIBILITY}`;
  }
  const withAddress = parts.map((p, i) => {
    const address = (p.address ?? '').trim();
    return address ? `${named[i]}, ${address},` : `${named[i]},`;
  });
  // "A (x), 1 High St, and B (y), 2 High St." The last part's trailing comma becomes the full stop.
  const joined = joinNames(withAddress).replace(/,$/, '');
  return `You are booking with ${joined}. ${VISIT_TRADER_RESPONSIBILITY}`;
}

