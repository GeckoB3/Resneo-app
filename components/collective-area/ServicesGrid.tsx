/**
 * The host's services across every venue: the app's version of the web grid
 * (`CollectiveServicesGrid.tsx`, 2026-09-17).
 *
 * A phone cannot show services down and venues across, so each service is a card with one line
 * per venue (how many of its calendars offer it, hidden, staged changes). Tapping a card opens the
 * service at every venue, with a switch per calendar. "Select" turns the cards into a checklist for
 * the bulk lane, which applies one action across the chosen services and venues. Everything stages
 * rather than saves, so the ask can say what will change, and a change the engine refuses stays
 * staged so Save sends only those again.
 *
 * `useServicesGrid` holds the state; the list renders inside the screen's scroll and the bar is
 * pinned under it by the screen.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { SyncBadge } from '@/components/collective-area/AreaPieces';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SearchBar } from '@/components/ui/SearchBar';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { areaCopy, PREVIEW_REASON_WORDS } from '@/lib/collective-area/copy';
import {
  bulkOps,
  calendarWillOffer,
  CELL_LABEL,
  cellState,
  confirmSummary,
  gridRows,
  hiddenPillVenue,
  isHiddenAt,
  isOnPage,
  selectionSummary,
  stagedCountFor,
  stageOps,
  toBulkOps,
  toggleCalendar,
  valueChips,
  venueWarnings,
  type AreaService,
  type BulkOpKind,
  type CellState,
  type CollectiveCalendarGroup,
  type GridFilter,
  type PreviewVenue,
  type StagedOp,
} from '@/lib/collective-area/model';
import { useCollectiveBulkPreview, useCollectiveBulkSave } from '@/lib/queries/useCollectiveArea';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const CELL_TONE: Record<CellState, BadgeTone> = { all: 'success', some: 'warning', none: 'neutral' };

export function useServicesGrid(input: {
  collectiveId: string;
  collectiveName: string;
  services: AreaService[];
  groups: CollectiveCalendarGroup[];
}) {
  const { collectiveId, services, groups } = input;
  const [filter, setFilter] = useState<GridFilter>('all');
  const [search, setSearch] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [selectedVenues, setSelectedVenues] = useState<Set<string>>(new Set());
  const [staged, setStaged] = useState<StagedOp[]>([]);
  const [failures, setFailures] = useState<string[]>([]);
  const [openServiceId, setOpenServiceId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<{ state: 'loading' | 'ready' | 'failed'; venues: PreviewVenue[] } | null>(
    null,
  );
  const save = useCollectiveBulkSave(collectiveId);
  const previewMutation = useCollectiveBulkPreview(collectiveId);

  const rows = useMemo(() => gridRows(services, groups, filter, search), [services, groups, filter, search]);

  const toggleSet = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const runBulk = (kind: BulkOpKind) => {
    const serviceIds = selectedServices.size > 0 ? [...selectedServices] : rows.map((r) => r.id);
    const venueIds = selectedVenues.size > 0 ? [...selectedVenues] : groups.map((g) => g.venue_id);
    setStaged((prev) => stageOps(prev, bulkOps(kind, serviceIds, venueIds, groups)));
  };

  const openPreview = () => {
    setPreview({ state: 'loading', venues: [] });
    previewMutation.mutate(toBulkOps(staged), {
      onSuccess: (venues) => setPreview({ state: 'ready', venues }),
      onError: () => setPreview({ state: 'failed', venues: [] }),
    });
  };

  const commit = () => {
    const sent = staged;
    setConfirming(false);
    setFailures([]);
    save.mutate(toBulkOps(sent), {
      onSuccess: (results) => {
        const failedKeys = new Set<string>();
        const messages: string[] = [];
        for (const result of results) {
          if (result.ok) continue;
          const op = sent[result.index];
          if (!op) continue;
          failedKeys.add(op.key);
          messages.push(result.message ?? 'That change did not go through.');
        }
        // What failed stays staged, so Save again re-sends only those.
        setStaged(sent.filter((op) => failedKeys.has(op.key)));
        setFailures(messages);
      },
    });
  };

  return {
    ...input,
    filter,
    setFilter,
    search,
    setSearch,
    selecting,
    setSelecting: (on: boolean) => {
      setSelecting(on);
      if (!on) {
        setSelectedServices(new Set());
        setSelectedVenues(new Set());
      }
    },
    selectedServices,
    toggleService: (id: string) => setSelectedServices((prev) => toggleSet(prev, id)),
    selectAllShown: () => setSelectedServices(new Set(rows.map((r) => r.id))),
    selectedVenues,
    toggleVenue: (id: string) => setSelectedVenues((prev) => toggleSet(prev, id)),
    staged,
    setStaged,
    discard: () => {
      setStaged([]);
      setFailures([]);
    },
    failures,
    rows,
    runBulk,
    openServiceId,
    setOpenServiceId,
    confirming,
    setConfirming,
    preview,
    setPreview,
    openPreview,
    commit,
    saving: save.isPending,
    showBar: selecting || staged.length > 0,
  };
}

export type ServicesGridState = ReturnType<typeof useServicesGrid>;

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export function ServicesGridList({ grid, currencySymbol }: { grid: ServicesGridState; currencySymbol: string }) {
  const { colors } = useTheme();
  const { groups } = grid;
  return (
    <View style={styles.list}>
      <Segmented<GridFilter>
        options={[
          { value: 'all', label: areaCopy('ov.filter.all') },
          { value: 'attention', label: areaCopy('ov.filter.attention') },
          { value: 'off_page', label: areaCopy('ov.filter.offPage') },
        ]}
        value={grid.filter}
        onChange={grid.setFilter}
        wrapLabels
      />
      <SearchBar
        value={grid.search}
        onChangeText={grid.setSearch}
        onClear={() => grid.setSearch('')}
        placeholder={areaCopy('ov.grid.search')}
      />
      <View style={styles.selectRow}>
        <Button
          label={grid.selecting ? 'Done selecting' : 'Select'}
          variant="secondary"
          size="sm"
          onPress={() => grid.setSelecting(!grid.selecting)}
        />
        {grid.selecting ? (
          <Button label="Select every service shown" variant="ghost" size="sm" onPress={grid.selectAllShown} />
        ) : null}
      </View>
      {grid.selecting ? (
        <View style={styles.venueChips}>
          <Text variant="caption" tone="secondary">
            Venues (none chosen means every venue)
          </Text>
          <View style={styles.chipWrap}>
            {groups.map((group) => (
              <Chip
                key={group.venue_id}
                label={group.is_host ? areaCopy('svc.cal.venueYou', { venue: group.venue_name }) : group.venue_name}
                selected={grid.selectedVenues.has(group.venue_id)}
                onPress={() => grid.toggleVenue(group.venue_id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {grid.failures.length > 0 ? (
        <View style={[styles.failures, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}>
          <Text variant="bodySmall" tone="danger">
            {grid.failures.length === 1
              ? areaCopy('ov.bulk.someFailedOne')
              : areaCopy('ov.bulk.someFailed', { count: grid.failures.length })}
          </Text>
          {[...new Set(grid.failures)].slice(0, 3).map((message) => (
            <Text key={message} variant="caption" tone="danger">
              {message}
            </Text>
          ))}
        </View>
      ) : null}

      {grid.rows.length === 0 ? (
        <Text variant="bodySmall" tone="secondary" style={styles.empty}>
          {areaCopy('ov.grid.empty')}
        </Text>
      ) : null}

      {grid.rows.map((service) => {
        const onPage = isOnPage(service);
        const selected = grid.selectedServices.has(service.id);
        const offerChange = grid.staged.find(
          (s) => s.service_id === service.id && (s.op === 'offer' || s.op === 'withdraw'),
        );
        return (
          <Pressable
            key={service.id}
            onPress={() => (grid.selecting ? grid.toggleService(service.id) : grid.setOpenServiceId(service.id))}
            accessibilityRole={grid.selecting ? 'checkbox' : 'button'}
            accessibilityState={grid.selecting ? { checked: selected } : undefined}
            accessibilityLabel={service.name}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Card
              style={[
                styles.serviceCard,
                selected ? { borderColor: colors.brand, borderWidth: 2 } : null,
              ]}
            >
              <View style={styles.serviceHead}>
                {grid.selecting ? (
                  <View
                    style={[
                      styles.checkbox,
                      { borderColor: selected ? colors.brand : colors.border },
                      selected ? { backgroundColor: colors.brand } : null,
                    ]}
                  >
                    {selected ? (
                      <Text variant="caption" color={colors.onColor}>
                        ✓
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                <Text variant="bodyMedium" style={styles.flex1}>
                  {service.name}
                </Text>
                {!onPage ? <Badge label={areaCopy('common.pill.parked')} /> : null}
                {!grid.selecting ? (
                  <Text variant="title" tone="muted">
                    ›
                  </Text>
                ) : null}
              </View>
              {offerChange ? (
                <Badge
                  label={offerChange.op === 'offer' ? `Not saved: ${areaCopy('ov.bulk.offer')}` : `Not saved: ${areaCopy('ov.bulk.withdraw')}`}
                  tone="brand"
                />
              ) : null}
              {onPage ? (
                groups.map((group) => {
                  const state = cellState(group, service.collective?.item_id);
                  const hidden = state !== 'none' && isHiddenAt(service, group.venue_id);
                  const changes = stagedCountFor(grid.staged, service.id, group.venue_id);
                  return (
                    <View key={group.venue_id} style={styles.cellLine}>
                      <Text variant="caption" tone="secondary" style={styles.flex1} numberOfLines={1}>
                        {group.is_host ? areaCopy('svc.cal.venueYou', { venue: group.venue_name }) : group.venue_name}
                      </Text>
                      <View style={styles.cellBadges}>
                        {changes > 0 ? (
                          <Badge label={areaCopy('ov.grid.cell.staged', { count: changes })} tone="brand" />
                        ) : (
                          <Badge label={CELL_LABEL[state]} tone={hidden ? 'warning' : CELL_TONE[state]} />
                        )}
                        {hidden && changes === 0 ? <Badge label={areaCopy('ov.grid.cell.hidden')} tone="warning" /> : null}
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text variant="caption" tone="muted">
                  {areaCopy('ov.grid.cell.offPage')}
                </Text>
              )}
            </Card>
          </Pressable>
        );
      })}

      <ServiceSheet grid={grid} currencySymbol={currencySymbol} />
      <ConfirmSaveSheet grid={grid} />
      <PreviewSheet grid={grid} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// The bar under the list
// ---------------------------------------------------------------------------

export function ServicesGridBar({ grid }: { grid: ServicesGridState }) {
  const { colors } = useTheme();
  if (!grid.showBar) return null;
  const serviceCount = grid.selectedServices.size || grid.rows.length;
  const venueCount = grid.selectedVenues.size || grid.groups.length;
  const anyFailure = grid.failures.length > 0 || grid.groups.some((g) => g.sync.failed.length > 0);
  const count = grid.staged.length;
  return (
    <View style={[styles.bar, { backgroundColor: colors.surfaceRaised, borderTopColor: colors.border }]}>
      {grid.selecting ? (
        <>
          <Text variant="label">{selectionSummary(serviceCount, venueCount)}</Text>
          <View style={styles.barGrid}>
            <Button label={areaCopy('ov.bulk.offer')} variant="secondary" size="sm" style={styles.barCell} onPress={() => grid.runBulk('offer')} />
            <Button label={areaCopy('ov.bulk.withdraw')} variant="secondary" size="sm" style={styles.barCell} onPress={() => grid.runBulk('withdraw')} />
            <Button label={areaCopy('ov.bulk.addCalendars')} variant="secondary" size="sm" style={styles.barCell} onPress={() => grid.runBulk('assign')} />
            <Button label={areaCopy('ov.bulk.removeCalendars')} variant="secondary" size="sm" style={styles.barCell} onPress={() => grid.runBulk('unassign')} />
            {anyFailure ? (
              <Button label={areaCopy('ov.bulk.retry')} variant="secondary" size="sm" style={styles.barCell} onPress={() => grid.runBulk('retry')} />
            ) : null}
          </View>
        </>
      ) : null}
      {count > 0 ? (
        <View style={styles.barGrid}>
          <Button label={areaCopy('ov.bulk.discard')} variant="ghost" size="sm" style={styles.barCell} disabled={grid.saving} onPress={grid.discard} />
          <Button
            label={areaCopy(count === 1 ? 'ov.bulk.saveOne' : 'ov.bulk.save', { count })}
            size="sm"
            style={styles.barCell}
            loading={grid.saving}
            onPress={() => grid.setConfirming(true)}
          />
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// One service at every venue
// ---------------------------------------------------------------------------

function ServiceSheet({ grid, currencySymbol }: { grid: ServicesGridState; currencySymbol: string }) {
  const { colors } = useTheme();
  const service = grid.services.find((s) => s.id === grid.openServiceId) ?? null;
  const close = () => grid.setOpenServiceId(null);
  if (!service) return <Sheet visible={false} onClose={close}>{null}</Sheet>;
  const onPage = isOnPage(service);
  const itemId = service.collective?.item_id ?? null;
  const offerChange = grid.staged.find((s) => s.service_id === service.id && (s.op === 'offer' || s.op === 'withdraw'));
  const willBeOnPage = offerChange ? offerChange.op === 'offer' : onPage;
  const hiddenVenue = service.collective?.status === 'hidden' ? hiddenPillVenue(service.collective.hidden_reasons) : null;

  return (
    <Sheet visible onClose={close} maxHeight="92%" fill>
      <View style={styles.sheetHeader}>
        <Text variant="subheading" style={styles.flex1}>
          {service.name}
        </Text>
        {service.collective && onPage ? (
          <SyncBadge
            status={service.collective.status}
            label={hiddenVenue ? areaCopy('svc.card.hiddenAt', { venue: hiddenVenue }) : null}
          />
        ) : null}
      </View>
      <ScrollView style={styles.flex1} contentContainerStyle={styles.sheetContent}>
        <Button
          label={willBeOnPage ? areaCopy('ov.bulk.withdraw') : areaCopy('ov.bulk.offer')}
          variant="secondary"
          fullWidth
          onPress={() =>
            grid.setStaged(
              stageOps(grid.staged, [{ op: willBeOnPage ? 'withdraw' : 'offer', service_id: service.id }]),
            )
          }
        />
        {offerChange ? (
          <Text variant="caption" tone="brand">
            Not saved yet. Save from the bar at the bottom of the page.
          </Text>
        ) : null}
        {!onPage ? (
          <Text variant="bodySmall" tone="secondary">
            {areaCopy('ov.grid.cell.offPage')}. Put it on the page and save, then choose its calendars here.
          </Text>
        ) : (
          <>
            <Text variant="label">{areaCopy('svc.cal.heading')}</Text>
            {grid.groups.map((group) => {
              const active = group.calendars.filter((c) => c.is_active);
              const warnings = venueWarnings(group, service.collective?.hidden_reasons ?? [], grid.collectiveName, service.collective?.item_id ?? null);
              return (
                <View key={group.venue_id} style={[styles.venueBlock, { borderColor: colors.border }]}>
                  <Text variant="label">
                    {group.is_host ? areaCopy('svc.cal.venueYou', { venue: group.venue_name }) : group.venue_name}
                  </Text>
                  {warnings.map((warning) => (
                    <Text key={warning} variant="caption" color={colors.warning}>
                      {warning}
                    </Text>
                  ))}
                  {active.length === 0 ? (
                    <Text variant="caption" tone="muted">
                      {areaCopy('svc.cal.noCalendars', { venue: group.venue_name })}
                    </Text>
                  ) : null}
                  {active.map((calendar) => {
                    const on = calendarWillOffer(grid.staged, service.id, group.venue_id, calendar, itemId);
                    const assignedNow = Boolean(itemId && calendar.assigned.some((a) => a.item_id === itemId));
                    const chips = valueChips(
                      calendar.assigned.find((a) => a.item_id === itemId),
                      currencySymbol,
                    );
                    return (
                      <View key={calendar.id} style={styles.calendarRow}>
                        <View style={styles.flex1}>
                          <Text variant="bodySmall">{calendar.name}</Text>
                          {on !== assignedNow ? (
                            <Text variant="caption" tone="brand">
                              {on ? 'Not saved yet' : 'Not saved yet: will stop offering'}
                            </Text>
                          ) : null}
                          {chips.length > 0 ? (
                            <Text variant="caption" tone="muted">
                              {chips.join(' · ')}
                            </Text>
                          ) : null}
                        </View>
                        <Switch
                          value={on}
                          accessibilityLabel={`${calendar.name} at ${group.venue_name}`}
                          onValueChange={(next) =>
                            grid.setStaged(toggleCalendar(grid.staged, service.id, group.venue_id, calendar, itemId, next))
                          }
                          trackColor={{ true: colors.brand, false: colors.border }}
                          thumbColor={colors.surfaceRaised}
                        />
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
      <View style={styles.sheetFooter}>
        <Button label={areaCopy('ov.grid.done')} fullWidth onPress={close} />
      </View>
    </Sheet>
  );
}

function ConfirmSaveSheet({ grid }: { grid: ServicesGridState }) {
  return (
    <Sheet visible={grid.confirming} onClose={() => grid.setConfirming(false)}>
      <View style={styles.confirmBody}>
        <Text variant="subheading">{areaCopy('ov.bulk.confirm.title')}</Text>
        <Text variant="bodySmall" tone="secondary">
          {grid.staged.length > 0 ? confirmSummary(grid.staged, grid.groups) : ''}
        </Text>
        <Button label={areaCopy('ov.bulk.confirm.confirm')} fullWidth onPress={grid.commit} />
        <Button
          label={areaCopy('ov.preview.button')}
          variant="secondary"
          fullWidth
          onPress={() => {
            grid.setConfirming(false);
            grid.openPreview();
          }}
        />
        <Button label="Go back" variant="ghost" fullWidth onPress={() => grid.setConfirming(false)} />
      </View>
    </Sheet>
  );
}

function PreviewSheet({ grid }: { grid: ServicesGridState }) {
  const { colors } = useTheme();
  const preview = grid.preview;
  const close = () => grid.setPreview(null);
  return (
    <Sheet visible={preview !== null} onClose={close} maxHeight="92%" fill>
      <View style={styles.sheetHeader}>
        <Text variant="subheading">{areaCopy('ov.preview.title')}</Text>
      </View>
      <ScrollView style={styles.flex1} contentContainerStyle={styles.sheetContent}>
        {preview?.state === 'loading' ? (
          <Text variant="bodySmall" tone="secondary">
            {areaCopy('ov.preview.loading')}
          </Text>
        ) : preview?.state === 'failed' ? (
          <Text variant="bodySmall" tone="danger">
            {areaCopy('ov.preview.failed')}
          </Text>
        ) : (
          (preview?.venues ?? []).map((venue) => (
            <View key={venue.venue_id} style={styles.previewVenue}>
              <Text variant="label">
                {venue.is_host ? areaCopy('svc.cal.venueYou', { venue: venue.venue_name }) : venue.venue_name}
              </Text>
              <Text variant="bodySmall" tone="secondary">
                {venue.shows.length > 0
                  ? areaCopy('ov.preview.shows', { services: venue.shows.map((s) => s.name).join(', ') })
                  : areaCopy('ov.preview.nothing', { venue: venue.venue_name })}
              </Text>
              {venue.hides.map((hidden) => (
                <Text key={hidden.service_id} variant="bodySmall" color={colors.warning}>
                  {`${hidden.name}: ${areaCopy('ov.preview.willHide', {
                    venue: venue.venue_name,
                    reason: PREVIEW_REASON_WORDS[hidden.reason] ?? hidden.reason,
                  })}`}
                </Text>
              ))}
            </View>
          ))
        )}
      </ScrollView>
      <View style={styles.sheetFooter}>
        <Button label={areaCopy('ov.grid.done')} fullWidth onPress={close} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  list: { gap: spacing.sm },
  selectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  venueChips: { gap: spacing.xs },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  failures: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing.md, gap: spacing.xxs },
  empty: { paddingVertical: spacing.lg, textAlign: 'center' },
  serviceCard: { gap: spacing.xs },
  serviceHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cellBadges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.xxs, flexShrink: 1 },
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  barGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  barCell: { flexGrow: 1, flexBasis: '45%' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  sheetContent: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  sheetFooter: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  venueBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, gap: spacing.xs },
  calendarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  confirmBody: { gap: spacing.md },
  previewVenue: { gap: spacing.xxs },
});
