import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import type { DiaryAccess } from '@/lib/roles/roles';
import { DIARY_CHOICES, ROLE_INFO, SETTING_COPY, teamT } from '@/lib/roles/team-copy';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { RoleChoice } from '@/types/staff';

/**
 * The pieces the invite sheet and each person's sheet share (web `team/AccessSettings`,
 * `CalendarPicker` and the role cards), so a setting reads the same in both places: a step
 * heading, the role cards, the calendar list, a switch with its help, and the diary choices.
 */

/** A numbered step or a section of a sheet: its heading, and an optional line under it. */
export function StepHeading({ title, help }: { title: string; help?: string | null }) {
  return (
    <View style={styles.stepHeading}>
      <Text variant="label" accessibilityRole="header" style={styles.stepTitle}>
        {title}
      </Text>
      {help ? (
        <Text variant="bodySmall" tone="secondary">
          {help}
        </Text>
      ) : null}
    </View>
  );
}

/** A round radio mark, filled when chosen. */
function RadioMark({ selected }: { selected: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.radioOuter, { borderColor: selected ? colors.brand : colors.borderStrong }]}>
      {selected ? <View style={[styles.radioInner, { backgroundColor: colors.brand }]} /> : null}
    </View>
  );
}

/** A square tick box, filled when ticked. */
function CheckMark({ checked }: { checked: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.checkbox,
        { borderColor: checked ? colors.brand : colors.borderStrong, backgroundColor: checked ? colors.brand : 'transparent' },
      ]}>
      {checked ? (
        <Text variant="caption" color={colors.onBrand} style={styles.checkmark}>
          ✓
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The roles to choose from, as cards: the role, its one line and, when `showGoodFor`, who it suits
 * (web `InviteForm`, step 2).
 */
export function RoleChoiceList({
  options,
  value,
  onChange,
  disabled = false,
  showGoodFor = true,
}: {
  options: RoleChoice[];
  value: RoleChoice;
  onChange: (role: RoleChoice) => void;
  disabled?: boolean;
  showGoodFor?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={styles.roleList}>
      {options.map((key) => {
        const info = ROLE_INFO[key];
        const selected = key === value;
        return (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityHint={info.summary}
            disabled={disabled}
            onPress={() => {
              if (selected) return;
              hapticSelect();
              onChange(key);
            }}
            style={({ pressed }) => [
              styles.roleCard,
              {
                borderColor: selected ? colors.brand : colors.border,
                backgroundColor: selected ? colors.brandSubtle : colors.surfaceRaised,
                opacity: disabled ? 0.6 : pressed ? 0.8 : 1,
              },
            ]}>
            <RadioMark selected={selected} />
            <View style={styles.flex1}>
              <Text variant="bodyMedium" style={styles.roleLabel}>
                {info.label}
              </Text>
              <Text variant="bodySmall" tone="secondary">
                {info.summary}
              </Text>
              {showGoodFor ? (
                <Text variant="caption" tone="muted" style={styles.goodFor}>
                  {info.goodFor}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * "Their calendars" (roles plan §5.11; web `CalendarPicker`): the bookable calendars that belong to
 * a Front desk or Staff person, ticked in a list, with Tick all and Untick all for a longer list.
 */
export function CalendarChecklist({
  calendars,
  selected,
  onToggle,
  onSetAll,
  disabled = false,
}: {
  calendars: readonly { id: string; name: string }[];
  selected: readonly string[];
  onToggle: (calendarId: string, checked: boolean) => void;
  onSetAll: (all: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  if (calendars.length === 0) {
    return (
      <Text variant="bodySmall" tone="muted">
        {SETTING_COPY.noCalendars}
      </Text>
    );
  }
  return (
    <View style={styles.calendarBlock}>
      {calendars.length > 1 ? (
        <View style={styles.calendarActions}>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => onSetAll(true)}
            hitSlop={8}
            style={{ opacity: disabled ? 0.5 : 1 }}>
            <Text variant="label" tone="brand">
              {teamT('member.calendars.tickAll')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => onSetAll(false)}
            hitSlop={8}
            style={{ opacity: disabled ? 0.5 : 1 }}>
            <Text variant="label" tone="muted">
              {teamT('member.calendars.untickAll')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.calendarList, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        {calendars.map((c, index) => {
          const checked = selected.includes(c.id);
          return (
            <View key={c.id}>
              {index > 0 ? <View style={[styles.calendarDivider, { backgroundColor: colors.border }]} /> : null}
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled }}
                accessibilityLabel={c.name}
                disabled={disabled}
                onPress={() => {
                  hapticSelect();
                  onToggle(c.id, !checked);
                }}
                style={({ pressed }) => [
                  styles.calendarRow,
                  pressed && { backgroundColor: colors.surfaceRaised },
                  disabled && styles.dimmed,
                ]}>
                <CheckMark checked={checked} />
                <Text variant="body" style={styles.flex1}>
                  {c.name}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** A labelled switch with its help underneath (Appendix C, "Help text under the switches"). */
export function SettingSwitch({
  label,
  help,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  help: string;
  value: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.switchRow}>
      <View style={styles.flex1}>
        <Text variant="bodyMedium">{label}</Text>
        <Text variant="bodySmall" tone="secondary">
          {help}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.brand, false: colors.border }}
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
      />
    </View>
  );
}

/**
 * "Other people's diaries" (roles plan §5.11): the three choices, each with what it means, and the
 * Appendix C warning when View only or Hidden leaves someone with no calendar of their own.
 */
export function DiaryChoiceList({
  value,
  onChange,
  disabled = false,
  personName,
  hasCalendar,
}: {
  value: DiaryAccess;
  onChange: (next: DiaryAccess) => void;
  disabled?: boolean;
  /** For the warning, e.g. "Jess" or "This person". */
  personName: string;
  hasCalendar: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.diaryBlock}>
      <Text variant="bodyMedium">{SETTING_COPY.diariesLabel}</Text>
      <View accessibilityRole="radiogroup" style={styles.diaryList}>
        {DIARY_CHOICES.map((choice) => {
          const selected = choice.value === value;
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityHint={choice.help}
              disabled={disabled}
              onPress={() => {
                if (selected) return;
                hapticSelect();
                onChange(choice.value);
              }}
              style={({ pressed }) => [styles.diaryRow, { opacity: disabled ? 0.6 : pressed ? 0.7 : 1 }]}>
              <RadioMark selected={selected} />
              <View style={styles.flex1}>
                <Text variant="body">{choice.label}</Text>
                <Text variant="bodySmall" tone="secondary">
                  {choice.help}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {value !== 'book' && !hasCalendar ? (
        <View
          accessibilityRole="alert"
          style={[styles.warningBox, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
          <Text variant="bodySmall" color={colors.text}>
            {SETTING_COPY.noCalendarWarning(personName)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** What a Front desk or Staff person can see: the contact switch, other diaries, and exporting. */
export interface AccessValue {
  client_contact: boolean;
  other_diaries: DiaryAccess;
  export_clients: boolean;
}

/** The standard settings a new Front desk or Staff person starts with (roles plan §5.5). */
export const STANDARD_ACCESS: AccessValue = { client_contact: true, other_diaries: 'book', export_clients: false };

export function AccessSettingsFields({
  value,
  onChange,
  disabled = false,
  personName,
  hasCalendar,
}: {
  value: AccessValue;
  onChange: (patch: Partial<AccessValue>) => void;
  disabled?: boolean;
  personName: string;
  hasCalendar: boolean;
}) {
  return (
    <View style={styles.accessBlock}>
      <SettingSwitch
        label={SETTING_COPY.contactLabel}
        help={SETTING_COPY.contactHelp}
        value={value.client_contact}
        disabled={disabled}
        onChange={(on) => onChange({ client_contact: on })}
      />
      <DiaryChoiceList
        value={value.other_diaries}
        disabled={disabled}
        onChange={(next) => onChange({ other_diaries: next })}
        personName={personName}
        hasCalendar={hasCalendar}
      />
      <SettingSwitch
        label={SETTING_COPY.exportLabel}
        help={SETTING_COPY.exportHelp}
        value={value.export_clients}
        disabled={disabled}
        onChange={(on) => onChange({ export_clients: on })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
    minWidth: 0,
  },
  dimmed: {
    opacity: 0.6,
  },
  stepHeading: {
    gap: spacing.xs,
  },
  stepTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fonts.semibold,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 13,
    lineHeight: 15,
  },
  roleList: {
    gap: spacing.sm,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderRadius: radius.md,
  },
  roleLabel: {
    fontFamily: fonts.semibold,
  },
  goodFor: {
    marginTop: spacing.xxs,
  },
  calendarBlock: {
    gap: spacing.sm,
  },
  calendarActions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  calendarList: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  calendarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  calendarDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.base + 22 + spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  diaryBlock: {
    gap: spacing.sm,
  },
  diaryList: {
    gap: spacing.xs,
  },
  diaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  warningBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  accessBlock: {
    gap: spacing.lg,
  },
});
