/**
 * "Every venue's services": the host's view of each venue's own services, on the collective page
 * or not, to curate in a few taps (owner, 2026-10-27; web `VenueServicesPanel.tsx`).
 *
 * Pick a venue (or every venue) from the chips, filter and search, tick one, many or all shown, and
 * put them on the page or take them off from the bar pinned under the list. Nobody is asked: a
 * member's service goes on as it is and keeps its calendars. A service that matches one already on
 * the page joins it, unless the host ticks "Add them as separate services instead". Ticked
 * suggestions can be left off with "Not now".
 *
 * Laid out as the services grid is (`ServicesGrid.tsx`): `useVenueServicesPanel` holds the state,
 * the list renders inside the screen's scroll, and the screen pins the bar under it.
 *
 * A save can be undone for 60 seconds (web CQ-11): what went on comes off, and what came off goes
 * back on, joining by name. A member's service that joined a page service goes back with the host's
 * price and length (its own were not kept, R3-09), and the Undo says so. A service that did not
 * change is listed as "{service} at {venue}: {reason}" (CQ-04).
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { ErrorState } from '@/components/ui/ErrorState';
import { SearchBar } from '@/components/ui/SearchBar';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { areaCopy, formatVenueList } from '@/lib/collective-area/copy';
import { UNDO_WINDOW_MS } from '@/lib/collective-area/model';
import {
  curateFailureRows,
  curateOutcome,
  curateSelection,
  curateTitle,
  declinedText,
  declineTitle,
  isSuggested,
  joiningList,
  joinsLine,
  onPageAsLine,
  venueCounts,
  venueLabel,
  venueServiceFacts,
  venueServiceKey,
  venueServiceRows,
  type CurateAction,
  type CurateItem,
  type CurateResult,
  type VenueServicesFilter,
} from '@/lib/collective-area/venue-services';
import { useCurateServices, useDeclineSuggestions, useVenueServices } from '@/lib/queries/useCollectiveCurate';
import { refusalText } from '@/lib/queries/useCollectiveServiceTools';
import { hapticSelect } from '@/lib/haptics';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** `rows`: one line per service that did not change, or what an Undo could not put back as it was. */
type Note = { tone: 'ok' | 'error'; text: string; rows?: string[] };

/** A service a save changed, named as it was then, for its Undo. */
type UndoItem = CurateItem & { name: string; venueName: string };

/** The last save, while it can be undone (CQ-11): the opposite action, for these services. */
export interface LastCurate {
  action: CurateAction;
  items: UndoItem[];
  /** Services that joined a page service: undoing them keeps the host's price and length. */
  joined: UndoItem[];
  expiresAt: number;
}

/**
 * What undoes a save (web `VenueServicesPanel`, CQ-11): on comes off, off goes back on. "Already"
 * and "not on the page" changed nothing, so there is nothing to undo for them. Null when nothing can.
 */
export function curateUndo(
  action: CurateAction,
  results: readonly CurateResult[],
  named: (result: CurateResult) => { name: string; venueName: string },
  now: number,
): LastCurate | null {
  const undoable = results.filter(
    (r) =>
      r.ok &&
      (action === 'add' ? r.status === 'added' || r.status === 'matched' : r.status === 'withdrawn' || r.status === 'released'),
  );
  if (undoable.length === 0) return null;
  const items = undoable.map((r) => ({ venue_id: r.venue_id, service_id: r.service_id, ...named(r) }));
  return {
    action: action === 'add' ? 'remove' : 'add',
    items,
    joined: action === 'add' ? items.filter((_item, i) => undoable[i]!.status === 'matched') : [],
    expiresAt: now + UNDO_WINDOW_MS,
  };
}

/** "All venues" is the web's own words for the first chip (not in the copy table). */
const ALL_VENUES = 'All venues';

export function useVenueServicesPanel(input: {
  collectiveId: string;
  collectiveName: string;
  /** Only the host reads every venue's services. */
  enabled: boolean;
  /** Opened on this venue and filter (a bell's link names them). */
  initialVenueId?: string | null;
  initialFilter?: VenueServicesFilter | null;
}) {
  const { collectiveId, collectiveName } = input;
  const query = useVenueServices(collectiveId, input.enabled);
  const curate = useCurateServices(collectiveId);
  const decline = useDeclineSuggestions();
  const [venueChoice, setVenue] = useState<string>(input.initialVenueId ?? 'all');
  const [filter, setFilter] = useState<VenueServicesFilter>(input.initialFilter ?? 'all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState<Note | null>(null);
  const [confirming, setConfirming] = useState<CurateAction | null>(null);
  const [separate, setSeparate] = useState(false);
  const [askingDecline, setAskingDecline] = useState(false);
  const [lastCurate, setLastCurate] = useState<LastCurate | null>(null);

  // The Undo goes once its minute is up.
  useEffect(() => {
    if (!lastCurate) return;
    const timer = setTimeout(() => setLastCurate(null), Math.max(0, lastCurate.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [lastCurate]);

  /** undefined while loading; null when the server has no such route (before 2026-10-27). */
  const data = query.data;
  const groups = useMemo(() => (data?.role === 'host' ? data.venues : []), [data]);
  // A venue named by a link that is not in the collective falls back to every venue. Worked out
  // here rather than reset in an effect, so the first paint is already right.
  const venue = venueChoice !== 'all' && data && !groups.some((g) => g.venue_id === venueChoice) ? 'all' : venueChoice;
  const counts = useMemo(() => venueCounts(groups), [groups]);
  const suggestedTotal = useMemo(() => [...counts.values()].reduce((n, c) => n + c.suggested, 0), [counts]);
  const rows = useMemo(() => venueServiceRows(groups, venue, filter, search), [groups, venue, filter, search]);
  const selection = useMemo(() => curateSelection(groups, selected), [groups, selected]);
  const allShownSelected =
    rows.length > 0 && rows.every((r) => selected.has(venueServiceKey(r.group.venue_id, r.service.id)));
  const busy = curate.isPending || decline.isPending;

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAllShown = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        const key = venueServiceKey(r.group.venue_id, r.service.id);
        if (allShownSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });

  const save = (action: CurateAction) => {
    const list = action === 'add' ? selection.toAdd : selection.toRemove;
    if (list.length === 0) return;
    setNote(null);
    // The last save only: a new one replaces the Undo of the one before.
    setLastCurate(null);
    const names = new Map(list.map((c) => [venueServiceKey(c.group.venue_id, c.service.id), c.service.name]));
    const venues = new Map(list.map((c) => [venueServiceKey(c.group.venue_id, c.service.id), c.group.venue_name]));
    const nameOf = (r: CurateResult) => names.get(venueServiceKey(r.venue_id, r.service_id)) ?? 'A service';
    const venueOf = (r: CurateResult) => venues.get(venueServiceKey(r.venue_id, r.service_id)) ?? 'a venue';
    curate.mutate(
      {
        action,
        mode: separate ? 'separate' : 'match',
        items: list.map((c) => ({ venue_id: c.group.venue_id, service_id: c.service.id })),
      },
      {
        onSuccess: ({ results }) => {
          const outcome = curateOutcome(action, results, nameOf, collectiveName, venueOf);
          setNote({ tone: outcome.tone, text: outcome.text, rows: outcome.rows });
          setLastCurate(curateUndo(action, results, (r) => ({ name: nameOf(r), venueName: venueOf(r) }), Date.now()));
          // A service that did not change stays ticked, so trying again is one tap.
          setSelected(new Set(outcome.failedKeys));
        },
        onError: () => setNote({ tone: 'error', text: 'Could not save. Please check your connection and try again.' }),
        onSettled: () => {
          setConfirming(null);
          setSeparate(false);
        },
      },
    );
  };

  /** Undo (CQ-11): the opposite of the last save, with no question; a member's join keeps the host's price. */
  const undoLast = () => {
    const last = lastCurate;
    if (!last) return;
    setLastCurate(null);
    setNote(null);
    const named = (r: CurateResult) =>
      last.items.find((i) => i.venue_id === r.venue_id && i.service_id === r.service_id) ?? {
        name: 'A service',
        venueName: 'a venue',
      };
    curate.mutate(
      { action: last.action, mode: 'match', items: last.items.map(({ venue_id, service_id }) => ({ venue_id, service_id })) },
      {
        onSuccess: ({ results }) => {
          const failed = results.filter((r) => !r.ok);
          if (failed.length > 0) {
            setNote({
              tone: 'error',
              text:
                failed.length === 1
                  ? areaCopy('ov.bulk.undoFailedOne')
                  : areaCopy('ov.bulk.undoFailed', { count: failed.length }),
              rows: curateFailureRows(failed, (r) => named(r).name, (r) => named(r).venueName),
            });
          } else {
            const host = groups.find((g) => g.is_host)?.venue_name ?? 'the host';
            setNote({
              tone: 'ok',
              text: areaCopy('vs.undone'),
              rows:
                last.joined.length > 0
                  ? [
                      areaCopy('vs.undoJoined', {
                        services: formatVenueList(
                          last.joined.map((j) => j.name),
                          3,
                        ),
                        venueList: formatVenueList([...new Set(last.joined.map((j) => j.venueName))]),
                        host,
                      }),
                    ]
                  : undefined,
            });
          }
          setSelected(new Set());
        },
        onError: () => setNote({ tone: 'error', text: areaCopy('ov.venue.retryError') }),
      },
    );
  };

  const confirmDecline = () => {
    const list = selection.toDecline;
    if (list.length === 0) return;
    setNote(null);
    decline.mutate(
      { collectiveId, serviceIds: list.map((c) => c.service.id) },
      {
        onSuccess: () => {
          setAskingDecline(false);
          setSelected(new Set());
          setNote({
            tone: 'ok',
            text: declinedText(list.map((c) => ({ service: c.service.name, venue: c.group.venue_name }))),
          });
        },
        onError: (error) => {
          setAskingDecline(false);
          setNote({
            tone: 'error',
            text: refusalText(
              error,
              'Could not answer the suggestions. Please try again.',
              'Could not answer the suggestions. Please check your connection.',
            ),
          });
        },
      },
    );
  };

  return {
    collectiveName,
    query,
    data,
    /** The route is there: the host can curate from every venue's services. */
    supported: data != null,
    /** Known to be missing (a server before 2026-10-27). */
    unsupported: data === null,
    groups,
    counts,
    suggestedTotal,
    venue,
    setVenue,
    filter,
    setFilter,
    search,
    setSearch,
    rows,
    selected,
    selection,
    allShownSelected,
    toggle,
    toggleAllShown,
    clear: () => {
      setSelected(new Set());
      setNote(null);
    },
    note,
    /** The last save, while its Undo lasts (60 seconds). */
    lastCurate,
    undoLast,
    confirming,
    setConfirming,
    separate,
    setSeparate,
    save,
    askingDecline,
    setAskingDecline,
    confirmDecline,
    saving: curate.isPending,
    declining: decline.isPending,
    busy,
    /** Opens the list on every suggestion still waiting (the suggestions card's "Review"). */
    reviewSuggestions: () => {
      setVenue('all');
      setFilter('suggested');
      setSearch('');
    },
    showBar: selection.chosen.length > 0 || note !== null || lastCurate !== null,
  };
}

export type VenueServicesPanelState = ReturnType<typeof useVenueServicesPanel>;

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export function VenueServicesList({
  panel,
  currencySymbol,
}: {
  panel: VenueServicesPanelState;
  currencySymbol: string;
}) {
  const { colors } = useTheme();
  if (panel.query.isLoading) return <ListSkeleton rows={4} />;
  if (panel.query.isError) {
    return (
      <ErrorState
        message={refusalText(
          panel.query.error,
          'Could not load the services. Please try again.',
          'Could not load the services. Please check your connection.',
        )}
        onRetry={() => void panel.query.refetch()}
      />
    );
  }
  if (!panel.data) return null;

  const shownVenue = panel.venue === 'all' ? null : (panel.groups.find((g) => g.venue_id === panel.venue) ?? null);
  const chips = [
    { id: 'all', label: ALL_VENUES, sub: null as string | null, suggested: panel.suggestedTotal },
    ...panel.groups.map((g) => {
      const c = panel.counts.get(g.venue_id) ?? { on: 0, total: 0, suggested: 0 };
      return {
        id: g.venue_id,
        label: venueLabel(g),
        sub: areaCopy('vs.venueCount', { on: c.on, total: c.total }),
        suggested: c.suggested,
      };
    }),
  ];

  return (
    <View style={styles.list}>
      <Text variant="bodySmall" tone="secondary">
        {areaCopy('vs.intro', { collective: panel.collectiveName })}
      </Text>

      {/* Venues side by side, scrolling sideways on a phone, as the web's row of venue tabs. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.venueChips}
        accessibilityRole="tablist"
        accessibilityLabel="Venue">
        {chips.map((chip) => {
          const active = panel.venue === chip.id;
          return (
            <Pressable
              key={chip.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={[chip.label, chip.sub, chip.suggested > 0 ? `${chip.suggested} suggested` : null]
                .filter(Boolean)
                .join(', ')}
              onPress={() => {
                hapticSelect();
                panel.setVenue(chip.id);
              }}
              style={({ pressed }) => [
                styles.venueChip,
                {
                  borderColor: active ? colors.brand : colors.border,
                  backgroundColor: active ? colors.brandSubtle : colors.surface,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <View style={styles.venueChipHead}>
                <Text variant="label" color={active ? colors.brand : colors.text}>
                  {chip.label}
                </Text>
                {chip.suggested > 0 ? (
                  <View style={[styles.countPill, { backgroundColor: colors.warningSurface }]}>
                    <Text variant="caption" color={colors.warning}>
                      {String(chip.suggested)}
                    </Text>
                  </View>
                ) : null}
              </View>
              {chip.sub ? (
                <Text variant="caption" tone="muted">
                  {chip.sub}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <Segmented<VenueServicesFilter>
        options={[
          { value: 'all', label: areaCopy('vs.filter.all') },
          { value: 'on', label: areaCopy('vs.filter.on') },
          { value: 'off', label: areaCopy('vs.filter.off') },
          {
            value: 'suggested',
            label: `${areaCopy('vs.filter.suggested')}${panel.suggestedTotal > 0 ? ` (${panel.suggestedTotal})` : ''}`,
          },
        ]}
        value={panel.filter}
        onChange={panel.setFilter}
        wrapLabels
      />
      <SearchBar
        value={panel.search}
        onChangeText={panel.setSearch}
        onClear={() => panel.setSearch('')}
        placeholder={areaCopy('vs.search')}
      />

      {panel.rows.length === 0 ? (
        <Text variant="bodySmall" tone="secondary" style={styles.empty}>
          {shownVenue && shownVenue.services.length === 0
            ? areaCopy('vs.empty', { venue: shownVenue.venue_name })
            : areaCopy('vs.emptyFilter')}
        </Text>
      ) : (
        <>
          <ChoiceRow
            kind="checkbox"
            selected={panel.allShownSelected}
            title={areaCopy('vs.selectAll')}
            disabled={panel.busy}
            onPress={panel.toggleAllShown}
          />
          {panel.rows.map((entry) => {
            const { group, service } = entry;
            const key = venueServiceKey(group.venue_id, service.id);
            const asLine = onPageAsLine(service);
            const joins = joinsLine(service);
            return (
              <ChoiceRow
                key={key}
                kind="checkbox"
                selected={panel.selected.has(key)}
                title={service.name}
                summary={venueServiceFacts(entry, { symbol: currencySymbol, showVenue: panel.venue === 'all' })}
                disabled={panel.busy}
                onPress={() => panel.toggle(key)}>
                <View style={styles.pills}>
                  <Badge
                    label={areaCopy(service.on_page ? 'vs.pill.on' : 'vs.pill.off')}
                    tone={service.on_page ? 'accent' : 'neutral'}
                  />
                  {isSuggested(service) ? <Badge label={areaCopy('vs.pill.suggested')} tone="warning" /> : null}
                </View>
                {asLine ? (
                  <Text variant="caption" tone="secondary">
                    {asLine}
                  </Text>
                ) : null}
                {joins ? (
                  <Text variant="caption" tone="brand">
                    {joins}
                  </Text>
                ) : null}
              </ChoiceRow>
            );
          })}
        </>
      )}

      <CurateConfirmSheet panel={panel} />
      <ConfirmSheet
        visible={panel.askingDecline}
        title={declineTitle(panel.selection.toDecline.map((c) => c.service.name))}
        message={areaCopy('vs.declineMessage')}
        confirmLabel={areaCopy('svc.suggested.declineConfirm')}
        destructive={false}
        loading={panel.declining}
        onConfirm={panel.confirmDecline}
        onClose={() => {
          if (!panel.declining) panel.setAskingDecline(false);
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// The bar under the list
// ---------------------------------------------------------------------------

/**
 * Pinned under the screen's scroll, so the actions stay in reach however long the list is. It also
 * carries what the last save said, which a phone would otherwise scroll out of sight.
 */
export function VenueServicesBar({ panel }: { panel: VenueServicesPanelState }) {
  const { colors } = useTheme();
  if (!panel.showBar) return null;
  const { chosen, toAdd, toRemove, toDecline } = panel.selection;
  const count = chosen.length;
  return (
    <View
      style={[styles.bar, { backgroundColor: colors.surfaceRaised, borderTopColor: colors.border }]}
      testID="venue-services-bar">
      {panel.note ? (
        <View
          accessibilityRole={panel.note.tone === 'error' ? 'alert' : 'summary'}
          accessibilityLiveRegion="polite"
          style={[
            styles.note,
            panel.note.tone === 'error'
              ? { backgroundColor: colors.dangerSurface, borderColor: colors.danger }
              : { backgroundColor: colors.successSurface, borderColor: colors.success },
          ]}>
          <Text variant="bodySmall">{panel.note.text}</Text>
          {(panel.note.rows ?? []).map((row, index) => (
            <Text key={index} variant="caption">
              {`• ${row}`}
            </Text>
          ))}
        </View>
      ) : null}
      {panel.lastCurate ? (
        <View style={styles.undoRow} accessibilityLiveRegion="polite">
          <UndoButton
            key={panel.lastCurate.expiresAt}
            expiresAt={panel.lastCurate.expiresAt}
            disabled={panel.busy}
            onPress={panel.undoLast}
          />
        </View>
      ) : null}
      <View style={styles.barHead}>
        {count > 0 ? (
          <Text variant="label" style={styles.flex1}>
            {count === 1 ? areaCopy('vs.selectedOne') : areaCopy('vs.selected', { count })}
          </Text>
        ) : (
          <View style={styles.flex1} />
        )}
        <Button label={areaCopy('vs.clear')} variant="ghost" size="sm" disabled={panel.busy} onPress={panel.clear} />
      </View>
      {count > 0 ? (
        <View style={styles.barGrid}>
          {toDecline.length > 0 ? (
            <Button
              label={areaCopy('vs.decline')}
              variant="secondary"
              size="sm"
              style={styles.barCell}
              disabled={panel.busy}
              onPress={() => panel.setAskingDecline(true)}
            />
          ) : null}
          {toRemove.length > 0 ? (
            <Button
              label={`${areaCopy('vs.remove')} (${toRemove.length})`}
              variant="secondary"
              size="sm"
              style={styles.barCell}
              disabled={panel.busy}
              onPress={() => panel.setConfirming('remove')}
            />
          ) : null}
          {toAdd.length > 0 ? (
            <Button
              label={`${areaCopy('vs.add')} (${toAdd.length})`}
              size="sm"
              style={styles.barCell}
              disabled={panel.busy}
              onPress={() => panel.setConfirming('add')}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** "Undo (42s)", counting down to the end of the save's minute. */
function UndoButton({ expiresAt, disabled, onPress }: { expiresAt: number; disabled: boolean; onPress: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  return (
    <Button
      label={areaCopy('ov.bulk.undo', { seconds: Math.max(0, Math.ceil((expiresAt - now) / 1000)) })}
      variant="secondary"
      size="sm"
      disabled={disabled}
      onPress={onPress}
    />
  );
}

// ---------------------------------------------------------------------------
// The question before a save
// ---------------------------------------------------------------------------

function CurateConfirmSheet({ panel }: { panel: VenueServicesPanelState }) {
  const action = panel.confirming;
  const { toAdd, toRemove, joining } = panel.selection;
  const list = action === 'add' ? toAdd : toRemove;
  const close = () => {
    if (panel.saving) return;
    panel.setConfirming(null);
    panel.setSeparate(false);
  };
  return (
    <Sheet visible={action !== null} onClose={close}>
      {action ? (
        <View style={styles.confirmBody}>
          <Text variant="subheading">{curateTitle(action, list, panel.collectiveName)}</Text>
          {action === 'add' ? (
            <>
              <Text variant="bodySmall" tone="secondary">
                {areaCopy(list.length === 1 ? 'vs.addBodyOne' : 'vs.addBody')}
              </Text>
              {joining.length > 0 ? (
                <View style={styles.joinsBox}>
                  <Text variant="bodySmall">{areaCopy('vs.addJoins', { list: joiningList(joining) })}</Text>
                  <ChoiceRow
                    kind="checkbox"
                    selected={panel.separate}
                    title={areaCopy('vs.addSeparate')}
                    disabled={panel.saving}
                    onPress={() => panel.setSeparate(!panel.separate)}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <Text variant="bodySmall" tone="secondary">
              {areaCopy(list.length === 1 ? 'vs.removeBodyOne' : 'vs.removeBody', { collective: panel.collectiveName })}
            </Text>
          )}
          <View style={styles.confirmActions}>
            <Button label="Cancel" variant="secondary" style={styles.flex1} disabled={panel.saving} onPress={close} />
            <Button
              label={action === 'add' ? areaCopy('vs.add') : areaCopy('vs.remove')}
              style={styles.flex1}
              loading={panel.saving}
              onPress={() => panel.save(action)}
            />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  list: { gap: spacing.sm },
  venueChips: { gap: spacing.xs, paddingVertical: spacing.xxs },
  venueChip: {
    minHeight: minTouchTarget,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xxs,
  },
  venueChipHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  countPill: {
    minWidth: 20,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  empty: { paddingVertical: spacing.lg, textAlign: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xxs },
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  barHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  undoRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  barGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  barCell: { flexGrow: 1, flexBasis: '45%' },
  note: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  confirmBody: { gap: spacing.md },
  joinsBox: { gap: spacing.sm },
  confirmActions: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm },
});
