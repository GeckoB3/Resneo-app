/**
 * How a venue found by search reads (web `venueWhereLine` and `VenueSearchField`, 2026-10-29).
 *
 *   "Holywood · /book/aura-2"   its town, when its Profile gives one, and its booking page address,
 *                               so two venues of one name read apart (CQ-07, R1-12)
 *   not found                   by how the search read the input (CQ-09): a pasted address finds exact
 *                               matches only, so it says the address found nothing; a name, or an older
 *                               server that does not say, keeps the name line
 */
import { setupCopy } from '@/lib/linked/setup-copy';

function tidy(value: string | null | undefined): string | null {
  const t = (value ?? '').trim();
  return t.length > 0 ? t : null;
}

/** "{town} · /book/{slug}", either part alone when the other is missing, or null. */
export function venueWhereLine(v: { town?: string | null; slug?: string | null }): string | null {
  const town = tidy(v.town);
  const slug = tidy(v.slug);
  const parts = [town, slug ? `/book/${slug}` : null].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** The line when a search finds nothing. */
export function venueNotFoundLine(queryKind: 'address' | 'name' | null | undefined): string {
  return setupCopy(queryKind === 'address' ? 'setup.venue.notFoundAddress' : 'setup.venue.notFound');
}
