import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { fetchGuestGdprExport } from '@/lib/queries/useContactsBulk';
import { useEraseGuest } from '@/lib/queries/useGuestMutations';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

type GdprSectionProps = {
  guestId: string;
  guestName: string;
  /** Called after successful erasure — typically navigate back to the contacts list. */
  onErased: () => void;
};

/**
 * Admin-only GDPR card: data export (JSON share) + data erase (anonymise).
 * The erase action is gated behind an in-sheet two-step confirmation — Alert.alert
 * is a no-op on react-native-web (the dev-preview path), so the old Alert-based
 * flow meant the erase button did nothing there.
 */
export function GdprSection({ guestId, guestName, onErased }: GdprSectionProps) {
  const accessToken = useAccessToken();
  const eraseMutation = useEraseGuest();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  // 0 = closed, 1 = first confirm, 2 = final confirm.
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);

  async function handleExport() {
    if (!accessToken) return;
    setExporting(true);
    try {
      const data = await fetchGuestGdprExport(accessToken, guestId);
      const json = JSON.stringify(data, null, 2);
      await Share.share({
        title: `Data export — ${guestName}`,
        message: json,
      });
      hapticSuccess();
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not export data.');
    } finally {
      setExporting(false);
    }
  }

  async function handleErase() {
    try {
      await eraseMutation.mutateAsync({ guestId });
      setConfirmStep(0);
      // Feedback + navigation fire directly off the resolved mutation — never
      // from an Alert callback (which is a no-op on web).
      toast.success('Personal data anonymised. The booking record is retained.');
      onErased();
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not erase data.');
    }
  }

  return (
    <>
      <Card>
        <Text variant="label" style={styles.title}>
          GDPR (admin)
        </Text>
        <Text variant="bodySmall" tone="secondary" style={styles.description}>
          Export a structured JSON copy of all personal data, or permanently anonymise this contact
          (GDPR Art. 17 right to erasure).
        </Text>

        <View style={styles.actions}>
          <Button
            label={exporting ? 'Exporting…' : 'Export data (JSON)'}
            variant="secondary"
            size="sm"
            loading={exporting}
            onPress={() => void handleExport()}
            style={styles.flex1}
          />
          <Button
            label="Erase data"
            variant="danger"
            size="sm"
            loading={eraseMutation.isPending}
            onPress={() => setConfirmStep(1)}
            style={styles.flex1}
          />
        </View>
      </Card>

      <Sheet visible={confirmStep !== 0} onClose={() => setConfirmStep(0)}>
        <View style={styles.sheetBody}>
          {confirmStep === 1 ? (
            <>
              <Text variant="subheading">Erase personal data</Text>
              <Text variant="bodySmall" tone="secondary">
                This permanently anonymises {guestName}&apos;s personal data (name, email, phone,
                notes). Their booking history is retained anonymously. This cannot be undone.
              </Text>
              <View style={styles.sheetActions}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  style={styles.flex1}
                  onPress={() => setConfirmStep(0)}
                />
                <Button
                  label="Continue"
                  variant="danger"
                  style={styles.flex1}
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
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
});
