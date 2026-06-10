import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { VenueAddon, VenueAddonGroup } from '@/types/addon-groups';

export type AddonLinksTarget = {
  serviceId: string;
  serviceName: string;
  /** Currently linked group ids, in display order. */
  linkedGroupIds: string[];
};

type AddonLinksSheetProps = {
  target: AddonLinksTarget | null;
  groups: VenueAddonGroup[];
  addonsByGroup: Record<string, VenueAddon[]>;
  saving?: boolean;
  onClose: () => void;
  /** Receives the FULL linked-group id list (replace semantics on the API). */
  onSave: (groupIds: string[]) => void;
};

/** Link/unlink the venue's add-on groups to a service — checkbox list. */
export function AddonLinksSheet({
  target,
  groups,
  addonsByGroup,
  saving = false,
  onClose,
  onSave,
}: AddonLinksSheetProps) {
  const { colors } = useTheme();

  const [selected, setSelected] = useState<string[]>([]);
  const [seededId, setSeededId] = useState<string | null>(null);

  if (target && target.serviceId !== seededId) {
    setSeededId(target.serviceId);
    setSelected(target.linkedGroupIds);
  } else if (!target && seededId !== null) {
    setSeededId(null);
  }

  const toggle = (groupId: string) => {
    hapticSelect();
    setSelected((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId],
    );
  };

  const activeGroups = groups.filter((group) => group.is_active);

  return (
    <Sheet visible={!!target} onClose={onClose}>
      {target && seededId === target.serviceId ? (
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
                {activeGroups.length === 0 ? (
                  <Text variant="bodySmall" tone="muted">
                    No add-on groups yet. Create add-on groups on the web dashboard, then link
                    them to services here.
                  </Text>
                ) : (
                  activeGroups.map((group) => {
                    const isSelected = selected.includes(group.id);
                    const addons = addonsByGroup[group.id] ?? [];
                    return (
                      <Pressable
                        key={group.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isSelected }}
                        onPress={() => toggle(group.id)}
                        style={({ pressed }) => [
                          styles.groupRow,
                          {
                            backgroundColor: isSelected ? colors.surfaceRaised : colors.surface,
                            borderColor: isSelected ? colors.brand : colors.border,
                            opacity: pressed ? 0.9 : 1,
                          },
                        ]}>
                        <View
                          style={[
                            styles.check,
                            {
                              borderColor: isSelected ? colors.brand : colors.borderStrong,
                              backgroundColor: isSelected ? colors.brand : 'transparent',
                            },
                          ]}>
                          {isSelected ? (
                            <Text style={[styles.checkMark, { color: colors.onBrand }]}>✓</Text>
                          ) : null}
                        </View>
                        <View style={styles.groupText}>
                          <Text variant="bodyMedium" numberOfLines={1}>
                            {group.name}
                          </Text>
                          <Text variant="caption" tone="muted" numberOfLines={1}>
                            {addons.length} add-on{addons.length === 1 ? '' : 's'} ·{' '}
                            {group.selection_type === 'single' ? 'pick one' : 'pick multiple'}
                            {group.min_select > 0 ? ' · required' : ''}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })
                )}
                <Text variant="caption" tone="muted">
                  Groups and their add-ons are created on the web dashboard; here you choose which
                  apply to this service.
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
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
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
