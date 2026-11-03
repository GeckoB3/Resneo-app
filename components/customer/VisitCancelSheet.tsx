import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useCancelVisit, useVisitCancelPreview } from '@/lib/queries/useCustomerVisit';
import { spacing } from '@/theme/index';

type Props = {
  bookingId: string;
  visible: boolean;
  onClose: () => void;
  /** Everything was cancelled; `message` says so and what happens to the client's money. */
  onCancelled: (message: string) => void;
};

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Cancel the whole visit, with what it costs said first (web split-visit plan 6.7; G25).
 *
 * The preview is worked out on the server for this moment: every live service, grouped by
 * business, with what each business refunds or keeps and why. The client reads it before the
 * cancel button does anything; the button stays off until the preview says the visit can be
 * cancelled. On confirm every live service at every business is cancelled, refunds first, and a
 * refund that fails at the first business cancels nothing (the server's own sentence says so).
 *
 * Mirrors the web's cancel dialog in `GuestVisitPanel.tsx`. Mounted afresh each time it opens.
 */
export function VisitCancelSheet({ bookingId, visible, onClose, onCancelled }: Props) {
  const preview = useVisitCancelPreview(bookingId, visible);
  const cancel = useCancelVisit(bookingId);
  const [error, setError] = useState<string | null>(null);
  const data = preview.data;
  const many = (data?.businesses.length ?? 0) > 1;

  const confirm = () => {
    if (!data?.can_cancel) return;
    setError(null);
    cancel.mutate(undefined, {
      onSuccess: (result) => {
        const lead = result?.card_hold_message ?? result?.message ?? 'Your visit is cancelled.';
        onCancelled([lead, result?.refund_message].filter(Boolean).join(' '));
      },
      onError: (e) => setError(messageOf(e, 'We could not cancel your visit. Please try again.')),
    });
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.body} testID="visit-cancel-sheet">
        <Text variant="subheading">Cancel your visit?</Text>
        <Text variant="bodySmall" tone="secondary">
          This cancels every service in your visit and cannot be undone.
        </Text>

        <View testID="visit-cancel-preview" style={styles.preview}>
          {preview.isLoading ? (
            <LoadingState message="Working out what cancelling would mean…" />
          ) : preview.isError ? (
            <Text variant="bodySmall">
              {messageOf(preview.error, 'We could not work out what cancelling would mean. Please try again.')}
            </Text>
          ) : data && !data.can_cancel ? (
            <Text variant="bodySmall">{data.message ?? 'Your visit cannot be cancelled online.'}</Text>
          ) : data ? (
            data.businesses.map((business) => (
              <View key={business.venue_id} style={styles.business}>
                {many ? <Text variant="bodyMedium">{business.name}</Text> : null}
                {business.services.map((s) => (
                  <Text key={s.booking_id} variant="bodySmall">
                    {s.booking_time.slice(0, 5)} {s.service_name}
                  </Text>
                ))}
                <Text variant="bodySmall" tone="secondary">
                  {business.summary ?? 'Nothing has been paid, so there is nothing to refund.'}
                </Text>
              </View>
            ))
          ) : null}
        </View>

        {error ? (
          <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            label="Yes, cancel my visit"
            variant="danger"
            loading={cancel.isPending}
            disabled={!data?.can_cancel}
            onPress={confirm}
          />
          <Button label="Keep my visit" variant="secondary" disabled={cancel.isPending} onPress={onClose} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, padding: spacing.base },
  preview: { gap: spacing.md },
  business: { gap: 2 },
  actions: { gap: spacing.sm },
});
