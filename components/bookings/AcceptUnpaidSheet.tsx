import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  ACCEPT_UNPAID_EXPLAINER,
  ACCEPT_UNPAID_TITLE,
  acceptUnpaidBodyCopy,
  depositUnpaid409,
  type DepositUnpaidInfo,
} from '@/lib/booking/accept-unpaid';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useSendDepositPaymentLinkById } from '@/lib/queries/useBookingMutations';
import { spacing } from '@/theme/index';

type AcceptUnpaidSheetProps = {
  info: DepositUnpaidInfo | null;
  busy: boolean;
  linkSent: boolean;
  linkError: string | null;
  onSendLink: () => void;
  onAccept: () => void;
  onClose: () => void;
};

/**
 * The three ways out of an unpaid promotion, mirroring the web
 * `AcceptUnpaidBookingDialog`: chase the money, accept the booking anyway (the
 * deposit stays collectable), or back out.
 */
export function AcceptUnpaidSheet({
  info,
  busy,
  linkSent,
  linkError,
  onSendLink,
  onAccept,
  onClose,
}: AcceptUnpaidSheetProps) {
  return (
    <Sheet visible={!!info} onClose={onClose}>
      <View style={styles.body}>
        <View style={styles.headerBlock}>
          <Text variant="overline" tone="muted">
            Deposit
          </Text>
          <Text variant="title">{ACCEPT_UNPAID_TITLE}</Text>
          <Text variant="bodySmall" tone="muted">
            {info
              ? acceptUnpaidBodyCopy(info)
              : 'The payment for this booking has not been completed yet.'}
          </Text>
        </View>

        <Text variant="bodySmall" tone="secondary">
          {ACCEPT_UNPAID_EXPLAINER}
        </Text>

        {linkSent ? (
          <Text variant="bodySmall" tone="success">
            Payment link sent to the customer.
          </Text>
        ) : null}
        {linkError ? (
          <Text variant="bodySmall" tone="danger">
            {linkError}
          </Text>
        ) : null}

        <View style={styles.buttons}>
          <Button
            label="Send payment link"
            onPress={onSendLink}
            loading={busy}
            disabled={busy || linkSent}
            fullWidth
          />
          <Button
            label="Accept without payment"
            variant="secondary"
            onPress={onAccept}
            disabled={busy}
            fullWidth
          />
          <Button label="Go back" variant="ghost" onPress={onClose} disabled={busy} fullWidth />
        </View>
      </View>
    </Sheet>
  );
}

/**
 * Owns the guard sheet for a booking surface. Wire it around any staff status or
 * attendance PATCH that can promote a `Pending` booking:
 *
 * ```ts
 * const guard = useAcceptUnpaidGuard();
 * // in the mutation's onError:
 * if (guard.intercept(booking.id, error, () => run({ accept_unpaid: true }))) return;
 * toast.error(…);
 * // in the JSX:
 * {guard.sheet}
 * ```
 *
 * `retry` must re-run the SAME PATCH with `accept_unpaid: true` — the server
 * treats the flag as an acknowledgement of that specific promotion, not a
 * standing permission.
 */
export function useAcceptUnpaidGuard(): {
  /** True when the error was the guard 409 and the sheet has taken over. */
  intercept: (bookingId: string, error: unknown, retry: () => void) => boolean;
  sheet: ReactNode;
} {
  const [state, setState] = useState<{
    bookingId: string;
    info: DepositUnpaidInfo;
    retry: () => void;
  } | null>(null);
  const [linkSent, setLinkSent] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const sendLink = useSendDepositPaymentLinkById();

  const close = useCallback(() => {
    setState(null);
    setLinkSent(false);
    setLinkError(null);
  }, []);

  const intercept = useCallback(
    (bookingId: string, error: unknown, retry: () => void): boolean => {
      const info = depositUnpaid409(error);
      if (!info) return false;
      hapticWarning();
      setLinkSent(false);
      setLinkError(null);
      setState({ bookingId, info, retry });
      return true;
    },
    [],
  );

  const handleSendLink = useCallback(() => {
    const bookingId = state?.bookingId;
    if (!bookingId) return;
    setLinkError(null);
    sendLink.mutate(
      { bookingId },
      {
        onSuccess: () => {
          hapticSuccess();
          setLinkSent(true);
        },
        onError: (error) => {
          hapticWarning();
          setLinkError(
            error instanceof ApiError
              ? error.message
              : 'Could not send the payment link. Please try again.',
          );
        },
      },
    );
  }, [sendLink, state?.bookingId]);

  const handleAccept = useCallback(() => {
    const retry = state?.retry;
    // Close first: the retry re-enters the same onError path on a second
    // failure, and a live sheet would otherwise swallow the new state.
    close();
    retry?.();
  }, [state, close]);

  const sheet = (
    <AcceptUnpaidSheet
      info={state?.info ?? null}
      busy={sendLink.isPending}
      linkSent={linkSent}
      linkError={linkError}
      onSendLink={handleSendLink}
      onAccept={handleAccept}
      onClose={close}
    />
  );

  return { intercept, sheet };
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  buttons: {
    gap: spacing.sm,
  },
});
