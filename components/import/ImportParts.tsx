import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Small pieces the data import screens share: a coloured note, a searchable picker sheet, a
 * labelled choice row, a thin progress bar, and the yes or no tick row.
 */

export type BannerTone = 'info' | 'warning' | 'success' | 'danger';

/** A coloured note with an optional bold first line (the web's tinted boxes). */
export function ImportBanner({
  tone = 'info',
  title,
  children,
  action,
  testID,
}: {
  tone?: BannerTone;
  title?: string | null;
  children?: ReactNode;
  action?: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean };
  testID?: string;
}) {
  const { colors } = useTheme();
  const palette = {
    info: { bg: colors.infoSurface, border: colors.info },
    warning: { bg: colors.warningSurface, border: colors.warning },
    success: { bg: colors.successSurface, border: colors.success },
    danger: { bg: colors.dangerSurface, border: colors.danger },
  }[tone];
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      {title ? <Text variant="label">{title}</Text> : null}
      {typeof children === 'string' ? <Text variant="bodySmall">{children}</Text> : children}
      {action ? (
        <Button
          label={action.label}
          size="sm"
          variant={tone === 'danger' ? 'danger' : 'secondary'}
          loading={action.loading}
          disabled={action.disabled}
          onPress={action.onPress}
          style={styles.bannerAction}
        />
      ) : null}
    </View>
  );
}

/** A thin bar for a percentage (0 to 100). */
export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={[styles.track, { backgroundColor: colors.border }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors.brand }]} />
    </View>
  );
}

export type PickerOption = { value: string; label: string; detail?: string | null };

/**
 * A searchable list in a tall sheet: choose a field for a column, a column for a field, or a
 * service to match. The search box shows once the list is long enough to need it.
 */
export function OptionPickerSheet({
  visible,
  title,
  subtitle,
  options,
  selected,
  noneLabel,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string | null;
  options: PickerOption[];
  selected?: string | null;
  /** Offer an empty choice at the top (e.g. "Don't import this column"). */
  noneLabel?: string;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || (o.detail ?? '').toLowerCase().includes(q));
  }, [options, query]);

  function pick(value: string) {
    setQuery('');
    onPick(value);
  }

  return (
    <Sheet visible={visible} onClose={onClose} fill maxHeight="88%" keyboardAvoidance="overlay">
      <View style={styles.sheetHeader}>
        <Text variant="heading">{title}</Text>
        {subtitle ? (
          <Text variant="bodySmall" tone="muted">
            {subtitle}
          </Text>
        ) : null}
        {options.length > 8 ? (
          <Input
            placeholder="Search"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search the list"
          />
        ) : null}
      </View>
      <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
        {noneLabel ? <PickRow label={noneLabel} selected={!selected} onPress={() => pick('')} /> : null}
        {shown.map((o) => (
          <PickRow key={o.value} label={o.label} detail={o.detail} selected={selected === o.value} onPress={() => pick(o.value)} />
        ))}
        {shown.length === 0 ? (
          <Text variant="bodySmall" tone="muted">
            Nothing matches that search.
          </Text>
        ) : null}
      </ScrollView>
      <View style={styles.sheetFooter}>
        <Button label="Cancel" variant="secondary" onPress={onClose} fullWidth />
      </View>
    </Sheet>
  );
}

function PickRow({ label, detail, selected, onPress }: { label: string; detail?: string | null; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.pickRow,
        {
          borderColor: selected ? colors.brand : colors.border,
          backgroundColor: selected ? colors.brandSubtle : colors.surfaceRaised,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <Text variant="bodyMedium">{label}</Text>
      {detail ? (
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * A labelled box that opens a picker: the value chosen, or a prompt. Used in place of the web's
 * `<select>`.
 */
export function SelectField({
  label,
  value,
  placeholder,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  label?: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.selectWrap}>
      {label ? (
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
      ) : null}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
        accessibilityState={{ disabled: Boolean(disabled) }}
        style={({ pressed }) => [
          styles.select,
          { borderColor: colors.border, backgroundColor: colors.surfaceRaised, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
        ]}>
        <Text variant="bodySmall" tone={value ? 'default' : 'muted'} numberOfLines={1} style={styles.selectText}>
          {value ?? placeholder}
        </Text>
        <Text variant="bodySmall" tone="muted">
          Change
        </Text>
      </Pressable>
    </View>
  );
}

/** A tick box row (the web's checkbox with its label). */
export function TickRow({
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  help?: string | null;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      style={({ pressed }) => [styles.tickRow, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}>
      <View
        style={[
          styles.tickBox,
          { borderColor: checked ? colors.brand : colors.borderStrong, backgroundColor: checked ? colors.brand : 'transparent' },
        ]}>
        {checked ? (
          <Text variant="caption" color={colors.onBrand}>
            ✓
          </Text>
        ) : null}
      </View>
      <View style={styles.tickText}>
        <Text variant="bodyMedium">{label}</Text>
        {help ? (
          <Text variant="caption" tone="secondary">
            {help}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A confidence badge for an AI match. */
export function ConfidenceBadge({ confidence }: { confidence: string | null | undefined }) {
  if (confidence === 'high') return <Badge label="Good match" tone="success" />;
  if (confidence === 'medium') return <Badge label="Likely match" tone="warning" />;
  if (confidence === 'low') return <Badge label="A guess" tone="danger" />;
  return null;
}

export const importStyles = StyleSheet.create({
  stack: { gap: spacing.md },
  tight: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  content: { gap: spacing.base, paddingBottom: spacing['3xl'] },
});

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  bannerAction: { alignSelf: 'flex-start', marginTop: spacing.xs },
  track: { height: 8, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full },
  sheetHeader: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  sheetScroll: { flex: 1 },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  sheetFooter: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  pickRow: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.xxs },
  selectWrap: { gap: spacing.xs },
  select: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  selectText: { flex: 1 },
  tickRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: 44, paddingVertical: spacing.xs },
  tickBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  tickText: { flex: 1, gap: spacing.xxs },
});
