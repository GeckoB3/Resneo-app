import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ErrorLine, PosSheet, posStyles, usePosT, writeError, type Send } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { hapticSuccess } from '@/lib/haptics';
import { capitalised } from '@/lib/pos/loyalty';
import { canPos, isLoyaltyEnabled } from '@/lib/pos/pos-enabled';
import { useSaleRewards } from '@/lib/queries/usePos';
import { useVenue } from '@/lib/queries/useVenue';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosBootstrap, PosSale } from '@/types/pos';

/**
 * "Reward ready" on the sale (Pass LC, UX spec §21.3, §13.13; plan §4.34 "Redeeming"), as the web
 * till's `RewardReadyChip`. Shown while loyalty is on, the sale has a client with a reward waiting
 * and it can still change. Tapping it lists the rewards, oldest first, each with its words and
 * `loyalty.apply.confirm` (needs `take_payment`), or `loyalty.apply.noService` when a free service is
 * not on the sale. Applying sends `POST /api/venue/pos/sales/[id]/loyalty-reward` with the sale's
 * version, which adds a `loyalty_reward` discount: it shows in the discounts list with its words
 * and can be removed there. It never counts against a team member's discount limit, and is marked
 * used when the sale completes.
 */
export function RewardReadyChip({ sale, bootstrap, send }: { sale: PosSale; bootstrap: PosBootstrap; send: Send }) {
  const t = usePosT();
  const { colors } = useTheme();
  const venue = useVenue();
  // Discounts change only while the sale is open and no card payment is waiting (§3.12).
  const editable = sale.status === 'open' && !sale.payment_lock_payment_id;
  const on = isLoyaltyEnabled(venue.data) && Boolean(sale.guest) && editable;
  const rewards = useSaleRewards(sale.id, { enabled: on });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const waiting = (rewards.data?.rewards ?? []).filter((r) => !r.applied);
  if (!on || waiting.length === 0) return null;
  const clientName = sale.guest?.name?.trim() || t('app.sale.client');
  const canApply = canPos(bootstrap, 'take_payment');

  async function apply(rewardId: string) {
    setBusy(rewardId);
    setError(null);
    try {
      await send({ action: 'loyalty-reward', body: { version: sale.version, reward_id: rewardId } });
      hapticSuccess();
      setOpen(false);
    } catch (e) {
      setError(writeError(e, t));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Pressable
        onPress={() => {
          setError(null);
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={t('loyalty.ready')}
        style={({ pressed }) => [
          styles.chip,
          { borderColor: colors.success, backgroundColor: colors.successSurface, opacity: pressed ? 0.7 : 1 },
        ]}>
        <Text variant="label" tone="success">
          {t('loyalty.ready')}
        </Text>
      </Pressable>
      <PosSheet visible={open} onClose={() => setOpen(false)} title={t('loyalty.apply.title', { clientName })}>
        <View style={posStyles.stack}>
          {waiting.length > 1 ? (
            <Text variant="caption" tone="muted">
              {t('app.loyalty.choose')}
            </Text>
          ) : null}
          {waiting.map((r) => (
            <View key={r.id} style={posStyles.stack}>
              {r.applicable ? (
                <>
                  <Text variant="bodyMedium">{t('loyalty.apply.body', { rewardText: capitalised(r.text) })}</Text>
                  {canApply ? (
                    <Button
                      label={t('loyalty.apply.confirm')}
                      loading={busy === r.id}
                      disabled={busy !== null}
                      onPress={() => void apply(r.id)}
                      fullWidth
                    />
                  ) : null}
                </>
              ) : (
                <Text variant="bodySmall">{r.blocked_reason}</Text>
              )}
            </View>
          ))}
          <ErrorLine message={error} />
        </View>
      </PosSheet>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
});
