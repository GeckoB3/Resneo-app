import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { parsePoundsToPence, penceToPoundsInput } from '@/lib/format';
import { hapticSelect } from '@/lib/haptics';
import type { VariantWriteInput } from '@/lib/queries/useServicesManage';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ProcessingTimeBlock } from '@/types/services-manage';

type DraftVariant = {
  /** Stable local key (existing id or a draft key). */
  key: string;
  id?: string;
  name: string;
  description: string;
  duration: string;
  buffer: string;
  price: string;
  deposit: string;
  isActive: boolean;
  /** Carried through unchanged — not editable here, but must be preserved on
   *  save or the API resets the variant's processing blocks (data loss). */
  processingTimeBlocks: ProcessingTimeBlock[] | null;
};

export type VariantsEditorTarget = {
  serviceId: string;
  serviceName: string;
  variants: {
    id: string;
    name: string;
    description?: string | null;
    duration_minutes: number;
    buffer_minutes?: number | null;
    price_pence: number | null;
    deposit_pence: number | null;
    is_active?: boolean;
    processing_time_blocks?: ProcessingTimeBlock[] | null;
  }[];
};

type VariantsEditorSheetProps = {
  target: VariantsEditorTarget | null;
  saving?: boolean;
  onClose: () => void;
  /** Receives the FULL variant set to keep (replace semantics on the API). */
  onSave: (variants: VariantWriteInput[]) => void;
};

function toDraft(target: VariantsEditorTarget): DraftVariant[] {
  return target.variants.map((variant) => ({
    key: variant.id,
    id: variant.id,
    name: variant.name,
    description: variant.description ?? '',
    duration: String(variant.duration_minutes),
    buffer: String(variant.buffer_minutes ?? 0),
    price: penceToPoundsInput(variant.price_pence),
    deposit: penceToPoundsInput(variant.deposit_pence),
    isActive: variant.is_active !== false,
    processingTimeBlocks: variant.processing_time_blocks ?? null,
  }));
}

/**
 * Service options (variants) editor — add / edit / remove, then save the full
 * set. Each option expands in place; the sheet keeps everything thumb-reachable.
 *
 * State is seeded via useEffect (key-based reset) to avoid the React 18 strict-mode
 * render-phase setState anti-pattern.
 */
export function VariantsEditorSheet({ target, saving = false, onClose, onSave }: VariantsEditorSheetProps) {
  const { colors } = useTheme();

  const [drafts, setDrafts] = useState<DraftVariant[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftCounter, setDraftCounter] = useState(0);
  // seededId stored in state (not a ref) so the `seeded` derived value is safe
  // to read during render without violating react-hooks/refs.
  const [seededId, setSeededId] = useState<string | null>(null);

  // Seed (or re-seed) state whenever the target changes.
  useEffect(() => {
    if (!target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeededId(null);
      return;
    }
    if (target.serviceId === seededId) return;
     
    setDrafts(toDraft(target));
     
    setExpandedKey(null);
     
    setError(null);
     
    setSeededId(target.serviceId);
  // seededId intentionally omitted to avoid an infinite re-seed loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const patchDraft = (key: string, patch: Partial<DraftVariant>) => {
    setDrafts((current) => current.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const addOption = () => {
    hapticSelect();
    const key = `draft-${draftCounter}`;
    setDraftCounter((n) => n + 1);
    setDrafts((current) => [...current, { key, name: '', description: '', duration: '30', buffer: '0', price: '', deposit: '', isActive: true, processingTimeBlocks: null }]);
    setExpandedKey(key);
  };

  const removeOption = (key: string) => {
    setDrafts((current) => current.filter((d) => d.key !== key));
    if (expandedKey === key) setExpandedKey(null);
  };

  function handleSave() {
    setError(null);
    const result: VariantWriteInput[] = [];
    for (const draft of drafts) {
      const duration = Number(draft.duration);
      const buffer = Number(draft.buffer || '0');
      if (!draft.name.trim()) {
        setError('Every option needs a name.');
        setExpandedKey(draft.key);
        return;
      }
      if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
        setError(`"${draft.name.trim()}": duration must be 5–480 minutes.`);
        setExpandedKey(draft.key);
        return;
      }
      if (!Number.isInteger(buffer) || buffer < 0 || buffer > 120) {
        setError(`"${draft.name.trim()}": buffer must be 0–120 minutes.`);
        setExpandedKey(draft.key);
        return;
      }
      const price = parsePoundsToPence(draft.price);
      const deposit = parsePoundsToPence(draft.deposit);
      if (price === undefined || deposit === undefined) {
        setError(`"${draft.name.trim()}": price and deposit must be valid amounts.`);
        setExpandedKey(draft.key);
        return;
      }
      result.push({
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        duration_minutes: duration,
        buffer_minutes: buffer,
        price_pence: price,
        deposit_pence: deposit,
        is_active: draft.isActive,
        // Preserve per-variant processing blocks (not edited here) so the API's
        // replace-on-save doesn't wipe them.
        processing_time_blocks: draft.processingTimeBlocks ?? [],
      });
    }
    onSave(result);
  }

  const seeded = target && seededId === target.serviceId;

  return (
    <Sheet visible={!!target} onClose={onClose}>
      {seeded ? (
        <View style={styles.body}>
              <View>
                <Text variant="overline" tone="muted">
                  Service options
                </Text>
                <Text variant="title" numberOfLines={1}>
                  {target.serviceName}
                </Text>
              </View>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollBody}
                keyboardShouldPersistTaps="handled">
                {drafts.length === 0 ? (
                  <Text variant="bodySmall" tone="muted">
                    No options yet. Options let clients pick a version of this service (e.g. 30 vs
                    60 minutes) with its own duration and price.
                  </Text>
                ) : null}

                {drafts.map((draft) => {
                  const expanded = expandedKey === draft.key;
                  return (
                    <View
                      key={draft.key}
                      style={[
                        styles.optionCard,
                        { borderColor: expanded ? colors.brand : colors.border, backgroundColor: colors.surface },
                      ]}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setExpandedKey(expanded ? null : draft.key)}
                        style={({ pressed }) => [styles.optionHeader, { opacity: pressed ? 0.55 : 1 }]}>
                        <View style={styles.optionText}>
                          <Text variant="bodyMedium" numberOfLines={1}>
                            {draft.name.trim() || 'New option'}
                          </Text>
                          <Text variant="caption" tone="muted">
                            {draft.duration || '—'} min
                            {draft.price.trim() ? ` · £${draft.price.trim()}` : ''}
                            {!draft.isActive ? ' · Inactive' : ''}
                          </Text>
                        </View>
                        <Text variant="title" tone="muted">
                          {expanded ? '▾' : '›'}
                        </Text>
                      </Pressable>

                      {expanded ? (
                        <View style={[styles.optionBody, { borderTopColor: colors.border }]}>
                          <Input
                            label="Name"
                            value={draft.name}
                            onChangeText={(name) => patchDraft(draft.key, { name })}
                            maxLength={120}
                          />
                          <Input
                            label="Description (optional)"
                            value={draft.description}
                            onChangeText={(description) => patchDraft(draft.key, { description })}
                            multiline
                            style={styles.multiline}
                            maxLength={500}
                          />
                          <View style={styles.moneyRow}>
                            <View style={styles.moneyField}>
                              <Input
                                label="Duration (mins)"
                                value={draft.duration}
                                onChangeText={(duration) => patchDraft(draft.key, { duration })}
                                keyboardType="number-pad"
                              />
                            </View>
                            <View style={styles.moneyField}>
                              <Input
                                label="Buffer (mins)"
                                value={draft.buffer}
                                onChangeText={(buffer) => patchDraft(draft.key, { buffer })}
                                keyboardType="number-pad"
                              />
                            </View>
                          </View>
                          <View style={styles.moneyRow}>
                            <View style={styles.moneyField}>
                              <Input
                                label="Price (£)"
                                value={draft.price}
                                onChangeText={(price) => patchDraft(draft.key, { price })}
                                keyboardType="decimal-pad"
                              />
                            </View>
                            <View style={styles.moneyField}>
                              <Input
                                label="Deposit (£)"
                                value={draft.deposit}
                                onChangeText={(deposit) => patchDraft(draft.key, { deposit })}
                                keyboardType="decimal-pad"
                              />
                            </View>
                          </View>
                          <View style={styles.switchRow}>
                            <Text variant="bodySmall">Offer this option to clients</Text>
                            <Switch
                              value={draft.isActive}
                              onValueChange={(isActive) => patchDraft(draft.key, { isActive })}
                            />
                          </View>
                          <Button
                            label="Remove option"
                            variant="ghost"
                            size="sm"
                            onPress={() => removeOption(draft.key)}
                          />
                        </View>
                      ) : null}
                    </View>
                  );
                })}

                <Button label="Add option" variant="secondary" onPress={addOption} fullWidth />

                {error ? (
                  <Text variant="bodySmall" tone="danger">
                    {error}
                  </Text>
                ) : null}
              </ScrollView>

              <View style={styles.actions}>
                <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
                <Button
                  label="Save options"
                  style={styles.flex1}
                  loading={saving}
                  onPress={handleSave}
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
  optionCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  optionBody: {
    padding: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  multiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  moneyRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  moneyField: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
});
