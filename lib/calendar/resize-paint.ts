/**
 * Re-lay a bar's painted regions for a LIVE resize.
 *
 * The pieces, segments, free taps and buffer band a bar is painted with are
 * computed from the booking's stored length (`clusterPaintRegions`). While the
 * bottom edge is being dragged the wrapper is rendered at the held height, but
 * those regions still describe the old one, so the bar looked unchanged while
 * growing and, while shrinking, the box clipped the last lozenge flat instead
 * of the piece ending on its rounded corner.
 *
 * The rule is the one the drop will produce: the bottom edge moves, the last
 * busy stretch follows it (a piece that ends at the bar's end grows or shrinks
 * with it), nothing else moves, and whatever the new edge cuts through is
 * trimmed. The buffer band sits after the bar, so it rides the edge. Pure.
 */

export type PaintRegion = { top: number; height: number };

/** A piece is "at the end" when it reaches the old bottom edge (1px slack). */
const END_SLACK_PX = 1;

function clampRegion<T extends PaintRegion>(region: T, maxHeight: number): T | null {
  const height = Math.min(region.height, maxHeight - region.top);
  if (height <= 0) return null;
  return height === region.height ? region : { ...region, height };
}

/**
 * Pieces at the new height. Grows the trailing piece when it reached the old
 * bar end; trims (and drops) whatever the new end cuts.
 */
export function resizePaintPieces<T extends PaintRegion>(
  pieces: readonly T[] | undefined,
  fromHeight: number,
  toHeight: number,
): T[] | undefined {
  if (!pieces || pieces.length === 0 || toHeight === fromHeight) return pieces as T[] | undefined;
  const delta = toHeight - fromHeight;
  const out: T[] = [];
  pieces.forEach((piece, index) => {
    const isLast = index === pieces.length - 1;
    const reachesEnd = piece.top + piece.height >= fromHeight - END_SLACK_PX;
    const next = isLast && reachesEnd && delta > 0 ? { ...piece, height: piece.height + delta } : piece;
    const clamped = clampRegion(next, toHeight);
    if (clamped) out.push(clamped);
  });
  return out;
}

/** Segments and free taps: fixed regions, trimmed by the new end. */
export function trimPaintRegions<T extends PaintRegion>(
  regions: readonly T[] | undefined,
  toHeight: number,
): T[] | undefined {
  if (!regions || regions.length === 0) return regions as T[] | undefined;
  const out: T[] = [];
  for (const region of regions) {
    const clamped = clampRegion(region, toHeight);
    if (clamped) out.push(clamped);
  }
  return out;
}

/** The buffer band follows the bottom edge. */
export function shiftBufferBand<T extends PaintRegion>(
  band: T | null | undefined,
  fromHeight: number,
  toHeight: number,
): T | null | undefined {
  if (!band || toHeight === fromHeight) return band;
  return { ...band, top: band.top + (toHeight - fromHeight) };
}
