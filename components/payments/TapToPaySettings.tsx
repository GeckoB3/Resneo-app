import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MoreRow } from '@/components/more/MoreRow';
import { TapToPayEducationSheet } from '@/components/payments/TapToPayEducation';
import { TapToPayProgress } from '@/components/payments/TapToPayProgress';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { TAP_TO_PAY_ON_IPHONE, TAP_TO_PAY_SYMBOL } from '@/lib/payments/tap-to-pay-copy';
import { TAP_TO_PAY_UPDATE_IOS_MESSAGE } from '@/lib/payments/tap-to-pay-errors';
import { TILE } from '@/lib/navigation/more-destinations';
import { useTapToPay } from '@/providers/TapToPayProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Settings → Tap to Pay on iPhone.
 *
 * The place Apple requires to turn Tap to Pay on outside a payment (checklist
 * 3.5, 3.6), with only an admin able to accept Apple's terms and everyone else
 * told to ask one (3.8, 3.8.1), the configuration progress while it sets up
 * (3.9.1), an invitation to try it once it is on (3.9), and the merchant
 * education to come back to at any time (4.3).
 *
 * Rendered only where `useTapToPay().applies`: iOS, an entitled build, and a
 * venue ready for card payments.
 */
export function TapToPaySettings() {
  const { colors } = useTheme();
  const tapToPay = useTapToPay();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [justTurnedOn, setJustTurnedOn] = useState(false);
  const [educationOpen, setEducationOpen] = useState(false);

  /** Apple's education where it exists (iOS 18+), else the app's own. */
  async function showEducation() {
    const shown = await tapToPay.showEducation();
    if (!shown) setEducationOpen(true);
  }

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await tapToPay.enable();
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setJustTurnedOn(true);
      // Education straight after the terms are accepted (4.2).
      if (result.acceptedTerms) await showEducation();
    } finally {
      setBusy(false);
    }
  }

  const unsupported = tapToPay.supported === false;
  const updateRequired = tapToPay.updateRequired;
  const ready = tapToPay.termsAccepted === true && !tapToPay.preparing;
  const needsAdmin = tapToPay.termsAccepted === false && !tapToPay.isAdmin;
  const canTurnOn =
    !unsupported && !updateRequired && !ready && !needsAdmin && !tapToPay.preparing;
  // The update message below already says everything the error would.
  const error = updateRequired ? null : (message ?? tapToPay.error);

  return (
    <>
      <View style={styles.block}>
        {updateRequired ? (
          <Text variant="bodySmall" color={colors.warning}>
            {TAP_TO_PAY_UPDATE_IOS_MESSAGE}
          </Text>
        ) : unsupported ? (
          <Text variant="bodySmall" tone="muted">
            {`This iPhone can't use ${TAP_TO_PAY_ON_IPHONE}. It needs an iPhone XS or later.`}
          </Text>
        ) : tapToPay.preparing ? (
          <TapToPayProgress progress={tapToPay.progress} />
        ) : ready ? (
          <>
            <Text variant="bodyMedium">{`${TAP_TO_PAY_ON_IPHONE} is on`}</Text>
            <Text variant="bodySmall" tone="muted">
              Take contactless cards, Apple Pay and other digital wallets on this iPhone. No card
              reader needed.
            </Text>
            {justTurnedOn ? (
              <Text variant="bodySmall" color={colors.success}>
                {`You're ready to try it. Open an appointment, tap Take payment, then ${TAP_TO_PAY_ON_IPHONE}.`}
              </Text>
            ) : null}
          </>
        ) : needsAdmin ? (
          <Text variant="bodySmall" tone="muted">
            {`${TAP_TO_PAY_ON_IPHONE} is not turned on for your venue yet. Ask an admin to turn it on here. Only an admin can accept Apple's terms.`}
          </Text>
        ) : (
          <Text variant="bodySmall" tone="muted">
            Take contactless cards, Apple Pay and other digital wallets on this iPhone. No card
            reader needed.
          </Text>
        )}

        {error && !tapToPay.preparing ? (
          <Text variant="bodySmall" tone="danger">
            {error}
          </Text>
        ) : null}

        {canTurnOn ? (
          <Button
            label={`Set up ${TAP_TO_PAY_ON_IPHONE}`}
            loading={busy}
            disabled={busy}
            onPress={() => void turnOn()}
            fullWidth
          />
        ) : null}
      </View>

      {!unsupported ? (
        <MoreRow
          icon={TAP_TO_PAY_SYMBOL}
          tile={TILE.teal}
          label={`How to use ${TAP_TO_PAY_ON_IPHONE}`}
          hint="Cards, Apple Pay, PIN entry and what to do if a card can't be read"
          onPress={() => void showEducation()}
        />
      ) : null}

      <TapToPayEducationSheet
        visible={educationOpen}
        onClose={() => setEducationOpen(false)}
        action={
          canTurnOn ? (
            <Button
              label={`Set up ${TAP_TO_PAY_ON_IPHONE}`}
              loading={busy}
              disabled={busy}
              onPress={() => {
                setEducationOpen(false);
                void turnOn();
              }}
              fullWidth
            />
          ) : null
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
    padding: spacing.base,
  },
});
