import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

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

/**
 * A table (web `ReportTable`) laid out for a phone. Two columns read as a plain list: the name left,
 * the figure right. Wider tables would run off the screen, so each row is stacked instead: the
 * first column as its title, then every other column as a labelled figure underneath. An optional
 * totals row closes it in bold.
 */
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
  const show = (content: ReactNode, strong: boolean, numeric: boolean, tone?: 'muted') =>
    typeof content === 'string' || typeof content === 'number' ? (
      <Text variant={strong ? 'bodyMedium' : 'bodySmall'} tone={tone} style={numeric ? styles.numeric : null}>
        {String(content)}
      </Text>
    ) : (
      content
    );
  const lines: { key: string; cells: ReactNode[]; total: boolean }[] = [
    ...rows.map((row, ri) => ({ key: rowKey(row, ri), cells: columns.map((c) => c.value(row)), total: false })),
    ...(footer ? [{ key: '__total', cells: footer, total: true }] : []),
  ];

  if (columns.length <= 2) {
    return (
      <View style={[styles.table, { borderColor: colors.border }]} accessibilityLabel={caption}>
        {lines.map((line, i) => (
          <View
            key={line.key}
            style={[
              styles.listRow,
              { borderBottomColor: colors.border, borderBottomWidth: i < lines.length - 1 ? StyleSheet.hairlineWidth : 0 },
              line.total ? { backgroundColor: colors.surface } : null,
            ]}>
            <View style={styles.listName}>{show(line.cells[0], true, false)}</View>
            {columns.length > 1 ? <View>{show(line.cells[1], line.total, true)}</View> : null}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.table, { borderColor: colors.border }]} accessibilityLabel={caption}>
      {lines.map((line, i) => (
        <View
          key={line.key}
          style={[
            styles.stackRow,
            { borderBottomColor: colors.border, borderBottomWidth: i < lines.length - 1 ? StyleSheet.hairlineWidth : 0 },
            line.total ? { backgroundColor: colors.surface } : null,
          ]}>
          {show(line.cells[0], true, false)}
          <View style={styles.pairs}>
            {columns.slice(1).map((c, ci) => (
              <View key={c.label} style={styles.pair}>
                <Text variant="caption" tone="muted">
                  {c.label}
                </Text>
                {show(line.cells[ci + 1], line.total, false)}
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
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
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  listName: { flex: 1, minWidth: 0 },
  stackRow: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  pairs: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs },
  pair: { minWidth: '28%' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: '45%' },
  figures: { gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
});
