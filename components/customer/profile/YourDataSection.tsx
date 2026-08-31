import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { useAccountExport } from '@/lib/queries/useAccountExport';
import {
  useAccountDeletionStatus,
  useCancelAccountDeletion,
  useRequestAccountDeletion,
} from '@/lib/queries/useAccountDeletion';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/**
 * Take your data, or close the account.
 *
 * The deletion hooks are the ones the staff app already uses; the routes are
 * about a USER, not about a venue, so a customer closing their account is the
 * same operation. Reusing them keeps one implementation of something that must
 * behave identically on both sides.
 *
 * Export sits beside deletion on purpose. Somebody about to delete an account
 * is exactly the person who should be offered their data first, and separating
 * the two would make taking a copy something you had to think of yourself.
 */
export function YourDataSection() {
  const toast = useToast();
  const exportData = useAccountExport();
  const status = useAccountDeletionStatus();
  const requestDeletion = useRequestAccountDeletion();
  const cancelDeletion = useCancelAccountDeletion();
  const [confirming, setConfirming] = useState(false);

  const scheduledAt = status.data?.deletion_scheduled_at ?? null;

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        YOUR DATA
      </Text>

      <Button
        label="Download a copy of my data"
        variant="secondary"
        loading={exportData.isPending}
        onPress={() =>
          exportData.mutate(undefined, {
            onSuccess: (result) => {
              // The share sheet closing without a choice is not a failure, so
              // only a real problem is reported.
              if (!result.ok) toast.error(result.message);
            },
            onError: () => toast.error('Could not prepare your data. Please try again.'),
          })
        }
        style={styles.gap}
      />
      <Text variant="caption" tone="muted" style={styles.gap}>
        A JSON file with your bookings, payments and preferences. You choose where to save it.
      </Text>

      <View style={styles.divider} />

      {scheduledAt ? (
        <>
          <Text variant="bodySmall">
            Your account is scheduled for deletion. You can still change your mind.
          </Text>
          <Button
            label="Keep my account"
            variant="secondary"
            loading={cancelDeletion.isPending}
            onPress={() =>
              cancelDeletion.mutate(undefined, {
                onSuccess: () => {
                  void status.refetch();
                  toast.success('Your account will not be deleted.');
                },
                onError: () => toast.error('Could not cancel that. Please try again.'),
              })
            }
            style={styles.gap}
          />
        </>
      ) : (
        <Button
          label="Delete my account"
          variant="danger"
          onPress={() => setConfirming(true)}
        />
      )}

      <ConfirmSheet
        visible={confirming}
        title="Delete your account?"
        /*
          Says what survives, because it is not nothing. A venue keeps its own
          booking records for its own accounting and legal reasons, and somebody
          who reads "delete" as "erase every trace" and later finds a venue
          still holds a record has been misled by this dialog.
        */
        message="Your ResNeo account and your access to it are removed. Venues keep their own records of bookings you made with them, which they need for their accounts. Nothing happens immediately, and you can change your mind here until it does."
        confirmLabel="Delete my account"
        cancelLabel="Keep it"
        loading={requestDeletion.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          requestDeletion.mutate(undefined, {
            onSuccess: () => {
              void status.refetch();
              toast.success('Your account is scheduled for deletion.');
            },
            onError: () => toast.error('Could not start that. Please try again.'),
          });
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing.sm },
  divider: { marginTop: spacing.base },
});
