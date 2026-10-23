import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Text } from '@/components/ui/Text';
import { useTreatmentRecordsList } from '@/lib/queries/useTreatmentRecords';
import { TR_COPY } from '@/lib/treatment-records/copy';
import { bookingSummaryLine, recordListLines } from '@/lib/treatment-records/draft';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import { useVenueContext } from '@/providers/VenueProvider';

/** The editor route for a record, or for a new one on this booking. */
export function treatmentRecordHref(args: { recordId: string | null; guestId: string; bookingId?: string | null }): Href {
  return {
    pathname: '/treatment-record/[id]',
    params: {
      id: args.recordId ?? 'new',
      guestId: args.guestId,
      ...(args.bookingId ? { bookingId: args.bookingId } : {}),
    },
  } as Href;
}

/**
 * Treatment records on a booking (web plan §9): the summary line, Add record or View record, and
 * Add another record once the visit has one. At our own venue the host shows it only to someone
 * who reaches records; on a linked venue's booking it appears once the list answers, and never
 * when the owning venue refuses.
 *
 * The editor is a pushed screen, so a host that shows the booking in a sheet passes `onNavigate`
 * to close the sheet as the screen opens (no Modal over a Modal).
 */
export function TreatmentRecordCard({
  bookingId,
  guestId,
  linked = false,
  onNavigate,
}: {
  bookingId: string;
  guestId: string;
  linked?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const list = useTreatmentRecordsList({ bookingId });

  if (list.data === null) return null;
  if (linked && !list.data) return null;
  const records = list.data?.records ?? [];

  const open = (recordId: string | null) => {
    router.push(treatmentRecordHref({ recordId, guestId, bookingId }));
    onNavigate?.();
  };

  const hint = !list.data ? null : records.length === 0 ? 'No record yet' : records.length === 1 ? '1 record' : `${records.length} records`;

  return (
    <CollapsibleCard title={TR_COPY.sectionTitle} summary={hint}>
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
          <Text variant="bodySmall">{bookingSummaryLine(records, venue?.timezone)}</Text>
          {records.length > 1
            ? records.map((r) => {
                const lines = recordListLines(r, venue?.timezone);
                return (
                  <Pressable
                    key={r.id}
                    accessibilityRole="button"
                    onPress={() => open(r.id)}
                    style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {lines.title}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {lines.meta}
                    </Text>
                  </Pressable>
                );
              })
            : null}
          {records.length <= 1 ? (
            <Button
              label={records.length === 0 ? TR_COPY.addRecord : TR_COPY.viewRecord}
              size="sm"
              onPress={() => open(records[0]?.id ?? null)}
            />
          ) : null}
          {records.length >= 1 ? (
            <Button label={TR_COPY.addAnother} variant="ghost" size="sm" onPress={() => open(null)} />
          ) : null}
        </View>
      )}
    </CollapsibleCard>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.sm,
  },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
});
