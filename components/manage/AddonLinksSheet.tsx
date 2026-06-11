import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { fonts, radius, spacing } from '@/theme/index';
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

/** Link/unlink the venue's add-on groups to a service — checkbox list.
 *
 * State is seeded via useEffect (not render-phase setState) to avoid React 18
 * strict-mode issues. The groups list is always rendered regardless of isAdmin
 * so non-admin staff can see which groups are linked (linking is server-gated).
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
     
    setSelected(target.linkedGroupIds);
     
    setSeededId(target.serviceId);
  // seededId intentionally omitted to avoid infinite loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const toggle = (groupId: string) => {
    hapticSelect();
    setSelected((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId],
    );
  };

  const activeGroups = groups.filter((group) => group.is_active);
  const seeded = target && seededId === target.serviceId;

  return (
    <Sheet visible={!!target} onClose={onClose}>
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
                {activeGroups.length === 0 ? (
                  <Text variant="bodySmall" tone="muted">
                    No add-on groups yet. Create add-on groups in the Add-ons tab, then link them to
                    services here.
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
                  Manage add-on groups in the Add-ons tab; here you choose which apply to this
                  service.
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
    fontFamily: fonts.bold,
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
