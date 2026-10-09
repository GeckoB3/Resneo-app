import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips, ErrorLine, money, Notice, PosSheet, posStyles, usePosT } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage } from '@/lib/pos/api';
import { adjustDelta, historyWords, loyaltyDay, newestReward, rewardText } from '@/lib/pos/loyalty';
import { isLoyaltyEnabled } from '@/lib/pos/pos-enabled';
import { useAdjustLoyalty, useLoyaltyCard } from '@/lib/queries/usePos';
import { useVenue } from '@/lib/queries/useVenue';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosLoyaltyCard } from '@/types/pos';

/**
 * "Loyalty card" on the client page (Pass LC, POS plan §4.34 "Staff tools"; UX spec §21.2, §13.13),
 * as the web's `ClientLoyaltySection`: the stamps as a row of circles with "4 of 6 visits", a reward
 * waiting with its use-by date, the history, and "Add or remove stamps" for admins and staff with
 * `adjust_loyalty` (which is how a paper card is carried over). Only while the venue's
 * `pos_loyalty_enabled` is on; read when the card is opened, from
 * `GET /api/venue/guests/[guestId]/loyalty-card`. Setting the card up stays on the web.
 */
export function LoyaltyCardSection({ guestId, clientName }: { guestId: string; clientName: string }) {
  const t = usePosT();
  const venue = useVenue();
  if (!isLoyaltyEnabled(venue.data)) return null;
  return (
    <CollapsibleCard title={t('loyalty.card.title')} lazy>
      <LoyaltyBody guestId={guestId} clientName={clientName} timeZone={venue.data?.timezone ?? 'Europe/London'} />
    </CollapsibleCard>
  );
}

function LoyaltyBody({ guestId, clientName, timeZone }: { guestId: string; clientName: string; timeZone: string }) {
  const t = usePosT();
  const q = useLoyaltyCard(guestId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (q.isLoading) return <Text tone="muted">{t('app.loading')}</Text>;
  if (q.error || !q.data) {
    return (
      <View style={posStyles.stack}>
        <ErrorLine message={posErrorMessage(q.error, t('common.saveError'))} />
        <Button label={t('common.tryAgain')} size="sm" variant="secondary" onPress={() => void q.refetch()} />
      </View>
    );
  }
  const card = q.data.card;
  if (!card) return <Text tone="muted">{t('feat.loyalty.setup')}</Text>;
  const progress = t('loyalty.card.progress', { count: card.stamps, needed: card.needed });
  const empty = card.stamps === 0 && card.rewards.length === 0 && card.history.length === 0;

  return (
    <View style={posStyles.stack}>
      {card.programme?.status === 'paused' ? <Notice tone="warning">{t('loyalty.card.paused')}</Notice> : null}
      {empty ? (
        <Text tone="muted">{t('loyalty.card.empty', { date: loyaltyDay(card.programme?.started_on ?? null, timeZone) })}</Text>
      ) : (
        <View style={styles.progress}>
          <Stamps count={card.stamps} needed={card.needed} label={progress} />
          <Text variant="bodyMedium">{progress}</Text>
        </View>
      )}
      {card.available.length ? (
        card.available.map((r) => (
          <Notice key={r.id} tone="success">
            {[
              t('loyalty.card.reward', { rewardText: rewardText(r, t, money) }),
              r.expires_at ? t('loyalty.card.rewardExpires', { date: loyaltyDay(r.expires_at, timeZone, true) }) : null,
            ]
              .filter(Boolean)
              .join('. ')}
          </Notice>
        ))
      ) : !empty ? (
        <Text variant="bodySmall" tone="muted">
          {t('loyalty.card.noReward')}
        </Text>
      ) : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <View style={styles.actions}>
        {card.history.length ? (
          <Button label={t('loyalty.card.history')} size="sm" variant="ghost" onPress={() => setHistoryOpen((o) => !o)} />
        ) : null}
        {q.data.can.adjust ? (
          <Button label={t('loyalty.adjust')} size="sm" variant="secondary" onPress={() => setAdjusting(true)} />
        ) : null}
      </View>
      {historyOpen
        ? card.history.map((h) => (
            <View key={h.id} style={posStyles.row}>
              <Text variant="bodySmall" style={styles.flex}>
                {historyWords(h, t, timeZone)}
              </Text>
              <Text variant="caption" tone="muted">
                {loyaltyDay(h.at, timeZone)}
              </Text>
            </View>
          ))
        : null}
      {adjusting ? (
        <AdjustStampsSheet
          guestId={guestId}
          card={card}
          onClose={() => setAdjusting(false)}
          onDone={(next, filled) => {
            setAdjusting(false);
            const reward = next ? newestReward(next.available) : null;
            setNotice(filled && reward ? t('loyalty.adjust.filled', { clientName, rewardText: rewardText(reward, t, money) }) : null);
          }}
        />
      ) : null}
    </View>
  );
}

/** The stamps as a row of circles, filled for each stamp; the text beside it is the accessible name. */
function Stamps({ count, needed, label }: { count: number; needed: number; label: string }) {
  const { colors } = useTheme();
  const total = Math.max(1, Math.min(needed, 20));
  return (
    <View style={styles.stamps} accessible accessibilityLabel={label}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.stamp,
            { borderColor: colors.brand, backgroundColor: i < count ? colors.brand : 'transparent' },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * "Change stamps" (§21.2): add or remove, how many (1 up to the stamps needed), a required reason
 * with the two suggestions, then save. One request id per sheet, so a retry writes once.
 */
function AdjustStampsSheet({
  guestId,
  card,
  onClose,
  onDone,
}: {
  guestId: string;
  card: PosLoyaltyCard;
  onClose: () => void;
  onDone: (card: PosLoyaltyCard | null, filled: boolean) => void;
}) {
  const t = usePosT();
  const adjust = useAdjustLoyalty(guestId);
  const requestId = useRef(newPaymentAttemptId());
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [count, setCount] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const max = Math.max(1, Math.min(20, card.needed));
  const check = adjustDelta({ direction, count, stamps: card.stamps, needed: card.needed, reason });
  const tooMany = direction === 'remove' && count > card.stamps;

  async function save() {
    if (!check.ok) return;
    setError(null);
    try {
      const res = await adjust.mutateAsync({ delta: check.delta, reason: reason.trim(), clientRequestId: requestId.current });
      onDone(res.card, (res.issued_reward_ids ?? []).length > 0);
    } catch (e) {
      setError(posErrorMessage(e, t('common.networkError')));
    }
  }

  return (
    <PosSheet visible onClose={onClose} title={t('loyalty.adjust.title')}>
      <View style={posStyles.stack}>
        <Segmented
          options={[
            { value: 'add', label: t('loyalty.adjust.add') },
            { value: 'remove', label: t('loyalty.adjust.remove') },
          ]}
          value={direction}
          onChange={setDirection}
        />
        <Stepper
          label={t('loyalty.adjust.count')}
          value={String(count)}
          onDecrement={() => setCount((c) => Math.max(1, c - 1))}
          onIncrement={() => setCount((c) => Math.min(max, c + 1))}
        />
        {tooMany ? <ErrorLine message={t('loyalty.adjust.tooMany', { count: card.stamps })} /> : null}
        <Text variant="label">{t('loyalty.adjust.reason')}</Text>
        <ChoiceChips
          options={[
            { value: t('loyalty.adjust.reason.paper'), label: t('loyalty.adjust.reason.paper') },
            { value: t('loyalty.adjust.reason.mistake'), label: t('loyalty.adjust.reason.mistake') },
          ]}
          value={reason}
          onChange={setReason}
        />
        <Input label={t('loyalty.adjust.reason')} value={reason} onChangeText={setReason} maxLength={200} />
        <ErrorLine message={error} />
        <Button label={t('loyalty.adjust.confirm')} loading={adjust.isPending} disabled={!check.ok} onPress={() => void save()} fullWidth />
        <Button label={t('common.cancel')} variant="ghost" onPress={onClose} disabled={adjust.isPending} fullWidth />
      </View>
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  progress: { gap: spacing.sm },
  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  stamp: { width: 22, height: 22, borderRadius: radius.full, borderWidth: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
});
