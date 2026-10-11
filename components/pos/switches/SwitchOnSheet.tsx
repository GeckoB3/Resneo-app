import { useQueryClient } from '@tanstack/react-query';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorLine, PosSheet } from '@/components/pos/parts';
import { TickRow } from '@/components/pos/switches/parts';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { readSwitchRefusal, switchKeepsRequestId } from '@/lib/pos/switches/api';
import { swT } from '@/lib/pos/switches/copy';
import { alsoCheckoutLine, needsSellerTick, switchOnSteps, switchRefusalSentence } from '@/lib/pos/switches/model';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { applySwitchResult, useSetFeatureSwitch } from '@/lib/queries/useFeatureSwitches';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosFeatureSwitchesResponse, PosSwitchExtraKey } from '@/types/pos-switches';

/**
 * "Switch on Checkout for {venue}?" (design section 14 step 3, drawn as C2): what changes, the
 * line that Checkout comes with the first extra ticked (SW4), the line about loyalty cards when
 * ticked, and the seller's tick box at the venue's first switch-on only (SW8), which "Switch on and
 * set up" waits for. The same words and calls as the web's `SwitchOnDialog`.
 *
 * The calls run in order (`switchOnSteps`): Checkout, or the first extra with `also_checkout`, then
 * any other extras. Nothing is applied to the app until the last answer, so the screen behind does
 * not change under the sheet; then the venue is updated at once and `onDone` takes the admin on.
 * An extra that fails after Checkout is on is named, not hidden.
 */
export function SwitchOnSheet(props: SwitchOnSheetProps) {
  // Mounted only while open, so every opening starts from a clean form.
  return props.visible ? <SwitchOnSheetBody {...props} /> : null;
}

interface SwitchOnSheetProps {
  visible: boolean;
  onClose: () => void;
  venueName: string;
  /** The switches as last read: versions, and whether the seller's tick was given before. */
  switches: PosFeatureSwitchesResponse;
  ticked: readonly PosSwitchExtraKey[];
  /** Checkout is on; `missed` names extras that did not come on. */
  onDone: (result: { missed: PosSwitchExtraKey[] }) => void;
}

function SwitchOnSheetBody({ visible, onClose, venueName, switches, ticked, onDone }: SwitchOnSheetProps) {
  const { colors } = useTheme();
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const set = useSetFeatureSwitch({ deferApply: true });
  const [seller, setSeller] = useState(false);
  const [askSeller, setAskSeller] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One request id per call in the sequence, kept for a retry only when the answer was lost.
  const requestIds = useRef<Record<string, string>>({});

  const tickNeeded = needsSellerTick(switches) || askSeller;
  const venue = venueName || 'your business';

  async function confirm() {
    if (tickNeeded && !seller) {
      setError(swT('sw.on.ackNeeded'));
      return;
    }
    setBusy(true);
    setError(null);
    let current = switches;
    const missed: PosSwitchExtraKey[] = [];
    const steps = switchOnSteps(ticked);
    for (const [index, step] of steps.entries()) {
      // An extra already on (another admin, a moment ago) needs no call.
      if (index > 0 && current.switches[step.feature]?.effective) continue;
      const idKey = `${index}:${step.feature}`;
      const requestId = requestIds.current[idKey] ?? newPaymentAttemptId();
      requestIds.current[idKey] = requestId;
      try {
        const result = await set.mutateAsync({
          feature: step.feature,
          on: true,
          ...(step.alsoCheckout ? { also_checkout: true } : {}),
          ...(index === 0 && tickNeeded ? { acknowledge_terms_version: current.terms_version } : {}),
          client_request_id: requestId,
          version: current.switches[step.feature]?.version ?? 0,
        });
        delete requestIds.current[idKey];
        if (result?.switches) current = result.switches;
      } catch (e) {
        if (!switchKeepsRequestId(e)) delete requestIds.current[idKey];
        if (index === 0) {
          // Checkout did not come on: say why, and keep the sheet.
          const refusal = readSwitchRefusal(e);
          if (refusal.kind === 'needs_ack' && refusal.needs.includes('terms')) {
            setAskSeller(true);
            setSeller(false);
          }
          setError(switchRefusalSentence(refusal, venue) ?? swT('sw.error.save'));
          setBusy(false);
          return;
        }
        // Checkout is on; this extra can be switched on from Checkout settings.
        if (step.feature !== 'pos_enabled') missed.push(step.feature);
      }
    }
    setBusy(false);
    requestIds.current = {};
    // The venue moves now, so the Checkout tiles appear at once; then on to Checkout settings.
    applySwitchResult(queryClient, accessToken, current);
    onDone({ missed });
  }

  const footer = (
    <View style={styles.footer}>
      {error ? <ErrorLine message={error} /> : null}
      <Button
        label={swT('sw.on.confirm')}
        onPress={() => void confirm()}
        loading={busy}
        disabled={busy || (tickNeeded && !seller)}
        fullWidth
      />
      <Button label={swT('sw.on.cancel')} variant="ghost" onPress={onClose} disabled={busy} fullWidth />
    </View>
  );

  const changes = [
    swT('sw.on.change.menu'),
    swT('sw.on.change.team'),
    swT('sw.on.change.app'),
    swT('sw.on.change.clients'),
    ...(ticked.includes('pos_loyalty_enabled') ? [swT('sw.on.change.loyalty')] : []),
  ];
  const also = alsoCheckoutLine(ticked);

  return (
    <PosSheet visible={visible} onClose={busy ? () => undefined : onClose} title={swT('sw.on.title', { venue })} footer={footer}>
      <Text variant="bodySmall" tone="secondary">
        {swT('sw.on.changes')}
      </Text>
      <View style={styles.list}>
        {changes.map((line) => (
          <View key={line} style={styles.item}>
            <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor={colors.success} size={16} />
            <Text variant="bodySmall" style={styles.flex}>
              {line}
            </Text>
          </View>
        ))}
      </View>
      {also ? (
        <Text variant="bodySmall" tone="secondary">
          {also}
        </Text>
      ) : null}
      {tickNeeded ? (
        <TickRow title={swT('sw.on.ack', { venue })} checked={seller} onChange={setSeller} disabled={busy} plain />
      ) : null}
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  footer: { gap: spacing.sm, paddingBottom: spacing.sm },
});
