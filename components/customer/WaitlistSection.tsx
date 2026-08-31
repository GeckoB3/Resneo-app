import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { venueNameFor, type CustomerHome } from '@/lib/queries/useCustomerHome';
import {
  isLiveWaitlistEntry,
  useCustomerWaitlist,
  useLeaveWaitlist,
  type WaitlistEntry,
} from '@/lib/queries/useCustomerWaitlist';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

type Props = { home: CustomerHome | undefined };

/**
 * Places the customer is waiting for, above their bookings.
 *
 * ABOVE rather than below, because a waitlist place is the thing most likely to
 * need an answer today: an offered place expires, and burying it under a list
 * of confirmed bookings is how somebody misses it.
 */
export function WaitlistSection({ home }: Props) {
  const toast = useToast();
  const { data } = useCustomerWaitlist();
  const leave = useLeaveWaitlist();

  const entries = (data?.entries ?? []).filter(isLiveWaitlistEntry);
  if (entries.length === 0) return null;

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        WAITING FOR A PLACE
      </Text>
      {entries.map((entry) => (
        <View key={entry.id} style={styles.row}>
          <View style={styles.main}>
            <Text variant="body">{venueNameFor(home, entry.venue_id)}</Text>
            <Text variant="bodySmall" tone="secondary">
              {waitingLine(entry)}
            </Text>
          </View>
          <Button
            label="Leave"
            variant="secondary"
            size="sm"
            loading={leave.isPending}
            onPress={() =>
              leave.mutate(entry.id, {
                onSuccess: (outcome) => {
                  if (outcome.status === 'left') {
                    toast.success('You have left the waitlist.');
                  } else {
                    // Not an error. The place resolved itself while the screen
                    // was open, which is ordinary on a waitlist.
                    toast.info('That place has already gone.');
                  }
                },
                onError: () => toast.error('Could not leave that waitlist.'),
              })
            }
          />
        </View>
      ))}
    </Card>
  );
}

/**
 * What this entry is waiting for, and whether it needs an answer now.
 *
 * An offered place is called out first, because it is the only state with a
 * deadline attached.
 */
function waitingLine(entry: WaitlistEntry): string {
  const when = entry.desired_date ? formatDayHeading(entry.desired_date) : 'any date';
  const time = entry.desired_time ? ` at ${entry.desired_time.slice(0, 5)}` : '';
  if (entry.offered_at) {
    return `A place has come up for ${when}${time}. The venue will be in touch.`;
  }
  return `Waiting for ${when}${time}.`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  main: { flex: 1, gap: 2 },
});
