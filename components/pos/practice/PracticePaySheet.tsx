import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { PaidOutcome } from '@/components/pos/PaySheet';
import { DueHeadline, OtherWays, PAY_ICONS, PayTile, PayTileGrid } from '@/components/pos/PayTiles';
import { money, Notice, PosSheet, posStyles, usePosT } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { tapToPayButtonLabel } from '@/lib/payments/tap-to-pay-copy';
import { cashChange, cashCovers, cashQuickAmounts, parseMoneyInput, penceToInput } from '@/lib/pos/sale-math';
import { spacing } from '@/theme/index';
import type { PosBootstrap, PosSale } from '@/types/pos';

import { practiceT } from './copy';
import { practiceOutcome, type PracticeMethod } from './model';

/**
 * Taking payment on a practice sale (design W11, B12 and B13; section 6.8): the same choice of
 * methods as a real sale (Part 2 mock-up 1's tiles), where each one shows what would happen and
 * nothing is sent anywhere. This sheet is never given the sale's write function, so it cannot
 * record a payment, start a card, ask a reader or make a pay link: the database would refuse a
 * payment on a practice sale anyway, and here nothing even asks.
 *
 * As on the web: the phone (Tap to Pay), the counter reader, a pay link and the venue's own payment
 * types show their outcome straight away; cash asks what was handed over and shows the change, as a
 * real sale does. Each ends with `onPaid`, and the sale screen shows the outcome, "Paid. This is
 * the moment the receipt goes out." and the receipt.
 */

type Mode = 'choose' | 'cash';

/** What the practice showed, with the venue's payment type's name for "Other ways". */
export type PracticePaid = (outcome: PaidOutcome, extra?: { typeName: string }) => void;

function PracticePaySheetBody({
  onClose,
  sale,
  bootstrap,
  onPaid,
}: {
  onClose: () => void;
  sale: PosSale;
  bootstrap: PosBootstrap;
  onPaid: PracticePaid;
}) {
  const t = usePosT();
  const balance = Math.max(0, sale.balance_due_pence);
  const [mode, setMode] = useState<Mode>('choose');
  const [tendered, setTendered] = useState('');
  const tenderedPence = parseMoneyInput(tendered);
  const change = cashChange(balance, tenderedPence);
  const cashReady = cashCovers(balance, 0, tenderedPence);

  function show(method: PracticeMethod, typeName?: string) {
    onPaid(practiceOutcome(method, method === 'cash' ? change : 0), typeName ? { typeName } : undefined);
    onClose();
  }

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={mode === 'cash' ? t('cash.title') : t('pay.title')}
      eyebrow={mode === 'choose'}
      headline={mode === 'choose' ? <DueHeadline balancePence={balance} /> : undefined}>
      <View style={posStyles.stack}>
        <Notice>{practiceT('setup.practice.banner')}</Notice>
        {mode === 'choose' ? (
          <>
            <PayTileGrid>
              <PayTile icon={PAY_ICONS.tapToPay} title={t('app.pay.card')} detail={tapToPayButtonLabel()} primary onPress={() => show('phone')} />
              <PayTile
                icon={PAY_ICONS.reader}
                title={t('pay.method.cardReader')}
                detail={t('app.pay.tile.reader')}
                primary
                onPress={() => show('reader')}
              />
              <PayTile icon={PAY_ICONS.cash} title={t('pay.method.cash')} detail={t('app.pay.tile.cash')} onPress={() => setMode('cash')} />
              <PayTile icon={PAY_ICONS.link} title={t('pay.method.link')} detail={t('app.pay.tile.link')} onPress={() => show('link')} />
            </PayTileGrid>
            <OtherWays
              types={bootstrap.payment_types ?? []}
              disabled={false}
              onChoose={(id) => {
                const type = (bootstrap.payment_types ?? []).find((p) => p.id === id);
                if (type) show('other', type.name);
              }}
            />
          </>
        ) : (
          <>
            <Text variant="bodySmall" tone="secondary">
              {practiceT('setup.practice.sim.cash')}
            </Text>
            <Text variant="heading">{t('cash.due', { amount: money(balance) })}</Text>
            <Input
              label={t('cash.tendered')}
              accessibilityLabel={t('cash.tendered')}
              value={tendered}
              onChangeText={setTendered}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder={penceToInput(balance)}
            />
            <View style={styles.chips}>
              {cashQuickAmounts(balance).map((p, i) => (
                <Chip key={p} label={i === 0 ? t('cash.exact') : money(p)} onPress={() => setTendered(penceToInput(p))} />
              ))}
            </View>
            {change > 0 ? <Text variant="heading">{t('cash.change', { amount: money(change) })}</Text> : null}
            <Button label={t('cash.confirm', { amount: money(balance) })} disabled={!cashReady} onPress={() => show('cash')} fullWidth />
            <Button label={t('pay.otherWay')} variant="ghost" onPress={() => setMode('choose')} fullWidth />
          </>
        )}
      </View>
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});

/** Mounted only while open, so every opening starts from the choice. */
export function PracticePaySheet(props: Parameters<typeof PracticePaySheetBody>[0] & { visible: boolean }) {
  return props.visible ? (
    <PracticePaySheetBody onClose={props.onClose} sale={props.sale} bootstrap={props.bootstrap} onPaid={props.onPaid} />
  ) : null;
}
