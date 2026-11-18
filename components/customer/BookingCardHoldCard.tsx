import { Linking, StyleSheet, View } from 'react-native';

import { useRemoveSavedCardFlow } from '@/components/customer/profile/RemoveSavedCardFlow';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { formatPence } from '@/lib/format';
import { cardGroupForVenue, useAccountCards, type AccountCard } from '@/lib/queries/useAccountCards';
import type { CustomerBookingCardHold } from '@/lib/queries/useCustomerBookings';
import { spacing } from '@/theme/index';

/** The words for a booking's protection (web Docs/card-on-file-plan.md §5.4). Null shows nothing. */
export function bookingCardHoldWords(
  hold: CustomerBookingCardHold | null | undefined,
  currency?: string | null,
): { title: string; lines: string[] } | null {
  if (!hold) return null;
  const money = (pence: number) => formatPence(pence, currency ?? 'GBP') ?? '';
  const fee = hold.fee_pence > 0 ? `No-show fee up to ${money(hold.fee_pence)}.` : null;
  switch (hold.state) {
    case 'held':
      return { title: 'Secured by your saved card', lines: fee ? [fee] : [] };
    case 'awaiting_card':
      return {
        title: 'Add a card to secure this booking',
        lines: ['No payment is taken now.', ...(fee ? [fee] : [])],
      };
    case 'charged': {
      const amount = hold.charged_pence && hold.charged_pence > 0 ? money(hold.charged_pence) : null;
      return { title: amount ? `A no-show fee of ${amount} was charged.` : 'A no-show fee was charged.', lines: [] };
    }
    case 'refunded':
      return { title: 'The no-show fee was refunded.', lines: [] };
    default:
      return null;
  }
}

/**
 * The card part of a booking (plan §5.4):
 * - Secured by your saved card, with "Remove my saved card" (the card kept for this business or
 *   its collective) and "This wasn't me" (only where the server gives a manage link: the action
 *   lives on the web manage page, which a signed-in read does not link to);
 * - Waiting for a card: "Add a card to secure this booking", opening the card-request page;
 * - a charged or refunded fee, in words.
 */
export function BookingCardHoldCard({
  hold,
  venueId,
  currency,
  manageUrl,
}: {
  hold: CustomerBookingCardHold | null | undefined;
  venueId: string;
  currency?: string | null;
  manageUrl?: string | null;
}) {
  const words = bookingCardHoldWords(hold, currency);
  const held = hold?.state === 'held';
  const cards = useAccountCards(held);
  const removal = useRemoveSavedCardFlow();
  if (!words || !hold) return null;

  let savedCard: AccountCard | null = null;
  if (held && cards.data?.grouped) {
    const group = cardGroupForVenue(cards.data.groups, venueId);
    savedCard = group?.cards.find((c) => c.kind === 'card_on_file') ?? group?.cards[0] ?? null;
  }

  return (
    <Card testID="booking-card-hold">
      <Text variant="overline" tone="secondary">
        CARD
      </Text>
      <Text variant="bodyMedium" style={styles.gap}>
        {words.title}
      </Text>
      {words.lines.map((line) => (
        <Text key={line} variant="bodySmall" tone="secondary">
          {line}
        </Text>
      ))}
      <View style={styles.actions}>
        {hold.state === 'awaiting_card' && hold.payment_link ? (
          <Button
            label="Add a card"
            onPress={() => void Linking.openURL(hold.payment_link as string)}
            fullWidth
          />
        ) : null}
        {held && savedCard ? (
          <Button
            label="Remove my saved card"
            variant="secondary"
            onPress={() => removal.start(savedCard as AccountCard)}
            fullWidth
          />
        ) : null}
        {held && manageUrl ? (
          <Button
            label="This wasn't me"
            variant="ghost"
            onPress={() => void Linking.openURL(manageUrl)}
            fullWidth
          />
        ) : null}
      </View>
      {removal.sheet}
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
