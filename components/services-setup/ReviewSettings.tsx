import { StyleSheet, View } from 'react-native';

import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { paymentDefaultValid, type PaymentDefault, type SetupDefaults } from '@/lib/services-setup/drafts';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { CalendarChips } from './bits';

/**
 * What applies to every service the setup adds (web `ReviewSettings.tsx`): who offers them, a
 * buffer after each appointment, online payment, and at a collective host whether they also go
 * on the combined booking page.
 */

const BUFFER_CHOICES = [0, 5, 10, 15, 20, 30];

const PAYMENT_CHOICES: { kind: PaymentDefault['kind']; title: string }[] = [
  { kind: 'none', title: 'No online payment' },
  { kind: 'deposit_fixed', title: 'A deposit of a fixed amount' },
  { kind: 'deposit_percent', title: 'A deposit as a share of the price' },
  { kind: 'full', title: 'Pay the full price online' },
];

export interface ReviewSettingsProps {
  calendars: { id: string; name: string }[];
  calendarIds: string[];
  onCalendarIds: (ids: string[]) => void;
  defaults: SetupDefaults;
  onDefaults: (next: SetupDefaults) => void;
  stripeConnected: boolean;
  currencySymbol: string;
  collectiveHost: { name: string } | null;
  addToCollective: boolean;
  onAddToCollective: (on: boolean) => void;
  locked: boolean;
}

export function ReviewSettings({
  calendars,
  calendarIds,
  onCalendarIds,
  defaults,
  onDefaults,
  stripeConnected,
  currencySymbol,
  collectiveHost,
  addToCollective,
  onAddToCollective,
  locked,
}: ReviewSettingsProps) {
  const { colors } = useTheme();
  const payment = defaults.payment;

  function setPayment(next: PaymentDefault) {
    onDefaults({ ...defaults, payment: next });
  }

  function choosePayment(kind: PaymentDefault['kind']) {
    if (kind === payment.kind) return;
    setPayment(kind === 'deposit_fixed' ? { kind, amount: '' } : kind === 'deposit_percent' ? { kind, percent: '20' } : { kind });
  }

  return (
    <View style={[styles.wrap, { borderTopColor: colors.border }]}>
      <Text variant="label">For every service you add</Text>

      {calendars.length > 1 ? (
        <View style={styles.stackXs}>
          <Text variant="label" tone="secondary">
            Who offers them
          </Text>
          <Text variant="caption" tone="muted">
            You can choose differently for a heading or a single service below.
          </Text>
          <CalendarChips calendars={calendars} selectedIds={calendarIds} onChange={onCalendarIds} disabled={locked} />
          {calendarIds.length === 0 ? (
            <Text variant="bodySmall" color={colors.warning}>
              With no calendar ticked, clients cannot book these services until you link them to one.
            </Text>
          ) : null}
        </View>
      ) : calendars.length === 1 ? (
        <Text variant="bodySmall" tone="secondary">{`Clients will book these with ${calendars[0]!.name}.`}</Text>
      ) : (
        <Text variant="bodySmall" color={colors.warning}>
          You have no team calendars yet. Services you add will not be bookable until you link them to a calendar.
        </Text>
      )}

      <View style={styles.stackXs}>
        <Text variant="label" tone="secondary">
          Buffer after each appointment
        </Text>
        <View style={styles.chips} pointerEvents={locked ? 'none' : 'auto'}>
          {BUFFER_CHOICES.map((m) => (
            <Chip
              key={m}
              label={m === 0 ? 'No buffer' : `${m} minutes`}
              selected={defaults.bufferMinutes === m}
              onPress={() => onDefaults({ ...defaults, bufferMinutes: m })}
            />
          ))}
        </View>
        <Text variant="caption" tone="muted">
          Time kept free after each booking, for clearing up.
        </Text>
      </View>

      <View style={styles.stackXs}>
        <Text variant="label" tone="secondary">
          Online payment
        </Text>
        {stripeConnected ? (
          <>
            {PAYMENT_CHOICES.map((choice) => (
              <ChoiceRow
                key={choice.kind}
                selected={payment.kind === choice.kind}
                title={choice.title}
                disabled={locked}
                onPress={() => choosePayment(choice.kind)}
              />
            ))}
            {payment.kind === 'deposit_fixed' ? (
              <Input
                accessibilityLabel="Deposit amount"
                keyboardType="decimal-pad"
                placeholder="10"
                value={payment.amount}
                editable={!locked}
                leftIcon={<Text tone="muted">{currencySymbol}</Text>}
                containerStyle={styles.amount}
                onChangeText={(v) => setPayment({ kind: 'deposit_fixed', amount: v })}
              />
            ) : null}
            {payment.kind === 'deposit_percent' ? (
              <Input
                accessibilityLabel="Deposit percentage"
                keyboardType="number-pad"
                value={payment.percent}
                editable={!locked}
                rightSlot={<Text tone="muted">%</Text>}
                containerStyle={styles.amount}
                onChangeText={(v) => setPayment({ kind: 'deposit_percent', percent: v.replace(/[^\d]/g, '').slice(0, 3) })}
              />
            ) : null}
            {payment.kind !== 'none' && !paymentDefaultValid(payment) ? (
              <Text variant="caption" tone="danger">
                {payment.kind === 'deposit_fixed'
                  ? `Enter a deposit of at least ${currencySymbol}1.`
                  : 'Enter a percentage from 1 to 100.'}
              </Text>
            ) : payment.kind === 'deposit_percent' || payment.kind === 'full' ? (
              <Text variant="caption" tone="muted">
                Services without a price are added with no online payment.
              </Text>
            ) : null}
          </>
        ) : (
          <Text variant="bodySmall" tone="secondary">
            To take deposits online, finish connecting Stripe on the web dashboard, under Settings, Payments. You can add
            deposits to any service afterwards.
          </Text>
        )}
      </View>

      {collectiveHost ? (
        <ChoiceRow
          kind="checkbox"
          selected={addToCollective}
          title={`Also put them on the ${collectiveHost.name} booking page`}
          disabled={locked}
          onPress={() => onAddToCollective(!addToCollective)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  stackXs: {
    gap: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  amount: {
    maxWidth: 180,
  },
});
