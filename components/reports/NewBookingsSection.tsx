import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SvgStackedBarChart, type StackedRow, type StackedSeries } from '@/components/reports/SvgStackedBarChart';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { ErrorState } from '@/components/ui/ErrorState';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useNewBookings } from '@/lib/queries/useNewBookings';
import { buildAndShareCsv } from '@/lib/reports/csv-export';
import {
  NEW_BOOKING_CHANNELS,
  NEW_BOOKING_CHANNEL_COLOURS,
  NEW_BOOKING_CHANNEL_LABELS,
  NEW_BOOKINGS_GRAINS,
  NEW_BOOKINGS_PRESETS,
  newBookingsChartLabel,
  newBookingsCsvFilename,
  newBookingsCsvRows,
  newBookingsFootnote,
  newBookingsPeriodLabel,
  newBookingsRangeError,
  type NewBookingsRangeChoice,
} from '@/lib/reports/new-bookings';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import type { NewBookingsGrain } from '@/types/reports';



/**
 * Reports, New bookings (web `NewBookingsSection.tsx`, 2026-09-18): bookings MADE per day, week
 * or month, split by how they came in, with a preset or custom range and a CSV.
 */
export function NewBookingsSection({ bookingWord, today, enabled = true }: { bookingWord: string; today: string; enabled?: boolean }) {
  const toast = useToast();
  const [choice, setChoice] = useState<NewBookingsRangeChoice>({ kind: 'preset', preset: 'this_week' });
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [grain, setGrain] = useState<NewBookingsGrain>('day');
  const query = useNewBookings(choice, grain, enabled);
  const data = query.data;

  const channels = useMemo(
    () => NEW_BOOKING_CHANNELS.filter((c) => c !== 'linked_venue' || (data?.totals.by_channel.linked_venue ?? 0) > 0),
    [data],
  );
  const series = useMemo<StackedSeries[]>(
    () =>
      channels
        .filter((c) => (data?.totals.by_channel[c] ?? 0) > 0)
        .map((c) => ({ key: c, label: NEW_BOOKING_CHANNEL_LABELS[c], color: NEW_BOOKING_CHANNEL_COLOURS[c] })),
    [channels, data],
  );
  const rows = useMemo<StackedRow[]>(
    () =>
      (data?.periods ?? []).map((p) => ({
        key: p.period_start,
        label: newBookingsChartLabel(p.period_start, data!.grain),
        fullLabel: newBookingsPeriodLabel(p.period_start, p.period_end, data!.grain),
        values: Object.fromEntries(NEW_BOOKING_CHANNELS.map((c) => [c, p.by_channel[c] ?? 0])),
      })),
    [data],
  );

  const customError = newBookingsRangeError({ from: customFrom, to: customTo }, today);
  const rangeLabel = data ? (data.from === data.to ? newBookingsPeriodLabel(data.from, data.to, 'day') : `${newBookingsPeriodLabel(data.from, data.from, 'day')} to ${newBookingsPeriodLabel(data.to, data.to, 'day')}`) : '';
  const footnote = data ? newBookingsFootnote(data.totals) : null;

  const exportCsv = async () => {
    if (!data) return;
    const result = await buildAndShareCsv(newBookingsCsvFilename(data), newBookingsCsvRows(data));
    if (!result.ok) toast.error(result.message);
  };

  return (
    <View style={styles.section}>
      <Card style={styles.card}>
        <Text variant="subheading">New {bookingWord.toLowerCase()}s</Text>
        <Text variant="bodySmall" tone="secondary">
          {`How many ${bookingWord.toLowerCase()}s were made in the period, whatever date each is for, and how they came in. A cancelled one still counts as made.`}
        </Text>
        <View style={styles.chips}>
          {NEW_BOOKINGS_PRESETS.map((preset) => (
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
          <Chip label="Custom range" selected={choice.kind === 'custom' || customOpen} onPress={() => setCustomOpen(true)} />
        </View>
        {customOpen || choice.kind === 'custom' ? (
          <View style={styles.custom}>
            <View style={styles.dateField}>
            <Text variant="label">From</Text>
            <DatePickerField value={customFrom} onChange={setCustomFrom} accessibilityLabel="From" />
          </View>
            <View style={styles.dateField}>
            <Text variant="label">To</Text>
            <DatePickerField value={customTo} onChange={setCustomTo} accessibilityLabel="To" />
          </View>
            {customError ? (
              <Text variant="caption" tone="danger">
                {customError}
              </Text>
            ) : null}
            <Button
              label="Apply"
              size="sm"
              disabled={Boolean(customError)}
              onPress={() => setChoice({ kind: 'custom', from: customFrom, to: customTo })}
            />
          </View>
        ) : null}
        <View style={styles.chips}>
          {NEW_BOOKINGS_GRAINS.map((g) => (
            <Chip key={g.id} label={g.label} selected={grain === g.id} onPress={() => setGrain(g.id)} />
          ))}
        </View>
      </Card>

      {query.isLoading ? (
        <DetailSkeleton />
      ) : query.isError ? (
        <ErrorState message={query.error instanceof ApiError ? query.error.message : 'Could not load new bookings.'} onRetry={() => void query.refetch()} />
      ) : data ? (
        <>
          <Card style={styles.card}>
            <Text variant="caption" tone="muted">
              {rangeLabel}
            </Text>
            <View style={styles.tiles}>
              <StatTile label={`New ${bookingWord.toLowerCase()}s`} value={String(data.totals.total)} style={styles.tile} />
              {channels.map((c) => (
                <StatTile key={c} label={NEW_BOOKING_CHANNEL_LABELS[c]} value={String(data.totals.by_channel[c] ?? 0)} style={styles.tile} />
              ))}
            </View>
            {footnote ? (
              <Text variant="caption" tone="muted">
                {footnote}
              </Text>
            ) : null}
          </Card>
          {rows.length > 0 && series.length > 0 ? (
            <Card style={styles.card}>
              <SvgStackedBarChart rows={rows} series={series} formatValue={(v) => String(Math.round(v))} />
            </Card>
          ) : (
            <Card style={styles.card}>
              <Text variant="bodySmall" tone="muted">
                {`No ${bookingWord.toLowerCase()}s were made in this period.`}
              </Text>
            </Card>
          )}
          <Button label="Export CSV" variant="secondary" disabled={data.periods.length === 0} onPress={() => void exportCsv()} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  custom: {
    gap: spacing.sm,
  },
  dateField: {
    gap: spacing.xs,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
  },
});
