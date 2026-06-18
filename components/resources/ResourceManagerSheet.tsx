import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import {
  ResourceEditorSheet,
  type ResourceEditorTarget,
} from '@/components/resources/ResourceEditorSheet';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useDeleteResource,
  useHostCalendars,
  useResourcesManageList,
  useUpdateResource,
} from '@/lib/queries/useResourcesManage';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { Resource, ResourceHoursRange } from '@/types/resources-manage';

/**
 * Open the manager straight into a sub-flow: a fresh "New resource" form, or the
 * editor for a specific resource (by id). Lets the resources page surface "New
 * resource" / per-resource "Edit" as one tap instead of opening the list first.
 */
export type ResourceManagerInitialAction =
  | { type: 'create' }
  | { type: 'edit'; resourceId: string };

type ResourceManagerSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** When set, the editor opens to this on the next time the sheet becomes visible. */
  initialAction?: ResourceManagerInitialAction | null;
  /** Book a slot on this resource — the parent closes the sheet and routes to the flow. */
  onBookResource?: (resourceId: string) => void;
};

/** Payment summary line, mirroring the web resource payment rule. */
function paymentSummary(resource: Resource): string {
  const req = resource.payment_requirement ?? 'none';
  if (req === 'full_payment') return 'Full payment online';
  if (req === 'deposit') {
    const amount = formatPence(resource.deposit_amount_pence ?? null);
    return amount ? `Deposit ${amount}` : 'Deposit online';
  }
  return 'No online payment';
}

/** Minimal shape the reorder mapping needs (kept generic so it's unit-testable). */
type Sortable = { id: string; sort_order?: number };

/**
 * Compute the dense `sort_order` PATCH set for moving `id` by `offset` (-1 up,
 * +1 down) within a list that is already in display order. Returns only the rows
 * whose index actually changes, each carrying its new dense index (0..n-1) — the
 * same minimal-write reorder pattern as `BookableCalendarsManager`. An out-of-range
 * move (first item up / last item down / unknown id) yields an empty patch list.
 *
 * Exported for unit testing the dense-reindex mapping.
 */
export function reorderResourceSortOrders<T extends Sortable>(
  ordered: T[],
  id: string,
  offset: -1 | 1,
): { id: string; sort_order: number }[] {
  const oldIndex = ordered.findIndex((r) => r.id === id);
  const newIndex = oldIndex + offset;
  if (oldIndex < 0 || newIndex < 0 || newIndex >= ordered.length) return [];
  const reordered = [...ordered];
  const [moved] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, moved!);
  // Persist every changed row's new index so sort_order stays a dense 0..n-1.
  const patches: { id: string; sort_order: number }[] = [];
  reordered.forEach((r, idx) => {
    if (r.sort_order !== idx) patches.push({ id: r.id, sort_order: idx });
  });
  return patches;
}

/** Mon-first weekday rows for the read-only detail (keys match `availability_hours`). */
const DETAIL_DAYS: { key: string; label: string }[] = [
  { key: '1', label: 'Mon' },
  { key: '2', label: 'Tue' },
  { key: '3', label: 'Wed' },
  { key: '4', label: 'Thu' },
  { key: '5', label: 'Fri' },
  { key: '6', label: 'Sat' },
  { key: '0', label: 'Sun' },
];

/** "09:00–17:00 +1" style summary of one day's ranges (first range shown, extras counted). */
function formatDayRanges(ranges: ResourceHoursRange[] | undefined): string {
  if (!ranges || ranges.length === 0) return 'Closed';
  const first = ranges[0]!;
  const base = `${first.start}–${first.end}`;
  return ranges.length > 1 ? `${base} +${ranges.length - 1}` : base;
}

/** Count date exceptions, split into closures vs amended-hours, for the detail caption. */
function summariseExceptions(
  exceptions: Resource['availability_exceptions'] | undefined,
): { total: number; closed: number; amended: number } {
  if (!exceptions) return { total: 0, closed: 0, amended: 0 };
  let closed = 0;
  let amended = 0;
  for (const value of Object.values(exceptions)) {
    if (!value) continue;
    if ('closed' in value) closed += 1;
    else if ('periods' in value && value.periods.length > 0) amended += 1;
  }
  return { total: closed + amended, closed, amended };
}

/** One label/value cell in the read-only detail stat grid. */
function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text variant="overline" tone="muted">
        {label}
      </Text>
      <Text variant="bodySmall">{value}</Text>
    </View>
  );
}

/**
 * Read-only detail surface for a resource card — mirrors the web resource
 * detail-panel StatTiles (booking rules) plus the full weekly-availability list
 * and a date-exceptions summary. Read-only: all editing stays in the editor
 * sheet; this just saves a round-trip when you only want to check the setup.
 * Uses data already present on the {@link Resource} record (no extra fetch).
 */
function ResourceDetail({ resource }: { resource: Resource }) {
  const { colors } = useTheme();
  const hours = resource.availability_hours ?? {};
  const exceptions = summariseExceptions(resource.availability_exceptions);
  const price = formatPence(resource.price_per_slot_pence ?? null);

  return (
    <View style={[styles.detail, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.statGrid}>
        <DetailStat label="Start step" value={`${resource.slot_interval_minutes} min`} />
        <DetailStat label="Shortest" value={`${resource.min_booking_minutes} min`} />
        <DetailStat label="Longest" value={`${resource.max_booking_minutes} min`} />
        <DetailStat label="Price/slot" value={price ?? 'Free'} />
        <DetailStat label="Book ahead" value={`${resource.max_advance_booking_days ?? 90} days`} />
        <DetailStat label="Min notice" value={`${resource.min_booking_notice_hours ?? 0} h`} />
        <DetailStat
          label="Cancellation"
          value={`${resource.cancellation_notice_hours ?? 0} h`}
        />
        <DetailStat
          label="Same-day"
          value={resource.allow_same_day_booking === false ? 'No' : 'Yes'}
        />
      </View>

      <View style={styles.detailSection}>
        <Text variant="overline" tone="muted">
          Weekly hours
        </Text>
        {DETAIL_DAYS.map((day) => {
          const open = (hours[day.key]?.length ?? 0) > 0;
          return (
            <View key={day.key} style={styles.hoursRow}>
              <Text variant="caption" tone="secondary" style={styles.hoursDay}>
                {day.label}
              </Text>
              <Text variant="caption" tone={open ? 'default' : 'muted'}>
                {formatDayRanges(hours[day.key])}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.detailSection}>
        <Text variant="overline" tone="muted">
          Date exceptions
        </Text>
        <Text variant="caption" tone="muted">
          {exceptions.total === 0
            ? 'None set.'
            : `${exceptions.total} date${exceptions.total > 1 ? 's' : ''}` +
              ` · ${exceptions.closed} closed · ${exceptions.amended} amended`}
        </Text>
      </View>
    </View>
  );
}

/**
 * In-app resource manager — opened from a header action on /resources. Lists
 * every bookable resource (court, room, bay…) with its slot grid, pricing and
 * host calendar, plus Edit, Delete and "New resource". Replaces the previous
 * "create or edit on the web dashboard" dead-end.
 */
export function ResourceManagerSheet({
  visible,
  onClose,
  initialAction = null,
  onBookResource,
}: ResourceManagerSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();

  const query = useResourcesManageList();
  const hostCalendarsQuery = useHostCalendars();
  const deleteResource = useDeleteResource();
  const updateResource = useUpdateResource();

  const [editorTarget, setEditorTarget] = useState<ResourceEditorTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null);
  // Resource with an in-flight reorder PATCH (disables its move buttons).
  const [busyId, setBusyId] = useState<string | null>(null);
  // Resource whose read-only detail (weekly hours + exceptions) is expanded.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const resources = useMemo(() => query.data ?? [], [query.data]);

  // Consume `initialAction` once per open: jump straight to the create form, or to
  // a specific resource's editor (waiting for the list to load to resolve the id).
  // The ref guard stops it re-opening the editor after the user closes it.
  const consumedActionRef = useRef<ResourceManagerInitialAction | null>(null);
  useEffect(() => {
    if (!visible) {
      consumedActionRef.current = null;
      return;
    }
    if (!initialAction || consumedActionRef.current === initialAction) return;
    if (initialAction.type === 'create') {
      consumedActionRef.current = initialAction;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open the editor in response to the sheet opening with an initialAction
      setEditorTarget({ mode: 'create' });
      return;
    }
    // edit: resolve the full record from the loaded list before opening.
    const match = resources.find((r) => r.id === initialAction.resourceId);
    if (match) {
      consumedActionRef.current = initialAction;
      setEditorTarget({ mode: 'edit', resource: match });
    }
  }, [visible, initialAction, resources]);
  const hostCalendars = useMemo(() => hostCalendarsQuery.data ?? [], [hostCalendarsQuery.data]);

  const hostNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of hostCalendars) map.set(c.id, c.name);
    return map;
  }, [hostCalendars]);

  const onMove = useCallback(
    async (id: string, offset: -1 | 1) => {
      const patches = reorderResourceSortOrders(resources, id, offset);
      if (patches.length === 0) return;
      setBusyId(id);
      try {
        // Persist each changed row's new dense index (mirrors BookableCalendarsManager).
        await Promise.all(patches.map((p) => updateResource.mutateAsync(p)));
        hapticSuccess();
      } catch (e) {
        hapticWarning();
        toast.error(e instanceof ApiError ? e.message : 'Could not save the resource order.');
        void query.refetch();
      } finally {
        setBusyId(null);
      }
    },
    [resources, updateResource, toast, query],
  );

  const onDelete = useCallback(() => {
    const resource = deleteTarget;
    if (!resource) return;
    deleteResource.mutate(resource.id, {
      onSuccess: () => {
        hapticSuccess();
        setDeleteTarget(null);
        toast.success(`"${resource.name}" deleted.`);
      },
      onError: (e) => {
        hapticWarning();
        setDeleteTarget(null);
        toast.error(
          e instanceof ApiError ? e.message : 'Could not delete the resource. Please try again.',
        );
      },
    });
  }, [deleteTarget, deleteResource, toast]);

  return (
    <>
      <Sheet visible={visible} onClose={onClose} maxHeight="92%" fill>
        <View style={styles.header}>
          <Text variant="subheading">Resources</Text>
          <IconButton
            icon={{ ios: 'xmark', android: 'close', web: 'close' }}
            accessibilityLabel="Close"
            tint={colors.textSecondary}
            onPress={onClose}
          />
        </View>

        {query.isLoading ? (
          <ListSkeleton />
        ) : query.isError ? (
          <View style={styles.stateWrap}>
            <ErrorState
              message={
                query.error instanceof ApiError ? query.error.message : 'Could not load resources.'
              }
              onRetry={() => void query.refetch()}
            />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
                tintColor={colors.brand}
              />
            }>
            <Button
              label="New resource"
              fullWidth
              onPress={() => setEditorTarget({ mode: 'create' })}
            />

            {resources.length === 0 ? (
              <EmptyState
                title="No resources yet"
                message="Create your first court, room, or piece of equipment to start taking resource bookings."
              />
            ) : (
              resources.map((resource, index) => {
                const hostName = resource.display_on_calendar_id
                  ? hostNameById.get(resource.display_on_calendar_id) ?? null
                  : null;
                const price = formatPence(resource.price_per_slot_pence ?? null);
                const isFirst = index === 0;
                const isLast = index === resources.length - 1;
                const canReorder = resources.length > 1;
                const rowBusy = busyId === resource.id;
                const expanded = expandedId === resource.id;
                return (
                  <Card key={resource.id} style={styles.resourceCard}>
                    <View style={styles.resourceHeader}>
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: resource.colour ?? colors.brand },
                        ]}
                      />
                      <View style={styles.resourceText}>
                        <Text variant="bodyMedium" numberOfLines={1}>
                          {resource.name}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {resource.resource_type ? `${resource.resource_type} · ` : ''}
                          {resource.slot_interval_minutes} min slots
                          {price ? ` · ${price}/slot` : ' · free'}
                        </Text>
                      </View>
                      {resource.is_active === false ? (
                        <Badge label="Inactive" tone="neutral" />
                      ) : null}
                      {canReorder ? (
                        <View style={styles.reorderCol}>
                          <IconButton
                            icon={{
                              ios: 'chevron.up',
                              android: 'keyboard_arrow_up',
                              web: 'keyboard_arrow_up',
                            }}
                            accessibilityLabel={`Move ${resource.name} up`}
                            variant="bordered"
                            iconSize={16}
                            size={32}
                            disabled={isFirst || rowBusy}
                            onPress={() => void onMove(resource.id, -1)}
                          />
                          <IconButton
                            icon={{
                              ios: 'chevron.down',
                              android: 'keyboard_arrow_down',
                              web: 'keyboard_arrow_down',
                            }}
                            accessibilityLabel={`Move ${resource.name} down`}
                            variant="bordered"
                            iconSize={16}
                            size={32}
                            disabled={isLast || rowBusy}
                            onPress={() => void onMove(resource.id, 1)}
                          />
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.metaGrid}>
                      {hostName ? (
                        <Text variant="caption" tone="secondary">
                          On {hostName}
                        </Text>
                      ) : (
                        <Text variant="caption" tone="danger">
                          No calendar
                        </Text>
                      )}
                      <Text variant="caption" tone="muted">
                        {paymentSummary(resource)}
                      </Text>
                    </View>

                    {/* Read-only detail (web StatTile panel parity): booking rules,
                        weekly hours rows, and a date-exceptions summary. */}
                    <Button
                      label={expanded ? 'Hide details' : 'Details'}
                      variant="ghost"
                      size="sm"
                      onPress={() => setExpandedId(expanded ? null : resource.id)}
                    />
                    {expanded ? (
                      <ResourceDetail resource={resource} />
                    ) : null}

                    {!resource.display_on_calendar_id ? (
                      // Web parity: a resource with no host column isn't visible on
                      // any calendar — offer the one-tap fix.
                      <Button
                        label="Set calendar"
                        variant="primary"
                        size="sm"
                        onPress={() => setEditorTarget({ mode: 'edit', resource })}
                      />
                    ) : resource.is_active !== false && onBookResource ? (
                      <Button
                        label="Book this resource"
                        variant="secondary"
                        size="sm"
                        onPress={() => onBookResource(resource.id)}
                      />
                    ) : null}

                    <View style={styles.actionsRow}>
                      <Button
                        label="Edit"
                        variant="secondary"
                        size="sm"
                        style={styles.flex1}
                        onPress={() => setEditorTarget({ mode: 'edit', resource })}
                      />
                      <Button
                        label="Delete"
                        variant="ghost"
                        size="sm"
                        style={styles.flex1}
                        onPress={() => setDeleteTarget(resource)}
                      />
                    </View>
                  </Card>
                );
              })
            )}
            <View style={styles.spacer} />
          </ScrollView>
        )}
      </Sheet>

      {/* Create / edit a resource */}
      <ResourceEditorSheet
        target={editorTarget}
        hostCalendars={hostCalendars}
        onClose={() => setEditorTarget(null)}
      />

      {/* Delete confirm — a Sheet, since Alert.alert's confirm is a no-op on web. */}
      <Sheet visible={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <View style={styles.deleteSheet}>
          <Text variant="subheading">Delete resource</Text>
          <Text variant="bodySmall" tone="secondary">
            Delete &quot;{deleteTarget?.name}&quot;? This cannot be undone, and will be blocked if
            upcoming bookings exist.
          </Text>
          <View style={styles.actionsRow}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              onPress={() => setDeleteTarget(null)}
            />
            <Button
              label="Delete"
              variant="danger"
              style={styles.flex1}
              loading={deleteResource.isPending}
              onPress={onDelete}
            />
          </View>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  resourceCard: {
    gap: spacing.sm,
  },
  resourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  resourceText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  reorderCol: {
    gap: spacing.xs,
  },
  detail: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
  },
  statCell: {
    width: '50%',
    gap: 1,
  },
  detailSection: {
    gap: spacing.xs,
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hoursDay: {
    width: 40,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  spacer: {
    height: spacing.xl,
  },
  deleteSheet: {
    gap: spacing.md,
  },
});
