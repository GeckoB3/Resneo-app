import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError, apiErrorCode } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { fetchGuestGdprExport } from '@/lib/queries/useContactsBulk';
import { useEraseGuest } from '@/lib/queries/useGuestMutations';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useEraseHeldCounts } from '@/lib/queries/useTreatmentRecords';
import { TR_COPY } from '@/lib/treatment-records/copy';
import { accessRefusalMessage } from '@/lib/roles/roles';
import { useToast } from '@/providers/ToastProvider';
import { useViewerAccess } from '@/providers/ViewerAccessProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type GdprSectionProps = {
  guestId: string;
  guestName: string;
  /** Called after successful erasure — typically navigate back to the contacts list. */
  onErased: () => void;
  /** Drop the outer Card chrome (e.g. when nested inside a CollapsibleCard). */
  bare?: boolean;
};

/**
 * Admin-only GDPR card: data export (JSON share) + data erase (anonymise).
 * The export is offered only with "Can export client data" (web roles plan A2): an owner can switch
 * it off for an admin, and `gdpr/export-guest` then refuses with 403 EXPORT_NOT_ALLOWED.
 * The erase action is gated behind an in-sheet two-step confirmation — Alert.alert
 * is a no-op on react-native-web (the dev-preview path), so the old Alert-based
 * flow meant the erase button did nothing there.
 */
export function GdprSection({ guestId, guestName, onErased, bare = false }: GdprSectionProps) {
  const accessToken = useAccessToken();
  const eraseMutation = useEraseGuest();
  const toast = useToast();
  const { canExportClients } = useViewerAccess();
  const [exporting, setExporting] = useState(false);
  // 0 = closed, 1 = first confirm, 2 = final confirm.
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const { colors } = useTheme();
  // What erasing also removes (web plan TR17): the client's treatment records and alerts. With
  // either, the erase needs a reason, which the server keeps in its audit.
  const held = useEraseHeldCounts(guestId, confirmStep !== 0);
  const [reason, setReason] = useState('');
  // The server asked for a reason this sheet did not know was needed (records added meanwhile).
  const [reasonAsked, setReasonAsked] = useState(false);
  const records = held.data?.treatment_records ?? 0;
  const alerts = held.data?.client_alerts ?? 0;
  const needsReason = records > 0 || alerts > 0 || reasonAsked;

  async function handleExport() {
    if (!accessToken) return;
    setExporting(true);
    try {
      const data = await fetchGuestGdprExport(accessToken, guestId);
      const json = JSON.stringify(data, null, 2);
      await Share.share({
        title: `Data export for ${guestName}`,
        message: json,
      });
      hapticSuccess();
    } catch (e) {
      hapticWarning();
      toast.error(accessRefusalMessage(e) ?? (e instanceof ApiError ? e.message : 'Could not export data.'));
    } finally {
      setExporting(false);
    }
  }

  async function handleErase() {
    try {
      await eraseMutation.mutateAsync({ guestId, reason: reason.trim() || null });
      setConfirmStep(0);
      setReason('');
      // Feedback + navigation fire directly off the resolved mutation — never
      // from an Alert callback (which is a no-op on web).
      toast.success('Personal data anonymised. The booking record is retained.');
      onErased();
    } catch (e) {
      hapticWarning();
      if (apiErrorCode(e) === 'ERASE_REASON_REQUIRED') {
        setReasonAsked(true);
        setConfirmStep(1);
      }
      toast.error(e instanceof ApiError ? e.message : 'Could not erase data.');
    }
  }

  function closeSheet() {
    setConfirmStep(0);
    setReason('');
    setReasonAsked(false);
  }

  const body = (
    <>
      <Text variant="label" style={styles.title}>
        GDPR (admin)
      </Text>
      <Text variant="bodySmall" tone="secondary" style={styles.description}>
        {canExportClients
          ? 'Export a structured JSON copy of all personal data, or permanently anonymise this contact (GDPR Art. 17 right to erasure).'
          : 'Permanently anonymise this contact (GDPR Art. 17 right to erasure).'}
      </Text>

      <View style={styles.actions}>
        {canExportClients ? (
          <Button
            label={exporting ? 'Exporting…' : 'Export data (JSON)'}
            variant="secondary"
            size="sm"
            loading={exporting}
            onPress={() => void handleExport()}
            style={styles.flex1}
          />
        ) : null}
        <Button
          label="Erase data"
          variant="danger"
          size="sm"
          loading={eraseMutation.isPending}
          onPress={() => setConfirmStep(1)}
          style={styles.flex1}
        />
      </View>
    </>
  );

  return (
    <>
      {bare ? body : <Card>{body}</Card>}

      <Sheet visible={confirmStep !== 0} onClose={closeSheet}>
        <View style={styles.sheetBody}>
          {confirmStep === 1 ? (
            <>
              <Text variant="subheading">Erase personal data</Text>
              <Text variant="bodySmall" tone="secondary">
                This permanently anonymises {guestName}&apos;s personal data (name, email, phone,
                notes). Their booking history is retained anonymously. This cannot be undone.
              </Text>
              {needsReason ? (
                <View style={[styles.held, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
                  <Text variant="bodySmall">
                    {records > 0 || reasonAsked
                      ? TR_COPY.eraseWarning(guestName, Math.max(records, 1))
                      : TR_COPY.eraseAlertsOnly(guestName)}
                  </Text>
                  <Input
                    label={TR_COPY.eraseReasonLabel}
                    value={reason}
                    onChangeText={setReason}
                    maxLength={500}
                    multiline
                  />
                </View>
              ) : null}
              <View style={styles.sheetActions}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  style={styles.flex1}
                  onPress={closeSheet}
                />
                <Button
                  label="Continue"
                  variant="danger"
                  style={styles.flex1}
                  disabled={held.isLoading || (needsReason && !reason.trim())}
                  onPress={() => setConfirmStep(2)}
                />
              </View>
            </>
          ) : (
            <>
              <Text variant="subheading">Final confirmation</Text>
              <Text variant="bodySmall" tone="secondary">
                All personal data for {guestName} will be permanently erased. There is no way to
                recover it.
              </Text>
              <View style={styles.sheetActions}>
                <Button
                  label="Back"
                  variant="secondary"
                  style={styles.flex1}
                  onPress={() => setConfirmStep(1)}
                />
                <Button
                  label="Yes, erase permanently"
                  variant="danger"
                  style={styles.flex1}
                  loading={eraseMutation.isPending}
                  onPress={() => void handleErase()}
                />
              </View>
            </>
          )}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: spacing.xs,
  },
  description: {
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  sheetBody: {
    gap: spacing.md,
  },
  held: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
});
