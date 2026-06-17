import { StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import {
  useLinkedNotificationPrefs,
  useUpdateLinkedNotificationPrefs,
} from '@/lib/queries/useLinkedVenues';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import {
  LINKED_NOTIFICATION_ROWS,
  type LinkedNotificationPrefs,
} from '@/types/linked-venues';

/**
 * Admin-only card (web §17.4 `NotificationPrefsCard` parity): choose which
 * cross-venue write events email this venue when a LINKED partner creates,
 * reschedules, cancels, or edits one of your bookings. In-app notifications are
 * always created regardless — these gate only the email channel. Optimistic:
 * the switch flips immediately (the hook rolls back on error).
 */
export function LinkedNotificationPrefsCard() {
  const { colors } = useTheme();
  const query = useLinkedNotificationPrefs();
  const update = useUpdateLinkedNotificationPrefs();
  const prefs = query.data;

  return (
    <View style={styles.section}>
      <Text variant="overline" tone="muted" style={styles.sectionTitle}>
        Email notifications
      </Text>
      <Card>
        <Text variant="caption" tone="muted" style={styles.intro}>
          Email this venue when a linked venue acts on one of your bookings. You’ll always see
          these in the app.
        </Text>
        {query.isError ? (
          <Text variant="caption" color={colors.danger}>
            Couldn’t load notification preferences.
          </Text>
        ) : (
          LINKED_NOTIFICATION_ROWS.map((row, i) => (
            <View
              key={row.key}
              style={[
                styles.row,
                i < LINKED_NOTIFICATION_ROWS.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
              ]}>
              <Text variant="bodyMedium" style={styles.rowLabel}>
                {row.label}
              </Text>
              <Switch
                value={prefs?.[row.key] ?? false}
                disabled={!prefs}
                onValueChange={(next) =>
                  update.mutate({ [row.key]: next } as Partial<LinkedNotificationPrefs>)
                }
                trackColor={{ false: colors.border, true: colors.brand }}
                thumbColor={colors.surfaceRaised}
                accessibilityLabel={row.label}
              />
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    marginLeft: spacing.md,
  },
  intro: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
  },
});
