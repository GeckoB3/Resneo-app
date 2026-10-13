/**
 * Reports' "Showing" picker (lib/reports/report-scope.ts has the contract; it extends the one-calendar
 * filter in lib/reports/report-calendar.ts): your whole venue, one of your calendars, a business you
 * may report on, one of its shared calendars, or everyone together, and what each section says.
 *
 * The choice lives on the screen (`useReportCalendarFilter`) and reaches every section through
 * `ReportCalendarProvider`, so it holds while moving between tabs, with the "Compare with" choice
 * beside it. Without a provider a section reads your whole venue and behaves exactly as it did
 * before the filter.
 *
 * - The bookings sections (Overview and Clients, New bookings, Booked value) send the whole choice
 *   (`useReportScopeQuery`), then say what the answer is for: `CalendarScopeNote`.
 * - The till sections (Sales, Commission) read `calendar`, which is only ever one of your OWN
 *   calendars: a partner's till money is never shared. With a partner or everyone together chosen
 *   they show your venue's figures and say so (`CalendarScopeNote till`, `WholeVenueNote tab`).
 * - Sections that are always the whole venue show `WholeVenueNote` while something is chosen; on
 *   Takings and Vouchers, and on every till tab while a partner is chosen, the picker is greyed out.
 * - A refusal because of the choice (409 before the server's migration, 400 on `calendar_id` or
 *   `business`) shows the server's sentence with "Show all calendars" (`CalendarRefusal`).
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
import { calendarRefusalMessage, reportCalendarCopy } from '@/lib/reports/report-calendar';
import type { ComparisonBasis } from '@/lib/reports/report-comparison';
import {
  bookingScopeQuery,
  isPartnerShowing,
  NO_SHOWING_OPTIONS,
  reportScopeCopy,
  resolveShowing,
  scopeNote,
  scopeRefusalMessage,
  showingChoiceKey,
  showingPickerGroups,
  showingPickerLabel,
  showShowingPicker,
  tillCalendarId,
  tillScopeText,
  togetherNamesFromOptions,
  VENUE_CHOICE,
  WHOLE_VENUE,
  type ReportScopeQuery,
  type ResolvedShowing,
  type ShowingChoice,
} from '@/lib/reports/report-scope';
import { fonts, minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ReportCalendarRef, ReportScopeEcho, ReportShowingOptions } from '@/types/reports';

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
  /**
   * One of your OWN calendars, or null: what a till report (Sales, Commission) may be sent. Never a
   * partner's calendar.
   */
  calendar: ReportCalendarRef | null;
  /** What the bookings reports show: your venue, a calendar (yours or a partner's), a business, or together. */
  showing: ResolvedShowing;
  /** The picker's choices, for the together note's names. */
  options: ReportShowingOptions;
  /** "Compare with": the previous period (the default) or the same dates last year. */
  compare: ComparisonBasis;
  /** Back to your whole venue: a section's way out of a refusal. */
  clearCalendar: () => void;
}

const NO_CALENDAR: ReportCalendarValue = {
  calendar: null,
  showing: WHOLE_VENUE,
  options: NO_SHOWING_OPTIONS,
  compare: 'previous',
  clearCalendar: () => {},
};

const ReportCalendarContext = createContext<ReportCalendarValue>(NO_CALENDAR);

/** One of your own calendars as a choice (a provider given only `calendar`, as before release 1). */
function ownCalendarShowing(calendar: ReportCalendarRef | null): ResolvedShowing {
  if (!calendar) return WHOLE_VENUE;
  return {
    choice: { kind: 'calendar', calendarId: calendar.id },
    kind: 'calendar',
    calendar,
    business: null,
    name: calendar.name,
  };
}

export function ReportCalendarProvider({
  calendar = null,
  showing,
  options = NO_SHOWING_OPTIONS,
  compare = 'previous',
  onClear,
  children,
}: {
  /** One of your own calendars; read when `showing` is not given. */
  calendar?: ReportCalendarRef | null;
  showing?: ResolvedShowing;
  options?: ReportShowingOptions;
  compare?: ComparisonBasis;
  onClear: () => void;
  children: ReactNode;
}) {
  const value = useMemo<ReportCalendarValue>(() => {
    const shown = showing ?? ownCalendarShowing(calendar);
    return {
      calendar: tillCalendarId(shown) && shown.calendar ? shown.calendar : null,
      showing: shown,
      options,
      compare,
      clearCalendar: onClear,
    };
  }, [calendar, showing, options, compare, onClear]);
  return <ReportCalendarContext.Provider value={value}>{children}</ReportCalendarContext.Provider>;
}

/** What the Reports screen is showing (`calendar` null: your whole venue, for a till report). */
export function useReportCalendar(): ReportCalendarValue {
  return useContext(ReportCalendarContext);
}

/**
 * What a bookings report (Overview and Clients, New bookings, Booked value) is sent: `calendar_id`,
 * `business` and `compare`. Stable while the choice is, so it can sit in a query's inputs.
 */
export function useReportScopeQuery(): ReportScopeQuery {
  const { showing, compare } = useReportCalendar();
  const { calendarId, business } = bookingScopeQuery(showing);
  return useMemo(() => ({ calendarId, business, compare }), [calendarId, business, compare]);
}

/**
 * The screen's picker state: the choices (`GET /api/venue/reports/calendars`), the one chosen, and
 * the comparison. A calendar or business that has gone from the list reads as your whole venue, so no
 * report is asked for something the server no longer offers. `allowBusinesses` false (a team
 * member) never offers a business.
 */
export function useReportCalendarFilter(enabled = true, allowBusinesses = true) {
  const list = useReportCalendars(enabled, allowBusinesses);
  const [choice, setChoice] = useState<ShowingChoice>(VENUE_CHOICE);
  const [compare, setCompare] = useState<ComparisonBasis>('previous');
  const options = useMemo(() => list.data ?? NO_SHOWING_OPTIONS, [list.data]);
  const resolved = resolveShowing(options, choice);
  // Kept by what it is, so a refreshed list hands the sections the same choice.
  const key = [
    showingChoiceKey(resolved.choice),
    resolved.name,
    resolved.calendar?.name ?? '',
    resolved.business?.name ?? '',
    resolved.business?.all_calendars ? '1' : '0',
  ].join('|');
  const [kept, setKept] = useState({ key, showing: resolved });
  if (kept.key !== key) setKept({ key, showing: resolved });
  const showing = kept.key === key ? kept.showing : resolved;
  const calendar = useMemo<ReportCalendarRef | null>(
    () => (tillCalendarId(showing) && showing.calendar ? showing.calendar : null),
    [showing],
  );
  const clear = useCallback(() => setChoice(VENUE_CHOICE), []);
  return {
    options,
    showing,
    calendar,
    choose: setChoice,
    clear,
    compare,
    setCompare,
    showPicker: showShowingPicker(options, showing),
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
 * "Showing: All calendars" on one line; a tap opens a sheet with the choices (lib/reports/report-scope.ts
 * `showingPickerGroups`: your venue and its calendars, then each business and its calendars, then
 * everyone together), and choosing applies it and closes the sheet.
 *
 * `disabled` on a tab whose figures are always your venue's (Takings, Vouchers, and every till tab
 * while a partner is chosen): greyed out and reading your whole venue, while the tab says the choice
 * stays on the others.
 */
export function ReportCalendarPicker({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: ReportShowingOptions;
  /** What is chosen. */
  value: ResolvedShowing;
  onChange: (choice: ShowingChoice) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const shown = disabled ? WHOLE_VENUE : value;
  const chosen = shown.kind !== 'venue';
  const label = showingPickerLabel(options, shown);
  const selectedKey = showingChoiceKey(shown.choice);
  const groups = showingPickerGroups(options);
  const pick = (choice: ShowingChoice) => {
    onChange(choice);
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
        accessibilityLabel={`${reportScopeCopy('scope.label')}, ${label}`}
        accessibilityHint={disabled ? undefined : reportScopeCopy('scope.hint')}
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
          {reportScopeCopy('scope.label')}
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
          {groups.map((group, gi) => (
            <View key={group.key} style={gi > 0 ? [styles.group, { borderTopColor: colors.border }] : null}>
              {group.heading ? (
                <Text variant="overline" tone="muted" accessibilityRole="header" style={styles.groupHeading}>
                  {group.heading}
                </Text>
              ) : null}
              {group.rows.map((row, i) => (
                <CalendarOption
                  key={row.key}
                  label={row.label}
                  selected={row.key === selectedKey}
                  last={i === group.rows.length - 1}
                  onPress={() => pick(row.choice)}
                />
              ))}
            </View>
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
 * Under a report that can be narrowed: what the figures on screen are for, from the answer itself
 * (`echoed` is its `calendar`, `scope` its `scope`). Nothing while your whole venue is chosen and the
 * answer is the whole venue's, as before the picker.
 *
 * `till` for Sales and Commission, which only ever take one of your own calendars: while a partner
 * or everyone together is chosen they say the figures are your venue's only.
 * `togetherNames` lists each business for everyone together (the answer's own list), yours first;
 * without it the picker's list is used.
 */
export function CalendarScopeNote({
  echoed,
  scope,
  detail,
  till = false,
  togetherNames,
  style,
}: {
  echoed: ReportCalendarRef | null | undefined;
  scope?: ReportScopeEcho | null;
  /** What one calendar's figures are, after "Showing {calendar} only." (the web's words). */
  detail?: string;
  till?: boolean;
  togetherNames?: readonly string[];
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { showing, calendar, options } = useReportCalendar();
  if (till && isPartnerShowing(showing)) {
    const tillText = tillScopeText(showing);
    return tillText ? <QuietLine text={tillText} style={style} /> : null;
  }
  const chosen = till ? ownCalendarShowing(calendar) : showing;
  const note = scopeNote(
    chosen,
    { calendar: echoed, scope: till ? null : scope },
    { detail, togetherNames: togetherNames && togetherNames.length > 0 ? togetherNames : togetherNamesFromOptions(options) },
  );
  if (!note) return null;
  if (note.kind === 'whole-venue') return <QuietLine text={reportCalendarCopy('cal.wholeVenue')} style={style} />;
  return (
    <View
      accessibilityRole="text"
      style={[styles.scope, { backgroundColor: colors.brandSubtle, borderColor: colors.brand }, style]}>
      <SymbolView name={ICONS.filter} size={16} tintColor={colors.brand} style={styles.quietIcon} />
      <Text variant="bodySmall" style={styles.flex}>
        <Text variant="bodySmall" style={styles.bold}>
          {note.lead}
        </Text>
        {note.detail ? ` ${note.detail}` : null}
      </Text>
    </View>
  );
}

/**
 * In a report that is always your venue's, while something is chosen (the web's words):
 * - `figures`: a card inside a tab that can be narrowed (stock, history, SMS usage);
 * - `tab`: a whole tab, Takings or Vouchers (and Sales or Commission while a partner is chosen),
 *   where the picker is greyed out: "These figures are for the whole venue. {calendar} stays chosen
 *   on the other tabs.", or, for a partner or everyone together, that takings and sales are never
 *   shared between businesses;
 * - `files`: the data export.
 */
export function WholeVenueNote({
  variant = 'figures',
  style,
}: {
  variant?: 'figures' | 'tab' | 'files';
  style?: StyleProp<ViewStyle>;
}) {
  const { showing } = useReportCalendar();
  if (showing.kind === 'venue') return null;
  const partner = isPartnerShowing(showing);
  const text =
    variant === 'tab'
      ? partner
        ? tillScopeText(showing)
        : reportCalendarCopy('cal.wholeVenueTab', { calendar: showing.name })
      : variant === 'files'
        ? reportCalendarCopy('cal.wholeVenueFiles')
        : reportCalendarCopy('cal.wholeVenue');
  return text ? <QuietLine text={text} style={style} /> : null;
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
 * The server's sentence when it refused this report because of the choice (or null for any other
 * failure), for the section to show in place of its usual error. `kind` 'bookings' for Overview and
 * Clients, New bookings and Booked value (a calendar, yours or a partner's, or a business); 'till'
 * (the default) for Sales and Commission (one of your own calendars).
 */
export function useCalendarRefusal(error: unknown, kind: 'till' | 'bookings' = 'till'): string | null {
  const { calendar, showing } = useReportCalendar();
  return kind === 'bookings'
    ? scopeRefusalMessage(error, showing.kind !== 'venue')
    : calendarRefusalMessage(error, calendar != null);
}

/** The refusal in the section: the server's words, and the way back to all calendars. */
export function CalendarRefusal({ message }: { message: string }) {
  const { colors } = useTheme();
  const { clearCalendar, showing } = useReportCalendar();
  return (
    <View accessibilityRole="alert" style={[styles.refusal, { borderColor: colors.warning, backgroundColor: colors.warningSurface }]}>
      <Text variant="bodySmall">{message}</Text>
      <Button
        // The web's words: back to all calendars, or to your venue from a partner or everyone together.
        label={isPartnerShowing(showing) ? reportScopeCopy('scope.showYourVenue') : reportCalendarCopy('cal.showAll')}
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
  group: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.xs, paddingTop: spacing.xs },
  groupHeading: { marginTop: spacing.sm },
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
