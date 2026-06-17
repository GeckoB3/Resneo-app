import { useMemo } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import {
  applyCalendarVisibilityChange,
  normaliseCalendarIds,
  normaliseGrant,
} from '@/lib/linked/grants';
import { spacing, radius, minTouchTarget } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  LinkActionLevel,
  LinkCalendarVisibility,
  LinkGrant,
} from '@/types/linked-venues';

const VISIBILITY_OPTIONS: { value: LinkCalendarVisibility; label: string }[] = [
  { value: 'none', label: 'No access' },
  { value: 'time_only', label: 'Time blocks only' },
  { value: 'full_details', label: 'Full booking detail' },
];

const ACTION_OPTIONS: { value: LinkActionLevel; label: string }[] = [
  { value: 'none', label: 'View only' },
  { value: 'edit_existing', label: 'Edit existing' },
  { value: 'create_edit_cancel', label: 'Full management' },
];

/** A single in-scope calendar row with a checkbox affordance. */
function CalendarCheckRow({
  name,
  checked,
  disabled,
  isFirst,
  onToggle,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  isFirst: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={name}
      disabled={disabled}
      onPress={() => {
        hapticSelect();
        onToggle();
      }}
      style={[
        styles.calRow,
        !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
      ]}>
      <View
        style={[
          styles.checkbox,
          {
            borderColor: checked ? colors.brand : colors.borderStrong,
            backgroundColor: checked ? colors.brand : 'transparent',
          },
        ]}>
        {checked ? (
          <Text variant="caption" color={colors.onBrand} style={styles.checkmark}>
            ✓
          </Text>
        ) : null}
      </View>
      <Text variant="bodySmall" numberOfLines={1} style={styles.flex1}>
        {name}
      </Text>
    </Pressable>
  );
}

/** §18 "which of your calendars?" picker — All vs a specific subset. */
function CalendarScopeField({
  calendars,
  value,
  disabled,
  onChange,
}: {
  calendars: { id: string; name: string }[];
  value: string[] | null;
  disabled?: boolean;
  onChange: (ids: string[] | null) => void;
}) {
  const specific = value != null && value.length > 0;
  const selected = useMemo(() => new Set(value ?? []), [value]);
  const summary = specific ? `${selected.size} selected` : 'All calendars';

  return (
    <CollapsibleCard title="Which of your calendars?" summary={summary}>
      <View style={styles.scopeBody}>
        <Segmented
          options={[
            { value: 'all', label: 'All calendars' },
            { value: 'specific', label: 'Choose specific' },
          ]}
          value={specific ? 'specific' : 'all'}
          onChange={(next) => {
            if (disabled) return;
            // "All" clears the scope; "Choose specific" seeds with every calendar
            // selected (matching the web, which lets you then untick).
            onChange(next === 'all' ? null : calendars.map((c) => c.id));
          }}
        />
        {specific ? (
          <View style={styles.calList}>
            {calendars.map((c, i) => (
              <CalendarCheckRow
                key={c.id}
                name={c.name}
                isFirst={i === 0}
                checked={selected.has(c.id)}
                disabled={disabled}
                onToggle={() => {
                  const next = new Set(selected);
                  if (next.has(c.id)) next.delete(c.id);
                  else next.add(c.id);
                  onChange(next.size === 0 ? null : [...next]);
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
    </CollapsibleCard>
  );
}

/**
 * Editor for ONE direction of a link's permissions, with §5.5 coherence
 * (`normaliseGrant` / `applyCalendarVisibilityChange` applied on every change so
 * an incoherent grant can never be expressed). Mirrors the web `GrantEditor`.
 *
 * `reductionOnly` locks the calendar-visibility / action segmented controls so
 * the Reduce sheet can only step access down — handled by the caller via the
 * pure grant helpers; here it simply disables the increase affordances visually
 * by leaving validation to the parent (the parent still gates the submit).
 */
export function GrantEditor({
  value,
  onChange,
  calendars,
  disabled = false,
  label,
  hint,
}: {
  value: LinkGrant;
  onChange: (next: LinkGrant) => void;
  /** The granting venue's own calendars, enabling the §18 scope picker. */
  calendars: { id: string; name: string }[];
  disabled?: boolean;
  /** Reduce sheet locks edits to reductions only; the parent validates. */
  reductionOnly?: boolean;
  /** Optional title rendered above the controls (used by GrantPairEditor). */
  label?: string;
  hint?: string;
}) {
  const { colors } = useTheme();
  const v = normaliseGrant(value);

  const piiDisabled = disabled || v.calendar !== 'full_details';
  const actDisabled = disabled || v.calendar !== 'full_details' || !v.pii;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {label ? <Text variant="label">{label}</Text> : null}
      {hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}

      <View style={styles.field}>
        <Text variant="label" tone="secondary">
          Calendar visibility
        </Text>
        <Segmented
          options={VISIBILITY_OPTIONS}
          value={v.calendar}
          onChange={(next) => onChange(applyCalendarVisibilityChange(v, next))}
        />
      </View>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: v.pii, disabled: piiDisabled }}
        disabled={piiDisabled}
        onPress={() => onChange(normaliseGrant({ ...v, pii: !v.pii }))}
        style={styles.piiRow}>
        <View style={styles.flex1}>
          <Text variant="bodySmall" tone={piiDisabled ? 'muted' : 'default'}>
            Share client contact details
          </Text>
          <Text variant="caption" tone="muted">
            Name, email and phone
          </Text>
        </View>
        <Switch
          value={v.pii}
          disabled={piiDisabled}
          onValueChange={(next) => onChange(normaliseGrant({ ...v, pii: next }))}
          trackColor={{ true: colors.brand, false: colors.border }}
        />
      </Pressable>

      <View style={styles.field}>
        <Text variant="label" tone={actDisabled ? 'muted' : 'secondary'}>
          Booking actions
        </Text>
        <Segmented
          options={ACTION_OPTIONS}
          value={v.act}
          onChange={(next) => {
            if (actDisabled) return;
            onChange(normaliseGrant({ ...v, act: next }));
          }}
        />
      </View>

      {calendars.length > 0 && v.calendar !== 'none' ? (
        <CalendarScopeField
          calendars={calendars}
          value={v.calendarIds ?? null}
          disabled={disabled}
          onChange={(ids) =>
            onChange(normaliseGrant({ ...v, calendarIds: normaliseCalendarIds(ids) }))
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.base,
    gap: spacing.md,
  },
  field: {
    gap: spacing.sm,
  },
  piiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: minTouchTarget,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
  scopeBody: {
    gap: spacing.md,
  },
  calList: {},
  calRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: minTouchTarget,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontWeight: '700',
    lineHeight: 16,
  },
});
