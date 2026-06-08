/**
 * Small colour utilities for tinting calendar blocks with arbitrary service /
 * practitioner hex colours while keeping text readable.
 */

/** Expand #RGB → #RRGGBB and strip a leading #. Returns null if unparseable. */
function normalizeHex(hex: string): string | null {
  let value = hex.trim().replace(/^#/, '');
  if (value.length === 3) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return null;
  }
  return value;
}

/** Convert a hex colour to an `rgba(...)` string at the given alpha (0–1). */
export function hexToRgba(hex: string, alpha: number): string {
  const value = normalizeHex(hex);
  if (!value) {
    // Fall back to a neutral slate tint so a bad colour never breaks layout.
    return `rgba(100, 116, 139, ${alpha})`;
  }
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
