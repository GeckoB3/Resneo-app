import { format, parseISO } from 'date-fns';
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CommunicationRow } from '@/types/guest-detail';

type CommunicationsSectionProps = {
  communications: CommunicationRow[];
  /** Render inside a tap-to-expand CollapsibleCard instead of a plain Card. */
  collapsible?: boolean;
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
export function CommunicationsSection({
  communications,
  collapsible = false,
}: CommunicationsSectionProps) {
  const { colors } = useTheme();

  // Plain (non-collapsible) mode keeps the original behaviour: hidden when empty.
  if (!collapsible && communications.length === 0) return null;

  const rows =
    communications.length === 0 ? (
      <Text variant="bodySmall" tone="muted">
        No messages sent to this contact yet.
      </Text>
    ) : (
      communications.map((comm, index) => (
        <View
          key={comm.id}
          style={[
            collapsible ? styles.rowFlush : styles.row,
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
      ))
    );

  if (collapsible) {
    const summary =
      communications.length === 0
        ? 'None'
        : `${communications.length} message${communications.length === 1 ? '' : 's'}`;
    return (
      // Web default-opens the messages accordion when there is history.
      <CollapsibleCard
        title="Message history"
        summary={summary}
        defaultExpanded={communications.length > 0}>
        {rows}
      </CollapsibleCard>
    );
  }

  return (
    <Card padded={false}>
      <View style={styles.header}>
        <Text variant="label">Message history</Text>
      </View>
      {rows}
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
  rowFlush: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
