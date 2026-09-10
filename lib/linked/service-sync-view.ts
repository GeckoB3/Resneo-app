/**
 * Collective service sync, as the combined-page manager shows it (web #187
 * introduced sync; web #190 `CopySyncStatus`, `copiesOutOfStep`,
 * `linkedCopies` in `CombinedPageManager.tsx`; `Docs/collective-service-sync-plan.md`).
 *
 * A member venue's copy of an offering may follow the origin's scheduling
 * shape (duration, buffer, processing periods, options; add-ons matched on
 * link and update). Each copy row says where it stands in plain words and
 * offers the one sensible next step. Nothing is shown for the origin itself,
 * for a venue's own unrelated service, or on a database without the sync
 * columns (`sync` absent or `state: 'none'`).
 *
 * Pure: the builder renders what these return.
 */

import type {
  CatalogueActionPayload,
  CatalogueItemView,
  CatalogueProviderView,
} from '@/types/collectives';

export const SYNCED_FIELDS_COPY = 'duration, buffer, processing periods, options and add-ons';

function fmtDuration(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} hr` : `${h} hr ${r} min`;
}

/** One service per venue, active rows only, never the origin's own service. */
function copiesElsewhere(item: CatalogueItemView): CatalogueProviderView[] {
  const seen = new Set<string>();
  const out: CatalogueProviderView[] = [];
  for (const p of item.providers) {
    if (p.status === 'removed' || seen.has(p.sourceServiceId)) continue;
    if (item.originVenueId && p.venueId === item.originVenueId) continue;
    if (!p.sync || p.sync.state === 'none') continue;
    seen.add(p.sourceServiceId);
    out.push(p);
  }
  return out;
}

/**
 * The copies "Link all" would act on: every copy at another venue that is not
 * linked and in step (independent copies whether or not they match today,
 * customised copies, and linked copies whose origin has moved on).
 */
export function copiesOutOfStep(item: CatalogueItemView): CatalogueProviderView[] {
  return copiesElsewhere(item).filter((p) => !(p.sync!.state === 'linked' && p.sync!.inStep !== false));
}

/** Copies at other venues that follow their origin (linked, or customised and so once linked). */
export function linkedCopies(item: CatalogueItemView): CatalogueProviderView[] {
  return copiesElsewhere(item).filter((p) => p.sync!.state === 'linked' || p.sync!.state === 'customised');
}

export type SyncBadgeTone = 'ok' | 'warn' | 'muted';

export interface CopySyncStatusView {
  badge: { tone: SyncBadgeTone; text: string };
  /** The one next step; `quiet` for Unlink. */
  action: {
    label: string;
    confirmTitle: string;
    confirmText: string;
    quiet: boolean;
    payload: CatalogueActionPayload;
  };
}

/**
 * A copy's standing against its origin and the one thing to do about it. Null
 * for the origin's own service, an unrelated service, or without sync data.
 */
export function copySyncStatus(
  item: CatalogueItemView,
  provider: CatalogueProviderView,
  venueName: string,
): CopySyncStatusView | null {
  const sync = provider.sync;
  if (!sync || sync.state === 'none') return null;
  if (item.originVenueId && item.originVenueId === provider.venueId) return null;
  const origin = sync.originVenueName ?? item.originVenueName ?? 'the original';

  // What differs, as far as the row can tell: the length is on both providers,
  // so it can be named; anything else is one of the other synced fields.
  const originProvider = item.originVenueId
    ? (item.providers.find((p) => p.venueId === item.originVenueId && p.status !== 'removed') ?? null)
    : null;
  const here = provider.effectiveDurationMinutes;
  const there = originProvider?.effectiveDurationMinutes ?? null;
  const differenceNote =
    here != null && there != null && here !== there
      ? `${fmtDuration(here)} here, ${fmtDuration(there)} at ${origin}`
      : 'buffer, processing periods or options differ';

  const linkConfirm =
    `Link “${item.name}” at ${venueName} to ${origin}'s and update it now? Its ${SYNCED_FIELDS_COPY} ` +
    `will match ${origin}'s and follow it from now on. Price and description stay as they are.`;
  const unlink = {
    label: 'Unlink',
    confirmTitle: 'Unlink',
    confirmText:
      `Unlink “${item.name}” at ${venueName}? The copy keeps its current settings and no longer follows ${origin}.`,
    quiet: true,
    payload: { action: 'detach_provider', providerId: provider.id } as CatalogueActionPayload,
  };

  if (sync.state === 'independent') {
    const badge =
      sync.inStep === false
        ? { tone: 'warn' as const, text: `Not linked. Differs from ${origin}: ${differenceNote}` }
        : sync.inStep === true
          ? { tone: 'muted' as const, text: `Not linked. Same as ${origin} today` }
          : { tone: 'muted' as const, text: 'Not linked' };
    return {
      badge,
      action: {
        label: `Link to ${origin}`,
        confirmTitle: 'Link and update',
        confirmText: linkConfirm,
        quiet: false,
        payload: { action: 'link_provider', providerId: provider.id },
      },
    };
  }
  if (sync.state === 'customised') {
    return {
      badge: {
        tone: 'warn',
        text:
          sync.inStep === false
            ? `Edited at ${venueName}, no longer following. ${differenceNote[0]!.toUpperCase()}${differenceNote.slice(1)}`
            : `Edited at ${venueName}, no longer following`,
      },
      action: {
        label: `Relink to ${origin}`,
        confirmTitle: 'Relink and update',
        confirmText:
          `Relink “${item.name}” at ${venueName} to ${origin}'s? Its ${SYNCED_FIELDS_COPY} will be set back ` +
          `to ${origin}'s and follow it from now on. Price and description stay as they are.`,
        quiet: false,
        payload: { action: 'sync_provider', providerId: provider.id, forceSync: true },
      },
    };
  }
  // linked
  if (sync.inStep === false) {
    return {
      badge: { tone: 'warn', text: `Linked, behind ${origin}: ${differenceNote}` },
      action: {
        label: `Update from ${origin}`,
        confirmTitle: 'Update',
        confirmText:
          `Update “${item.name}” at ${venueName} from ${origin}'s now? Its ${SYNCED_FIELDS_COPY} will match ` +
          `${origin}'s. Price and description stay as they are.`,
        quiet: false,
        payload: { action: 'sync_provider', providerId: provider.id },
      },
    };
  }
  return { badge: { tone: 'ok', text: `Linked to ${origin}, in step` }, action: unlink };
}

/** The words for "Link all n copies" on one offering, or null when there is nothing to do. */
export function linkOfferingCopiesWords(item: CatalogueItemView): {
  label: string;
  confirmText: string;
  payload: CatalogueActionPayload;
} | null {
  const out = copiesOutOfStep(item);
  if (out.length === 0) return null;
  const origin = item.originVenueName ?? 'the original';
  const venues = [...new Set(out.map((p) => p.venueName))].join(', ');
  const one = out.length === 1;
  return {
    label: one ? 'Link 1 copy' : `Link all ${out.length} copies`,
    confirmText:
      `Link “${item.name}” at ${venues} to ${origin}'s and update ${one ? 'it' : 'them'} now? ` +
      `${one ? 'Its' : 'Their'} ${SYNCED_FIELDS_COPY} will match ${origin}'s and follow it from now on. ` +
      `Price and description stay as they are.`,
    payload: { action: 'sync_all_providers', itemId: item.id },
  };
}

/** The words for "Unlink all n copies" on one offering, or null when none is linked. */
export function unlinkOfferingCopiesWords(item: CatalogueItemView): {
  label: string;
  confirmText: string;
  payload: CatalogueActionPayload;
} | null {
  const linked = linkedCopies(item);
  if (linked.length === 0) return null;
  const venues = [...new Set(linked.map((p) => p.venueName))].join(', ');
  const one = linked.length === 1;
  return {
    label: one ? 'Unlink 1 copy' : `Unlink all ${linked.length} copies`,
    confirmText:
      `Unlink “${item.name}” at ${venues}? ${one ? 'The copy keeps its' : 'The copies keep their'} ` +
      `current settings and no longer ${one ? 'follows' : 'follow'} the original.`,
    payload: { action: 'unlink_all_providers', itemId: item.id },
  };
}

/** The same two actions across every offering on the page. */
export function pageWideSyncWords(items: readonly CatalogueItemView[]): {
  link: { label: string; confirmText: string; payload: CatalogueActionPayload } | null;
  unlink: { label: string; confirmText: string; payload: CatalogueActionPayload } | null;
} {
  const out = items.reduce((n, item) => n + copiesOutOfStep(item).length, 0);
  const linked = items.reduce((n, item) => n + linkedCopies(item).length, 0);
  return {
    link:
      out > 0
        ? {
            label: `Link all copies (${out})`,
            confirmText:
              `Link every copy at another venue that is not linked, or has fallen behind, to its original and ` +
              `update it now? ${out === 1 ? 'Its' : 'Their'} ${SYNCED_FIELDS_COPY} will match the original's ` +
              `and follow it from now on. Prices and descriptions stay as they are.`,
            payload: { action: 'sync_all_providers' },
          }
        : null,
    unlink:
      linked > 0
        ? {
            label: `Unlink all copies (${linked})`,
            confirmText:
              `Unlink every linked copy? ${linked === 1 ? 'It keeps its' : 'They keep their'} current settings ` +
              `and no longer ${linked === 1 ? 'follows' : 'follow'} the original.`,
            payload: { action: 'unlink_all_providers' },
          }
        : null,
  };
}

/**
 * Ticking a calendar whose venue already has the service: the tick reuses that
 * service as it is, so the host is asked whether to bring it into step now
 * (`ops[].sync` on the add). Null when there is nothing to ask.
 */
export function askToSyncOnAdd(
  item: CatalogueItemView,
  venueId: string,
  venueName: string,
  hasService: boolean,
): { text: string; confirmLabel: string } | null {
  if (!hasService || !item.originVenueId || item.originVenueId === venueId) return null;
  const origin = item.originVenueName ?? 'the original';
  return {
    text:
      `${venueName} already has a service called “${item.name}”. Link it to ${origin}'s? Its ${SYNCED_FIELDS_COPY} ` +
      `will be updated to match ${origin}'s now and follow it from then on. Price and description stay as they are.\n\n` +
      `Choose Link it to link it, or Cancel to add the calendar and leave the service as it is.`,
    confirmLabel: 'Link it',
  };
}
