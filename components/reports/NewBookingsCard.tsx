import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { NEW_BOOKING_CHANNELS, NEW_BOOKING_CHANNEL_LABELS, newBookingsFootnote } from '@/lib/reports/new-bookings';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { NewBookingsSummary } from '@/types/dashboard';

type Span = 'today' | 'this_week' | 'this_month';

const SPANS: { id: Span; label: string; word: string }[] = [
  { id: 'today', label: 'Today', word: 'today' },
  { id: 'this_week', label: 'This week', word: 'this week' },
  { id: 'this_month', label: 'This month', word: 'this month' },
];

/**
 * Today: how many bookings were MADE today, this week and this month, whatever date each is for
 * (web `NewBookingsCard.tsx`, 2026-09-18). The KPI tiles above count the diary instead. Renders
 * nothing on a server that predates the figure.
 */
export function NewBookingsCard({
  summary,
  onOpenReport,
}: {
  /** `undefined` when the server predates the figure; `null` when it could not be counted. */
  summary: NewBookingsSummary | null | undefined;
  /** Reports are admin only, so only admins get the link through. */
  onOpenReport?: () => void;
}) {
  const { colors } = useTheme();
  const [span, setSpan] = useState<Span>('today');
  if (summary === undefined) return null;
  const counts = summary ? summary[span] : null;
  const word = SPANS.find((s) => s.id === span)?.word ?? 'today';
  const channels = counts ? NEW_BOOKING_CHANNELS.filter((c) => (counts.by_channel[c] ?? 0) > 0) : [];
  const footnote = counts ? newBookingsFootnote(counts) : null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.flex1}>
          <Text variant="overline" tone="muted">
            Bookings made
          </Text>
          <Text variant="subheading">New bookings</Text>
        </View>
      </View>
      <View style={styles.chips}>
        {SPANS.map((s) => (
          <Chip key={s.id} label={s.label} selected={span === s.id} onPress={() => setSpan(s.id)} />
        ))}
      </View>
      {!counts ? (
        <Text variant="bodySmall" tone="muted">
          We could not count your new bookings just now. Pull down to try again.
        </Text>
      ) : (
        <>
          <Text variant="body">
            {counts.total === 0
              ? `No new bookings ${span === 'today' ? 'yet today' : `${word} yet`}.`
              : `You have had ${counts.total} new ${counts.total === 1 ? 'booking' : 'bookings'} ${word}.`}
          </Text>
          {channels.length > 0 ? (
            <View style={styles.chips} accessibilityLabel="How they were booked">
              {channels.map((c) => (
                <View key={c} style={[styles.pill, { backgroundColor: colors.surfaceSunken }]}>
                  <Text variant="caption">{`${NEW_BOOKING_CHANNEL_LABELS[c]} ${counts.by_channel[c]}`}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {footnote ? (
            <Text variant="caption" tone="muted">
              {footnote}
            </Text>
          ) : null}
        </>
      )}
      <Text variant="caption" tone="muted">
        Counted on the day each booking was made, whatever date it is for.
      </Text>
      {onOpenReport ? (
        <Pressable accessibilityRole="button" onPress={onOpenReport} hitSlop={8}>
          <Text variant="label" tone="brand">
            See new bookings by day, week or month in Reports
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pill: {
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
