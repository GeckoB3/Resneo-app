import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { VisitCancelSheet } from '@/components/customer/VisitCancelSheet';
import { VisitChangeSheet } from '@/components/customer/VisitChangeSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { customerBookingState } from '@/lib/booking/customer-booking-state';
import { visitActionBookingId } from '@/lib/booking/customer-visit-list';
import { useConfirmVisit, type CustomerVisit } from '@/lib/queries/useCustomerVisit';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

type Props = {
  /** The row the screen was opened on, which may be a service the business has cancelled. */
  bookingId: string;
  visit: CustomerVisit;
};

/**
 * What the client can do about their whole visit (web split-visit plan 6.5 to 6.7; G1, G3, G25):
 * "I'm coming" confirms every service, the change moves every service together, and the cancel
 * cancels every service after showing what each business refunds.
 *
 * Each action shows only when the server says it is available. When it is not, the server's own
 * sentence says why and whom to call ("Your visit has started, so it can't be changed online.
 * Please speak to The Beauty Parlour."), rather than a button that would only fail. The single
 * service change is never offered here: the server refuses it for a visit (409 `part_of_visit`).
 */
export function VisitActions({ bookingId, visit }: Props) {
  const toast = useToast();
  // Sent through a live service: the server refuses cancel and confirm through a cancelled one.
  const actionId = visitActionBookingId(visit, bookingId);
  const confirm = useConfirmVisit(actionId);
  const [notice, setNotice] = useState<string | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // Bumped on each open, so each sheet mounts afresh with nothing left over from last time.
  const [sheetKey, setSheetKey] = useState(0);

  const upcoming = visit.state === 'live' && visit.services.some((s) => customerBookingState(s.status) === 'live');

  return (
    <>
      {notice ? (
        <Card testID="visit-notice">
          <Text variant="body" accessibilityRole="alert">
            {notice}
          </Text>
        </Card>
      ) : null}

      {upcoming ? (
        <Card>
          <Text variant="overline" tone="secondary">
            MANAGE YOUR VISIT
          </Text>

          {visit.confirm.available ? (
            <Button
              label="I'm coming"
              variant="secondary"
              loading={confirm.isPending}
              onPress={() => {
                confirm.mutate(undefined, {
                  onSuccess: (result) =>
                    toast.success(result?.message || 'Thanks, your visit is confirmed.'),
                  onError: (e) =>
                    toast.error(e instanceof Error && e.message ? e.message : 'We could not confirm. Please try again.'),
                });
              }}
              style={styles.gap}
            />
          ) : visit.confirm.confirmed ? (
            <Text variant="bodySmall" tone="secondary" style={styles.gap}>
              Your visit is confirmed.
            </Text>
          ) : null}

          {visit.change.available ? (
            <Button
              label="Change date or time"
              variant="secondary"
              onPress={() => {
                setNotice(null);
                setSheetKey((k) => k + 1);
                setChangeOpen(true);
              }}
              style={styles.gap}
            />
          ) : visit.change.message ? (
            <Text variant="bodySmall" tone="secondary" style={styles.gap} testID="visit-change-blocked">
              {visit.change.message}
            </Text>
          ) : null}

          {visit.cancel.available ? (
            <Button
              label="Cancel visit"
              variant="danger"
              onPress={() => {
                setNotice(null);
                setSheetKey((k) => k + 1);
                setCancelOpen(true);
              }}
              style={styles.gap}
            />
          ) : visit.cancel.message && visit.cancel.reason !== visit.change.reason ? (
            // The same reason blocks both more often than not; say it once.
            <Text variant="bodySmall" tone="secondary" style={styles.gap}>
              {visit.cancel.message}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <VisitChangeSheet
        key={`change-${sheetKey}`}
        bookingId={actionId}
        visit={visit}
        visible={changeOpen}
        onClose={() => setChangeOpen(false)}
        onMoved={(message) => {
          setChangeOpen(false);
          setNotice(message);
          toast.success(message);
        }}
      />
      <VisitCancelSheet
        key={`cancel-${sheetKey}`}
        bookingId={actionId}
        visible={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onCancelled={(message) => {
          setCancelOpen(false);
          setNotice(message);
          toast.success('Your visit is cancelled.');
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing.sm },
});
