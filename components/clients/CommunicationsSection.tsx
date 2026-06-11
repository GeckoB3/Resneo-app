import { format, parseISO } from 'date-fns';
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CommunicationRow } from '@/types/guest-detail';

type CommunicationsSectionProps = {
  communications: CommunicationRow[];
};

function formatCommDate(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}

function statusTone(status: string): 'success' | 'neutral' | 'danger' | 'warning' {
  switch (status.toLowerCase()) {
    case 'delivered':
    case 'sent':
      return 'success';
    case 'bounced':
    case 'failed':
      return 'danger';
    case 'pending':
    case 'queued':
      return 'warning';
    default:
      return 'neutral';
  }
}

/**
 * Read-only list of past communications for a contact.
 * Hidden when there are no rows.
 */
export function CommunicationsSection({ communications }: CommunicationsSectionProps) {
  const { colors } = useTheme();

  if (communications.length === 0) return null;

  return (
    <Card padded={false}>
      <View style={styles.header}>
        <Text variant="label">Message history</Text>
      </View>
      {communications.map((comm, index) => (
        <View
          key={comm.id}
          style={[
            styles.row,
            index < communications.length - 1
              ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }
              : null,
          ]}>
          <View style={styles.rowMain}>
            <Text variant="bodySmall" numberOfLines={1}>
              {comm.message_type.replace(/_/g, ' ')}
            </Text>
            <Text variant="caption" tone="muted">
              {comm.channel.toUpperCase()} · {formatCommDate(comm.created_at)}
            </Text>
          </View>
          <Badge label={comm.status} tone={statusTone(comm.status)} />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: spacing.base,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
