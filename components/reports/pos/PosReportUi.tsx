import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CardHeader, StatRow } from '@/components/reports/ReportCardParts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { reportsCopy, type ReportsCopyId } from '@/lib/pos/reports-copy';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { downloadReportFile } from '@/lib/reports/pos-report-download';
import { customRangeProblem, POS_REPORT_GRAINS, POS_REPORT_PRESETS } from '@/lib/reports/pos-report-format';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosRangeChoice, ReportGrain } from '@/types/pos-reports';

/**
 * Shared parts of Reports' POS tabs (web `pos-report-ui.tsx`): the range and grain card, a report
 * card whose CSV comes from the server (so `export` is enforced there), plain tables that scroll
 * sideways on a phone, KPI tiles, and the download that opens the share sheet.
 */

/** A notice the range card or a download raises (the web's export flash). */
export type ReportNotice = (variant: 'success' | 'notice', message: string) => void;

export function useReportNotice(): ReportNotice {
  const toast = useToast();
  return useCallback(
    (variant, message) => {
      if (variant === 'success') toast.success(message);
      else toast.info(message);
    },
    [toast],
  );
}

/**
 * Downloads one card's CSV (or a PDF) from the server with the Bearer token and opens the share
 * sheet. A refusal shows the server's sentence; anything else the web's own words.
 */
export function useReportDownload() {
  const accessToken = useAccessToken();
  const toast = useToast();
  return useCallback(
    async (path: string, label: string, opts: { fallbackFilename?: string; mimeType?: string } = {}): Promise<boolean> => {
      if (!accessToken) return false;
      const res = await downloadReportFile({
        path,
        accessToken,
        fallbackFilename: opts.fallbackFilename ?? 'report.csv',
        mimeType: opts.mimeType ?? 'text/csv',
        dialogTitle: label,
      });
      if (!res.ok) {
        toast.error(res.message ?? reportsCopy('rep.fileFailed'));
        return false;
      }
      return true;
    },
    [accessToken, toast],
  );
}

/** The range chips, "Choose dates" and the Show by chips (web `PosRangeCard`). */
export function PosRangeCard({
  title,
  help,
  choice,
  onChoice,
  grain,
  onGrain,
  loading,
  currentRange,
  today,
  onNotice,
}: {
  title: string;
  help: string;
  choice: PosRangeChoice;
  onChoice: (choice: PosRangeChoice) => void;
  grain: ReportGrain;
  onGrain: (grain: ReportGrain) => void;
  loading: boolean;
  currentRange: { from: string; to: string } | null;
  /** Today in the venue's zone, to seed the dates before the report has loaded. */
  today: string;
  onNotice: ReportNotice;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  const shownDraft = draft ?? currentRange ?? { from: today, to: today };

  const applyCustom = () => {
    const problem = customRangeProblem(shownDraft.from, shownDraft.to);
    if (problem) {
      onNotice('notice', problem);
      return;
    }
    onChoice({ kind: 'custom', from: shownDraft.from, to: shownDraft.to });
  };

  return (
    <Card style={styles.card}>
      <Text variant="label">{title}</Text>
      <Text variant="bodySmall" tone="secondary">
        {help}
      </Text>
      <Text variant="overline" tone="muted">
        {reportsCopy('rng.range')}
      </Text>
      <View style={styles.chips} accessibilityLabel={reportsCopy('rng.range')}>
        {POS_REPORT_PRESETS.map((preset) => (
          <Chip
            key={preset}
            label={reportsCopy(`preset.${preset}` as ReportsCopyId)}
            selected={choice.kind === 'preset' && choice.preset === preset}
            onPress={() => {
              setCustomOpen(false);
              onChoice({ kind: 'preset', preset });
            }}
          />
        ))}
        <Chip
          label={reportsCopy('rng.choose')}
          selected={choice.kind === 'custom' || customOpen}
          onPress={() => {
            setCustomOpen(true);
            if (!draft && currentRange) setDraft(currentRange);
          }}
        />
      </View>
      {customOpen || choice.kind === 'custom' ? (
        <View style={styles.custom}>
          <View style={styles.dateField}>
            <Text variant="caption" tone="muted">
              {reportsCopy('rng.from')}
            </Text>
            <DatePickerField
              value={shownDraft.from}
              onChange={(from) => setDraft({ ...shownDraft, from })}
              accessibilityLabel={`${title} ${reportsCopy('rng.from')}`}
            />
          </View>
          <View style={styles.dateField}>
            <Text variant="caption" tone="muted">
              {reportsCopy('rng.to')}
            </Text>
            <DatePickerField
              value={shownDraft.to}
              onChange={(to) => setDraft({ ...shownDraft, to })}
              accessibilityLabel={`${title} ${reportsCopy('rng.to')}`}
            />
          </View>
          <Button
            label={loading ? reportsCopy('rng.loading') : reportsCopy('rng.apply')}
            size="sm"
            disabled={loading}
            onPress={applyCustom}
          />
        </View>
      ) : null}
      <Text variant="overline" tone="muted">
        {reportsCopy('rng.showBy')}
      </Text>
      <View style={styles.chips}>
        {POS_REPORT_GRAINS.map((g) => (
          <Chip key={g} label={reportsCopy(`grain.${g}` as ReportsCopyId)} selected={grain === g} onPress={() => onGrain(g)} />
        ))}
      </View>
    </Card>
  );
}

/** A report card: its title, and "Export CSV" when this person may export. */
export function PosReportCard({ title, onExport, children }: { title: string; onExport?: () => void; children: ReactNode }) {
  return (
    <Card style={styles.card}>
      <CardHeader title={title} onExport={onExport} />
      {children}
    </Card>
  );
}

export function EmptyReport() {
  return (
    <Text variant="bodySmall" tone="muted">
      {reportsCopy('rep.empty')}
    </Text>
  );
}

export function ReportLoadError({ message, onRetry }: { message?: string | null; onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[styles.error, { borderColor: colors.danger, backgroundColor: colors.dangerSurface }]}>
      <Text variant="bodySmall" tone="danger" style={styles.flex}>
        {message || reportsCopy('rep.error')}
      </Text>
      <Button label={reportsCopy('rep.tryAgain')} size="sm" variant="secondary" onPress={onRetry} />
    </View>
  );
}

export interface Column<Row> {
  label: string;
  value: (row: Row) => ReactNode;
  numeric?: boolean;
  /** Width in points; numeric columns default to 104, the first column to 160. */
  width?: number;
}

/** A plain table (web `ReportTable`): a header, one row per entry, an optional totals row. */
export function ReportTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  footer,
}: {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  footer?: ReactNode[];
}) {
  const { colors } = useTheme();
  if (rows.length === 0) return <EmptyReport />;
  const width = (c: Column<Row>, i: number) => c.width ?? (i === 0 ? 160 : c.numeric ? 104 : 140);
  const cell = (content: ReactNode, c: Column<Row>, i: number, strong?: boolean) => (
    <View key={`${c.label}-${i}`} style={[styles.cell, { width: width(c, i) }]}>
      {typeof content === 'string' || typeof content === 'number' ? (
        <Text
          variant={strong || i === 0 ? 'bodyMedium' : 'bodySmall'}
          style={[c.numeric ? styles.numeric : null]}>
          {String(content)}
        </Text>
      ) : (
        content
      )}
    </View>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={caption}>
      <View style={[styles.table, { borderColor: colors.border }]}>
        <View style={[styles.row, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          {columns.map((c, i) => (
            <View key={c.label} style={[styles.cell, { width: width(c, i) }]}>
              <Text variant="caption" tone="muted" style={c.numeric ? styles.numeric : null}>
                {c.label}
              </Text>
            </View>
          ))}
        </View>
        {rows.map((row, ri) => (
          <View key={rowKey(row, ri)} style={[styles.row, { borderBottomColor: colors.border }]}>
            {columns.map((c, i) => cell(c.value(row), c, i))}
          </View>
        ))}
        {footer ? (
          <View style={[styles.row, { backgroundColor: colors.surface }]}>
            {footer.map((content, i) => cell(content, columns[i] ?? { label: String(i), value: () => '', numeric: i > 0 }, i, true))}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

/** A row of KPI tiles, two to a line (the web's StatTile grid). */
export function KpiTiles({ items }: { items: { label: string; value: string; caption?: string }[] }) {
  return (
    <View style={styles.tiles}>
      {items.map((it) => (
        <StatTile key={it.label} label={it.label} value={it.value} caption={it.caption} style={styles.tile} />
      ))}
    </View>
  );
}

/** Label and figure lines (the web's `<dl>` blocks). */
export function FigureList({ items }: { items: [string, string][] }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.figures, { borderTopColor: colors.border }]}>
      {items.map(([label, value]) => (
        <StatRow key={label} label={label} value={value} />
      ))}
    </View>
  );
}

export const reportStyles = StyleSheet.create({
  stack: { gap: spacing.base },
  note: { marginTop: spacing.xs },
});

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  custom: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.sm },
  dateField: { gap: spacing.xs },
  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  flex: { flex: 1 },
  table: { borderWidth: 1, borderRadius: radius.sm, overflow: 'hidden' },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, justifyContent: 'center' },
  numeric: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: '45%' },
  figures: { gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
});
