import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

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
import type {
  AddonGroupInput,
  AddonGroupUpsertResponse,
  AddonItemInput,
  VenueAddon,
  VenueAddonGroup,
} from '@/types/addon-groups';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DraftAddon = {
  key: string;
  id?: string;
  name: string;
  description: string;
  price: string;
  cost: string;
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
  /** Reports the saved group so a caller (the service form) can auto-link it. */
  onSaved?: (result: AddonGroupUpsertResponse, mode: 'create' | 'edit') => void;
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
    cost: penceToPoundsInput(addon.cost_to_business_pence ?? null),
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
export function AddonGroupEditorSheet({ target, onClose, onSaved }: Props) {
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
  // Two-step inline delete confirm — Alert.alert's confirm is a no-op on web.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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

      // Web parity: new single-select groups default to "required".
      setMinSelect('1');

      setMaxSelect('');

      setHiddenFromOnline(false);

      setIsActive(true);

      // Web parity: seed one blank option row — the API requires at least one option.
      setAddons([
        { key: 'new-addon-seed', name: '', description: '', price: '', cost: '', duration: '0', isActive: true },
      ]);

      setExpandedAddonKey('new-addon-seed');
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

    setConfirmingDelete(false);

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
      { key, name: '', description: '', price: '', cost: '', duration: '0', isActive: true },
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
    // Web parity: single-select groups are normalised to min 0/1 and max 1
    // (the API rejects anything else); min/max are only free-form for multi.
    let min: number;
    let max: number | null;
    if (selectionType === 'single') {
      min = Number(minSelect) >= 1 ? 1 : 0;
      max = 1;
    } else {
      min = Number(minSelect || '0');
      max = maxSelect.trim() ? Number(maxSelect) : null;
      if (!Number.isInteger(min) || min < 0) {
        setError('Minimum must be 0 or more.');
        return;
      }
      if (max !== null && (!Number.isInteger(max) || max < 1)) {
        setError('Maximum must be 1 or more, or blank for no limit.');
        return;
      }
      if (max !== null && max < min) {
        setError('Maximum must be at least the minimum.');
        return;
      }
    }

    // Validate add-ons. Completely blank rows are dropped silently (web parity);
    // partially filled rows without a name are an error.
    const addonInputs: AddonItemInput[] = [];
    for (const draft of addons) {
      const pricePence = parsePoundsToPence(draft.price);
      const costPence = parsePoundsToPence(draft.cost);
      const isBlankRow =
        !draft.name.trim() &&
        !draft.description.trim() &&
        (pricePence == null || pricePence === 0) &&
        (costPence == null || costPence === 0) &&
        (!draft.duration.trim() || Number(draft.duration) === 0);
      if (isBlankRow) continue;
      if (!draft.name.trim()) {
        setError('Every add-on needs a name.');
        setExpandedAddonKey(draft.key);
        return;
      }
      if (pricePence === undefined) {
        setError(`"${draft.name.trim()}": price must be a valid amount.`);
        setExpandedAddonKey(draft.key);
        return;
      }
      if (costPence === undefined) {
        setError(`"${draft.name.trim()}": cost to business must be a valid amount.`);
        setExpandedAddonKey(draft.key);
        return;
      }
      const dur = Number(draft.duration || '0');
      if (!Number.isInteger(dur) || dur < 0 || dur > 240) {
        setError(`"${draft.name.trim()}": duration must be 0–240 minutes.`);
        setExpandedAddonKey(draft.key);
        return;
      }
      addonInputs.push({
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        additional_price_pence: pricePence ?? 0,
        additional_duration_minutes: dur,
        // Preserve the internal cost-to-business figure (web parity); null clears it.
        cost_to_business_pence: costPence ?? null,
        is_active: draft.isActive,
        // Explicit order — the API re-inserts options and sorts on this field.
        sort_order: addonInputs.length,
      });
    }
    if (addonInputs.length === 0) {
      setError('Add at least one option with a name.');
      return;
    }
    if (addonInputs.length > 40) {
      setError('A group can have at most 40 options.');
      return;
    }

    // `sort_order` rides along (the API would otherwise reset it to 0 on edit).
    const groupInput: AddonGroupInput & { sort_order: number } = {
      name: name.trim(),
      prompt_to_client: prompt.trim() || null,
      description: description.trim() || null,
      selection_type: selectionType,
      min_select: min,
      max_select: max,
      hidden_from_online: hiddenFromOnline,
      is_active: isActive,
      sort_order: target?.mode === 'edit' ? target.group.sort_order : 0,
      addons: addonInputs,
    };

    try {
      const result =
        target?.mode === 'edit'
          ? await updateMutation.mutateAsync({ id: target.group.id, group: groupInput })
          : await createMutation.mutateAsync({ group: groupInput });
      hapticSuccess();
      onSaved?.(result, target?.mode === 'edit' ? 'edit' : 'create');
      onClose();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save the add-on group.');
    }
  }

  async function runDelete() {
    if (target?.mode !== 'edit') return;
    const group = target.group;
    try {
      await deleteMutation.mutateAsync(group.id);
      hapticSuccess();
      setConfirmingDelete(false);
      onClose();
    } catch (e) {
      hapticWarning();
      setConfirmingDelete(false);
      setError(
        e instanceof ApiError ? e.message : 'Could not delete the group. Please try again.',
      );
    }
  }

  // Web parity: archived groups get the permanent-delete wording.
  const deleteMessage =
    target?.mode === 'edit'
      ? target.group.is_active
        ? `Delete "${target.group.name}"? If it has booking history it will be archived (hidden from new bookings) instead.`
        : `"${target.group.name}" is already archived. Delete it permanently? This is only possible when no bookings reference it.`
      : '';

  const saving = createMutation.isPending || updateMutation.isPending;
  const deleting = deleteMutation.isPending;
  const seeded = target && seededId === (target.mode === 'create' ? '__create__' : (target as Extract<AddonGroupEditorTarget, {mode:'edit'}>).group?.id);

  return (
    <Sheet visible={!!target} onClose={onClose} maxHeight="92%" fill>
      {seeded ? (
        <View style={styles.body}>
          <View style={styles.header}>
            <Text variant="overline" tone="muted">
              {target.mode === 'create' ? 'New add-on group' : 'Edit add-on group'}
            </Text>
            {target.mode === 'edit' && !confirmingDelete ? (
              <Button
                label="Delete"
                variant="ghost"
                size="sm"
                loading={deleting}
                onPress={() => setConfirmingDelete(true)}
              />
            ) : null}
          </View>

          {/* Inline delete confirm — a Sheet-in-Sheet would be unreliable, and
              Alert.alert's confirm is a no-op on web. */}
          {target.mode === 'edit' && confirmingDelete ? (
            <View style={styles.deleteConfirm}>
              <Text variant="bodySmall" tone="secondary">
                {deleteMessage}
              </Text>
              <View style={styles.deleteConfirmActions}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  size="sm"
                  style={styles.flex1}
                  onPress={() => setConfirmingDelete(false)}
                />
                <Button
                  label="Delete"
                  variant="danger"
                  size="sm"
                  style={styles.flex1}
                  loading={deleting}
                  onPress={() => void runDelete()}
                />
              </View>
            </View>
          ) : null}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollBody}
            keyboardShouldPersistTaps="handled">
            {/* Group metadata — max lengths match the API schema */}
            <Input
              label="Group name"
              helper="Internal label; shown to clients only when the prompt is blank."
              value={name}
              onChangeText={setName}
              maxLength={120}
            />
            <Input
              label="Prompt shown to client (optional)"
              helper='e.g. "Would you like any extras?"'
              value={prompt}
              onChangeText={setPrompt}
              maxLength={240}
            />
            <Input
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              multiline
              style={styles.multiline}
              maxLength={2000}
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

            {/* Selection rules — single uses a required toggle; multi uses min/max */}
            {selectionType === 'single' ? (
              <View style={styles.switchRow}>
                <View style={styles.switchLabel}>
                  <Text variant="bodyMedium">Required</Text>
                  <Text variant="caption" tone="muted">
                    Client must choose one option at booking.
                  </Text>
                </View>
                <Switch
                  value={Number(minSelect) >= 1}
                  onValueChange={(v) => setMinSelect(v ? '1' : '0')}
                />
              </View>
            ) : (
              <View style={styles.twoCol}>
                <View style={styles.col}>
                  <Input
                    label="Minimum"
                    helper="0 = optional"
                    value={minSelect}
                    onChangeText={setMinSelect}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.col}>
                  <Input
                    label="Maximum"
                    helper="Blank = no limit"
                    value={maxSelect}
                    onChangeText={setMaxSelect}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            )}

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
                        maxLength={2000}
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
                            helper="0–240"
                            value={addon.duration}
                            onChangeText={(v) => patchAddon(addon.key, { duration: v })}
                            keyboardType="number-pad"
                          />
                        </View>
                      </View>
                      <Input
                        label="Cost to business (£)"
                        helper="Optional — used in reports, never shown to clients."
                        value={addon.cost}
                        onChangeText={(v) => patchAddon(addon.key, { cost: v })}
                        keyboardType="decimal-pad"
                      />
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
  // `fill` Sheet (fixed height): the body claims that height so the ScrollView
  // scrolls between the header and the pinned actions, keeping Save reachable on
  // long add-on lists. `fill` strips the wrapper's horizontal padding — restore it.
  body: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deleteConfirm: {
    gap: spacing.sm,
  },
  deleteConfirmActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  scroll: {
    flex: 1,
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
