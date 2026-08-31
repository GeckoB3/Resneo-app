import { StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import {
  ALWAYS_SENT_NOTE,
  MARKETING_ELSEWHERE_NOTE,
  channelLabel,
  preferenceLabel,
  preferencePatch,
  readPreferences,
  type PreferenceRow,
} from '@/lib/notifications/customer-preferences';
import { useCustomerProfile, useUpdateCustomerProfile } from '@/lib/queries/useCustomerProfile';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/**
 * How ResNeo may contact this customer, per kind of message and per channel.
 *
 * Grouped by kind rather than by channel, because a customer thinks "stop
 * texting me about offers", not "turn off the marketing SMS pair".
 *
 * The note about what is always sent is not a disclaimer, it is the honest
 * half: confirmations and change emails have no switch, and leaving that
 * unexplained makes the list look incomplete rather than deliberate.
 */
export function NotificationPreferencesSection() {
  const toast = useToast();
  const { data, isLoading } = useCustomerProfile();
  const update = useUpdateCustomerProfile();

  if (isLoading) return <LoadingState message="Loading your preferences…" />;

  const rows = readPreferences(data?.profile?.notification_preferences);
  const groups = groupByCategory(rows);

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        WHAT WE SEND YOU
      </Text>

      {groups.map(([category, items]) => (
        <View key={category} style={styles.group}>
          <Text variant="bodyMedium">{preferenceLabel(category)}</Text>
          {items.map((row) => (
            <View key={`${row.category}:${row.channel}`} style={styles.row}>
              <Text variant="bodySmall" tone="secondary" style={styles.rowLabel}>
                {channelLabel(row.channel)}
              </Text>
              <Switch
                value={row.enabled}
                disabled={update.isPending}
                accessibilityLabel={`${preferenceLabel(row.category)} by ${channelLabel(row.channel)}`}
                onValueChange={(next) =>
                  update.mutate(
                    {
                      // ONE key. The column is shared with the staff app and the
                      // route merges, so sending the whole matrix would write
                      // back defaults this customer never chose.
                      notification_preferences: preferencePatch(row.category, row.channel, next),
                    },
                    {
                      onError: () => toast.error('Could not save that. Please try again.'),
                    },
                  )
                }
              />
            </View>
          ))}
        </View>
      ))}

      <Text variant="caption" tone="muted" style={styles.note}>
        {ALWAYS_SENT_NOTE}
      </Text>
      <Text variant="caption" tone="muted" style={styles.note}>
        {MARKETING_ELSEWHERE_NOTE}
      </Text>
    </Card>
  );
}

/** Preserves the order the matrix defines, rather than re-sorting it. */
function groupByCategory(rows: PreferenceRow[]): [PreferenceRow['category'], PreferenceRow[]][] {
  const out: [PreferenceRow['category'], PreferenceRow[]][] = [];
  for (const row of rows) {
    const existing = out.find(([category]) => category === row.category);
    if (existing) existing[1].push(row);
    else out.push([row.category, [row]]);
  }
  return out;
}

const styles = StyleSheet.create({
  group: { marginTop: spacing.base, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { flex: 1 },
  note: { marginTop: spacing.base },
});
