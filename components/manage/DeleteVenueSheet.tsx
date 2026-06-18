import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticError, hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useCancelVenueDeletion,
  useRequestVenueDeletion,
  useVenueDeletionStatus,
} from '@/lib/queries/useVenueDeletion';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type DeleteVenueSheetProps = {
  visible: boolean;
  /** Venue name to type-to-confirm against (fallback when the GET hasn't resolved). */
  venueName: string;
  onClose: () => void;
};

/** "30 Jun 2026" from an ISO timestamp (date portion only). */
function formatScheduledDate(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso.slice(0, 10);
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Danger-zone "Delete this venue" flow — the mobile equivalent of the web
 * `DeleteVenueSection`. Three states drive the body:
 *   - loading  → the GET /api/venue/delete-request status is in flight,
 *   - scheduled → a deletion is already scheduled (show date + cancel),
 *   - request  → the armed type-the-venue-name-to-confirm form.
 *
 * Admin-only (the caller gates on role). NO `Alert.alert` — the destructive
 * action is armed by typing the exact venue name, mirroring the web confirm.
 */
export function DeleteVenueSheet({ visible, venueName, onClose }: DeleteVenueSheetProps) {
  const { colors } = useTheme();

  // Only fetch the live state while the sheet is open (admin-only route).
  const statusQuery = useVenueDeletionStatus(visible);
  const requestMutation = useRequestVenueDeletion();
  const cancelMutation = useCancelVenueDeletion();

  const [confirmation, setConfirmation] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  );

  // Reset transient form state each time the sheet (re)opens.
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setConfirmation('');
      setFeedback(null);
    }
  }

  function handleClose() {
    setConfirmation('');
    setFeedback(null);
    onClose();
  }

  // Prefer the server's canonical name; fall back to the prop while it loads.
  const resolvedName = statusQuery.data?.venue_name?.trim() || venueName.trim();
  const scheduledAt = statusQuery.data?.deletion_scheduled_at ?? null;
  const loaded = statusQuery.isSuccess || statusQuery.isError;

  // Case-insensitive exact match, mirroring the web + server check.
  const confirmMatches =
    confirmation.trim().length > 0 &&
    confirmation.trim().toLowerCase() === resolvedName.toLowerCase();

  async function handleRequest() {
    if (!confirmMatches) return;
    hapticWarning();
    setFeedback(null);
    try {
      const res = await requestMutation.mutateAsync(confirmation.trim());
      hapticSuccess();
      setConfirmation('');
      setFeedback({
        tone: 'success',
        text:
          res.note ??
          'Deletion scheduled. You can cancel any time before the date shown above.',
      });
    } catch (err) {
      hapticError();
      setFeedback({
        tone: 'danger',
        text: err instanceof ApiError ? err.message : 'Could not schedule deletion. Try again.',
      });
    }
  }

  async function handleCancel() {
    setFeedback(null);
    try {
      await cancelMutation.mutateAsync();
      hapticSuccess();
      setFeedback({
        tone: 'success',
        text: 'Scheduled deletion cancelled. Your venue and subscription continue as normal.',
      });
    } catch (err) {
      hapticError();
      setFeedback({
        tone: 'danger',
        text: err instanceof ApiError ? err.message : 'Could not cancel deletion. Try again.',
      });
    }
  }

  const busy = requestMutation.isPending || cancelMutation.isPending;

  return (
    <Sheet visible={visible} onClose={handleClose} maxHeight="90%" fill>
      <View style={styles.header}>
        <Text variant="overline" tone="danger">
          Danger zone
        </Text>
        <Text variant="subheading">Delete this venue</Text>
        <Text variant="caption" tone="muted">
          Permanently removes this venue and all of its data: bookings, contacts, staff, services,
          uploaded files, and linked-account connections. This cannot be undone once the grace
          period ends.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.dangerBox,
            { backgroundColor: colors.dangerSurface, borderColor: colors.danger },
          ]}>
          {!loaded ? (
            <Text variant="bodySmall" tone="muted">
              Loading…
            </Text>
          ) : scheduledAt ? (
            // ----- Scheduled state -----
            <View style={styles.section}>
              <View style={styles.scheduledRow}>
                <Badge label="Deletion scheduled" tone="danger" />
                <Text variant="bodySmall" style={styles.scheduledText}>
                  Permanent deletion on{' '}
                  <Text variant="bodySmall" style={styles.bold}>
                    {formatScheduledDate(scheduledAt)}
                  </Text>
                  .
                </Text>
              </View>
              <Text variant="caption" tone="secondary">
                You can cancel any time before then. Your subscription was set to cancel at the end
                of the billing period; cancelling deletion restores it.
              </Text>
              {feedback ? (
                <Text variant="bodySmall" tone={feedback.tone}>
                  {feedback.text}
                </Text>
              ) : null}
              <Button
                label={cancelMutation.isPending ? 'Working…' : 'Cancel scheduled deletion'}
                variant="secondary"
                fullWidth
                loading={cancelMutation.isPending}
                disabled={busy}
                onPress={() => void handleCancel()}
              />
            </View>
          ) : (
            // ----- Request form (armed type-to-confirm) -----
            <View style={styles.section}>
              <Text variant="bodySmall" tone="secondary">
                Requests a{' '}
                <Text variant="bodySmall" style={styles.bold}>
                  30-day grace period
                </Text>
                , after which this venue and all of its data are permanently erased and any linked
                venues are notified. Your subscription is set to cancel at the end of the current
                billing period.
              </Text>
              <Input
                label={`Type the venue name "${resolvedName}" to confirm`}
                value={confirmation}
                onChangeText={(v) => {
                  setConfirmation(v);
                  if (feedback) setFeedback(null);
                }}
                placeholder={resolvedName}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
              />
              {feedback ? (
                <Text variant="bodySmall" tone={feedback.tone}>
                  {feedback.text}
                </Text>
              ) : null}
              <Button
                label={requestMutation.isPending ? 'Scheduling…' : 'Schedule venue deletion'}
                variant="danger"
                fullWidth
                loading={requestMutation.isPending}
                disabled={busy || !confirmMatches}
                onPress={() => void handleRequest()}
              />
            </View>
          )}
        </View>

        <Button label="Keep my venue" variant="ghost" fullWidth onPress={handleClose} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.xxs,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },
  dangerBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
  },
  section: {
    gap: spacing.md,
  },
  scheduledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  scheduledText: {
    flexShrink: 1,
  },
  bold: {
    fontWeight: '700',
  },
});
