import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { CardHeader, StatRow } from '@/components/reports/ReportCardParts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { hapticTap } from '@/lib/haptics';
import { reportsCopy, type ReportsCopyId } from '@/lib/pos/reports-copy';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { downloadReportFile } from '@/lib/reports/pos-report-download';
import { customRangeProblem, POS_REPORT_GRAINS, POS_REPORT_PRESETS, presetRangeSoFar, shortRangeLabel } from '@/lib/reports/pos-report-format';
import { useToast } from '@/providers/ToastProvider';
import { brand, fonts, minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosReportPreset } from '@/types/pos';
import type { PosRangeChoice, ReportGrain } from '@/types/pos-reports';

/**
 * Shared parts of Reports' POS tabs (web `pos-report-ui.tsx`): the one-line range control and its
 * sheet, a report card whose CSV comes from the server (so `export` is enforced there), plain
 * tables laid out for a phone, KPI tiles in the web's colours, the line that says what a report
 * counts, and the download that opens the share sheet.
 *
 * Each tab leads with its numbers (Part 2 mock-up 3, approved 2026-10-11): the range on one line,
 * the KPI tiles, then the tables. SMS usage sits on the Overview only.
 */

type Icon = SymbolViewProps['name'];
const ICONS = {
  calendar: { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
} as const satisfies Record<string, Icon>;

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

function presetName(preset: PosReportPreset): string {
  return reportsCopy(`preset.${preset}` as ReportsCopyId);
}

/** One choice in the range sheet: its name, its dates, and a tick when it is the one shown. */
function RangeOption({
  label,
  detail,
  selected,
  opens = false,
  last = false,
  onPress,
}: {
  label: string;
  detail?: string | null;
  selected: boolean;
  /** "Choose dates": opens the date fields instead of choosing. */
  opens?: boolean;
  last?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={opens ? 'button' : 'radio'}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={opens ? { selected } : { checked: selected, selected }}
      style={({ pressed }) => [
        styles.option,
        { borderBottomColor: colors.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, opacity: pressed ? 0.6 : 1 },
      ]}>
      <Text variant="body" color={selected ? colors.brand : colors.text} style={[styles.flex, selected ? styles.bold : null]}>
        {label}
      </Text>
      {detail ? (
        <Text variant="bodySmall" tone="muted">
          {detail}
        </Text>
      ) : null}
      <View style={styles.optionMark}>
        {opens ? (
          <SymbolView name={ICONS.chevronRight} size={16} tintColor={colors.textMuted} />
        ) : selected ? (
          <SymbolView name={ICONS.check} size={18} tintColor={colors.brand} />
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * The range on one line (Part 2 mock-up 3): "This week, 5 to 11 Oct". A tap opens a sheet with the
 * presets, each with its dates, "Choose dates" and, where the report has one, Show by; choosing
 * applies it and closes the sheet. The sheet is the screen's own (one Modal, never stacked over
 * another sheet), and "Choose dates" opens inside it, where a range that can't be used says why.
 */
export function PosRangeLine({
  report,
  choice,
  onChoice,
  grain,
  onGrain,
  presets = POS_REPORT_PRESETS,
  rangeFor,
  rangeProblem = customRangeProblem,
  today,
  loading,
  currentRange,
}: {
  /** The report's name: the sheet asks "Show takings for", the date fields are "Takings From". */
  report: string;
  choice: PosRangeChoice;
  onChoice: (choice: PosRangeChoice) => void;
  /** Show by, for reports that have it. */
  grain?: ReportGrain;
  onGrain?: (grain: ReportGrain) => void;
  presets?: PosReportPreset[];
  /** A preset's dates, when the report reads its presets its own way (Vouchers). */
  rangeFor?: (preset: PosReportPreset) => { from: string; to: string };
  /** Why chosen dates can't be used, or null. */
  rangeProblem?: (from: string, to: string) => string | null;
  /** Today in the venue's zone. */
  today: string;
  loading: boolean;
  /** The report's own dates once loaded, to start "Choose dates" from. */
  currentRange: { from: string; to: string } | null;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<'list' | 'dates'>('list');
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const datesOf = (preset: PosReportPreset) => (rangeFor ? rangeFor(preset) : presetRangeSoFar(preset, today));
  const chosen = choice.kind === 'preset' ? datesOf(choice.preset) : { from: choice.from, to: choice.to };
  const dates = shortRangeLabel(chosen.from, chosen.to, today);
  const name = choice.kind === 'preset' ? presetName(choice.preset) : null;
  const shownDraft = draft ?? chosen;

  const close = () => setOpen(false);
  const pick = (next: PosRangeChoice) => {
    onChoice(next);
    close();
  };
  const openDates = () => {
    // The report's own dates, up to today: a whole month's end would start the fields in the future.
    setDraft(choice.kind === 'custom' || !currentRange ? chosen : { from: currentRange.from, to: currentRange.to > today ? today : currentRange.to });
    setProblem(null);
    setPage('dates');
  };
  const apply = () => {
    const why = rangeProblem(shownDraft.from, shownDraft.to);
    if (why) {
      setProblem(why);
      return;
    }
    pick({ kind: 'custom', from: shownDraft.from, to: shownDraft.to });
  };

  return (
    <>
      <Pressable
        onPress={() => {
          hapticTap();
          setPage('list');
          setProblem(null);
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={name ? `${name}, ${dates}` : dates}
        accessibilityHint={reportsCopy('rng.hint')}
        accessibilityState={{ busy: loading, expanded: open }}
        style={({ pressed }) => [
          styles.rangeLine,
          { borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised, opacity: pressed ? 0.7 : 1 },
        ]}>
        <SymbolView name={ICONS.calendar} size={20} tintColor={colors.brand} />
        <Text variant="body" numberOfLines={1} style={styles.flex}>
          {name ? (
            <>
              <Text variant="body" style={styles.bold}>
                {name}
              </Text>
              {`, ${dates}`}
            </>
          ) : (
            <Text variant="body" style={styles.bold}>
              {dates}
            </Text>
          )}
        </Text>
        {loading ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
        <SymbolView name={ICONS.chevronDown} size={18} tintColor={colors.textMuted} />
      </Pressable>

      <Sheet visible={open} onClose={close}>
        {page === 'list' ? (
          <>
            <Text variant="heading" accessibilityRole="header">
              {reportsCopy('rng.sheetTitle', { report: report.toLowerCase() })}
            </Text>
            <View accessibilityRole="radiogroup">
              {presets.map((preset) => {
                const r = datesOf(preset);
                return (
                  <RangeOption
                    key={preset}
                    label={presetName(preset)}
                    detail={shortRangeLabel(r.from, r.to, today)}
                    selected={choice.kind === 'preset' && choice.preset === preset}
                    onPress={() => pick({ kind: 'preset', preset })}
                  />
                );
              })}
              <RangeOption
                label={reportsCopy('rng.choose')}
                detail={choice.kind === 'custom' ? dates : null}
                selected={choice.kind === 'custom'}
                opens
                last
                onPress={openDates}
              />
            </View>
            {grain && onGrain ? (
              <View style={styles.showBy}>
                <Text variant="overline" tone="muted">
                  {reportsCopy('rng.showBy')}
                </Text>
                <Segmented
                  options={POS_REPORT_GRAINS.map((g) => ({ value: g, label: reportsCopy(`grain.${g}` as ReportsCopyId) }))}
                  value={grain}
                  onChange={(g) => {
                    onGrain(g);
                    close();
                  }}
                />
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Pressable
              onPress={() => setPage('list')}
              accessibilityRole="button"
              accessibilityLabel={reportsCopy('rng.back')}
              hitSlop={12}
              style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}>
              <SymbolView name={ICONS.chevronLeft} size={16} tintColor={colors.brand} />
              <Text variant="label" tone="brand">
                {reportsCopy('rng.back')}
              </Text>
            </Pressable>
            <Text variant="heading" accessibilityRole="header">
              {reportsCopy('rng.choose')}
            </Text>
            <View style={styles.custom}>
              <View style={styles.dateField}>
                <Text variant="caption" tone="muted">
                  {reportsCopy('rng.from')}
                </Text>
                <DatePickerField
                  value={shownDraft.from}
                  onChange={(from) => {
                    setProblem(null);
                    setDraft({ ...shownDraft, from });
                  }}
                  accessibilityLabel={`${report} ${reportsCopy('rng.from')}`}
                />
              </View>
              <View style={styles.dateField}>
                <Text variant="caption" tone="muted">
                  {reportsCopy('rng.to')}
                </Text>
                <DatePickerField
                  value={shownDraft.to}
                  onChange={(to) => {
                    setProblem(null);
                    setDraft({ ...shownDraft, to });
                  }}
                  accessibilityLabel={`${report} ${reportsCopy('rng.to')}`}
                />
              </View>
            </View>
            {problem ? (
              <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
                {problem}
              </Text>
            ) : null}
            <Button label={loading ? reportsCopy('rng.loading') : reportsCopy('rng.apply')} disabled={loading} onPress={apply} fullWidth />
          </>
        )}
      </Sheet>
    </>
  );
}

/**
 * What a report counts, in a quiet line under its figures ("Money in and out, on the day it
 * moved."), with the CSV of those figures when this person may export.
 */
export function ReportInfoLine({ text, exportTitle, onExport }: { text: string; exportTitle?: string; onExport?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.infoLine}>
      <SymbolView name={ICONS.info} size={16} tintColor={colors.textMuted} style={styles.infoIcon} />
      <Text variant="bodySmall" tone="muted" style={styles.flex}>
        {text}
      </Text>
      {onExport ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={reportsCopy('rep.exportLabel', { title: exportTitle ?? '' })}
          onPress={() => {
            hapticTap();
            onExport();
          }}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Text variant="label" tone="brand">
            {reportsCopy('rep.export')}
          </Text>
        </Pressable>
      ) : null}
    </View>
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
export function KpiTiles({ items }: { items: KpiItem[] }) {
  return (
    <View style={styles.tiles}>
      {items.map((it) =>
        it.tone ? (
          <KpiTile key={it.label} {...it} tone={it.tone} />
        ) : (
          <StatTile key={it.label} label={it.label} value={it.value} caption={it.caption} style={styles.tile} />
        ),
      )}
    </View>
  );
}

/** The web's StatTile colours (emerald for money in, amber for money out, navy, slate). */
export type KpiTone = 'emerald' | 'amber' | 'brand' | 'slate';

export interface KpiItem {
  label: string;
  value: string;
  caption?: string;
  /** A second line under the figure ("£1,122.70 with tips"). */
  caption2?: string;
  /** A tinted tile, as the web's report figures; without it, the plain tile. */
  tone?: KpiTone;
}

const KPI_TONES: Record<'light' | 'dark', Record<KpiTone, { bg: string; border: string; text: string }>> = {
  light: {
    emerald: { bg: '#ECFDF5', border: '#D1FAE5', text: '#065F46' },
    amber: { bg: '#FFFBEB', border: '#FEF3C7', text: '#78350F' },
    brand: { bg: brand[50], border: brand[100], text: brand[800] },
    slate: { bg: '#F8FAFC', border: '#E2E8F0', text: '#1E293B' },
  },
  dark: {
    emerald: { bg: '#0E2A22', border: '#134E3A', text: '#6EE7B7' },
    amber: { bg: '#2C2410', border: '#4A3A12', text: '#FCD34D' },
    brand: { bg: '#0E2438', border: '#1E3A52', text: brand[100] },
    slate: { bg: '#111A2B', border: '#233047', text: '#E2E8F0' },
  },
};

/** One figure first, its name above it: "PAYMENTS IN £1,256.20" (mock-up 3's tiles). */
function KpiTile({ label, value, caption, caption2, tone }: KpiItem & { tone: KpiTone }) {
  const { isDark } = useTheme();
  const c = KPI_TONES[isDark ? 'dark' : 'light'][tone];
  return (
    <View
      accessible
      accessibilityLabel={[label, value, caption, caption2].filter(Boolean).join(', ')}
      style={[styles.tile, styles.kpi, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text variant="overline" color={c.text} style={styles.kpiLabel}>
        {label}
      </Text>
      <Text color={c.text} style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      {caption ? (
        <Text variant="caption" color={c.text} style={styles.kpiSub}>
          {caption}
        </Text>
      ) : null}
      {caption2 ? (
        <Text variant="caption" color={c.text} style={styles.kpiSub}>
          {caption2}
        </Text>
      ) : null}
    </View>
  );
}

/** One row of a takings table: payments in, refunds out, net and tips. */
export interface MoneyRow {
  key: string;
  name: string;
  inPence: number;
  outPence: number;
  netPence: number;
  tipsPence: number;
}

/**
 * A takings table laid out for a phone (mock-up 3): the name, then In, Out and Net in columns that
 * line up, each row's tips under its name, and an optional total in bold. A screen reader hears
 * each row as one sentence with the full column names.
 */
export function MoneyTable({
  caption,
  nameHeader,
  rows,
  total,
  money,
}: {
  caption: string;
  nameHeader: string;
  rows: MoneyRow[];
  total?: MoneyRow;
  money: (pence: number) => string;
}) {
  const { colors } = useTheme();
  if (rows.length === 0) return <EmptyReport />;
  const line = (row: MoneyRow, isTotal: boolean) => (
    <View
      key={row.key}
      accessible
      accessibilityLabel={reportsCopy('tk.row.a11y', {
        name: row.name,
        in: money(row.inPence),
        out: money(row.outPence),
        net: money(row.netPence),
        tips: money(row.tipsPence),
      })}
      style={[
        styles.moneyRow,
        { borderTopColor: isTotal ? colors.borderStrong : colors.border, borderTopWidth: isTotal ? 1.5 : StyleSheet.hairlineWidth },
      ]}>
      <View style={styles.moneyName}>
        <Text variant="bodySmall" style={isTotal ? styles.bold : styles.medium}>
          {row.name}
        </Text>
        <Text variant="caption" tone="muted">
          {reportsCopy('tk.tipsSub', { amount: money(row.tipsPence) })}
        </Text>
      </View>
      {[row.inPence, row.outPence, row.netPence].map((pence, i) => (
        <Text
          key={i}
          variant="bodySmall"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[styles.moneyCell, styles.numeric, isTotal ? styles.bold : null]}>
          {money(pence)}
        </Text>
      ))}
    </View>
  );
  return (
    <View accessibilityLabel={caption}>
      <View style={styles.moneyHead} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text variant="overline" tone="muted" style={styles.moneyName}>
          {nameHeader}
        </Text>
        {[reportsCopy('tk.col.in'), reportsCopy('tk.col.out'), reportsCopy('tk.col.net')].map((h) => (
          <Text key={h} variant="overline" tone="muted" style={[styles.moneyCell, styles.numeric]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((row) => line(row, false))}
      {total ? line(total, true) : null}
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
  bold: { fontFamily: fonts.bold },
  medium: { fontFamily: fonts.medium },
  rangeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 50,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  optionMark: { width: 20, alignItems: 'center' },
  showBy: { gap: spacing.sm, marginTop: spacing.xs },
  back: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', minHeight: minTouchTarget - 12 },
  infoLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  infoIcon: { marginTop: 2 },
  kpi: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 14, paddingVertical: spacing.md, gap: spacing.xxs },
  kpiLabel: { opacity: 0.8 },
  kpiValue: { fontFamily: fonts.bold, fontSize: 23, lineHeight: 28, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  kpiSub: { fontFamily: fonts.medium, opacity: 0.85, fontVariant: ['tabular-nums'] },
  moneyHead: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingBottom: spacing.xs },
  moneyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm },
  moneyName: { flex: 1.3, minWidth: 0, gap: spacing.xxs },
  moneyCell: { flex: 1, minWidth: 0 },
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
