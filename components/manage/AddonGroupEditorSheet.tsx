import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { parsePoundsToPence, penceToPoundsInput } from '@/lib/format';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useCreateAddonGroup,
  useDeleteAddonGroup,
  useUpdateAddonGroup,
} from '@/lib/queries/useAddonGroups';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AddonGroupInput, AddonItemInput, VenueAddon, VenueAddonGroup } from '@/types/addon-groups';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DraftAddon = {
  key: string;
  id?: string;
  name: string;
  description: string;
  price: string;
  duration: string;
  isActive: boolean;
};

export type AddonGroupEditorTarget =
  | { mode: 'create' }
  | {
      mode: 'edit';
      group: VenueAddonGroup;
      addons: VenueAddon[];
    };

type Props = {
  target: AddonGroupEditorTarget | null;
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDraftAddon(addon: VenueAddon, keyOverride?: string): DraftAddon {
  return {
    key: keyOverride ?? addon.id,
    id: addon.id,
    name: addon.name,
    description: addon.description ?? '',
    price: penceToPoundsInput(addon.additional_price_pence),
    duration: String(addon.additional_duration_minutes),
    isActive: addon.is_active,
  };
}

const SELECTION_TYPES = [
  { value: 'single' as const, label: 'Pick one', hint: 'Client selects exactly one add-on' },
  { value: 'multi' as const, label: 'Pick multiple', hint: 'Client may select several add-ons' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Full-featured bottom sheet for creating and editing add-on groups.
 * Handles the group metadata + inline add-on list.
 * Admin-only — the parent screen must ensure isAdmin before opening.
 */
export function AddonGroupEditorSheet({ target, onClose }: Props) {
  const { colors } = useTheme();
  const createMutation = useCreateAddonGroup();
  const updateMutation = useUpdateAddonGroup();
  const deleteMutation = useDeleteAddonGroup();

  // Group-level form state
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [description, setDescription] = useState('');
  const [selectionType, setSelectionType] = useState<'single' | 'multi'>('single');
  const [minSelect, setMinSelect] = useState('0');
  const [maxSelect, setMaxSelect] = useState('');
  const [hiddenFromOnline, setHiddenFromOnline] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // Add-on rows
  const [addons, setAddons] = useState<DraftAddon[]>([]);
  const [expandedAddonKey, setExpandedAddonKey] = useState<string | null>(null);
  const [addonCounter, setAddonCounter] = useState(0);

  const [error, setError] = useState<string | null>(null);
  // seededId tracks which target we last seeded so we can guard re-seeding.
  // Stored in state (not a ref) so the `seeded` derived value is safe to read
  // during render without violating react-hooks/refs.
  const [seededId, setSeededId] = useState<string | null>(null);

  // Seed when target changes
  useEffect(() => {
    if (!target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeededId(null);
      return;
    }
    const seedKey = target.mode === 'create' ? '__create__' : target.group.id;
    if (seedKey === seededId) return;

    if (target.mode === 'create') {
       
      setName('');
       
      setPrompt('');
       
      setDescription('');
       
      setSelectionType('single');
       
      setMinSelect('0');
       
      setMaxSelect('');
       
      setHiddenFromOnline(false);
       
      setIsActive(true);
       
      setAddons([]);
       
      setExpandedAddonKey(null);
    } else {
      const g = target.group;
       
      setName(g.name);
       
      setPrompt(g.prompt_to_client ?? '');
       
      setDescription(g.description ?? '');
       
      setSelectionType(g.selection_type);
       
      setMinSelect(String(g.min_select));
       
      setMaxSelect(g.max_select != null ? String(g.max_select) : '');
       
      setHiddenFromOnline(g.hidden_from_online);
       
      setIsActive(g.is_active);
       
      setAddons(target.addons.map((a) => toDraftAddon(a)));
       
      setExpandedAddonKey(null);
    }
     
    setError(null);
     
    setSeededId(seedKey);
  // seededId intentionally omitted — including it would cause an infinite loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const patchAddon = (key: string, patch: Partial<DraftAddon>) =>
    setAddons((cur) => cur.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  const addAddonRow = () => {
    hapticSelect();
    const key = `new-addon-${addonCounter}`;
    setAddonCounter((n) => n + 1);
    setAddons((cur) => [
      ...cur,
      { key, name: '', description: '', price: '0', duration: '0', isActive: true },
    ]);
    setExpandedAddonKey(key);
  };

  const removeAddon = (key: string) => {
    setAddons((cur) => cur.filter((a) => a.key !== key));
    if (expandedAddonKey === key) setExpandedAddonKey(null);
  };

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError('Group name is required.');
      return;
    }
    const min = Number(minSelect || '0');
    const max = maxSelect.trim() ? Number(maxSelect) : null;
    if (!Number.isInteger(min) || min < 0) {
      setError('Min select must be 0 or more.');
      return;
    }
    if (max !== null && (!Number.isInteger(max) || max < 1)) {
      setError('Max select must be 1 or more.');
      return;
    }
    if (max !== null && max < min) {
      setError('Max select must be at least min select.');
      return;
    }

    // Validate add-ons
    const addonInputs: AddonItemInput[] = [];
    for (const draft of addons) {
      if (!draft.name.trim()) {
        setError('Every add-on needs a name.');
        setExpandedAddonKey(draft.key);
        return;
      }
      const pricePence = parsePoundsToPence(draft.price);
      if (pricePence === undefined) {
        setError(`"${draft.name.trim()}": price must be a valid amount.`);
        setExpandedAddonKey(draft.key);
        return;
      }
      const dur = Number(draft.duration || '0');
      if (!Number.isInteger(dur) || dur < 0 || dur > 480) {
        setError(`"${draft.name.trim()}": duration must be 0–480 minutes.`);
        setExpandedAddonKey(draft.key);
        return;
      }
      addonInputs.push({
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        additional_price_pence: pricePence ?? 0,
        additional_duration_minutes: dur,
        is_active: draft.isActive,
      });
    }

    const groupInput: AddonGroupInput = {
      name: name.trim(),
      prompt_to_client: prompt.trim() || null,
      description: description.trim() || null,
      selection_type: selectionType,
      min_select: min,
      max_select: max,
      hidden_from_online: hiddenFromOnline,
      is_active: isActive,
      addons: addonInputs,
    };

    try {
      if (target?.mode === 'edit') {
        await updateMutation.mutateAsync({ id: target.group.id, group: groupInput });
      } else {
        await createMutation.mutateAsync({ group: groupInput });
      }
      hapticSuccess();
      onClose();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save the add-on group.');
    }
  }

  function handleDelete() {
    if (target?.mode !== 'edit') return;
    const groupName = target.group.name;
    Alert.alert(
      'Delete add-on group',
      `Delete "${groupName}"? If it has booking history it will be archived (hidden from new bookings) instead.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(target.group.id);
              hapticSuccess();
              onClose();
            } catch (e) {
              hapticWarning();
              Alert.alert(
                'Could not delete',
                e instanceof ApiError ? e.message : 'Please try again.',
              );
            }
          },
        },
      ],
    );
  }

  const saving = createMutation.isPending || updateMutation.isPending;
  const deleting = deleteMutation.isPending;
  const seeded = target && seededId === (target.mode === 'create' ? '__create__' : (target as Extract<AddonGroupEditorTarget, {mode:'edit'}>).group?.id);

  return (
    <Sheet visible={!!target} onClose={onClose} maxHeight="92%">
      {seeded ? (
        <View style={styles.body}>
          <View style={styles.header}>
            <Text variant="overline" tone="muted">
              {target.mode === 'create' ? 'New add-on group' : 'Edit add-on group'}
            </Text>
            {target.mode === 'edit' ? (
              <Button
                label="Delete"
                variant="ghost"
                size="sm"
                loading={deleting}
                onPress={handleDelete}
              />
            ) : null}
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollBody}
            keyboardShouldPersistTaps="handled">
            {/* Group metadata */}
            <Input label="Group name" value={name} onChangeText={setName} maxLength={200} />
            <Input
              label="Prompt shown to client (optional)"
              helper='e.g. "Would you like any extras?"'
              value={prompt}
              onChangeText={setPrompt}
              maxLength={300}
            />
            <Input
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              multiline
              style={styles.multiline}
              maxLength={500}
            />

            {/* Selection type */}
            <Text variant="overline" tone="muted">
              Selection type
            </Text>
            {SELECTION_TYPES.map((opt) => {
              const selected = selectionType === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectionType(opt.value)}
                  style={({ pressed }) => [
                    styles.radioRow,
                    {
                      borderColor: selected ? colors.brand : colors.border,
                      backgroundColor: selected ? colors.brandSubtle : colors.surface,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}>
                  <View
                    style={[
                      styles.radioDot,
                      { borderColor: selected ? colors.brand : colors.borderStrong },
                    ]}>
                    {selected ? (
                      <View style={[styles.radioDotInner, { backgroundColor: colors.brand }]} />
                    ) : null}
                  </View>
                  <View style={styles.radioText}>
                    <Text variant="bodyMedium">{opt.label}</Text>
                    <Text variant="caption" tone="muted">
                      {opt.hint}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            {/* Min / max */}
            <View style={styles.twoCol}>
              <View style={styles.col}>
                <Input
                  label="Min select"
                  helper="0 = optional"
                  value={minSelect}
                  onChangeText={setMinSelect}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.col}>
                <Input
                  label="Max select"
                  helper="Leave blank for unlimited"
                  value={maxSelect}
                  onChangeText={setMaxSelect}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            {/* Toggles */}
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text variant="bodyMedium">Hide from online booking</Text>
                <Text variant="caption" tone="muted">
                  Staff can still add these at the time of booking.
                </Text>
              </View>
              <Switch value={hiddenFromOnline} onValueChange={setHiddenFromOnline} />
            </View>
            <View style={styles.switchRow}>
              <Text variant="bodyMedium">Active</Text>
              <Switch value={isActive} onValueChange={setIsActive} />
            </View>

            {/* Add-ons list */}
            <Text variant="overline" tone="muted">
              Add-ons ({addons.length})
            </Text>
            {addons.length === 0 ? (
              <Text variant="bodySmall" tone="muted">
                No add-ons yet. Add items clients can choose from (e.g. conditioning treatment,
                extra time, starter).
              </Text>
            ) : null}
            {addons.map((addon) => {
              const addonExpanded = expandedAddonKey === addon.key;
              return (
                <View
                  key={addon.key}
                  style={[
                    styles.addonCard,
                    {
                      borderColor: addonExpanded ? colors.brand : colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setExpandedAddonKey(addonExpanded ? null : addon.key)}
                    style={({ pressed }) => [styles.addonHeader, { opacity: pressed ? 0.55 : 1 }]}>
                    <View style={styles.addonText}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {addon.name.trim() || 'New add-on'}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {addon.price.trim() ? `£${addon.price.trim()}` : 'Free'}
                        {Number(addon.duration) > 0 ? ` · +${addon.duration} min` : ''}
                        {!addon.isActive ? ' · Inactive' : ''}
                      </Text>
                    </View>
                    <Text variant="title" tone="muted">
                      {addonExpanded ? '▾' : '›'}
                    </Text>
                  </Pressable>
                  {addonExpanded ? (
                    <View style={[styles.addonBody, { borderTopColor: colors.border }]}>
                      <Input
                        label="Name"
                        value={addon.name}
                        onChangeText={(v) => patchAddon(addon.key, { name: v })}
                        maxLength={120}
                      />
                      <Input
                        label="Description (optional)"
                        value={addon.description}
                        onChangeText={(v) => patchAddon(addon.key, { description: v })}
                        multiline
                        style={styles.multiline}
                        maxLength={300}
                      />
                      <View style={styles.twoCol}>
                        <View style={styles.col}>
                          <Input
                            label="Extra price (£)"
                            value={addon.price}
                            onChangeText={(v) => patchAddon(addon.key, { price: v })}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <View style={styles.col}>
                          <Input
                            label="Extra duration (mins)"
                            value={addon.duration}
                            onChangeText={(v) => patchAddon(addon.key, { duration: v })}
                            keyboardType="number-pad"
                          />
                        </View>
                      </View>
                      <View style={styles.switchRow}>
                        <Text variant="bodySmall">Active</Text>
                        <Switch
                          value={addon.isActive}
                          onValueChange={(v) => patchAddon(addon.key, { isActive: v })}
                        />
                      </View>
                      <Button
                        label="Remove add-on"
                        variant="ghost"
                        size="sm"
                        onPress={() => removeAddon(addon.key)}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}

            <Button label="Add add-on" variant="secondary" onPress={addAddonRow} fullWidth />

            {error ? (
              <Text variant="bodySmall" tone="danger">
                {error}
              </Text>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
            <Button
              label={target.mode === 'create' ? 'Create group' : 'Save group'}
              style={styles.flex1}
              loading={saving}
              onPress={() => void handleSave()}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollBody: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  multiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  twoCol: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  col: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  switchLabel: {
    flex: 1,
    gap: 2,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  radioDot: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDotInner: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  radioText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  addonCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  addonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
  },
  addonText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  addonBody: {
    padding: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
});
