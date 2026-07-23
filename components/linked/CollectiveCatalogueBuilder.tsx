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

  return (
    <View style={styles.root}>
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

function ItemCard({
  item,
  memberSources,
  busy,
  onAction,
}: {
  item: CatalogueItemView;
  memberSources: CatalogueMemberSource[];
  busy: boolean;
  onAction: (payload: CatalogueActionPayload, onDone?: () => void) => void;
}) {
  const [name, setName] = useState(item.name);

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
        Price, duration, description, photo, variants and add-ons all come from each venue&apos;s
        own service settings (Services). Here you only choose which calendars offer it.
      </Text>

      <CollapsibleCard
        title="Calendars offering this"
        summary={item.providers.length > 0 ? `${item.providers.length} assigned` : 'None yet'}>
        <CalendarAssignment
          item={item}
          memberSources={memberSources}
          busy={busy}
          onAction={onAction}
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
}: {
  item: CatalogueItemView;
  memberSources: CatalogueMemberSource[];
  busy: boolean;
  onAction: (payload: CatalogueActionPayload, onDone?: () => void) => void;
}) {
  /** Staged desired state per calendar id; absent = unchanged from the server. */
  const [staged, setStaged] = useState<Record<string, boolean>>({});

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
      const desired = staged[cal.id];
      if (desired === undefined) continue;
      const provider = providerByCalendar.get(cal.id) ?? null;
      const current = Boolean(provider);
      if (desired === current) continue;
      if (desired) {
        pendingOps.push({
          op: 'add',
          itemId: item.id,
          venueId: ms.venueId,
          practitionerId: cal.id,
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
              const checked = staged[cal.id] ?? Boolean(provider);
              return (
                <CalendarRow
                  key={cal.id}
                  item={item}
                  venueName={ms.venueName}
                  cal={cal}
                  provider={provider}
                  checked={checked}
                  busy={busy}
                  onToggle={() =>
                    setStaged((prev) => ({ ...prev, [cal.id]: !checked }))
                  }
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
  checked,
  busy,
  onToggle,
}: {
  item: CatalogueItemView;
  venueName: string;
  cal: { id: string; name: string; services: { id: string; name: string }[] };
  provider: CatalogueProviderView | null;
  /** Staged desired state (may differ from `provider` until saved). */
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const hasService = cal.services.some(
    (s) => s.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
  );
  const willDuplicate = checked && !provider && !hasService;

  return (
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
        ) : null}
      </View>
    </PressableScale>
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
