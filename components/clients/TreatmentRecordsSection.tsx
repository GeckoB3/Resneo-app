import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { treatmentRecordHref } from '@/components/bookings/TreatmentRecordCard';
import { ClientAlertsSheet } from '@/components/treatment-records/ClientAlertsStrip';
import { Button } from '@/components/ui/Button';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticWarning } from '@/lib/haptics';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { shareTreatmentPdf, useTreatmentRecordsList } from '@/lib/queries/useTreatmentRecords';
import { TR_COPY } from '@/lib/treatment-records/copy';
import { recordListLines } from '@/lib/treatment-records/draft';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { useViewerAccess } from '@/providers/ViewerAccessProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * A client's treatment records (web plan §9): the list, Add record, Print all records and Add
 * alert. Deleted records, restore, the batch search and the view log are on the web in v1. The
 * host shows it only to someone who reaches records here.
 */
export function TreatmentRecordsSection({ guestId }: { guestId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const accessToken = useAccessToken();
  const { venue } = useVenueContext();
  const { canExportClients } = useViewerAccess();
  const list = useTreatmentRecordsList({ guestId });
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [printing, setPrinting] = useState(false);

  if (list.data === null) return null;
  const records = list.data?.records ?? [];
  const summary = !list.data ? null : records.length === 0 ? 'None yet' : `${records.length} record${records.length === 1 ? '' : 's'}`;

  async function printAll() {
    if (!accessToken) return;
    setPrinting(true);
    try {
      const out = await shareTreatmentPdf(accessToken, { guestId });
      if (!out.ok) toast.error(out.message);
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not print the records.');
    } finally {
      setPrinting(false);
    }
  }

  return (
    <>
      <CollapsibleCard title={TR_COPY.sectionTitle} summary={summary}>
        {list.isLoading ? (
          <Text variant="bodySmall" tone="muted">
            Loading…
          </Text>
        ) : list.isError ? (
          <Text variant="bodySmall" tone="muted">
            Could not load treatment records. Pull to refresh to try again.
          </Text>
        ) : (
          <View style={styles.body}>
            <View style={styles.actions}>
              <Button label={TR_COPY.addRecord} size="sm" onPress={() => router.push(treatmentRecordHref({ recordId: null, guestId }))} />
              {records.length > 0 && canExportClients ? (
                <Button label={TR_COPY.printAll} size="sm" variant="secondary" loading={printing} onPress={() => void printAll()} />
              ) : null}
            </View>
            {records.length === 0 ? (
              <Text variant="bodySmall" tone="muted">
                {TR_COPY.contactEmpty}
              </Text>
            ) : (
              records.map((r) => {
                const lines = recordListLines(r, venue?.timezone);
                return (
                  <Pressable
                    key={r.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${lines.title}. ${lines.meta}`}
                    onPress={() => router.push(treatmentRecordHref({ recordId: r.id, guestId }))}
                    style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                    <View style={[styles.thumb, { backgroundColor: colors.surface }]}>
                      {r.first_photo_preview_url ? <Image source={{ uri: r.first_photo_preview_url }} style={styles.thumbImage} /> : null}
                    </View>
                    <View style={styles.rowText}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {lines.title}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {lines.meta}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setAlertsOpen(true)}>
              <Text variant="caption" tone="brand" style={styles.link}>
                {TR_COPY.addAlert}
              </Text>
            </Pressable>
          </View>
        )}
      </CollapsibleCard>
      <ClientAlertsSheet guestId={guestId} visible={alertsOpen} onClose={() => setAlertsOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  link: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
