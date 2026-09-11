/**
 * The single answer to "may this venue send this contact marketing?" (web
 * `src/lib/guests/marketing-permission.ts`, 2026-09-10).
 *
 * Two columns on `guests` carry the answer. `marketing_consent` is the
 * positive, dated opt-in (PECR/GDPR) and `marketing_opt_out` is the
 * withdrawal, set by the unsubscribe link, the customer portal and staff. A
 * contact has permission only when the opt-in is recorded AND no withdrawal
 * stands, so an old consent never outlives an unsubscribe.
 *
 * Use this everywhere a "subscribed" state is shown or decided; do not read
 * either column on its own.
 */
export interface MarketingPermissionRow {
  marketing_consent?: boolean | null;
  marketing_opt_out?: boolean | null;
}

export function hasMarketingPermission(row: MarketingPermissionRow): boolean {
  return Boolean(row.marketing_consent) && !row.marketing_opt_out;
}

/** Staff-facing reason a contact was skipped, for toasts and skip lists. */
export function marketingSkipReason(row: MarketingPermissionRow): string | null {
  if (row.marketing_opt_out) return 'Opted out of marketing';
  if (!row.marketing_consent) return 'No marketing permission on file';
  return null;
}

/** The one-line state under the two toggles (web `ContactMarketingSection`). */
export function marketingPermissionSummary(row: MarketingPermissionRow): string {
  return hasMarketingPermission(row) ? 'Receives marketing messages.' : 'Does not receive marketing messages.';
}

/**
 * The hint on a collapsed "Marketing preferences" card — the web's
 * `marketingHint` (`ContactDetailPanel.tsx` ~333-334): an opt-out wins, then a
 * recorded consent reads "Subscribed", and otherwise nothing is on file.
 */
export function marketingSummaryHint(row: MarketingPermissionRow): string {
  if (row.marketing_opt_out) return 'Opted out';
  if (row.marketing_consent) return 'Subscribed';
  return 'No consent';
}
