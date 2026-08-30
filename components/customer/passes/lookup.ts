/**
 * Venue and product names, resolved from the lookup arrays these routes return
 * alongside the rows.
 *
 * The rows carry ids only, so every section needs this. Falling back to a
 * neutral word rather than the id matters: a uuid on screen is worse than a
 * vague noun, because it looks like a fault rather than a gap.
 */
export function nameById(
  items: { id: string; name: string }[] | undefined,
  id: string | null | undefined,
  fallback = 'your venue',
): string {
  if (!id) return fallback;
  return items?.find((i) => i.id === id)?.name ?? fallback;
}
