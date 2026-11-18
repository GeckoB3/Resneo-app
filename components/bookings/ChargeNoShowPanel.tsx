/**
 * "Charge no-show fees" for a visit (web Docs/card-on-file-plan.md §4.10, §6.8, D19).
 *
 * Lists this business's services in the visit with a chargeable no-show fee, grouped by the card
 * that protects them (usually one), with how the card was found and the cardholder's name so staff
 * can check it is the right person. Each line can be lowered (never above its fee) or left out.
 * One button per card: "Charge £30", which charges only that card's lines. Never split across
 * businesses: the server lists only the caller's own.
 *
 * Drawn inside the deposit sheet (never a second stacked sheet). An older server without the visit
 * route answers 404; the panel then hands back to the sheet's single-booking charge.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ApiError, isApiErrorBody } from '@/lib/api/client';
import {
  CARD_HOLD_CHARGE_FEES_LABEL,
  cardChargeDoneLine,
  cardHoldChargeConfirmLabel,
  cardLabel,
} from '@/lib/booking/card-hold';
import { formatPence } from '@/lib/format';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useChargeNoShowFees,
  useNoShowCharges,
  type NoShowChargeGroup,
  type NoShowChargeLine,
  type NoShowChargeOutcome,
} from '@/lib/queries/useCardsOnFile';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** "25.00" from pence, for the amount fields. */
export function penceToMoneyInput(pence: number): string {
  return (pence / 100).toFixed(2);
}

/** Pence from an amount field ("25", "25.5", "£25.00"); null when not a usable number. */
export function moneyInputToPence(value: string): number | null {
  const trimmed = value.trim().replace(/^[£€]/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const pounds = Number(trimmed);
  if (!Number.isFinite(pounds)) return null;
  return Math.round(pounds * 100);
}

/** The heading of a card group: "Visa ending 4242", or where a card with no details came from. */
export function chargeGroupHeading(group: Pick<NoShowChargeGroup, 'kind' | 'brand' | 'last4'>): string {
  if (group.brand || group.last4) return cardLabel(group.brand, group.last4);
  if (group.kind === 'till_card') return 'Card saved at the till';
  if (group.kind === 'booking_customer') return 'Card saved for this booking';
  return 'Card on file';
}

/** The words for one charge's outcome (plan §6.8). */
export function chargeOutcomeText(outcome: NoShowChargeOutcome): { text: string; tone: 'success' | 'danger' | 'muted' } {
  if (outcome.status === 'succeeded') return { text: cardChargeDoneLine(outcome.amount_pence), tone: 'success' };
  if (outcome.status === 'pending') {
    return { text: 'The charge is being processed. Check back in a moment to see if it went through.', tone: 'muted' };
  }
  return {
    text: outcome.message ?? 'The bank declined the card. Send the client a payment link instead.',
    tone: 'danger',
  };
}

function lineTitle(line: NoShowChargeLine): string {
  const what = line.service_name?.trim() || 'Booking';
  return line.person_label?.trim() ? `${what} (${line.person_label.trim()})` : what;
}

function lineWhen(line: NoShowChargeLine): string {
  const time = (line.booking_time ?? '').slice(0, 5);
  return [line.booking_date, time].filter(Boolean).join(', ');
}

type LineChoice = { included: boolean; input: string };

export function ChargeNoShowPanel({
  visitId,
  bookingId,
  onUnavailable,
  onBack,
}: {
  /** The booking's `group_booking_id`, or its own id for a single booking. */
  visitId: string;
  bookingId: string;
  /** An older server without the visit route: use the single-booking charge instead. */
  onUnavailable: () => void;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const query = useNoShowCharges(visitId);
  const charge = useChargeNoShowFees(visitId, bookingId);
  const [choices, setChoices] = useState<Record<string, LineChoice>>({});
  const [outcomes, setOutcomes] = useState<Record<string, { text: string; tone: 'success' | 'danger' | 'muted' }>>({});
  const [chargingKey, setChargingKey] = useState<string | null>(null);

  const unavailable =
    query.error instanceof ApiError && query.error.status === 404 && !isApiErrorBody(query.error.body);
  useEffect(() => {
    if (unavailable) onUnavailable();
  }, [unavailable, onUnavailable]);

  const groups = useMemo(() => query.data?.groups ?? [], [query.data]);

  // Seed each chargeable line at its fee, included, once the groups arrive.
  useEffect(() => {
    if (groups.length === 0) return;
    setChoices((prev) => {
      const next = { ...prev };
      for (const group of groups) {
        for (const line of group.lines) {
          if (line.chargeable && !next[line.booking_id]) {
            next[line.booking_id] = { included: true, input: penceToMoneyInput(line.fee_pence) };
          }
        }
      }
      return next;
    });
  }, [groups]);

  function lineAmount(line: NoShowChargeLine): number | null {
    const choice = choices[line.booking_id];
    if (!choice || !choice.included) return 0;
    const pence = moneyInputToPence(choice.input);
    if (pence == null || pence < 1 || pence > line.fee_pence) return null;
    return pence;
  }

  async function chargeGroup(group: NoShowChargeGroup) {
    const lines = group.lines
      .filter((l) => l.chargeable && choices[l.booking_id]?.included)
      .map((l) => ({ booking_id: l.booking_id, amount_pence: lineAmount(l) ?? 0 }));
    if (lines.length === 0 || lines.some((l) => l.amount_pence < 1)) return;
    setChargingKey(group.key);
    try {
      const result = await charge.mutateAsync({ lines });
      const outcome = result.charges.find((c) => c.key === group.key) ?? result.charges[0];
      const skipped = result.skipped.map((s) => s.message).filter(Boolean);
      if (outcome) {
        const words = chargeOutcomeText(outcome);
        if (outcome.status === 'succeeded') hapticSuccess();
        else hapticWarning();
        setOutcomes((prev) => ({
          ...prev,
          [group.key]: { ...words, text: [words.text, ...skipped].join(' ') },
        }));
      } else {
        hapticWarning();
        setOutcomes((prev) => ({
          ...prev,
          [group.key]: { text: skipped.join(' ') || 'Nothing was charged.', tone: 'danger' },
        }));
      }
    } catch (e) {
      hapticWarning();
      setOutcomes((prev) => ({
        ...prev,
        [group.key]: { text: e instanceof Error ? e.message : 'The fee could not be charged. Please try again.', tone: 'danger' },
      }));
    } finally {
      setChargingKey(null);
    }
  }

  return (
    <View style={styles.body} testID="charge-no-show-panel">
      <View style={styles.header}>
        <Text variant="overline" tone="muted">
          Card
        </Text>
        <Text variant="title" accessibilityRole="header">
          {CARD_HOLD_CHARGE_FEES_LABEL}
        </Text>
        <Text variant="bodySmall" tone="muted">
          Each fee can be lowered or left out. You can charge up to the fee shown for each booking.
        </Text>
      </View>

      {query.isLoading ? (
        <Text variant="bodySmall" tone="muted">
          Loading the fees...
        </Text>
      ) : query.error && !unavailable ? (
        <View style={styles.stack}>
          <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
            {query.error instanceof Error ? query.error.message : 'The fees could not be loaded.'}
          </Text>
          <Button label="Try again" variant="secondary" onPress={() => void query.refetch()} fullWidth />
        </View>
      ) : null}

      {query.data && groups.length === 0 ? (
        <Text variant="bodySmall" tone="secondary">
          There are no no-show fees to charge for this visit.
        </Text>
      ) : null}

      {groups.map((group) => {
        const chargeable = group.lines.filter((l) => l.chargeable);
        const amounts = chargeable.map(lineAmount);
        const invalid = amounts.some((a) => a == null);
        const total = amounts.reduce<number>((sum, a) => sum + (a ?? 0), 0);
        const outcome = outcomes[group.key];
        const done = outcome?.tone === 'success';
        return (
          <View
            key={group.key}
            style={[styles.group, { borderColor: colors.border, backgroundColor: colors.surface }]}
            testID={`charge-group-${group.key}`}>
            <Text variant="bodyMedium">{chargeGroupHeading(group)}</Text>
            {group.cardholder_name ? (
              <Text variant="bodySmall" tone="secondary">{`Cardholder: ${group.cardholder_name}`}</Text>
            ) : null}
            {group.found_by_label ? (
              <Text variant="caption" tone="muted">{`${group.found_by_label}.`}</Text>
            ) : null}

            {group.lines.map((line) => {
              const choice = choices[line.booking_id];
              const amount = lineAmount(line);
              return (
                <View key={line.booking_id} style={styles.line}>
                  <View style={styles.lineHead}>
                    <View style={styles.lineText}>
                      <Text variant="bodySmall">{lineTitle(line)}</Text>
                      <Text variant="caption" tone="muted">
                        {`${lineWhen(line)}. Fee up to ${formatPence(line.fee_pence, line.currency) ?? ''}.`}
                      </Text>
                    </View>
                    {line.chargeable ? (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: choice?.included ?? true }}
                        accessibilityLabel={`Charge ${lineTitle(line)}`}
                        hitSlop={8}
                        disabled={done || chargingKey !== null}
                        onPress={() => {
                          hapticSelect();
                          setChoices((prev) => ({
                            ...prev,
                            [line.booking_id]: {
                              included: !(prev[line.booking_id]?.included ?? true),
                              input: prev[line.booking_id]?.input ?? penceToMoneyInput(line.fee_pence),
                            },
                          }));
                        }}
                        style={[styles.toggle, { borderColor: colors.border }]}>
                        <Text variant="caption">{choice?.included === false ? 'Left out' : 'Included'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {line.chargeable && choice?.included !== false ? (
                    <Input
                      label={`Amount for ${lineTitle(line)}`}
                      value={choice?.input ?? penceToMoneyInput(line.fee_pence)}
                      onChangeText={(text) =>
                        setChoices((prev) => ({ ...prev, [line.booking_id]: { included: true, input: text } }))
                      }
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      editable={!done && chargingKey === null}
                      error={
                        amount == null
                          ? `Enter an amount up to ${formatPence(line.fee_pence, line.currency) ?? ''}.`
                          : undefined
                      }
                    />
                  ) : null}
                  {!line.chargeable && line.refusal_message ? (
                    <Text variant="caption" tone="muted">
                      {line.refusal_message}
                    </Text>
                  ) : null}
                </View>
              );
            })}

            {outcome ? (
              <Text
                variant="bodySmall"
                tone={outcome.tone}
                accessibilityLiveRegion="polite"
                testID={`charge-outcome-${group.key}`}>
                {outcome.text}
              </Text>
            ) : null}

            {chargeable.length > 0 && !done ? (
              <Button
                label={cardHoldChargeConfirmLabel(total)}
                variant="danger"
                onPress={() => void chargeGroup(group)}
                loading={chargingKey === group.key}
                disabled={chargingKey !== null || invalid || total < 1}
                fullWidth
              />
            ) : null}
          </View>
        );
      })}

      {query.data && query.data.unchargeable.length > 0 ? (
        <View style={styles.stack}>
          <Text variant="bodySmall" tone="secondary">
            These cannot be charged:
          </Text>
          {query.data.unchargeable.map((line) => (
            <Text key={line.booking_id} variant="caption" tone="muted">
              {`${lineTitle(line)}: ${line.refusal_message ?? 'This booking cannot be charged.'}`}
            </Text>
          ))}
        </View>
      ) : null}

      <Button label="Back" variant="secondary" onPress={onBack} disabled={chargingKey !== null} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  header: { gap: spacing.xs },
  stack: { gap: spacing.sm },
  group: { gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.base },
  line: { gap: spacing.xs },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineText: { flex: 1, minWidth: 0 },
  toggle: {
    minHeight: 44,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
  },
});
