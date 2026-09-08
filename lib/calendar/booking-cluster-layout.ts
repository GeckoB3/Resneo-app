/**
 * Horizontal layout for calendar bars that overlap in time on one column.
 * Ported from the web's `src/lib/calendar/booking-cluster-layout.ts` (#175,
 * #177, #184) so both diaries run the same arithmetic.
 *
 * Two mechanisms, in order of preference:
 *
 * 1. NESTING. A booking that starts inside another booking's processing gap
 *    (the client is under the colour and the chair is free) and keeps to that
 *    gap for as long as the host lasts is drawn INSIDE the host bar, taking the
 *    host's whole lane and sitting above it, so it covers the free band it was
 *    booked into and reads as an ordinary booking. It may run on past the
 *    host's end when the gap reaches the end too. Nesting chains (web #184): a
 *    bar nested in a gap can host a third bar in a gap of its own (a trim
 *    booked into the processing time of a cut that was itself booked into a
 *    colour's), so consecutive processing periods read as one line of bookings.
 *
 * 2. LANES. Anything that still overlaps is split into side-by-side lanes, the
 *    same interval-colouring the grid always did.
 *
 * Pure and shape-agnostic: the single-calendar grid, the multi-column grid and
 * the read-only linked column all call it with wall-clock minutes.
 */

export interface MinuteRange {
  start: number;
  end: number;
}

export interface ClusterLayoutItem extends MinuteRange {
  key: string;
  /**
   * Wall-clock minute ranges inside this item during which its column is free
   * (processing time). Another item that starts inside one of these, and stays
   * inside it until this item ends, can nest in this one. A range may run past
   * `end` (a wait after the service, web #185).
   */
  gaps?: MinuteRange[];
}

export interface BookingClusterLayout {
  laneIndex: number;
  laneCount: number;
  /** Key of the host this item is drawn inside, when it nests in a processing gap. */
  nestedInKey?: string;
  /**
   * How many hosts this item sits inside: 1 when nested directly in a lane's
   * bar, 2 when nested in a bar that is itself nested, and so on. Each level is
   * drawn above the one it rides in.
   */
  nestDepth?: number;
  /**
   * Wall-clock ranges of the items nested inside this one, when it hosts any,
   * including items nested deeper down the chain (they cover this bar too).
   * The host lays its text and buttons out around these.
   */
  nestedRanges?: MinuteRange[];
}

/**
 * Historical: nested bars were once indented by this much so a sliver of the
 * host showed on the left. They now take the full lane (web #184); the constant
 * remains only for anything still reading it.
 */
export const NESTED_BOOKING_INSET_PX = 5;

/**
 * Where a host bar keeps its text and its action buttons once nested bars
 * cover parts of it. All values are wall-clock minutes inside the host.
 */
export interface HostRegions {
  /** The text runs from here... */
  textStart: number;
  /** ...to here: the first nested band below the text, or the host's end. */
  textEnd: number;
  /** The action tray sits at the bottom of this span. */
  trayStart: number;
  trayEnd: number;
  /**
   * True when the tray had to move up into the text's span because a nested
   * bar covers the host's bottom edge. False when the tray keeps a free strip
   * of its own below the lowest nested bar.
   */
  traySharesText: boolean;
}

/**
 * Lays a host's text and tray out around the bars nested in it (and, since
 * web #185, around its own free bands: nothing about a booking is written on
 * time the practitioner is free for).
 *
 * The host's text keeps to the span above the first band (or below a band
 * that starts at the very top). The tray prefers the free strip under the
 * lowest band; when that strip is shorter than `minTraySpan` (or a band runs
 * to the host's end, as a tail processing gap does) it moves up into the
 * text's span instead.
 *
 * Returns null when nothing is nested, so callers can keep their plain layout.
 */
export function hostRegionsAroundNested(
  host: MinuteRange,
  nested: readonly MinuteRange[],
  minTraySpan: number,
): HostRegions | null {
  const bands = nested
    .map((r) => ({ start: Math.max(host.start, r.start), end: Math.min(host.end, r.end) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  if (bands.length === 0) return null;

  // Text starts below any band that begins at the host's top edge (bands there
  // are contiguous only if the next one starts where the last ended).
  let textStart = host.start;
  for (const band of bands) {
    if (band.start > textStart) break;
    textStart = Math.max(textStart, band.end);
  }
  const nextBand = bands.find((band) => band.start > textStart);
  const textEnd = nextBand ? nextBand.start : host.end;

  const lowest = bands.reduce((a, b) => (b.end > a.end ? b : a));
  const freeBelow = host.end - lowest.end;
  if (freeBelow >= minTraySpan) {
    return { textStart, textEnd, trayStart: lowest.end, trayEnd: host.end, traySharesText: false };
  }
  return { textStart, textEnd, trayStart: textStart, trayEnd: textEnd, traySharesText: true };
}

export function rangesOverlap(a: MinuteRange, b: MinuteRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Can `item` ride inside `host`? It must start inside one of the host's gaps
 * and stay inside that gap for as long as the host lasts. It may run on past
 * the host's end when the gap reaches the end too: a cut booked into the tail
 * of a colour's processing time is a proper nesting even though the cut
 * finishes after the colour does. It may not run into a part of the host where
 * the chair is busy again.
 */
function startsInGapAndStaysFree(host: ClusterLayoutItem, item: MinuteRange): boolean {
  const overlapEnd = Math.min(item.end, host.end);
  return (host.gaps ?? []).some(
    (gap) => gap.start <= item.start && item.start < gap.end && overlapEnd <= gap.end,
  );
}

/** The chain of hosts above an item, nearest first; empty for a lane's own bar. */
function hostChain(nestedIn: Map<string, string>, key: string): string[] {
  const chain: string[] = [];
  let cur = nestedIn.get(key);
  while (cur !== undefined && !chain.includes(cur)) {
    chain.push(cur);
    cur = nestedIn.get(cur);
  }
  return chain;
}

/**
 * Chooses, for every item, the host it nests in (if any).
 *
 * Longer items are considered as hosts first, so a booking prefers the longest
 * host it could ride in. A host may itself be nested, so chains form: a third
 * booking rides in the gap of the second, which rides in the gap of the first.
 * Items are placed in start order, so a bar is always settled before anything
 * that could nest in it is considered. Two items may share a host's gap only
 * if they do not overlap each other; an item that would overlap them tries the
 * next host and otherwise falls back to a lane.
 */
function assignNesting(items: ClusterLayoutItem[]): Map<string, string> {
  const nestedIn = new Map<string, string>();
  const hosted = new Map<string, MinuteRange[]>();
  const hostCandidates = [...items].sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const byStart = [...items].sort((a, b) => a.start - b.start || a.end - b.end);

  for (const item of byStart) {
    if (hosted.has(item.key)) continue;
    for (const host of hostCandidates) {
      if (host.key === item.key) continue;
      // Never nest in something that sits inside this item.
      if (hostChain(nestedIn, host.key).includes(item.key)) continue;
      if (!startsInGapAndStaysFree(host, item)) continue;
      const already = hosted.get(host.key) ?? [];
      if (already.some((r) => rangesOverlap(r, item))) continue;
      nestedIn.set(item.key, host.key);
      hosted.set(host.key, [...already, { start: item.start, end: item.end }]);
      break;
    }
  }
  return nestedIn;
}

/**
 * Lays out one column's items. Items are grouped into runs of transitive
 * overlap; within a run, nested items take the lane of the bar at the top of
 * their host chain and the rest are assigned lanes greedily by start time. A
 * lane stays taken until the last bar nested anywhere in its chain ends, which
 * is after the host itself when a nested bar runs out of a tail gap.
 */
export function layoutOverlapClusters(
  items: readonly ClusterLayoutItem[],
): Map<string, BookingClusterLayout> {
  const layouts = new Map<string, BookingClusterLayout>();
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);

  let run: ClusterLayoutItem[] = [];
  let runEnd = -Infinity;

  const flush = () => {
    if (run.length === 0) return;
    const nestedIn = assignNesting(run);
    // The lane's own bar is the top of each item's host chain.
    const laneOwnerOf = (key: string): string => {
      const chain = hostChain(nestedIn, key);
      return chain.length > 0 ? chain[chain.length - 1]! : key;
    };
    const laneReach = new Map<string, number>();
    for (const item of run) laneReach.set(item.key, item.end);
    for (const item of run) {
      if (!nestedIn.has(item.key)) continue;
      const owner = laneOwnerOf(item.key);
      laneReach.set(owner, Math.max(laneReach.get(owner) ?? item.end, item.end));
    }
    const laneEnds: number[] = [];
    const laneOf = new Map<string, number>();
    for (const item of run) {
      if (nestedIn.has(item.key)) continue;
      const reach = laneReach.get(item.key) ?? item.end;
      let laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= item.start);
      if (laneIndex === -1) {
        laneEnds.push(reach);
        laneIndex = laneEnds.length - 1;
      } else {
        laneEnds[laneIndex] = reach;
      }
      laneOf.set(item.key, laneIndex);
    }
    const laneCount = Math.max(1, laneEnds.length);
    // Every host up the chain is covered by the nested bar, so each gets the range.
    const rangesByHost = new Map<string, MinuteRange[]>();
    for (const item of run) {
      for (const hostKey of hostChain(nestedIn, item.key)) {
        const list = rangesByHost.get(hostKey) ?? [];
        list.push({ start: item.start, end: item.end });
        rangesByHost.set(hostKey, list);
      }
    }
    for (const item of run) {
      const hostKey = nestedIn.get(item.key);
      const nestedRanges = rangesByHost.get(item.key);
      if (hostKey !== undefined) {
        layouts.set(item.key, {
          laneIndex: laneOf.get(laneOwnerOf(item.key)) ?? 0,
          laneCount,
          nestedInKey: hostKey,
          nestDepth: hostChain(nestedIn, item.key).length,
          ...(nestedRanges ? { nestedRanges } : {}),
        });
      } else {
        layouts.set(item.key, {
          laneIndex: laneOf.get(item.key) ?? 0,
          laneCount,
          ...(nestedRanges ? { nestedRanges } : {}),
        });
      }
    }
    run = [];
    runEnd = -Infinity;
  };

  for (const item of sorted) {
    if (run.length > 0 && item.start >= runEnd) flush();
    run.push(item);
    runEnd = Math.max(runEnd, item.end);
  }
  flush();
  return layouts;
}
