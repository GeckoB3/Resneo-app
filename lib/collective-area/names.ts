/**
 * A business's name in its collective, for staff (web `collective-names.ts`, 2026-11-05).
 *
 * When two businesses in a collective share a name, staff see the one each goes by in the
 * collective, or, until it has one, the name with its people ("Aura Hair Studio (Jenny)"). The server
 * builds those labels; this only says when to ask for a name.
 */

export const COLLECTIVE_NAME_MAX = 60;

export interface NamedMember {
  venueId: string;
  /** The business's own name, as its Profile has it. */
  ownName: string;
  nameInCollective?: string | null;
  status: string;
}

/** Spaces collapsed and trimmed; empty is null, which clears the name. */
export function tidyCollectiveName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.replace(/\s+/g, ' ').trim();
  return v ? v : null;
}

function sameName(a: string, b: string): boolean {
  const left = a.trim().toLocaleLowerCase('en-GB');
  return left.length > 0 && left === b.trim().toLocaleLowerCase('en-GB');
}

/**
 * The names more than one active business goes by with none chosen, with those businesses. A pair
 * where one has a name is told apart already.
 */
export function collectiveNameClashes(members: readonly NamedMember[]): { name: string; venueIds: string[] }[] {
  const unnamed = members.filter((m) => m.status === 'active' && !tidyCollectiveName(m.nameInCollective));
  const out: { name: string; venueIds: string[] }[] = [];
  for (const m of unnamed) {
    if (out.some((c) => sameName(c.name, m.ownName))) continue;
    const same = unnamed.filter((o) => sameName(o.ownName, m.ownName));
    if (same.length > 1) out.push({ name: m.ownName.trim(), venueIds: same.map((o) => o.venueId) });
  }
  return out;
}

/** True when another active business in the collective has `venueId`'s own name. */
export function sharesNameInCollective(members: readonly NamedMember[], venueId: string): boolean {
  const me = members.find((m) => m.venueId === venueId);
  if (!me) return false;
  return members.some((o) => o.venueId !== venueId && o.status === 'active' && sameName(o.ownName, me.ownName));
}

/** The members a server sent own names for; older servers send none, and nothing is asked. */
export function namedMembers(
  members: readonly { venueId: string; status: string; ownName?: string; nameInCollective?: string | null }[],
): NamedMember[] {
  return members
    .filter((m) => typeof m.ownName === 'string')
    .map((m) => ({ venueId: m.venueId, ownName: m.ownName!, nameInCollective: m.nameInCollective ?? null, status: m.status }));
}
