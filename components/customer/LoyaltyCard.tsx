import { StyleSheet, View } from 'react-native';

import { loyaltyCopy } from '@/components/customer/loyalty-copy';
import { LoyaltyStamps } from '@/components/pos/settings-more/loyalty/LoyaltyStamps';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useCustomerLoyalty, type CustomerLoyaltyCard } from '@/lib/queries/useCustomerLoyalty';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * "Loyalty card" on Home (UX spec §21.4), the same card as the web account's `AccountLoyaltyCard`
 * in the same words: one per venue where the customer has a stamp or a reward waiting, with the
 * circles, "4 of 6 visits at {venue}", each reward with its use-by date, and how stamps are earned.
 * Several venues stack, in the server's order (by venue name).
 *
 * It reads `GET /api/v1/me/loyalty` itself rather than riding on the hub's aggregate, and shows
 * only when there is something to show: nothing while the first read is in flight, nothing when
 * the customer has no cards, and nothing when the read fails. The card is extra, so its absence
 * says nothing false, and the hub never waits for it or shows a broken block. A failed refresh
 * keeps the cards from the last read that worked.
 */
export function LoyaltyCard() {
  const { data } = useCustomerLoyalty();
  const cards = data?.venues ?? [];
  if (cards.length === 0) return null;

  return (
    <View style={styles.stack}>
      {cards.map((card, index) => (
        // Not the venue alone: nothing makes a customer one client record per venue, and each
        // record has its own card.
        <VenueLoyaltyCard key={`${card.venue_id}:${index}`} card={card} />
      ))}
    </View>
  );
}

function VenueLoyaltyCard({ card }: { card: CustomerLoyaltyCard }) {
  const { colors } = useTheme();
  const progress = loyaltyCopy('acct.loyalty.progress', {
    count: card.stamps,
    needed: card.needed,
    venue: card.venue_name,
  });

  return (
    <Card style={styles.card}>
      <Text variant="overline" tone="secondary" accessibilityRole="header">
        {loyaltyCopy('capp.home.loyalty')}
      </Text>
      {/* The progress is the row's one label, so a screen reader says it once, not every circle. */}
      <LoyaltyStamps count={card.stamps} needed={card.needed} label={progress} />
      {/* The same words for the eye, hidden from screen readers because they heard them on the row. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text variant="bodyMedium">{progress}</Text>
      </View>
      {card.rewards.map((reward) => (
        <View
          key={reward.id}
          testID="loyalty-reward"
          // The reward and its use-by date are heard together.
          accessible
          style={[styles.reward, { backgroundColor: colors.successSurface, borderColor: colors.success }]}>
          <Text variant="bodySmall">{loyaltyCopy('acct.loyalty.reward', { rewardText: reward.text })}</Text>
          {reward.expires_text ? <Text variant="caption">{reward.expires_text}</Text> : null}
        </View>
      ))}
      <Text variant="caption" tone="muted">
        {loyaltyCopy('acct.loyalty.how', { venue: card.venue_name })}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.base },
  card: { gap: spacing.sm },
  reward: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xxs,
  },
});
