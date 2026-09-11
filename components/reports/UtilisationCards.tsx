/**
 * Reports overview → Table utilisation and Resource utilisation.
 *
 * Both are a list of bars: how much of each table's or resource's open time was
 * booked in the range, with the same thresholds, captions and CSV exports as
 * the web (_reference/Resneo/src/app/dashboard/reports/ReportsView.tsx:1190-1329).
 * The venue only sees the one its booking types call for; the screen decides.
 */
import { StyleSheet, View } from 'react-native';

import { CardHeader, useReportCsvExport } from '@/components/reports/ReportCardParts';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import {
  buildReport5Csv,
  buildResourceUtilisationCsv,
  type ReportRange,
} from '@/lib/reports/overview-report';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  ReportResourceUtilisationRow,
  ReportTableUtilisationRow,
} from '@/types/reports';

/** One row: the name, its percentage, the bar, and the hours behind it. */
function UtilisationRow({
  name,
  utilisationPct,
  caption,
}: {
  name: string;
  utilisationPct: number;
  caption: string;
}) {
  const { colors } = useTheme();
  // The web's thresholds: under half is amber, over 90% emerald, otherwise brand.
  const tone =
    utilisationPct < 50 ? colors.warning : utilisationPct > 90 ? colors.success : colors.brand;
  const valueColor =
    utilisationPct < 50 ? colors.warning : utilisationPct > 90 ? colors.success : colors.text;

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.rowHeader}>
        <Text variant="bodySmall" numberOfLines={1} style={styles.rowName}>
          {name}
        </Text>
        <Text variant="bodyMedium" style={[styles.rowValue, { color: valueColor }]}>
          {utilisationPct}%
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ now: utilisationPct, min: 0, max: 100 }}
        style={[styles.track, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: tone, width: `${Math.min(100, Math.max(0, utilisationPct))}%` },
          ]}
        />
      </View>
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
    </View>
  );
}

export function TableUtilisationCard({
  rows,
  range,
}: {
  rows: ReportTableUtilisationRow[];
  range: ReportRange;
}) {
  const exportCsv = useReportCsvExport();

  return (
    <Card>
      <CardHeader
        title="Table utilisation"
        onExport={() => {
          const csv = buildReport5Csv(rows, range);
          void exportCsv(csv.filename, csv.rows);
        }}
        exportDisabled={rows.length === 0}
        exportBlockedMessage="There is no table utilisation data to export for this period."
      />
      {rows.length > 0 ? (
        <View style={styles.rows}>
          {rows.map((row) => (
            <UtilisationRow
              key={row.table_id}
              name={row.table_name}
              utilisationPct={row.utilisation_pct}
              caption={`${row.occupied_hours}h occupied / ${row.available_hours}h available`}
            />
          ))}
        </View>
      ) : (
        <Text variant="bodySmall" tone="muted" style={styles.intro}>
          No table utilisation data for this range.
        </Text>
      )}
    </Card>
  );
}

export function ResourceUtilisationCard({
  rows,
  range,
}: {
  rows: ReportResourceUtilisationRow[];
  range: ReportRange;
}) {
  const exportCsv = useReportCsvExport();

  return (
    <Card>
      <CardHeader
        title="Resource utilisation"
        onExport={() => {
          const csv = buildResourceUtilisationCsv(rows, range);
          void exportCsv(csv.filename, csv.rows);
        }}
        exportDisabled={rows.length === 0}
        exportBlockedMessage="There is no resource utilisation data to export for this period."
      />
      <Text variant="bodySmall" tone="secondary" style={styles.intro}>
        {
          'Booked hours against each resource’s open hours for this date range, plus the number of bookings. Only active bookings (not cancelled) count toward booked hours.'
        }
      </Text>
      <View style={styles.rows}>
        {rows.map((row) => (
          <UtilisationRow
            key={row.resource_id}
            name={row.resource_name}
            utilisationPct={row.utilisation_pct}
            caption={`${row.booking_count} ${row.booking_count === 1 ? 'booking' : 'bookings'} · ${row.occupied_hours}h booked / ${row.available_hours}h open`}
          />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginTop: spacing.sm,
  },
  rows: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  row: {
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowName: {
    flex: 1,
  },
  rowValue: {
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: radius.pill,
  },
});
