/**
 * Permission-model logic for Linked Venues (§5). Pure functions, no I/O — the
 * exact rules the web server enforces, ported from the reference
 * `src/lib/linked-accounts/permissions.ts` so the client can never express an
 * incoherent or zero-way grant. Unit-tested in grants.test.ts.
 */

import type {
  LinkActionLevel,
  LinkCalendarVisibility,
  LinkGrant,
} from '@/types/linked-venues';

export const CALENDAR_RANK: Record<LinkCalendarVisibility, number> = {
  none: 0,
  time_only: 1,
  full_details: 2,
};

export const ACTION_RANK: Record<LinkActionLevel, number> = {
  none: 0,
  edit_existing: 1,
  create_edit_cancel: 2,
};

/** Canonicalise a calendar-scope list (§18): empty/null → null (= all); else sorted unique. */
export function normaliseCalendarIds(ids: string[] | null | undefined): string[] | null {
  if (!ids || ids.length === 0) return null;
  return [...new Set(ids)].sort();
}

/** True when two canonicalised calendar-scope lists are equivalent. */
export function calendarIdsEqual(a: string[] | null, b: string[] | null): boolean {
  if (a === null || b === null) return a === b;
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Force a grant into a coherent state (§5.5). Calendar visibility is the lead
 * dimension; PII and action are clamped down to whatever it allows. The §18
 * calendar scope is canonicalised, and cleared entirely when there is no
 * calendar access (`none`).
 */
export function normaliseGrant(grant: LinkGrant): LinkGrant {
  const calendar = grant.calendar;
  if (calendar === 'none') {
    return { calendar, pii: false, act: 'none', calendarIds: null };
  }
  if (calendar === 'time_only') {
    return { calendar, pii: false, act: 'none', calendarIds: normaliseCalendarIds(grant.calendarIds) };
  }
  // full_details
  const pii = grant.pii;
  const act: LinkActionLevel = pii ? grant.act : 'none';
  return { calendar, pii, act, calendarIds: normaliseCalendarIds(grant.calendarIds) };
}

/** True when scope `n` is at least as restrictive as `c` (n ⊆ c; `null` = all). */
function scopeIsNarrowerOrEqual(n: string[] | null, c: string[] | null): boolean {
  if (c === null) return true; // c = all calendars; any n is narrower-or-equal
  if (n === null) return false; // n = all but c is limited → n is wider
  return n.every((id) => c.includes(id));
}

/** True when scope `n` is at least as broad as `c` (c ⊆ n; `null` = all). */
function scopeIsWiderOrEqual(n: string[] | null, c: string[] | null): boolean {
  if (n === null) return true; // n = all calendars; at least as broad as anything
  if (c === null) return false; // c = all but n is limited → n is narrower
  return c.every((id) => n.includes(id));
}

/** True when the grant is internally consistent without modification. */
export function isGrantCoherent(grant: LinkGrant): boolean {
  const n = normaliseGrant(grant);
  return n.calendar === grant.calendar && n.pii === grant.pii && n.act === grant.act;
}

/** A link must not grant `none` in both directions (§5.5). */
export function isLinkConfigurationValid(a: LinkGrant, b: LinkGrant): boolean {
  return a.calendar !== 'none' || b.calendar !== 'none';
}

/** True when two grants are identical after normalisation (including §18 scope). */
export function grantsEqual(a: LinkGrant, b: LinkGrant): boolean {
  const na = normaliseGrant(a);
  const nb = normaliseGrant(b);
  return (
    na.calendar === nb.calendar &&
    na.pii === nb.pii &&
    na.act === nb.act &&
    calendarIdsEqual(na.calendarIds ?? null, nb.calendarIds ?? null)
  );
}

/** True when `next` grants strictly less-or-equal access than `current` in every dimension. */
export function isReductionOnly(current: LinkGrant, next: LinkGrant): boolean {
  const c = normaliseGrant(current);
  const n = normaliseGrant(next);
  return (
    CALENDAR_RANK[n.calendar] <= CALENDAR_RANK[c.calendar] &&
    (n.pii ? c.pii : true) &&
    ACTION_RANK[n.act] <= ACTION_RANK[c.act] &&
    // Narrowing the calendar scope is a reduction; widening it is not (§18).
    scopeIsNarrowerOrEqual(n.calendarIds ?? null, c.calendarIds ?? null)
  );
}

/** True when `next` grants strictly more-or-equal access than `current`, and differs. */
export function isIncreaseOnly(current: LinkGrant, next: LinkGrant): boolean {
  const c = normaliseGrant(current);
  const n = normaliseGrant(next);
  if (grantsEqual(c, n)) return false;
  return (
    CALENDAR_RANK[n.calendar] >= CALENDAR_RANK[c.calendar] &&
    (n.pii ? true : !c.pii) &&
    ACTION_RANK[n.act] >= ACTION_RANK[c.act] &&
    // Widening the calendar scope is an increase; narrowing it is not (§18).
    scopeIsWiderOrEqual(n.calendarIds ?? null, c.calendarIds ?? null)
  );
}

/**
 * Apply a calendar visibility change with sensible defaults — upgrading to
 * `full_details` from `time_only`/`none` enables PII and edit access (§5.4).
 */
export function applyCalendarVisibilityChange(
  grant: LinkGrant,
  calendar: LinkCalendarVisibility,
): LinkGrant {
  if (
    calendar === 'full_details' &&
    (grant.calendar === 'none' || grant.calendar === 'time_only')
  ) {
    return normaliseGrant({ calendar, pii: true, act: 'edit_existing' });
  }
  return normaliseGrant({ ...grant, calendar });
}

const CALENDAR_LABEL: Record<LinkCalendarVisibility, string> = {
  none: 'no access',
  time_only: 'time blocks only',
  full_details: 'full calendar detail',
};

const ACTION_LABEL: Record<LinkActionLevel, string> = {
  none: 'view only',
  edit_existing: 'edit existing bookings',
  create_edit_cancel: 'full booking management',
};

/** Plain-English bullet list of what a grant permits (neutral phrasing). */
export function describeGrant(grant: LinkGrant): string[] {
  const out: string[] = [];
  if (grant.calendar === 'none') return ['have no access to the calendar'];
  const scope = normaliseCalendarIds(grant.calendarIds);
  const scopeNote =
    scope && scope.length > 0
      ? `only for ${scope.length} selected calendar${scope.length === 1 ? '' : 's'}`
      : null;
  if (grant.calendar === 'time_only') {
    out.push('see the calendar as busy/free time blocks only');
    if (scopeNote) out.push(scopeNote);
    return out;
  }
  out.push('see the calendar in full detail');
  if (grant.pii) out.push('see client contact details');
  if (grant.act === 'edit_existing') out.push('edit existing bookings');
  if (grant.act === 'create_edit_cancel') out.push('create, edit and cancel bookings');
  if (scopeNote) out.push(scopeNote);
  return out;
}

/** One-line summary suitable for a list row. */
export function summariseGrant(grant: LinkGrant): string {
  if (grant.calendar === 'none') return 'No access';
  if (grant.calendar === 'time_only') return 'Time blocks only';
  const parts = ['Full calendar'];
  if (grant.pii) parts.push('client details');
  if (grant.act === 'edit_existing') parts.push('edit bookings');
  if (grant.act === 'create_edit_cancel') parts.push('full booking management');
  const scope = normaliseCalendarIds(grant.calendarIds);
  if (scope && scope.length > 0) parts.push(`${scope.length} calendars`);
  return parts.join(' · ');
}

/** Human-readable before→after delta between two grants (§17.5). */
export function diffGrant(before: LinkGrant, after: LinkGrant): string[] {
  const b = normaliseGrant(before);
  const a = normaliseGrant(after);
  const bullets: string[] = [];
  if (b.calendar !== a.calendar) {
    bullets.push(`Calendar visibility: ${CALENDAR_LABEL[b.calendar]} → ${CALENDAR_LABEL[a.calendar]}`);
  }
  const bothFull = b.calendar === 'full_details' && a.calendar === 'full_details';
  if (bothFull && b.pii !== a.pii) {
    bullets.push(`Client details: ${b.pii ? 'shared' : 'hidden'} → ${a.pii ? 'shared' : 'hidden'}`);
  }
  if (bothFull && b.act !== a.act) {
    bullets.push(`Booking actions: ${ACTION_LABEL[b.act]} → ${ACTION_LABEL[a.act]}`);
  }
  return bullets;
}

// ---------------------------------------------------------------------------
// Permission-change classifier (the EditPermissions immediate-vs-deferred logic)
// ---------------------------------------------------------------------------

/**
 * Which API path a proposed permission edit should take, mirroring the web
 * `EditPermissionsModal` exactly. "mine" = what my venue grants the other
 * (= link.theyCan); "theirs" = what I get from them (= link.iCan).
 *
 * - Only my grant changed, and it's a pure increase → `grant` (immediate).
 * - Only my grant changed, and it's a pure reduction → `reduce` (immediate).
 * - Their side changed, or my change mixes up/down → `propose` (negotiated).
 * - Nothing changed → `none`.
 */
export type GrantChangeAction = 'grant' | 'reduce' | 'propose' | 'none';

export interface GrantChangeClassification {
  mineChanged: boolean;
  theirsChanged: boolean;
  canApplyMineIncrease: boolean;
  canApplyMineReduction: boolean;
  needsNegotiation: boolean;
  action: GrantChangeAction;
  /** Button label matching the web: "Expand access now" / "Reduce access now" / "Propose change". */
  submitLabel: string;
}

export function classifyGrantChange(
  current: { iCan: LinkGrant; theyCan: LinkGrant },
  next: { iCan: LinkGrant; theyCan: LinkGrant },
): GrantChangeClassification {
  const currentMine = normaliseGrant(current.theyCan);
  const currentTheirs = normaliseGrant(current.iCan);
  const nextMine = normaliseGrant(next.theyCan);
  const nextTheirs = normaliseGrant(next.iCan);

  const mineChanged = !grantsEqual(currentMine, nextMine);
  const theirsChanged = !grantsEqual(currentTheirs, nextTheirs);
  const onlyMineChanged = mineChanged && !theirsChanged;
  const canApplyMineIncrease = onlyMineChanged && isIncreaseOnly(currentMine, nextMine);
  const canApplyMineReduction = onlyMineChanged && isReductionOnly(currentMine, nextMine);
  const needsNegotiation =
    theirsChanged || (mineChanged && !canApplyMineIncrease && !canApplyMineReduction);

  let action: GrantChangeAction;
  if (canApplyMineIncrease) action = 'grant';
  else if (canApplyMineReduction) action = 'reduce';
  else if (needsNegotiation) action = 'propose';
  else action = 'none';

  const submitLabel = canApplyMineIncrease
    ? 'Expand access now'
    : canApplyMineReduction
      ? 'Reduce access now'
      : 'Propose change';

  return {
    mineChanged,
    theirsChanged,
    canApplyMineIncrease,
    canApplyMineReduction,
    needsNegotiation,
    action,
    submitLabel,
  };
}
