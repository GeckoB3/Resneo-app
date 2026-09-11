/**
 * Reports → Revenue (web #191, `BookedRevenueSection.tsx`).
 *
 * The value of every appointment on the diary that has not been cancelled,
 * by day / week / month and by calendar, with linked venues' calendars when
 * their grant is full detail with create/edit/cancel rights. The default view
 * deducts no-shows; "Include no-shows" adds them back. Prices are the server's
 * (`loadRowTotalResolver`, the same precedence as the booking panel), so the
 * app never re-prices a row.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { SvgStackedBarChart } from '@/components/reports/SvgStackedBarChart';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { Segmented } from '@/components/ui/Segmented';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence } from '@/lib/format';
import { hapticTap } from '@/lib/haptics';
import { useBookedRevenue } from '@/lib/queries/useBookedRevenue';
import { buildAndShareCsv } from '@/lib/reports/csv-export';
import {
  BOOKED_REVENUE_GRAINS,
  BOOKED_REVENUE_PRESETS,
  bookedRevenueBarColour,
  bookedRevenueChartLabel,
  bookedRevenueColumnName,
  bookedRevenueCsvFilename,
  bookedRevenueCsvRows,
  bookedRevenueNetPence,
  bookedRevenuePeriodLabel,
  bookedRevenueRangeError,
  bookedRevenueStepBase,
  shiftBookedRevenueRange,
  type BookedRevenueRangeChoice,
} from '@/lib/reports/booked-revenue';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookedRevenueGrain } from '@/types/reports';

const money = (pence: number): string => formatPence(pence) ?? `£${(pence / 100).toFixed(2)}`;

/** A zero reads faintly in the table, as on the web. */
const moneyCell = (pence: number): string => (pence === 0 ? '£0' : money(pence));

function ymdToLocalNoon(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

const PERIOD_COL = 132;
const MONEY_COL = 92;

export function BookedRevenueSection({
  bookingWord,
  today,
  enabled = true,
}: {
  /** The venue's word for an appointment (terminology.booking). */
  bookingWord: string;
  /** Today in the venue's timezone, to seed the custom range. */
  today: string;
  /** Admin only; the section stays quiet for anyone else. */
  enabled?: boolean;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const [choice, setChoice] = useState<BookedRevenueRangeChoice>({ kind: 'preset', preset: 'this_week' });
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [grain, setGrain] = useState<BookedRevenueGrain>('day');
  const [includeNoShows, setIncludeNoShows] = useState(false);

  const query = useBookedRevenue(choice, grain, enabled);
  const data = query.data;

  const columns = useMemo(() => data?.columns ?? [], [data]);
  const ownColumns = columns.filter((c) => !c.linked);
  const linkedColumns = columns.filter((c) => c.linked);
  const series = useMemo(
    () =>
      columns.map((col, index) => ({
        key: col.key,
        label: bookedRevenueColumnName(col),
        color: bookedRevenueBarColour(index),
      })),
    [columns],
  );
  const chartRows = useMemo(
    () =>
      (data?.periods ?? []).map((p) => ({
        key: p.period_start,
        label: bookedRevenueChartLabel(p.period_start, data!.grain),
        fullLabel: bookedRevenuePeriodLabel(p.period_start, p.period_end, data!.grain),
        highlighted: p.period_start <= data!.today && data!.today <= p.period_end,
        values: Object.fromEntries(
          (data?.columns ?? []).map((c) => [c.key, bookedRevenueNetPence(p.by_calendar[c.key], includeNoShows)]),
        ),
      })),
    [data, includeNoShows],
  );

  const totalNet = data ? bookedRevenueNetPence(data.totals, includeNoShows) : 0;
  const totalCount = data ? data.totals.booked_count + (includeNoShows ? data.totals.no_show_count : 0) : 0;
  const unpriced = data?.totals.unpriced_count ?? 0;
  const rangeLabel = data ? bookedRevenuePeriodLabel(data.from, data.to, 'week') : '';
  const hasFuture = data ? data.to > data.today : false;
  const hasPast = data ? data.from < data.today : false;
  const lowerWord = bookingWord.toLowerCase();
  const errorMessage =
    query.error instanceof ApiError ? query.error.message : 'Could not load booked revenue.';

  /**
   * The range the arrows step from: the last one REQUESTED. The query keeps the
   * previous answer on screen while the next range loads, so stepping from
   * `data` made a second quick tap ask for the window it had just asked for. A
   * preset has no dates of its own, so its arrows wait for the server.
   */
  const stepBase = bookedRevenueStepBase(choice, data, query.isPlaceholderData);
  const stepLabel = stepBase
    ? bookedRevenuePeriodLabel(stepBase.from, stepBase.to, 'week')
    : rangeLabel;

  /** One period earlier or later, from the range last requested. */
  function stepRange(direction: -1 | 1) {
    if (!stepBase) return;
    const next = shiftBookedRevenueRange(stepBase, grain, direction);
    const rangeError = bookedRevenueRangeError(next);
    if (rangeError) {
      toast.info(rangeError);
      return;
    }
    hapticTap();
    setCustomOpen(false);
    setCustomFrom(next.from);
    setCustomTo(next.to);
    setChoice({ kind: 'custom', ...next });
  }

  function applyCustom() {
    // The route's own limits, checked here so the UI never sends a range it
    // knows will come back 400 (web `booked-revenue/route.ts:61-70`).
    const rangeError = bookedRevenueRangeError({ from: customFrom, to: customTo });
    if (rangeError) {
      toast.info(rangeError);
      return;
    }
    hapticTap();
    setChoice({ kind: 'custom', from: customFrom, to: customTo });
  }

  async function exportCsv() {
    if (!data || data.periods.length === 0) {
      toast.info('There is no booked revenue to export for this range.');
      return;
    }
    hapticTap();
    const result = await buildAndShareCsv(
      bookedRevenueCsvFilename(data),
      bookedRevenueCsvRows(data, includeNoShows),
    );
    if (!result.ok) {
      toast.error('Could not export the report.');
      return;
    }
    toast.success('Export started.');
  }

  return (
    <>
      <Card>
        <View style={styles.cardHeader}>
          <Text variant="label">Booked revenue</Text>
        </View>
        <Text variant="bodySmall" tone="muted">
          The value of every {lowerWord} on the diary that has not been cancelled, by day and by
          calendar. Future dates show everything booked. Past dates leave out services marked as a
          no-show unless you turn on Include no-shows.
        </Text>

        <Text variant="overline" tone="muted" style={styles.groupLabel}>
          Range
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {BOOKED_REVENUE_PRESETS.map((preset) => (
            <Chip
              key={preset.id}
              label={preset.label}
              selected={choice.kind === 'preset' && choice.preset === preset.id}
              onPress={() => {
                setCustomOpen(false);
                setChoice({ kind: 'preset', preset: preset.id });
              }}
            />
          ))}
          <Chip
            label="Custom range"
            selected={choice.kind === 'custom' || customOpen}
            onPress={() => {
              setCustomOpen(true);
              if (choice.kind === 'preset' && stepBase) {
                setCustomFrom(stepBase.from);
                setCustomTo(stepBase.to);
              }
            }}
          />
        </ScrollView>

        {/* The From/To editor belongs to the Custom range chip. Stepping sets a
            custom range too, but it must not open the editor. */}
        {customOpen ? (
          <View style={styles.customRange}>
            <View style={styles.dateField}>
              <Text variant="caption" tone="muted">
                From
              </Text>
              <DatePickerField
                value={customFrom}
                onChange={(iso) => {
                  setCustomFrom(iso);
                  if (iso > customTo) setCustomTo(iso);
                }}
                accessibilityLabel="Revenue range start date"
              />
            </View>
            <View style={styles.dateField}>
              <Text variant="caption" tone="muted">
                To
              </Text>
              <DatePickerField
                value={customTo}
                onChange={(iso) => {
                  setCustomTo(iso);
                  if (iso < customFrom) setCustomFrom(iso);
                }}
                accessibilityLabel="Revenue range end date"
                minimumDate={ymdToLocalNoon(customFrom)}
              />
            </View>
            <Button
              label={query.isFetching ? 'Loading…' : 'Apply'}
              size="sm"
              onPress={applyCustom}
              disabled={query.isFetching}
            />
          </View>
        ) : null}

        <Text variant="overline" tone="muted" style={styles.groupLabel}>
          Show by
        </Text>
        <Segmented options={BOOKED_REVENUE_GRAINS.map((g) => ({ value: g.id, label: g.label }))} value={grain} onChange={setGrain} />

        {/* Step the range one period back or forward: a day, a week, or a
            calendar month, by the grain (the owner's ask, 2026-09-11). */}
        <View style={styles.stepRow}>
          <IconButton
            icon={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
            accessibilityLabel={`Previous ${grain}`}
            variant="bordered"
            disabled={!stepBase}
            onPress={() => stepRange(-1)}
          />
          <Text variant="label" numberOfLines={2} style={styles.stepLabel}>
            {stepLabel || '…'}
          </Text>
          <IconButton
            icon={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            accessibilityLabel={`Next ${grain}`}
            variant="bordered"
            disabled={!stepBase}
            onPress={() => stepRange(1)}
          />
        </View>

        <View style={styles.switchRow}>
          <Text variant="bodyMedium" style={styles.flex1}>
            Include no-shows
          </Text>
          <Switch
            testID="include-no-shows"
            accessibilityLabel="Include no-shows"
            value={includeNoShows}
            onValueChange={setIncludeNoShows}
          />
        </View>
      </Card>

      <Card>
        <View style={styles.cardHeader}>
          <Text variant="label" style={styles.flex1} numberOfLines={2}>
            {data ? `Booked revenue, ${rangeLabel}` : 'Booked revenue'}
          </Text>
          <Button label="Export CSV" size="sm" variant="ghost" onPress={() => void exportCsv()} />
        </View>

        {query.isError && !data ? (
          <ErrorState message={errorMessage} onRetry={() => void query.refetch()} />
        ) : !data ? (
          <DetailSkeleton />
        ) : (
          <>
            {/* An error with figures already on screen is shown above them and
                the table stays, as on the web (`BookedRevenueSection.tsx:319`). */}
            {query.isError ? (
              <Text variant="bodySmall" tone="danger" style={styles.inlineError}>
                {errorMessage}
              </Text>
            ) : null}
            <View style={query.isFetching ? styles.refreshing : undefined}>
            <View style={styles.tiles}>
              <StatTile
                label={includeNoShows ? 'Booked revenue (incl. no-shows)' : 'Booked revenue'}
                value={money(totalNet)}
                caption={hasFuture && hasPast ? 'Past and upcoming dates' : hasFuture ? 'Upcoming dates' : 'Past dates'}
                style={styles.tile}
              />
              <StatTile
                label={includeNoShows ? 'No-shows included' : 'No-shows deducted'}
                value={money(data.totals.no_show_pence)}
                caption={`${data.totals.no_show_count} ${data.totals.no_show_count === 1 ? 'service' : 'services'}`}
                trend={data.totals.no_show_pence > 0 ? 'down' : 'neutral'}
                style={styles.tile}
              />
              <StatTile
                label={`${bookingWord}s counted`}
                value={String(totalCount)}
                caption={unpriced > 0 ? `${unpriced} without a price` : undefined}
                style={styles.tile}
              />
            </View>

            {unpriced > 0 ? (
              <View style={[styles.note, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
                <Text variant="bodySmall" color={colors.text}>
                  {unpriced} {unpriced === 1 ? 'service has' : 'services have'} no price on the booking or in
                  your service list, so {unpriced === 1 ? 'it adds' : 'they add'} nothing to these totals.
                </Text>
              </View>
            ) : null}
            {linkedColumns.length > 0 ? (
              <Text variant="bodySmall" tone="muted">
                Includes calendars from {[...new Set(linkedColumns.map((c) => c.venue_name))].join(', ')},
                shared with you through a linked account.
              </Text>
            ) : null}

            {data.periods.length === 0 || columns.length === 0 ? (
              <Text variant="bodySmall" tone="muted">
                No {lowerWord}s in this range.
              </Text>
            ) : (
              <>
                <View style={styles.chartSection}>
                  <SvgStackedBarChart rows={chartRows} series={series} formatValue={money} />
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={[styles.table, { borderColor: colors.border }]}>
                    <View style={[styles.tableRow, styles.tableHead, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                      <Text variant="caption" tone="muted" style={[styles.periodCol, styles.headText]}>
                        Period
                      </Text>
                      {ownColumns.map((col, index) => (
                        <View key={col.key} style={styles.moneyCol}>
                          <View style={styles.headCell}>
                            <View style={[styles.swatch, { backgroundColor: bookedRevenueBarColour(index) }]} />
                            <Text variant="caption" tone="muted" numberOfLines={1} style={styles.headText}>
                              {col.name}
                            </Text>
                          </View>
                        </View>
                      ))}
                      {linkedColumns.map((col, index) => (
                        <View key={col.key} style={styles.moneyCol}>
                          <View style={styles.headCell}>
                            <View
                              style={[
                                styles.swatch,
                                { backgroundColor: bookedRevenueBarColour(ownColumns.length + index) },
                              ]}
                            />
                            <Text variant="caption" tone="muted" numberOfLines={1} style={styles.headText}>
                              {col.name}
                            </Text>
                          </View>
                          <Text variant="caption" tone="muted" numberOfLines={1} style={styles.venueCaption}>
                            {col.venue_name}
                          </Text>
                        </View>
                      ))}
                      <Text variant="caption" tone="muted" style={[styles.moneyCol, styles.headText]}>
                        Total
                      </Text>
                      {!includeNoShows ? (
                        <Text variant="caption" style={[styles.moneyCol, styles.headText, { color: colors.warning }]}>
                          No-shows
                        </Text>
                      ) : null}
                    </View>

                    {data.periods.map((p) => {
                      const isToday = p.period_start <= data.today && data.today <= p.period_end;
                      return (
                        <View
                          key={p.period_start}
                          style={[
                            styles.tableRow,
                            { borderBottomColor: colors.border },
                            isToday ? { backgroundColor: colors.brandSubtle } : null,
                          ]}>
                          <Text variant="bodySmall" numberOfLines={1} style={styles.periodCol}>
                            {bookedRevenuePeriodLabel(p.period_start, p.period_end, data.grain)}
                            {isToday && data.grain === 'day' ? ' · Today' : ''}
                          </Text>
                          {columns.map((col) => {
                            const v = bookedRevenueNetPence(p.by_calendar[col.key], includeNoShows);
                            return (
                              <Text
                                key={col.key}
                                variant="bodySmall"
                                tone={v === 0 ? 'muted' : 'default'}
                                style={styles.moneyCol}>
                                {moneyCell(v)}
                              </Text>
                            );
                          })}
                          <Text variant="bodyMedium" style={styles.moneyCol}>
                            {money(bookedRevenueNetPence(p, includeNoShows))}
                          </Text>
                          {!includeNoShows ? (
                            <Text
                              variant="bodySmall"
                              style={[styles.moneyCol, p.no_show_pence > 0 ? { color: colors.warning } : null]}
                              tone={p.no_show_pence === 0 ? 'muted' : 'default'}>
                              {moneyCell(p.no_show_pence)}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })}

                    <View style={[styles.tableRow, styles.tableFoot, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                      <Text variant="bodyMedium" style={styles.periodCol}>
                        Total
                      </Text>
                      {columns.map((col) => (
                        <Text key={col.key} variant="bodyMedium" style={styles.moneyCol}>
                          {money(bookedRevenueNetPence(data.totals.by_calendar[col.key], includeNoShows))}
                        </Text>
                      ))}
                      <Text variant="bodyMedium" style={styles.moneyCol}>
                        {money(totalNet)}
                      </Text>
                      {!includeNoShows ? (
                        <Text variant="bodyMedium" style={[styles.moneyCol, { color: colors.warning }]}>
                          {money(data.totals.no_show_pence)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </ScrollView>
              </>
            )}
            </View>
          </>
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  groupLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  customRange: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dateField: {
    gap: spacing.xs,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  stepLabel: {
    flex: 1,
    textAlign: 'center',
  },
  flex1: {
    flex: 1,
  },
  refreshing: {
    opacity: 0.7,
  },
  inlineError: {
    marginBottom: spacing.sm,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
  },
  note: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  chartSection: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  tableHead: {
    alignItems: 'flex-end',
  },
  tableFoot: {
    borderBottomWidth: 0,
  },
  periodCol: {
    width: PERIOD_COL,
  },
  moneyCol: {
    width: MONEY_COL,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    paddingLeft: spacing.xs,
  },
  headCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  headText: {
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontSize: 10,
  },
  venueCaption: {
    fontSize: 10,
    textAlign: 'right',
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
});
