import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { formatPence } from '@/lib/format';
import { hapticSelect } from '@/lib/haptics';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { VenueAddon, VenueAddonGroup } from '@/types/addon-groups';

/** Human label for a group's selection rules (web parity: `selectionRuleLabel`). */
export function addonSelectionRuleLabel(
  group: Pick<VenueAddonGroup, 'selection_type' | 'min_select' | 'max_select'>,
): string {
  if (group.selection_type === 'single') {
    return group.min_select === 1 ? 'Pick exactly one (required)' : 'Pick one (optional)';
  }
  const max = group.max_select == null ? '' : `, max ${group.max_select}`;
  const min = group.min_select === 0 ? 'Pick any' : `Min ${group.min_select}`;
  return `${min}${max}`;
}

/** A linked add-on group in display order — id + a name snapshot for archived groups. */
export type AddonLink = { id: string; name: string };

type AddonLinksEditorProps = {
  /** Linked groups in display order (persisted as link sort_order on save). */
  links: AddonLink[];
  onChange: (next: AddonLink[]) => void;
  /** The venue add-on library (for captions + the "add a group" picker). */
  groups: VenueAddonGroup[];
  addonsByGroup: Record<string, VenueAddon[]>;
  /** Open the group editor to create a brand-new group (auto-linked on save). */
  onCreateGroup: () => void;
  /** Open the group editor to edit an existing linked group in place. */
  onEditGroup: (group: VenueAddonGroup, addons: VenueAddon[]) => void;
  isLoading?: boolean;
  error?: string | null;
};

/**
 * Inline (controlled) editor for the add-on groups linked to a service — web
 * parity with the dashboard's AddonGroupsSection: link / unlink / reorder, edit a
 * linked group, create a new group inline, and pick from the venue library.
 * Renders no scroll container of its own (lives inside the form's scroll view).
 */
export function AddonLinksEditor({
  links,
  onChange,
  groups,
  addonsByGroup,
  onCreateGroup,
  onEditGroup,
  isLoading = false,
  error = null,
}: AddonLinksEditorProps) {
  const { colors } = useTheme();

  const groupById = new Map(groups.map((group) => [group.id, group] as const));
  const linkedIds = new Set(links.map((l) => l.id));
  const available = groups.filter((group) => group.is_active && !linkedIds.has(group.id));

  const groupCaption = (group: VenueAddonGroup) => {
    const addons = addonsByGroup[group.id] ?? [];
    return [
      addonSelectionRuleLabel(group),
      `${addons.length} option${addons.length === 1 ? '' : 's'}`,
      ...(group.hidden_from_online ? ['hidden online'] : []),
      ...(group.is_active ? [] : ['archived']),
    ].join(' · ');
  };

  const move = (index: number, dir: -1 | 1) => {
    const targetIdx = index + dir;
    if (targetIdx < 0 || targetIdx >= links.length) return;
    hapticSelect();
    const next = [...links];
    const tmp = next[index]!;
    next[index] = next[targetIdx]!;
    next[targetIdx] = tmp;
    onChange(next);
  };

  const unlink = (id: string) => {
    hapticSelect();
    onChange(links.filter((link) => link.id !== id));
  };

  const link = (group: VenueAddonGroup) => {
    hapticSelect();
    onChange([...links, { id: group.id, name: group.name }]);
  };

  return (
    <View style={styles.root}>
      <Text variant="caption" tone="muted">
        Optional extras a client can add at booking. Each group sets its own rule (pick one, pick many,
        required, optional).
      </Text>

      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}

      {/* Linked groups */}
      {links.length === 0 ? (
        <Text variant="bodySmall" tone="muted">
          No add-on groups linked yet. Create one or pick from the library below.
        </Text>
      ) : (
        links.map((linkRow, index) => {
          const group = groupById.get(linkRow.id);
          // Web parity (AddonGroupsSection): preview the group's active options
          // inline so the admin sees the contents without opening the editor.
          const visibleAddons = group
            ? (addonsByGroup[group.id] ?? []).filter((a) => a.is_active)
            : [];
          return (
            <View
              key={linkRow.id}
              style={[styles.linkedCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={styles.linkedHeaderRow}>
              <View style={styles.groupText}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {group?.name ?? linkRow.name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {group ? groupCaption(group) : 'Archived group'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Move ${group?.name ?? linkRow.name} up`}
                disabled={index === 0}
                hitSlop={4}
                onPress={() => move(index, -1)}
                style={({ pressed }) => [styles.iconBtn, { opacity: index === 0 ? 0.3 : pressed ? 0.5 : 1 }]}>
                <Text variant="title" tone="secondary">
                  ↑
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Move ${group?.name ?? linkRow.name} down`}
                disabled={index === links.length - 1}
                hitSlop={4}
                onPress={() => move(index, 1)}
                style={({ pressed }) => [
                  styles.iconBtn,
                  { opacity: index === links.length - 1 ? 0.3 : pressed ? 0.5 : 1 },
                ]}>
                <Text variant="title" tone="secondary">
                  ↓
                </Text>
              </Pressable>
              {group ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${group.name}`}
                  hitSlop={4}
                  onPress={() => onEditGroup(group, addonsByGroup[group.id] ?? [])}
                  style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}>
                  <Text variant="label" tone="brand">
                    Edit
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Unlink ${group?.name ?? linkRow.name}`}
                hitSlop={4}
                onPress={() => unlink(linkRow.id)}
                style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}>
                <Text variant="title" color={colors.danger}>
                  ✕
                </Text>
              </Pressable>
            </View>

            {visibleAddons.length > 0 ? (
              <View style={[styles.optionPreview, { borderTopColor: colors.border }]}>
                {visibleAddons.map((addon) => (
                  <Text key={addon.id} variant="caption" tone="muted" numberOfLines={1}>
                    • {addon.name}
                    {addon.additional_price_pence > 0
                      ? ` +${formatPence(addon.additional_price_pence)}`
                      : ''}
                    {addon.additional_duration_minutes > 0
                      ? ` +${addon.additional_duration_minutes}min`
                      : ''}
                  </Text>
                ))}
              </View>
            ) : null}
            </View>
          );
        })
      )}
      {links.length > 1 ? (
        <Text variant="caption" tone="muted">
          Clients see the groups in this order at booking.
        </Text>
      ) : null}

      <Button label="New add-on group" variant="secondary" onPress={onCreateGroup} fullWidth />

      {/* Library picker */}
      {available.length > 0 ? (
        <>
          <Text variant="overline" tone="muted">
            Add from library
          </Text>
          {available.map((group) => (
            <Pressable
              key={group.id}
              accessibilityRole="button"
              accessibilityLabel={`Link ${group.name}`}
              onPress={() => link(group)}
              style={({ pressed }) => [
                styles.availableRow,
                { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
              ]}>
              <View style={[styles.plusBadge, { borderColor: colors.brand }]}>
                <Text style={[styles.plusMark, { color: colors.brand }]}>+</Text>
              </View>
              <View style={styles.groupText}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {group.name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {groupCaption(group)}
                </Text>
              </View>
            </Pressable>
          ))}
        </>
      ) : isLoading ? (
        <Text variant="caption" tone="muted">
          Loading add-on library…
        </Text>
      ) : groups.filter((g) => g.is_active).length > 0 ? (
        <Text variant="caption" tone="muted">
          All active groups are already linked.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  linkedCard: {
    borderWidth: 1,
    borderRadius: radius.md,
  },
  linkedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.base,
    paddingRight: spacing.xs,
  },
  optionPreview: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  availableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
    minHeight: 56,
  },
  iconBtn: {
    minWidth: 40,
    height: 44,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusBadge: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusMark: {
    fontSize: 15,
    fontFamily: fonts.bold,
    lineHeight: 18,
  },
  groupText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});
