import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import type { DraftIssue } from '@/lib/services-setup/drafts';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Small pieces the services setup screens share (the web wizard's `Button variant="link"`,
 * issue list, status icons and calendar ticks, on a phone).
 */

/** A text-only action, the web's `variant="link"`. */
export function TextLink({
  label,
  onPress,
  disabled = false,
  small = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  small?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.link, { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 }]}>
      <Text variant={small ? 'caption' : 'bodySmall'} color={colors.brand} style={styles.linkText}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A bordered, lightly shaded box (the web's `Panel`). */
export function Panel({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'warning' | 'danger' }) {
  const { colors } = useTheme();
  const background =
    tone === 'warning' ? colors.warningSurface : tone === 'danger' ? colors.dangerSurface : colors.surfaceSunken;
  return <View style={[styles.panel, { backgroundColor: background, borderColor: colors.border }]}>{children}</View>;
}

const ISSUE_SYMBOL = {
  fix: { ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' },
  check: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' },
  info: { ios: 'info.circle.fill', android: 'info', web: 'info' },
} as const;

/** The notes on a draft card: red to fix, amber to check, grey for the AI's own notes. */
export function IssueList({ issues }: { issues: DraftIssue[] }) {
  const { colors } = useTheme();
  if (issues.length === 0) return null;
  return (
    <View style={styles.issues}>
      {issues.map((issue, i) => {
        const tint = issue.level === 'fix' ? colors.danger : issue.level === 'check' ? colors.warning : colors.textMuted;
        return (
          <View key={`${issue.kind}-${i}`} style={styles.issueRow}>
            <SymbolView name={ISSUE_SYMBOL[issue.level]} tintColor={tint} size={15} style={styles.issueIcon} />
            <Text
              variant="bodySmall"
              style={styles.flex}
              color={issue.level === 'fix' ? colors.danger : issue.level === 'check' ? colors.text : colors.textSecondary}>
              {issue.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Waiting, reading, read or failed, for one source. */
export function SourceStatusIcon({ status }: { status: 'waiting' | 'reading' | 'done' | 'failed' }) {
  const { colors } = useTheme();
  if (status === 'reading') return <ActivityIndicator size="small" color={colors.brand} />;
  if (status === 'done') {
    return <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} tintColor={colors.success} size={20} />;
  }
  if (status === 'failed') {
    return <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} tintColor={colors.danger} size={20} />;
  }
  return <View style={[styles.waitingDot, { borderColor: colors.border }]} />;
}

/** Tick calendars on and off (the web's checkbox row of calendar names). */
export function CalendarChips({
  calendars,
  selectedIds,
  onChange,
  disabled = false,
}: {
  calendars: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.chips} pointerEvents={disabled ? 'none' : 'auto'}>
      {calendars.map((c) => {
        const on = selectedIds.includes(c.id);
        return (
          <Chip
            key={c.id}
            label={c.name}
            selected={on}
            onPress={() => onChange(on ? selectedIds.filter((id) => id !== c.id) : [...selectedIds, c.id])}
          />
        );
      })}
    </View>
  );
}

/** "everyone", "no one yet", "Sam and Jo", "Sam, Jo and 2 more". */
export function calendarSummary(ids: string[], calendars: { id: string; name: string }[]): string {
  if (ids.length === calendars.length) return 'everyone';
  if (ids.length === 0) return 'no one yet';
  const names = calendars.filter((c) => ids.includes(c.id)).map((c) => c.name);
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

export function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** "site.co.uk/prices" for a source row. */
export function hostLabel(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return url;
  }
}

const styles = StyleSheet.create({
  link: {
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  linkText: {
    fontWeight: '600',
  },
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  issues: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  issueRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  issueIcon: {
    marginTop: 2,
  },
  flex: {
    flex: 1,
  },
  waitingDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
