/**
 * Which follow-on questions a visit asks (web Docs/follow-on-services-plan.md 4.2, rules R1 to
 * R10). A straight port of the web's `src/lib/follow-ons/rules.ts`; keep the two in step. Staff
 * bookings never enforce "Clients must choose one", so the app only uses it to say so.
 * @see _reference/reserve-ni/src/lib/follow-ons/rules.ts
 */

/** A follow-on group as the booking catalogue carries it. */
export interface CatalogFollowOnGroup {
  id: string;
  /** The question; null shows the default. */
  prompt: string | null;
  selection_type: 'single' | 'multi';
  required: boolean;
  trigger_service_ids: string[];
  /** In the order clients see them. */
  offered_service_ids: string[];
}

export interface FollowOnQuestion {
  group: CatalogFollowOnGroup;
  /** The trigger in the visit the picks go after: the last one in visit order (R5). */
  afterServiceId: string;
  /** Offered services the client can book here and has not got in the visit yet (R2), in order. */
  choices: string[];
  /** Offered services already in the visit (R3, R8). */
  chosen: string[];
}

/** The question clients see when the venue leaves it empty (web plan 4.4). */
export const DEFAULT_FOLLOW_ON_QUESTION = 'Would you like to add one of these?';

/** The most services one visit holds (mirrors `MAX_SERVICES_PER_VISIT`). */
export const FOLLOW_ON_VISIT_LIMIT = 4;

/**
 * The questions a visit asks, in the order its trigger services come (R1, R6). A group is in play
 * when the visit holds one of its triggers. A group with nothing the client can book here, and
 * nothing already chosen, is not asked at all, required or not (R4).
 *
 * `bookable` says whether this client can book a service on this page: it is in the catalogue the
 * page loaded (active, bookable online, payable here, offered by someone the page lists) and, for
 * a single person's run of services, offered by someone who could do it with the rest.
 */
export function followOnQuestions(params: {
  groups: readonly CatalogFollowOnGroup[];
  visitServiceIds: readonly string[];
  bookable: (serviceId: string) => boolean;
}): FollowOnQuestion[] {
  const { groups, visitServiceIds, bookable } = params;
  const inVisit = new Set(visitServiceIds);
  const position = new Map(visitServiceIds.map((id, i) => [id, i] as const));
  const questions: (FollowOnQuestion & { at: number })[] = [];
  for (const group of groups) {
    const triggersHere = group.trigger_service_ids.filter((id) => inVisit.has(id));
    if (triggersHere.length === 0) continue;
    const offered = group.offered_service_ids.filter((id) => !group.trigger_service_ids.includes(id)); // R10
    const chosen = offered.filter((id) => inVisit.has(id));
    const choices = offered.filter((id) => !inVisit.has(id) && bookable(id));
    if (chosen.length === 0 && choices.length === 0) continue; // R4
    const afterServiceId = triggersHere.reduce((a, b) => ((position.get(b) ?? 0) > (position.get(a) ?? 0) ? b : a));
    questions.push({ group, afterServiceId, choices, chosen, at: position.get(afterServiceId) ?? 0 });
  }
  return questions.sort((a, b) => a.at - b.at).map(({ at: _at, ...q }) => q);
}

/** A question with nothing chosen yet (R3, R8). */
export function isUnanswered(q: FollowOnQuestion): boolean {
  return q.chosen.length === 0;
}

/**
 * The required questions an online booking leaves unanswered (F3). The create routes refuse such
 * a booking; staff bookings never ask this.
 */
export function unmetRequiredFollowOns(params: Parameters<typeof followOnQuestions>[0]): FollowOnQuestion[] {
  return followOnQuestions(params).filter((q) => q.group.required && isUnanswered(q));
}

/**
 * The visit with the picks added, each straight after the service that asked for it (R5). Picks
 * already in the visit, and the same service picked twice, are added once.
 */
export function insertFollowOnPicks(
  visitServiceIds: readonly string[],
  picks: readonly { serviceId: string; afterServiceId: string }[],
): string[] {
  const out = [...visitServiceIds];
  for (const pick of picks) {
    if (out.includes(pick.serviceId)) continue;
    const at = out.lastIndexOf(pick.afterServiceId);
    // A pick goes after its trigger and after any picks already placed there, in the order picked.
    let insertAt = at < 0 ? out.length : at + 1;
    while (insertAt < out.length && !visitServiceIds.includes(out[insertAt]!)) insertAt += 1;
    out.splice(insertAt, 0, pick.serviceId);
  }
  return out;
}

/** Whether every required question shown on the step has a pick (Continue is enabled). */
export function followOnStepComplete(
  questions: readonly FollowOnQuestion[],
  picks: ReadonlyMap<string, readonly string[]>,
): boolean {
  return questions.every((q) => !q.group.required || q.chosen.length > 0 || (picks.get(q.group.id)?.length ?? 0) > 0);
}
