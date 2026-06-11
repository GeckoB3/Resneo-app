import { useState } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { fetchGuestGdprExport } from '@/lib/queries/useContactsBulk';
import { useEraseGuest } from '@/lib/queries/useGuestMutations';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { spacing } from '@/theme/index';

type GdprSectionProps = {
  guestId: string;
  guestName: string;
  /** Called after successful erasure — typically navigate back to the contacts list. */
  onErased: () => void;
};

/**
 * Admin-only GDPR card: data export (JSON share) + data erase (anonymise).
 * Both actions are gated behind confirmation dialogs.
 */
export function GdprSection({ guestId, guestName, onErased }: GdprSectionProps) {
  const accessToken = useAccessToken();
  const eraseMutation = useEraseGuest();
  const [exporting, setExporting] = useState(false);

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
      Alert.alert('Export failed', e instanceof ApiError ? e.message : 'Could not export data.');
    } finally {
      setExporting(false);
    }
  }

  function handleErase() {
    Alert.alert(
      'Erase personal data',
      `This will permanently anonymise ${guestName}'s personal data (name, email, phone, notes). Their booking history is retained anonymously. This cannot be undone.\n\nAre you absolutely sure?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase data',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final confirmation',
              `Type to confirm: all personal data for ${guestName} will be permanently erased.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, erase permanently',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await eraseMutation.mutateAsync({ guestId });
                      hapticSuccess();
                      Alert.alert(
                        'Data erased',
                        'Personal data has been anonymised. The contact record still exists for booking history.',
                        [{ text: 'OK', onPress: onErased }],
                      );
                    } catch (e) {
                      hapticWarning();
                      Alert.alert(
                        'Erase failed',
                        e instanceof ApiError ? e.message : 'Could not erase data.',
                      );
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }

  return (
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
          onPress={handleErase}
          style={styles.flex1}
        />
      </View>
    </Card>
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
});
