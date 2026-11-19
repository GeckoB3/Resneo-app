import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CardBulkController, type CardBulkRequest } from '@/components/bookings/CardBulkController';
import { Button } from '@/components/ui/Button';
import { SectionCard } from '@/components/ui/SectionCard';
import { waitingForCardHomeLine } from '@/lib/booking/card-hold';
import { useVenueToday } from '@/lib/dates/use-venue-today';
import { useWaitingForCardCount } from '@/lib/queries/useWaitingForCardCount';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';

/** Where "View" goes: the bookings list, Waiting for card, from today onwards. */
export const WAITING_FOR_CARD_HREF = '/(app)/(tabs)/bookings?card=waiting';

/**
 * The Today screen's card-on-file nudge (web Docs/card-on-file-plan.md §6.5): only when there are
 * any, "6 upcoming bookings are waiting for a card" with "View" (the bookings list filtered to
 * Waiting for card from today onwards, so the numbers match) and "Send card requests" (one per
 * client, after a question). Hidden on an older server that does not say which bookings wait.
 */
export function WaitingForCardHomeCard() {
  const router = useRouter();
  const { venue } = useVenueContext();
  const today = useVenueToday(venue?.timezone ?? 'Europe/London');
  const waiting = useWaitingForCardCount(today);
  const [request, setRequest] = useState<CardBulkRequest | null>(null);

  const show = waiting.available && waiting.count > 0;

  return (
    <>
      {show ? (
        <SectionCard elevated>
          <SectionCard.Header title="Cards" description={waitingForCardHomeLine(waiting.count)} />
          <SectionCard.Footer style={styles.footer}>
            <View style={styles.actions}>
              <Button
                label="View"
                variant="secondary"
                size="sm"
                accessibilityHint="Opens the bookings waiting for a card"
                onPress={() => router.push(WAITING_FOR_CARD_HREF as Href)}
              />
              <Button
                label="Send card requests"
                size="sm"
                onPress={() =>
                  setRequest({
                    action: 'send_card_requests',
                    count: waiting.count,
                    selection: {
                      // The served count has no end date; the older list read has its own.
                      filter: {
                        card_state: 'waiting',
                        from_date: waiting.from,
                        ...(waiting.to ? { to_date: waiting.to } : {}),
                      },
                      expectedCount: waiting.count,
                    },
                  })
                }
              />
            </View>
          </SectionCard.Footer>
        </SectionCard>
      ) : null}
      {/* Kept mounted so its result message stays after the count reaches zero. */}
      <CardBulkController request={request} onDone={() => setRequest(null)} onCancel={() => setRequest(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  footer: { paddingTop: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end' },
});
