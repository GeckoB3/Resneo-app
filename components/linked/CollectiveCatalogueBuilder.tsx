import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useCatalogueAction, useCollectiveCatalogue } from '@/lib/queries/useCollectives';
import {
  askToSyncOnAdd,
  copySyncStatus,
  linkOfferingCopiesWords,
  pageWideSyncWords,
  unlinkOfferingCopiesWords,
  type SyncBadgeTone,
} from '@/lib/linked/service-sync-view';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  CatalogueActionPayload,
  CatalogueBulkAddService,
  CatalogueItemView,
  CatalogueMemberSource,
  CatalogueProviderOp,
  CatalogueProviderView,
} from '@/types/collectives';

function fmtPrice(p: number | null): string {
  return p == null ? '—' : `£${(p / 100).toFixed(2)}`;
}
function fmtDuration(m: number | null): string {
  return m == null ? '—' : `${m} min`;
}

/**
 * Services & calendars tab (Flow 11). The host picks services from any member
 * venue, edits offering names inline, archives offerings, and assigns each
 * offering to member calendars (ticking a calendar whose venue lacks the service
 * duplicates it there). Copy ported verbatim from the web CombinedPageManager.
 */
export function CollectiveCatalogueBuilder({ collectiveId }: { collectiveId: string }) {
  const toast = useToast();
  const query = useCollectiveCatalogue(collectiveId);
  const catalogueAction = useCatalogueAction();

  const [newItemName, setNewItemName] = useState('');
  /**
   * One confirm sheet for the whole builder (link / unlink / update, and the
   * tick-time "link it?" question). Held here so it is never a second sheet
   * over another one; the builder itself is a screen, not a sheet.
   */
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const ask: AskConfirm = (request) => setConfirm(request);

  const runAction = (payload: CatalogueActionPayload, onDone?: () => void) => {
    catalogueAction.mutate(
      { collectiveId, payload },
      {
        onSuccess: () => onDone?.(),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Action failed.'),
      },
    );
  };

  const busy = catalogueAction.isPending;

  if (query.isLoading) {
    return <ListSkeleton rows={4} />;
  }

  if (query.isError) {
    return (
      <ErrorState
        message={
          query.error instanceof ApiError ? query.error.message : 'Failed to load the catalogue.'
        }
        onRetry={() => void query.refetch()}
      />
    );
  }

  const catalogue = query.data?.catalogue ?? null;
  if (!catalogue) {
    return <EmptyState title="No catalogue" message="The catalogue could not be loaded." />;
  }

  const activeItems = catalogue.items.filter((i) => i.status === 'active');
  const pageSync = pageWideSyncWords(activeItems);

  return (
    <View style={styles.root}>
      <ConfirmSheet
        visible={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel ?? 'Confirm'}
        destructive={false}
        loading={busy}
        onConfirm={() => {
          const req = confirm;
          setConfirm(null);
          req?.onConfirm();
        }}
        onClose={() => {
          const req = confirm;
          setConfirm(null);
          req?.onCancel?.();
        }}
      />
      <VenueServicesPicker
        memberSources={catalogue.memberSources}
        items={activeItems}
        busy={busy}
        onAddSelected={(services, onDone) =>
          runAction({ action: 'create_items', services }, onDone)
        }
      />

      <View style={styles.section}>
        <Text variant="label">Offerings on your combined page</Text>
        <Text variant="caption" tone="muted">
          Each offering lists the calendars that provide it. A calendar at another venue uses that
          venue’s own copy of the service. A copy that is linked to the original follows the
          original’s duration, buffer, processing periods and options whenever the original is
          saved, and its add-ons are matched whenever it is linked or updated; price and
          description are always the venue’s own.
        </Text>
        {pageSync.link || pageSync.unlink ? (
          <View style={styles.syncRow}>
            {pageSync.link ? (
              <Button
                label={pageSync.link.label}
                size="sm"
                variant="secondary"
                disabled={busy}
                onPress={() =>
                  ask({
                    title: 'Link and update',
                    message: pageSync.link!.confirmText,
                    confirmLabel: 'Link and update',
                    onConfirm: () => runAction(pageSync.link!.payload),
                  })
                }
              />
            ) : null}
            {pageSync.unlink ? (
              <Button
                label={pageSync.unlink.label}
                size="sm"
                variant="ghost"
                disabled={busy}
                onPress={() =>
                  ask({
                    title: 'Unlink',
                    message: pageSync.unlink!.confirmText,
                    confirmLabel: 'Unlink',
                    onConfirm: () => runAction(pageSync.unlink!.payload),
                  })
                }
              />
            ) : null}
          </View>
        ) : null}
        {activeItems.length === 0 ? (
          <Text variant="bodySmall" tone="muted">
            Nothing on the page yet. Add services from your venues above, or create a custom
            offering below.
          </Text>
        ) : (
          activeItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              memberSources={catalogue.memberSources}
              busy={busy}
              onAction={runAction}
              ask={ask}
            />
          ))
        )}

        <Card style={styles.customRow}>
          <Input
            label="Custom offering"
            value={newItemName}
            onChangeText={setNewItemName}
            placeholder="e.g. 60-min Deep Tissue Massage"
            editable={!busy}
          />
          <Button
            label="Add custom"
            variant="secondary"
            disabled={busy || newItemName.trim().length === 0}
            loading={busy && newItemName.trim().length > 0}
            onPress={() =>
              runAction({ action: 'create_item', name: newItemName.trim() }, () =>
                setNewItemName(''),
              )
            }
          />
        </Card>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Venue services picker — "choose what services to offer"
// ---------------------------------------------------------------------------

/** Composite key for a selectable member service (`venueId::serviceId`). */
function selectionKey(venueId: string, serviceId: string): string {
  return `${venueId}::${serviceId}`;
}

/**
 * Bulk service picker (web #105). Ticking services and pressing "Add selected"
 * creates every chosen offering in ONE `create_items` request, replacing the old
 * per-row "Add" (one request each, with a wait between). Same-named services
 * across venues merge into a single offering server-side.
 */
function VenueServicesPicker({
  memberSources,
  items,
  busy,
  onAddSelected,
}: {
  memberSources: CatalogueMemberSource[];
  items: CatalogueItemView[];
  busy: boolean;
  onAddSelected: (services: CatalogueBulkAddService[], onDone: () => void) => void;
}) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const onPageNames = new Set(
    items.filter((i) => i.status === 'active').map((i) => i.name.trim().toLowerCase()),
  );
  const anyServices = memberSources.some((m) => m.services.length > 0);

  /** Services not already on the page, per venue — the only selectable rows. */
  const selectableByVenue = memberSources.map((ms) => ({
    venueId: ms.venueId,
    venueName: ms.venueName,
    services: ms.services,
    selectable: ms.services.filter((s) => !onPageNames.has(s.name.trim().toLowerCase())),
  }));
  const allSelectable = selectableByVenue.flatMap((v) =>
    v.selectable.map((s) => selectionKey(v.venueId, s.id)),
  );
  const allSelected = allSelectable.length > 0 && allSelectable.every((k) => selected.has(k));

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setMany = (keys: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  };

  const submit = () => {
    const chosen: CatalogueBulkAddService[] = [];
    for (const v of selectableByVenue) {
      for (const s of v.selectable) {
        if (selected.has(selectionKey(v.venueId, s.id))) {
          chosen.push({ name: s.name, venueId: v.venueId, sourceServiceId: s.id });
        }
      }
    }
    if (chosen.length === 0) return;
    onAddSelected(chosen, () => setSelected(new Set()));
  };

  const selectedCount = selected.size;

  return (
    <Card style={styles.card}>
      <Text variant="label">Choose services to offer</Text>
      <Text variant="caption" tone="muted">
        Tick services from any venue and add them together. To offer one at more than one venue,
        open the offering below and tick that venue&apos;s calendars. The service is created there
        automatically if it doesn&apos;t have it yet.
      </Text>

      {!anyServices ? (
        <Text variant="bodySmall" tone="muted">
          No bookable services found in the member venues.
        </Text>
      ) : (
        <>
          {allSelectable.length > 0 ? (
            <Button
              label={allSelected ? 'Clear all' : 'Select all'}
              variant="ghost"
              size="sm"
              disabled={busy}
              onPress={() => setMany(allSelectable, !allSelected)}
            />
          ) : null}

          {selectableByVenue.map((v) => {
            const venueKeys = v.selectable.map((s) => selectionKey(v.venueId, s.id));
            const venueAllSelected =
              venueKeys.length > 0 && venueKeys.every((k) => selected.has(k));
            return (
              <View key={v.venueId} style={styles.venueGroup}>
                <View style={styles.venueGroupHeader}>
                  <Text variant="overline" tone="muted" style={styles.flex1}>
                    {v.venueName}
                  </Text>
                  {venueKeys.length > 0 ? (
                    <Button
                      label={venueAllSelected ? 'Clear' : 'Select all'}
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onPress={() => setMany(venueKeys, !venueAllSelected)}
                    />
                  ) : null}
                </View>
                {v.services.length === 0 ? (
                  <Text variant="caption" tone="muted">
                    No bookable services.
                  </Text>
                ) : (
                  <View>
                    {v.services.map((s, i) => {
                      const onPage = onPageNames.has(s.name.trim().toLowerCase());
                      const key = selectionKey(v.venueId, s.id);
                      const checked = selected.has(key);
                      const meta = [
                        s.durationMinutes != null ? `${s.durationMinutes} min` : null,
                        s.pricePence != null ? `£${(s.pricePence / 100).toFixed(2)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      const rowStyle = [
                        styles.serviceRow,
                        i > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: colors.border,
                        },
                      ];
                      if (onPage) {
                        return (
                          <View key={s.id} style={rowStyle}>
                            <View style={styles.flex1}>
                              <Text variant="bodyMedium" numberOfLines={1}>
                                {s.name}
                              </Text>
                              <Text variant="caption" tone="muted">
                                {meta}
                              </Text>
                            </View>
                            <Text variant="caption" tone="muted">
                              On page
                            </Text>
                          </View>
                        );
                      }
                      return (
                        <PressableScale
                          key={s.id}
                          onPress={() => toggle(key)}
                          disabled={busy}
                          accessibilityState={{ checked }}
                          accessibilityLabel={s.name}>
                          <View style={rowStyle}>
                            <CheckBox checked={checked} />
                            <View style={styles.flex1}>
                              <Text variant="bodyMedium" numberOfLines={1}>
                                {s.name}
                              </Text>
                              <Text variant="caption" tone="muted">
                                {meta}
                              </Text>
                            </View>
                          </View>
                        </PressableScale>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}

          {allSelectable.length > 0 ? (
            <Button
              label={
                selectedCount > 0 ? `Add selected (${selectedCount})` : 'Add selected'
              }
              disabled={busy || selectedCount === 0}
              loading={busy && selectedCount > 0}
              onPress={submit}
            />
          ) : null}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Offering card — inline name edit, archive, calendar assignment matrix
// ---------------------------------------------------------------------------

/** A yes/no question asked with the builder's one ConfirmSheet. */
type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel?: () => void;
};
type AskConfirm = (request: ConfirmRequest) => void;

function ItemCard({
  item,
  memberSources,
  busy,
  onAction,
  ask,
}: {
  item: CatalogueItemView;
  memberSources: CatalogueMemberSource[];
  busy: boolean;
  onAction: (payload: CatalogueActionPayload, onDone?: () => void) => void;
  ask: AskConfirm;
}) {
  const [name, setName] = useState(item.name);
  const linkAll = linkOfferingCopiesWords(item);
  const unlinkAll = unlinkOfferingCopiesWords(item);

  const commitName = () => {
    const v = name.trim();
    if (v.length >= 1 && v !== item.name) {
      onAction({ action: 'update_item', itemId: item.id, name: v });
    } else if (v.length === 0) {
      setName(item.name);
    }
  };

  return (
    <Card style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View style={styles.flex1}>
          <Input
            value={name}
            onChangeText={setName}
            onBlur={commitName}
            maxLength={160}
            editable={!busy}
            accessibilityLabel="Service name"
          />
          <Text variant="caption" tone="muted">
            {`${item.providers.length} calendar${item.providers.length === 1 ? '' : 's'} · customers see the “from” price`}
          </Text>
        </View>
        <Button
          label="Remove offering"
          variant="ghost"
          size="sm"
          disabled={busy}
          onPress={() => onAction({ action: 'archive_item', itemId: item.id })}
        />
      </View>

      <Text variant="caption" tone="muted">
        Price, description and photo come from each venue&apos;s own service settings (Services).
        To offer it at more than one venue, open the calendars below and tick that venue&apos;s
        calendars. If the venue does not have the service, an exact copy is created there and
        linked to the original; if it already has one with the same name, you are asked whether
        to link it.
      </Text>

      {linkAll || unlinkAll ? (
        <View style={styles.syncRow}>
          {linkAll ? (
            <Button
              label={linkAll.label}
              size="sm"
              variant="secondary"
              disabled={busy}
              onPress={() =>
                ask({
                  title: 'Link and update',
                  message: linkAll.confirmText,
                  confirmLabel: 'Link and update',
                  onConfirm: () => onAction(linkAll.payload),
                })
              }
            />
          ) : null}
          {unlinkAll ? (
            <Button
              label={unlinkAll.label}
              size="sm"
              variant="ghost"
              disabled={busy}
              onPress={() =>
                ask({
                  title: 'Unlink',
                  message: unlinkAll.confirmText,
                  confirmLabel: 'Unlink',
                  onConfirm: () => onAction(unlinkAll.payload),
                })
              }
            />
          ) : null}
        </View>
      ) : null}

      <CollapsibleCard
        title="Calendars offering this"
        summary={item.providers.length > 0 ? `${item.providers.length} assigned` : 'None yet'}>
        <Text variant="caption" tone="muted">
          Tick the calendars that offer it. Each row at another venue shows whether that venue&apos;s
          copy is linked to the original and up to date, with a button for the next step.
        </Text>
        <CalendarAssignment
          item={item}
          memberSources={memberSources}
          busy={busy}
          onAction={onAction}
          ask={ask}
        />
      </CollapsibleCard>
    </Card>
  );
}

/**
 * Calendar assignment (web #106). Toggles are staged locally so each tick is
 * instant, then committed together via one `set_providers` batch on "Save and
 * close". Previously every tick fired a full PATCH, and each of those can
 * duplicate a service into a member venue, notify it, and reload the whole
 * catalogue — giving a multi-second delay per tap.
 */
function CalendarAssignment({
  item,
  memberSources,
  busy,
  onAction,
  ask,
}: {
  item: CatalogueItemView;
  memberSources: CatalogueMemberSource[];
  busy: boolean;
  onAction: (payload: CatalogueActionPayload, onDone?: () => void) => void;
  ask: AskConfirm;
}) {
  /**
   * Staged desired state per calendar id; absent = unchanged from the server.
   * `sync` rides an add whose venue already has the service and whose host said
   * yes to bringing it into step (web #190, `ops[].sync`).
   */
  const [staged, setStaged] = useState<Record<string, { desired: boolean; sync: boolean }>>({});

  const providerByCalendar = new Map<string, CatalogueProviderView>();
  for (const p of item.providers) {
    if (p.status !== 'removed' && p.practitionerId) providerByCalendar.set(p.practitionerId, p);
  }
  const anyCalendars = memberSources.some((m) => m.practitioners.length > 0);

  if (!anyCalendars) {
    return (
      <Text variant="caption" tone="muted">
        No calendars available in the member venues.
      </Text>
    );
  }

  /** Only keep entries that actually differ from the server state. */
  const pendingOps: CatalogueProviderOp[] = [];
  for (const ms of memberSources) {
    for (const cal of ms.practitioners) {
      const entry = staged[cal.id];
      if (entry === undefined) continue;
      const desired = entry.desired;
      const provider = providerByCalendar.get(cal.id) ?? null;
      const current = Boolean(provider);
      if (desired === current) continue;
      if (desired) {
        pendingOps.push({
          op: 'add',
          itemId: item.id,
          venueId: ms.venueId,
          practitionerId: cal.id,
          ...(entry.sync ? { sync: true } : {}),
        });
      } else if (provider) {
        pendingOps.push({ op: 'remove', providerId: provider.id });
      }
    }
  }

  const commit = () => {
    if (pendingOps.length === 0) return;
    onAction({ action: 'set_providers', ops: pendingOps }, () => setStaged({}));
  };

  return (
    <View style={styles.assignBlock}>
      {memberSources.map((ms) => (
        <View key={ms.venueId} style={styles.assignVenue}>
          <Text variant="overline" tone="muted">
            {ms.venueName}
          </Text>
          {ms.practitioners.length === 0 ? (
            <Text variant="caption" tone="muted">
              No calendars.
            </Text>
          ) : (
            ms.practitioners.map((cal) => {
              const provider = providerByCalendar.get(cal.id) ?? null;
              const checked = staged[cal.id]?.desired ?? Boolean(provider);
              const hasService = cal.services.some(
                (s) => s.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
              );
              return (
                <CalendarRow
                  key={cal.id}
                  item={item}
                  venueName={ms.venueName}
                  cal={cal}
                  provider={provider}
                  hasService={hasService}
                  checked={checked}
                  busy={busy}
                  onAction={onAction}
                  ask={ask}
                  onToggle={() => {
                    const next = !checked;
                    setStaged((prev) => ({ ...prev, [cal.id]: { desired: next, sync: false } }));
                    // Ticking a calendar whose venue already has the service: the
                    // tick reuses that service as it is, so ask whether to bring it
                    // into step with the original now (web #190).
                    const question = next && !provider ? askToSyncOnAdd(item, ms.venueId, ms.venueName, hasService) : null;
                    if (question) {
                      ask({
                        title: 'Link it?',
                        message: question.text,
                        confirmLabel: question.confirmLabel,
                        onConfirm: () =>
                          setStaged((prev) => ({ ...prev, [cal.id]: { desired: true, sync: true } })),
                      });
                    }
                  }}
                />
              );
            })
          )}
        </View>
      ))}

      {pendingOps.length > 0 ? (
        <Button
          label={`Save and close (${pendingOps.length})`}
          disabled={busy}
          loading={busy}
          onPress={commit}
        />
      ) : null}
    </View>
  );
}

function CalendarRow({
  item,
  venueName,
  cal,
  provider,
  hasService,
  checked,
  busy,
  onToggle,
  onAction,
  ask,
}: {
  item: CatalogueItemView;
  venueName: string;
  cal: { id: string; name: string; services: { id: string; name: string }[] };
  provider: CatalogueProviderView | null;
  /** The venue already has a same-named service. */
  hasService: boolean;
  /** Staged desired state (may differ from `provider` until saved). */
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onAction: (payload: CatalogueActionPayload, onDone?: () => void) => void;
  ask: AskConfirm;
}) {
  const { colors } = useTheme();
  const willDuplicate = checked && !provider && !hasService;
  const willAsk = checked && !provider && hasService;
  // The copy's standing against the origin, and its one next step (web #190).
  const syncView = provider ? copySyncStatus(item, provider, venueName) : null;
  const badgeTone: Record<SyncBadgeTone, 'success' | 'warning' | 'neutral'> = {
    ok: 'success',
    warn: 'warning',
    muted: 'neutral',
  };

  return (
    <View>
    <PressableScale
      onPress={() => {
        if (!busy) onToggle();
      }}
      disabled={busy}
      accessibilityState={{ checked }}
      accessibilityLabel={cal.name}>
      <View style={[styles.calRow, { backgroundColor: colors.surface }]}>
        <View style={styles.calLeft}>
          <CheckBox checked={checked} />
          <Text variant="bodySmall" numberOfLines={1} style={styles.flex1}>
            {cal.name}
          </Text>
        </View>
        {checked && provider ? (
          <View style={styles.calMeta}>
            <Text variant="caption" tone="muted">
              {`${fmtPrice(provider.effectivePricePence)} · ${fmtDuration(provider.effectiveDurationMinutes)}`}
            </Text>
            {provider.status === 'suspended' ? (
              <Badge label="Suspended" tone="warning" />
            ) : null}
          </View>
        ) : willDuplicate ? (
          <Text variant="caption" color={colors.brand} numberOfLines={1} style={styles.dupHint}>
            {`adds “${item.name}” to ${venueName}`}
          </Text>
        ) : willAsk ? (
          <Text variant="caption" color={colors.brand} numberOfLines={1} style={styles.dupHint}>
            {`uses ${venueName}’s “${item.name}”`}
          </Text>
        ) : null}
      </View>
    </PressableScale>
    {checked && provider && syncView ? (
      <View style={styles.syncStatus}>
        <Badge label={syncView.badge.text} tone={badgeTone[syncView.badge.tone]} />
        <Button
          label={syncView.action.label}
          size="sm"
          variant={syncView.action.quiet ? 'ghost' : 'secondary'}
          disabled={busy}
          onPress={() =>
            ask({
              title: syncView.action.confirmTitle,
              message: syncView.action.confirmText,
              confirmLabel: syncView.action.confirmTitle,
              onConfirm: () => onAction(syncView.action.payload),
            })
          }
        />
      </View>
    ) : null}
    </View>
  );
}

/** A simple square checkbox glyph driven by `checked`. */
function CheckBox({ checked }: { checked: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.checkbox,
        {
          backgroundColor: checked ? colors.brand : 'transparent',
          borderColor: checked ? colors.brand : colors.borderStrong,
        },
      ]}>
      {checked ? (
        <Text variant="caption" color={colors.onBrand} style={styles.check}>
          ✓
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
  },
  card: {
    gap: spacing.sm,
  },
  section: {
    gap: spacing.md,
  },
  venueGroup: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  venueGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  customRow: {
    gap: spacing.md,
  },
  itemCard: {
    gap: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  assignBlock: {
    gap: spacing.md,
  },
  assignVenue: {
    gap: spacing.xs,
  },
  calRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 40,
  },
  calLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  calMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  dupHint: {
    flexShrink: 1,
    textAlign: 'right',
  },
  syncRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  syncStatus: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    lineHeight: 14,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
