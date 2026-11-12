import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { formatPence } from '@/lib/format';
import { servicesByCategory, type FollowOnServiceOption } from '@/lib/follow-ons/service-options';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** "£55.00", "From £25.00", or '' when the service has no set price (web `followOnPriceLabel`). */
export function followOnPriceLabel(service: FollowOnServiceOption): string {
  if (service.from_price_pence != null) return `From ${formatPence(service.from_price_pence) ?? ''}`;
  if (service.price_pence != null) return formatPence(service.price_pence) ?? '';
  return '';
}

/**
 * A searchable checklist of the venue's services under their headings, with "Select all" per
 * heading, for the follow-on group sheet's two lists (web `FollowOnServicePicker`). `selectedIds`
 * keeps its order: ticking adds to the end. Services in `blockedIds` are shown but cannot be
 * ticked, with `blockedNote` (or `foot`) saying why.
 */
export function FollowOnServicePicker({
  label,
  help,
  foot,
  services,
  selectedIds,
  blockedIds,
  blockedNote,
  onChange,
  testID,
}: {
  label: string;
  help: string;
  foot?: string;
  services: readonly FollowOnServiceOption[];
  selectedIds: readonly string[];
  blockedIds?: ReadonlySet<string>;
  blockedNote?: string;
  onChange: (next: string[]) => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const live = services.filter((s) => s.is_active || selected.has(s.id));
    return servicesByCategory(
      q ? live.filter((s) => s.name.toLowerCase().includes(q) || (s.category ?? '').toLowerCase().includes(q)) : live,
    );
  }, [services, query, selected]);

  const toggle = (id: string) => {
    hapticSelect();
    onChange(selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };
  const selectAll = (ids: string[]) => {
    hapticSelect();
    onChange([...selectedIds, ...ids.filter((id) => !selected.has(id) && !blockedIds?.has(id))]);
  };
  const footText = foot ?? (blockedIds && blockedIds.size > 0 ? blockedNote : undefined);

  return (
    <View style={styles.root} testID={testID}>
      <Text variant="bodyMedium">{label}</Text>
      <Text variant="caption" tone="muted">
        {help}
      </Text>
      <Input
        accessibilityLabel={`Search services for ${label}`}
        placeholder="Search services"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {visible.length === 0 ? (
        <Text variant="bodySmall" tone="muted">
          No services match.
        </Text>
      ) : (
        visible.map((group) => {
          const pickable = group.services.filter((s) => !blockedIds?.has(s.id)).map((s) => s.id);
          const allTicked = pickable.every((id) => selected.has(id));
          return (
            <View key={group.category} style={styles.group}>
              <View style={styles.heading}>
                <Text variant="overline" tone="muted">
                  {group.category}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Select all in ${group.category}`}
                  accessibilityState={{ disabled: allTicked }}
                  disabled={allTicked}
                  hitSlop={8}
                  onPress={() => selectAll(pickable)}>
                  <Text variant="caption" color={allTicked ? colors.textMuted : colors.brand}>
                    Select all
                  </Text>
                </Pressable>
              </View>
              {group.services.map((s) => {
                const blocked = blockedIds?.has(s.id) ?? false;
                const checked = selected.has(s.id);
                const meta = [s.duration_minutes ? `${s.duration_minutes} min` : null, followOnPriceLabel(s) || null]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Pressable
                    key={s.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked, disabled: blocked }}
                    accessibilityLabel={s.name}
                    disabled={blocked}
                    onPress={() => toggle(s.id)}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        borderColor: checked ? colors.brand : colors.border,
                        backgroundColor: checked ? colors.brandSubtle : colors.surface,
                        opacity: blocked ? 0.45 : pressed ? 0.7 : 1,
                      },
                    ]}>
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: checked ? colors.brand : colors.borderStrong,
                          backgroundColor: checked ? colors.brand : 'transparent',
                        },
                      ]}>
                      {checked ? <Text style={styles.checkmark}>✓</Text> : null}
                    </View>
                    <Text variant="bodyMedium" numberOfLines={1} style={styles.name}>
                      {s.name}
                      {!s.is_active ? ' (switched off)' : ''}
                    </Text>
                    {meta ? (
                      <Text variant="caption" tone="muted">
                        {meta}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          );
        })
      )}
      {footText ? (
        <Text variant="caption" tone="muted">
          {footText}
        </Text>
      ) : null}
    </View>
  );
}

/** The chosen services in order, with buttons to move each up or down (web `FollowOnOrderList`). */
export function FollowOnOrderList({
  services,
  orderedIds,
  onChange,
}: {
  services: readonly FollowOnServiceOption[];
  orderedIds: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const { colors } = useTheme();
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s] as const)), [services]);
  if (orderedIds.length < 2) return null;
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= orderedIds.length) return;
    hapticSelect();
    const next = [...orderedIds];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };
  return (
    <View style={styles.order}>
      <Text variant="overline" tone="muted">
        Order clients see
      </Text>
      {orderedIds.map((id, index) => {
        const name = byId.get(id)?.name ?? 'Unknown service';
        return (
          <View key={id} style={[styles.orderRow, { backgroundColor: colors.surfaceSunken }]}>
            <Text variant="caption" tone="muted" style={styles.orderIndex}>
              {index + 1}.
            </Text>
            <Text variant="bodySmall" numberOfLines={1} style={styles.name}>
              {name}
            </Text>
            <Arrow label={`Move ${name} up`} glyph="↑" disabled={index === 0} onPress={() => move(index, -1)} />
            <Arrow
              label={`Move ${name} down`}
              glyph="↓"
              disabled={index === orderedIds.length - 1}
              onPress={() => move(index, 1)}
            />
          </View>
        );
      })}
    </View>
  );
}

function Arrow({ label, glyph, disabled, onPress }: { label: string; glyph: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.arrow, { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}>
      <Text variant="bodyMedium">{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  group: { gap: spacing.xs },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#FFFFFF', fontSize: 13, lineHeight: 15, fontWeight: '700' },
  name: { flex: 1, minWidth: 0 },
  order: { gap: spacing.xs },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.sm,
    borderRadius: radius.sm,
  },
  orderIndex: { width: 20 },
  arrow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
