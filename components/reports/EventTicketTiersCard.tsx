/**
 * Reports overview → Event ticket sales by tier.
 *
 * Tickets sold and revenue per ticket type, from the price captured when each
 * ticket was booked. Same figures, copy and CSV as the web
 * (_reference/Resneo/src/app/dashboard/reports/ReportsView.tsx:1232-1287).
 */
import { ScrollView, StyleSheet, View } from 'react-native';

import { CardHeader, useReportCsvExport } from '@/components/reports/ReportCardParts';
import { Card } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { formatPence } from '@/lib/format';
import { buildEventTicketTiersCsv, type ReportRange } from '@/lib/reports/overview-report';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ReportEventTicketTierRow } from '@/types/reports';

const money = (pence: number): string => formatPence(pence) ?? `£${(pence / 100).toFixed(2)}`;

export function EventTicketTiersCard({
  rows,
  range,
  bookingWord,
}: {
  rows: ReportEventTicketTierRow[];
  range: ReportRange;
  /** The venue's word for a booking (terminology.booking). */
  bookingWord: string;
}) {
  const { colors } = useTheme();
  const exportCsv = useReportCsvExport();

  const ticketsSold = rows.reduce((sum, row) => sum + row.tickets_sold, 0);
  const revenuePence = rows.reduce((sum, row) => sum + row.revenue_pence, 0);

  return (
    <Card>
      <CardHeader
        title="Event ticket sales by tier"
        onExport={() => {
          const csv = buildEventTicketTiersCsv(rows, range);
          void exportCsv(csv.filename, csv.rows);
        }}
        exportDisabled={rows.length === 0}
        exportBlockedMessage="There is no event ticket data to export for this period."
      />
      <Text variant="bodySmall" tone="secondary" style={styles.intro}>
        Tickets sold and revenue per ticket type for events in this date range. Figures use the
        price captured when each ticket was booked, so they stay accurate even after a tier is
        edited. Cancelled bookings are excluded.
      </Text>

      <View style={styles.tiles}>
        <StatTile label="Tickets sold" value={String(ticketsSold)} style={styles.tile} />
        <StatTile label="Ticket revenue" value={money(revenuePence)} style={styles.tile} />
        <StatTile label="Ticket tiers sold" value={String(rows.length)} style={styles.tile} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={[styles.table, { borderColor: colors.border }]}>
          <View
            style={[
              styles.tableRow,
              { backgroundColor: colors.surface, borderBottomColor: colors.border },
            ]}>
            <Text variant="caption" tone="muted" style={styles.nameCol}>
              Ticket type
            </Text>
            <Text variant="caption" tone="muted" style={styles.numCol}>
              Tickets sold
            </Text>
            <Text variant="caption" tone="muted" style={styles.numCol}>
              {`${bookingWord}s`}
            </Text>
            <Text variant="caption" tone="muted" style={styles.moneyCol}>
              Revenue
            </Text>
          </View>
          {rows.map((row) => (
            <View
              key={row.ticket_type_key}
              style={[styles.tableRow, { borderBottomColor: colors.border }]}>
              <Text variant="bodySmall" numberOfLines={1} style={styles.nameCol}>
                {row.ticket_type_label}
              </Text>
              <Text variant="bodySmall" style={[styles.numCol, styles.num]}>
                {row.tickets_sold}
              </Text>
              <Text variant="bodySmall" style={[styles.numCol, styles.num]}>
                {row.booking_count}
              </Text>
              <Text variant="bodyMedium" style={[styles.moneyCol, styles.num]}>
                {money(row.revenue_pence)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginTop: spacing.sm,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
  },
  table: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  nameCol: {
    width: 150,
  },
  numCol: {
    width: 86,
    textAlign: 'right',
    paddingLeft: spacing.xs,
  },
  moneyCol: {
    width: 96,
    textAlign: 'right',
    paddingLeft: spacing.xs,
  },
  num: {
    fontVariant: ['tabular-nums'],
  },
});
