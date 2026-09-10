import { StyleSheet, View } from 'react-native';

import { Badge, StatusPill } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useGroupVisitBookings, type GroupVisitBookingRow } from '@/lib/queries/useGroupVisit';
import { spacing } from '@/theme/index';

type GroupVisitCardsProps = {
  groupBookingId: string;
  currentBookingId: string;
  /** Current booking's person label, shown in the group card header. */
  personLabel?: string | null;
  /** The partner venue a linked booking belongs to; its siblings are read across the link. */
  ownerVenueId?: string | null;
};

/** "Massage – Deep tissue + Hot stones" — web `expandedBookingOfferingLine`. */
function offeringLine(row: GroupVisitBookingRow): string {
  const parts: string[] = [];
  if (row.booking_item_name) parts.push(row.booking_item_name);
  if (row.service_variant_name) parts.push(row.service_variant_name);
  let line = parts.join(' – ') || 'Service';
  if (row.booking_addon_labels && row.booking_addon_labels.length > 0) {
    line += ` + ${row.booking_addon_labels.join(' + ')}`;
  }
  return line;
}

/**
 * The "Group booking" card: the OTHER people of a group booking (rows sharing
 * this booking's `group_booking_id` that carry a person label), web
 * ExpandedBookingContent parity. A multi-service visit for ONE client is not
 * a group: its services are the rows of the visit summary at the top of the
 * panel (`VisitSummary`, web #190), which carries each service's own Start /
 * Complete, so this card renders nothing for it.
 */
export function GroupVisitCards({
  groupBookingId,
  currentBookingId,
  personLabel,
  ownerVenueId = null,
}: GroupVisitCardsProps) {
  const query = useGroupVisitBookings(groupBookingId, ownerVenueId);
  const rows = query.data ?? [];
  if (rows.length <= 1) return null;

  const isGroupPeopleVisit = rows.some((r) => !!r.person_label?.trim());
  if (!isGroupPeopleVisit) return null;

  const others = rows.filter((r) => r.id !== currentBookingId);
  return (
    <Card>
      <View style={styles.headerRow}>
        <Badge label="Group booking" tone="accent" />
        {personLabel?.trim() ? (
          <Text variant="caption" tone="muted">
            {personLabel}
          </Text>
        ) : null}
      </View>
      {others.length > 0 ? (
        <View style={styles.list}>
          <Text variant="caption" tone="muted">
            Others in this group
          </Text>
          {others.map((row) => (
            <View key={row.id} style={styles.rowMain}>
              <View style={styles.rowText}>
                <Text variant="bodySmall" numberOfLines={1}>
                  {row.person_label?.trim() || row.guest_name || 'Guest'}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {offeringLine(row)}
                  {row.booking_time ? ` · ${row.booking_time.slice(0, 5)}` : ''}
                </Text>
              </View>
              <StatusPill status={row.status} />
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  list: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});
