import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
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

export type AddonLinksTarget = {
  serviceId: string;
  serviceName: string;
  /**
   * Currently linked groups in display order — a snapshot from the service row,
   * so archived groups still show a name even when the library query excludes them.
   */
  linkedGroups: { id: string; name: string }[];
};

type AddonLinksSheetProps = {
  target: AddonLinksTarget | null;
  groups: VenueAddonGroup[];
  addonsByGroup: Record<string, VenueAddon[]>;
  saving?: boolean;
  onClose: () => void;
  /** Receives the FULL linked-group id list in display order (replace semantics on the API). */
  onSave: (groupIds: string[]) => void;
};

/**
 * Link/unlink/reorder the venue's add-on groups for one service — web parity with
 * the AddonGroupsSection in the service edit form (linked list with move up/down
 * + a picker of remaining active groups). Order is persisted as link sort_order.
 *
 * State is seeded via useEffect (not render-phase setState) to avoid React 18
 * strict-mode issues. Non-admin staff can view; linking is server-gated.
 */
export function AddonLinksSheet({
  target,
  groups,
  addonsByGroup,
  saving = false,
  onClose,
  onSave,
}: AddonLinksSheetProps) {
  const { colors } = useTheme();

  /** Linked group ids in display order. */
  const [selected, setSelected] = useState<string[]>([]);
  // seededId stored in state (not ref) so `seeded` can be read safely during render.
  const [seededId, setSeededId] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeededId(null);
      return;
    }
    if (target.serviceId === seededId) return;

    setSelected(target.linkedGroups.map((g) => g.id));

    setSeededId(target.serviceId);
  // seededId intentionally omitted to avoid infinite loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const groupById = new Map(groups.map((group) => [group.id, group] as const));
  const snapshotName = (id: string) =>
    target?.linkedGroups.find((g) => g.id === id)?.name ?? 'Add-on group';

  const move = (index: number, dir: -1 | 1) => {
    const targetIdx = index + dir;
    if (targetIdx < 0 || targetIdx >= selected.length) return;
    hapticSelect();
    setSelected((current) => {
      const next = [...current];
      const tmp = next[index]!;
      next[index] = next[targetIdx]!;
      next[targetIdx] = tmp;
      return next;
    });
  };

  const unlink = (id: string) => {
    hapticSelect();
    setSelected((current) => current.filter((groupId) => groupId !== id));
  };

  const link = (id: string) => {
    hapticSelect();
    setSelected((current) => [...current, id]);
  };

  const available = groups.filter((group) => group.is_active && !selected.includes(group.id));
  const seeded = target && seededId === target.serviceId;

  const groupCaption = (group: VenueAddonGroup) => {
    const addons = addonsByGroup[group.id] ?? [];
    return [
      addonSelectionRuleLabel(group),
      `${addons.length} option${addons.length === 1 ? '' : 's'}`,
      ...(group.hidden_from_online ? ['hidden online'] : []),
      ...(group.is_active ? [] : ['archived']),
    ].join(' · ');
  };

  return (
    <Sheet visible={!!target} onClose={onClose} maxHeight="88%">
      {seeded ? (
        <View style={styles.body}>
          <View>
            <Text variant="overline" tone="muted">
              Add-on groups
            </Text>
            <Text variant="title" numberOfLines={1}>
              {target.serviceName}
            </Text>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
            {/* Linked groups, reorderable */}
            <Text variant="overline" tone="muted">
              Linked ({selected.length})
            </Text>
            {selected.length === 0 ? (
              <Text variant="bodySmall" tone="muted">
                No add-on groups linked yet. Add one from the list below.
              </Text>
            ) : (
              selected.map((id, index) => {
                const group = groupById.get(id);
                return (
                  <View
                    key={id}
                    style={[
                      styles.linkedRow,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                    ]}>
                    <View style={styles.groupText}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {group?.name ?? snapshotName(id)}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {group ? groupCaption(group) : 'Archived group'}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${group?.name ?? snapshotName(id)} up`}
                      disabled={index === 0}
                      hitSlop={4}
                      onPress={() => move(index, -1)}
                      style={({ pressed }) => [
                        styles.iconBtn,
                        { opacity: index === 0 ? 0.3 : pressed ? 0.5 : 1 },
                      ]}>
                      <Text variant="title" tone="secondary">
                        ↑
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${group?.name ?? snapshotName(id)} down`}
                      disabled={index === selected.length - 1}
                      hitSlop={4}
                      onPress={() => move(index, 1)}
                      style={({ pressed }) => [
                        styles.iconBtn,
                        { opacity: index === selected.length - 1 ? 0.3 : pressed ? 0.5 : 1 },
                      ]}>
                      <Text variant="title" tone="secondary">
                        ↓
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Unlink ${group?.name ?? snapshotName(id)}`}
                      hitSlop={4}
                      onPress={() => unlink(id)}
                      style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}>
                      <Text variant="title" color={colors.danger}>
                        ✕
                      </Text>
                    </Pressable>
                  </View>
                );
              })
            )}
            {selected.length > 1 ? (
              <Text variant="caption" tone="muted">
                Clients see the groups in this order at booking.
              </Text>
            ) : null}

            {/* Remaining active groups */}
            <Text variant="overline" tone="muted">
              Add a group
            </Text>
            {available.length === 0 ? (
              <Text variant="bodySmall" tone="muted">
                {groups.filter((g) => g.is_active).length === 0
                  ? 'No add-on groups yet. Create them in the Add-ons tab, then link them here.'
                  : 'All active groups are already linked.'}
              </Text>
            ) : (
              available.map((group) => (
                <Pressable
                  key={group.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Link ${group.name}`}
                  onPress={() => link(group.id)}
                  style={({ pressed }) => [
                    styles.availableRow,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      opacity: pressed ? 0.7 : 1,
                    },
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
              ))
            )}
            <Text variant="caption" tone="muted">
              Manage the groups themselves (options, prices, rules) in the Add-ons tab.
            </Text>
          </ScrollView>

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
            <Button
              label="Save add-ons"
              style={styles.flex1}
              loading={saving}
              onPress={() => onSave(selected)}
            />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollBody: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.base,
    paddingRight: spacing.xs,
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
    width: 40,
    height: 44,
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
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
});
