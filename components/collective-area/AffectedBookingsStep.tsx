/**
 * The bookings a calendar would leave behind before it stops offering a service (web
 * `CollectiveAffectedBookings.tsx`, CQ-04).
 *
 * The engine refuses to take a calendar off a service that still has upcoming bookings for it until
 * the host has seen them, and answers with their dates and times. The app used to say "1 change did
 * not go through" and keep it for another Save, which was refused again, for ever. This step lists
 * them, says the bookings stay in the diary, and asks: take it off and keep these bookings, or keep
 * offering it. Dates and times only (owner, 2026-10-29): a member's guests stay out of the host's
 * grid. A server that sends no dates yet still names the calendar and service.
 *
 * It is a step inside whatever sheet asked (a service's sheet, Choose calendars, or its own sheet
 * after the bar's Save), never a sheet over another one ([[ios-no-stacked-modals]]).
 */
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import { affectedBookingsRow, affectedBookingsTitle, type AffectedBookingsItem } from '@/lib/collective-area/model';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export function AffectedBookingsStep({
  items,
  othersSaved = false,
  busy = false,
  onKeep,
  onConfirm,
}: {
  items: AffectedBookingsItem[];
  /** The rest of the save went through, which is worth saying before asking about these. */
  othersSaved?: boolean;
  busy?: boolean;
  /** "Keep offering it": nothing is sent, and the calendars keep the service. */
  onKeep: () => void;
  /** "Take it off and keep these bookings": only these removals, acknowledged. */
  onConfirm: () => void;
}) {
  const { colors } = useTheme();
  const one = items.length === 1;
  return (
    <>
      <View style={styles.header}>
        <Text variant="subheading">{affectedBookingsTitle(items)}</Text>
      </View>
      <ScrollView style={styles.flex1} contentContainerStyle={styles.content}>
        {othersSaved ? (
          <Text variant="bodySmall" tone="success" accessibilityLiveRegion="polite">
            {areaCopy('ov.bulk.bookings.othersSaved')}
          </Text>
        ) : null}
        <Text variant="bodySmall" tone="secondary">
          {areaCopy('ov.bulk.bookings.body')}
        </Text>
        <View style={[styles.list, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
          {items.map((item) => (
            <Text key={item.key} variant="bodySmall">
              {affectedBookingsRow(item)}
            </Text>
          ))}
        </View>
      </ScrollView>
      {/* Keep on the left, take off on the right, equal widths (web P3 section 0, item 4). */}
      <View style={styles.footer}>
        <Button
          label={areaCopy(one ? 'ov.bulk.bookings.keepOne' : 'ov.bulk.bookings.keep')}
          variant="secondary"
          style={styles.flex1}
          disabled={busy}
          onPress={onKeep}
        />
        <Button
          label={areaCopy(one ? 'ov.bulk.bookings.confirmOne' : 'ov.bulk.bookings.confirm')}
          style={styles.flex1}
          loading={busy}
          disabled={busy}
          onPress={onConfirm}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  header: { paddingHorizontal: spacing.lg },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
