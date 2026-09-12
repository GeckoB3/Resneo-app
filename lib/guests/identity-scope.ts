/**
 * The directory's identity scope, and what to say when it is the reason the
 * screen is empty.
 *
 * `GET /api/venue/guests` defaults its `filter` to `identified` — not `all` —
 * and reads that as `identifiability_tier = 'identified'`, which is "has an
 * email or phone". A guest booked in by name alone is tier `named` and simply
 * does not come back. The web dashboard defaults to the same scope ("Saved
 * contact details"), so this is the product's intent, not a bug.
 *
 * What it costs is discoverability: a walk-in booked by name is on the diary
 * and on their booking, yet searching Contacts for them answers "No contacts
 * found" with nothing to suggest a filter is in the way (device test,
 * 2026-09-12). When the scoped list comes back empty the screen asks the same
 * question again with scope `all`; if that finds people, this copy says how
 * many and offers one tap to show them.
 */

export interface IdentityScopeEmptyCopy {
  message: string;
  actionLabel: string;
}

/** The label of the default scope in `ContactFilterSheet`'s IDENTITY_OPTIONS. */
const DEFAULT_SCOPE_LABEL = 'With contact details';

export function hiddenByIdentityScopeCopy(args: {
  /** How many the `all` scope finds that the current one does not. */
  hiddenCount: number;
  /** The active search term, or null/empty when simply browsing. */
  search: string | null;
  /** Singular, lower case: "contact", "client", "patient" — venue terminology. */
  label: string;
}): IdentityScopeEmptyCopy | null {
  const count = Math.trunc(args.hiddenCount);
  if (count <= 0) return null;

  const one = count === 1;
  const noun = one ? args.label : `${args.label}s`;
  const term = args.search?.trim() ?? '';

  const finding = term
    ? `${count} ${noun} ${one ? 'matches' : 'match'} "${term}" but ${one ? 'has' : 'have'} no saved email or phone`
    : `${count} ${noun} ${one ? 'has' : 'have'} no saved email or phone`;

  return {
    message: `${finding}. The '${DEFAULT_SCOPE_LABEL}' filter is hiding them.`,
    actionLabel: 'Show them',
  };
}
