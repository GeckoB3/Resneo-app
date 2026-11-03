import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { LoadingState } from '@/components/ui/LoadingState';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { isCustomerRowLive } from '@/lib/booking/customer-visit-list';
import { addDaysToDateStr, formatDayHeading, formatShortDay } from '@/lib/dates/venue-dates';
import { queryKeys } from '@/lib/queries/keys';
import {
  useChangeVisit,
  useVisitChangeOptions,
  type CustomerVisit,
  type VisitChangeStart,
} from '@/lib/queries/useCustomerVisit';
import { spacing } from '@/theme/index';

type Props = {
  bookingId: string;
  visit: CustomerVisit;
  visible: boolean;
  onClose: () => void;
  /** The visit moved; `message` is the server's sentence for it. */
  onMoved: (message: string) => void;
};

/** Today on the phone's own calendar, as "YYYY-MM-DD". */
function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" to a local noon Date, for the picker's lower bound. */
function noonOf(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Move the whole visit to another day or time (web split-visit plan 6.6; G1).
 *
 * The visit moves as one block: every live service keeps its person, its length and its place
 * relative to the first one, and only the start changes. So this offers a day, then the starts
 * on it where every service still fits (`change-options`), then the old and new plans side by
 * side before anything moves. The change is all or nothing on the server; when a service changed
 * while the client was choosing, the server refuses it (409 `visit_changed`) and the times are
 * asked for again.
 *
 * It never offers a new person or a new service: for a visit, that is a cancel or a call to the
 * business. Mirrors the web's `VisitChangeSection` in `GuestVisitPanel.tsx`.
 *
 * Mounted afresh each time it opens (the caller keys it), so a reopened sheet starts clean.
 */
export function VisitChangeSheet({ bookingId, visit, visible, onClose, onMoved }: Props) {
  const queryClient = useQueryClient();
  const [today] = useState(localToday);
  const [date, setDate] = useState(() => (visit.span && visit.span.date >= today ? visit.span.date : today));
  const [chosen, setChosen] = useState<VisitChangeStart | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = useVisitChangeOptions(bookingId, date, visible);
  const change = useChangeVisit(bookingId);

  const serviceById = new Map(visit.services.map((s) => [s.booking_id, s]));
  const liveServices = visit.services.filter(isCustomerRowLive);

  const pickDate = (next: string) => {
    if (next < today) return;
    setDate(next);
    // A time chosen on one day means nothing on another.
    setChosen(null);
    setError(null);
  };

  const save = () => {
    if (!chosen || !options.data) return;
    setError(null);
    change.mutate(
      { booking_date: date, booking_time: chosen.start_time, expected: options.data.expected },
      {
        onSuccess: (result) => onMoved(result?.message || 'Your visit has been moved.'),
        onError: (e) => {
          setError(messageOf(e, 'We could not move your visit. Please try again.'));
          if (e instanceof ApiError && e.status === 409) {
            // The visit or the times changed meanwhile: read both again before another try.
            setChosen(null);
            void queryClient.invalidateQueries({ queryKey: queryKeys.customer.all() });
          }
        },
      },
    );
  };

  const data = options.data;

  return (
    <Sheet visible={visible} onClose={onClose} fill maxHeight="88%">
      <View style={styles.header}>
        <Text variant="subheading">Change date or time</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} testID="visit-change-sheet">
        <Text variant="bodySmall" tone="secondary">
          Pick a new day and time. Every service moves together, with the same people, in the same order.
        </Text>

        <DatePickerField value={date} onChange={pickDate} accessibilityLabel="Day" minimumDate={noonOf(today)} />
        <View style={styles.dayNav}>
          <Button
            label="Previous day"
            variant="secondary"
            size="sm"
            disabled={date <= today}
            onPress={() => pickDate(addDaysToDateStr(date, -1))}
            style={styles.flex1}
          />
          <Button
            label="Next day"
            variant="secondary"
            size="sm"
            onPress={() => pickDate(addDaysToDateStr(date, 1))}
            style={styles.flex1}
          />
        </View>

        {options.isLoading ? (
          <LoadingState message="Finding times…" />
        ) : options.isError ? (
          <Text variant="bodySmall" tone="secondary">
            {messageOf(options.error, 'We could not load times for that day. Try another day.')}
          </Text>
        ) : data && !data.can_change ? (
          <Text variant="bodySmall">{data.message ?? 'Your visit cannot be changed online.'}</Text>
        ) : data && data.starts.length === 0 ? (
          <Text variant="bodySmall" tone="secondary">
            There are no times on {formatDayHeading(date)} where your whole visit fits. Try another day.
          </Text>
        ) : data && !chosen ? (
          <View style={styles.slotWrap} testID="visit-change-starts">
            {data.starts.map((start) => (
              <Chip key={start.start_time} label={start.start_time} onPress={() => setChosen(start)} />
            ))}
          </View>
        ) : null}

        {chosen ? (
          <View style={styles.review} testID="visit-change-review">
            <View style={styles.plan}>
              <Text variant="overline" tone="secondary">
                NOW
              </Text>
              {liveServices.map((s) => (
                <Text key={s.booking_id} variant="bodySmall" tone="secondary">
                  {formatShortDay(s.booking_date)}, {s.start_time} {s.service_name}
                </Text>
              ))}
            </View>
            <View style={styles.plan}>
              <Text variant="overline" tone="brand">
                NEW
              </Text>
              {chosen.services.map((s) => {
                const service = serviceById.get(s.booking_id);
                return (
                  <Text key={s.booking_id} variant="bodySmall">
                    {formatShortDay(date)}, {s.start_time} {service?.service_name ?? 'Appointment'}
                    {service?.person_name ? ` with ${service.person_name}` : ''}
                  </Text>
                );
              })}
            </View>
            <Button label="Move my visit" loading={change.isPending} onPress={save} />
            <Button
              label="Choose another time"
              variant="secondary"
              disabled={change.isPending}
              onPress={() => {
                setChosen(null);
                setError(null);
              }}
            />
          </View>
        ) : null}

        {error ? (
          <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.base, paddingBottom: spacing.sm },
  scroll: { flex: 1 },
  content: { padding: spacing.base, paddingTop: 0, gap: spacing.base },
  dayNav: { flexDirection: 'row', gap: spacing.sm },
  flex1: { flex: 1 },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  review: { gap: spacing.sm },
  plan: { gap: 2 },
});
