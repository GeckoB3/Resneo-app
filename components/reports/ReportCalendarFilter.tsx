/**
 * Reports' calendar filter (lib/reports/report-calendar.ts has the contract): one "Calendar" picker
 * for the whole Reports screen, "All calendars" plus each calendar, and what each section says
 * about it.
 *
 * The choice lives on the screen (`useReportCalendarFilter`) and reaches every section through
 * `ReportCalendarProvider`, so it holds while moving between tabs. Without a provider a section
 * reads "all calendars" and behaves exactly as it did before the filter.
 *
 * - Sections that split by calendar send `calendar_id`, then say what the answer is for:
 *   `CalendarScopeNote` ("Showing Hannah only.", or the whole venue when the answer carries no
 *   calendar).
 * - Sections that are always the whole venue show `WholeVenueNote` while a calendar is chosen; on
 *   Takings and Vouchers the picker is greyed out (`disabled`), as on the web.
 * - A refusal because of the filter (409 before the server's migration, 400 on `calendar_id`)
 *   shows the server's sentence with "Show all calendars" (`CalendarRefusal`).
 */
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticTap } from '@/lib/haptics';
import { useReportCalendars } from '@/lib/queries/useReportCalendars';
import {
  calendarRefusalMessage,
  calendarScope,
  calendarScopeText,
  reportCalendarCopy,
  reportCalendarLabel,
  showReportCalendarPicker,
} from '@/lib/reports/report-calendar';
import { fonts, minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ReportCalendarOption, ReportCalendarRef } from '@/types/reports';

type Icon = SymbolViewProps['name'];
const ICONS = {
  calendars: { ios: 'person.2', android: 'group', web: 'group' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  filter: { ios: 'line.3.horizontal.decrease.circle', android: 'filter_list', web: 'filter_list' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
} as const satisfies Record<string, Icon>;

// ─── The choice, shared with every section ───────────────────────────────────

interface ReportCalendarValue {
  /** The calendar chosen, or null for all calendars (the whole venue). */
  calendar: ReportCalendarRef | null;
  /** Back to all calendars: a section's way out of a refusal. */
  clearCalendar: () => void;
}

const NO_CALENDAR: ReportCalendarValue = { calendar: null, clearCalendar: () => {} };

const ReportCalendarContext = createContext<ReportCalendarValue>(NO_CALENDAR);

export function ReportCalendarProvider({
  calendar,
  onClear,
  children,
}: {
  calendar: ReportCalendarRef | null;
  onClear: () => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ calendar, clearCalendar: onClear }), [calendar, onClear]);
  return <ReportCalendarContext.Provider value={value}>{children}</ReportCalendarContext.Provider>;
}

/** The calendar the Reports screen is showing (null: all calendars). */
export function useReportCalendar(): ReportCalendarValue {
  return useContext(ReportCalendarContext);
}

/**
 * The screen's filter state: the calendars to choose from (`GET /api/venue/reports/calendars`) and
 * the one chosen. A calendar that has gone from the list reads as all calendars, so no report is
 * asked for a calendar the server no longer offers.
 */
export function useReportCalendarFilter(enabled = true) {
  const list = useReportCalendars(enabled);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const options = useMemo(() => list.data ?? [], [list.data]);
  const chosen = chosenId ? (options.find((o) => o.id === chosenId) ?? null) : null;
  // Kept by id and name, so a refreshed list hands the sections the same calendar.
  const id = chosen?.id ?? null;
  const name = chosen?.name ?? null;
  const calendar = useMemo<ReportCalendarRef | null>(
    () => (id !== null && name !== null ? { id, name } : null),
    [id, name],
  );
  const clear = useCallback(() => setChosenId(null), []);
  return {
    options,
    calendar,
    choose: setChosenId,
    clear,
    showPicker: showReportCalendarPicker(options, calendar?.id ?? null),
  };
}

// ─── The picker ──────────────────────────────────────────────────────────────

function CalendarOption({
  label,
  selected,
  last,
  onPress,
}: {
  label: string;
  selected: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, selected }}
      style={({ pressed }) => [
        styles.option,
        { borderBottomColor: colors.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, opacity: pressed ? 0.6 : 1 },
      ]}>
      <Text variant="body" color={selected ? colors.brand : colors.text} style={[styles.flex, selected ? styles.bold : null]}>
        {label}
      </Text>
      <View style={styles.mark}>{selected ? <SymbolView name={ICONS.check} size={18} tintColor={colors.brand} /> : null}</View>
    </Pressable>
  );
}

/**
 * "Calendar: All calendars" on one line; a tap opens a sheet with "All calendars" and each
 * calendar (one no longer active says so), and choosing applies it and closes the sheet.
 *
 * `disabled` on a tab whose figures are always the whole venue's (Takings, Vouchers): greyed out
 * and reading "All calendars", as the web's, while the tab says the choice stays on the others.
 */
export function ReportCalendarPicker({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: ReportCalendarOption[];
  /** The chosen calendar's id, or null for all calendars. */
  value: string | null;
  onChange: (calendarId: string | null) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const chosen = value && !disabled ? (options.find((o) => o.id === value) ?? null) : null;
  const label = chosen ? reportCalendarLabel(chosen) : reportCalendarCopy('cal.all');
  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => {
          hapticTap();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${reportCalendarCopy('cal.label')}, ${label}`}
        accessibilityHint={disabled ? undefined : reportCalendarCopy('cal.hint')}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        style={({ pressed }) => [
          styles.line,
          {
            borderColor: chosen ? colors.brand : colors.borderStrong,
            backgroundColor: chosen ? colors.brandSubtle : colors.surfaceRaised,
            opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
          },
        ]}>
        <SymbolView name={ICONS.calendars} size={18} tintColor={colors.brand} />
        <Text variant="label" tone="muted">
          {reportCalendarCopy('cal.label')}
        </Text>
        <Text variant="bodyMedium" numberOfLines={1} style={styles.flex}>
          {label}
        </Text>
        <SymbolView name={ICONS.chevronDown} size={16} tintColor={colors.textMuted} />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)}>
        <Text variant="heading" accessibilityRole="header">
          {reportCalendarCopy('cal.sheetTitle')}
        </Text>
        {/* Content-sized up to about half the screen, then it scrolls: a long team still fits. */}
        <ScrollView style={{ maxHeight: Math.round(height * 0.55) }} accessibilityRole="radiogroup">
          <CalendarOption label={reportCalendarCopy('cal.all')} selected={!chosen} last={options.length === 0} onPress={() => pick(null)} />
          {options.map((o, i) => (
            <CalendarOption
              key={o.id}
              label={reportCalendarLabel(o)}
              selected={chosen?.id === o.id}
              last={i === options.length - 1}
              onPress={() => pick(o.id)}
            />
          ))}
        </ScrollView>
        <Text variant="bodySmall" tone="muted">
          {reportCalendarCopy('cal.sheetNote')}
        </Text>
      </Sheet>
    </>
  );
}

// ─── What a section says ─────────────────────────────────────────────────────

/**
 * Under a report that can split by calendar: what the figures on screen are for, from the answer
 * itself (`echoed` is its `calendar`). Nothing while all calendars are chosen and the answer is
 * the whole venue's, as before the filter.
 */
export function CalendarScopeNote({
  echoed,
  detail,
  style,
}: {
  echoed: ReportCalendarRef | null | undefined;
  /** What one calendar's figures are, after "Showing {calendar} only." (the web's words). */
  detail?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { calendar } = useReportCalendar();
  const scope = calendarScope(calendar, echoed);
  const text = calendarScopeText(scope);
  if (!scope || !text) return null;
  if (scope.kind === 'whole-venue') return <QuietLine text={text} style={style} />;
  return (
    <View
      accessibilityRole="text"
      style={[styles.scope, { backgroundColor: colors.brandSubtle, borderColor: colors.brand }, style]}>
      <SymbolView name={ICONS.filter} size={16} tintColor={colors.brand} style={styles.quietIcon} />
      <Text variant="bodySmall" style={styles.flex}>
        <Text variant="bodySmall" style={styles.bold}>
          {text}
        </Text>
        {detail ? ` ${detail}` : null}
      </Text>
    </View>
  );
}

/**
 * In a report that is always the whole venue, while a calendar is chosen (the web's words):
 * - `figures`: a card inside a tab that splits by calendar (stock, history, SMS usage);
 * - `tab`: a whole tab, Takings or Vouchers, where the picker is greyed out: "These figures are for
 *   the whole venue. {calendar} stays chosen on the other tabs.";
 * - `files`: the data export.
 */
export function WholeVenueNote({
  variant = 'figures',
  style,
}: {
  variant?: 'figures' | 'tab' | 'files';
  style?: StyleProp<ViewStyle>;
}) {
  const { calendar } = useReportCalendar();
  if (!calendar) return null;
  const text =
    variant === 'tab'
      ? reportCalendarCopy('cal.wholeVenueTab', { calendar: calendar.name })
      : variant === 'files'
        ? reportCalendarCopy('cal.wholeVenueFiles')
        : reportCalendarCopy('cal.wholeVenue');
  return <QuietLine text={text} style={style} />;
}

function QuietLine({ text, style }: { text: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.quiet, style]}>
      <SymbolView name={ICONS.info} size={16} tintColor={colors.textMuted} style={styles.quietIcon} />
      <Text variant="bodySmall" tone="muted" style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

/**
 * The server's sentence when it refused this report because of the chosen calendar (or null for
 * any other failure), for the section to show in place of its usual error.
 */
export function useCalendarRefusal(error: unknown): string | null {
  const { calendar } = useReportCalendar();
  return calendarRefusalMessage(error, calendar != null);
}

/** The refusal in the section: the server's words, and the way back to all calendars. */
export function CalendarRefusal({ message }: { message: string }) {
  const { colors } = useTheme();
  const { clearCalendar } = useReportCalendar();
  return (
    <View accessibilityRole="alert" style={[styles.refusal, { borderColor: colors.warning, backgroundColor: colors.warningSurface }]}>
      <Text variant="bodySmall">{message}</Text>
      <Button
        label={reportCalendarCopy('cal.showAll')}
        size="sm"
        variant="secondary"
        onPress={clearCalendar}
        style={styles.refusalButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontFamily: fonts.bold },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: minTouchTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  mark: { width: 20, alignItems: 'center' },
  scope: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quiet: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  quietIcon: { marginTop: 2 },
  refusal: { gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  refusalButton: { alignSelf: 'flex-start' },
});
