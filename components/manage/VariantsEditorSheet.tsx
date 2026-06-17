import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  ProcessingTimeBlocksEditor,
  processingBlocksToDrafts,
  validateProcessingBlocks,
  type ProcessingBlockDraft,
} from '@/components/services/ProcessingTimeBlocksEditor';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { parsePoundsToPence, penceToPoundsInput } from '@/lib/format';
import { hapticSelect } from '@/lib/haptics';
import type { VariantWriteInput } from '@/lib/queries/useServicesManage';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ProcessingTimeBlock, ServicePaymentRequirement } from '@/types/services-manage';

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
  /** Per-variant processing gaps, edited in place. Seeded from the persisted
   *  blocks; validated + converted back to the API shape on save. */
  processingDrafts: ProcessingBlockDraft[];
};

export type VariantsEditorTarget = {
  serviceId: string;
  serviceName: string;
  /**
   * The parent service's online-payment requirement. `full_payment` requires
   * every ACTIVE option to carry a price > 0 (web parity:
   * appointment-service-form-to-payload.ts:53-72) — otherwise an active £0
   * option would offer a £0 online charge. `payment_requirement` itself is
   * edited on the main service sheet, so it's passed in read-only here.
   */
  paymentRequirement: ServicePaymentRequirement;
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
    processingDrafts: processingBlocksToDrafts(variant.processing_time_blocks),
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
    setDrafts((current) => [...current, { key, name: '', description: '', duration: '30', buffer: '0', price: '', deposit: '', isActive: true, processingDrafts: [] }]);
    setExpandedKey(key);
  };

  const removeOption = (key: string) => {
    setDrafts((current) => current.filter((d) => d.key !== key));
    if (expandedKey === key) setExpandedKey(null);
  };

  /** Move a variant up/down in display order — persisted via `sort_order` on save. */
  const moveOption = (key: string, direction: -1 | 1) => {
    hapticSelect();
    setDrafts((current) => {
      const index = current.findIndex((d) => d.key === key);
      if (index < 0) return current;
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
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
      // Money-correctness (web parity): under full online payment, every ACTIVE
      // option must charge a price > 0, or it would offer a £0 online charge.
      if (target?.paymentRequirement === 'full_payment' && draft.isActive && !(price != null && price > 0)) {
        setError(`Option "${draft.name.trim()}": set a price — full online payment applies to each option.`);
        setExpandedKey(draft.key);
        return;
      }
      // Validate per-variant processing blocks against THIS variant's duration.
      const proc = validateProcessingBlocks(draft.processingDrafts, duration);
      if (!proc.ok) {
        setError(`"${draft.name.trim()}": ${proc.error ?? 'processing time is invalid.'}`);
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
        // Per-variant processing gaps (replace semantics on the API).
        processing_time_blocks: proc.blocks ?? [],
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

                {drafts.map((draft, index) => {
                  const expanded = expandedKey === draft.key;
                  const isFirst = index === 0;
                  const isLast = index === drafts.length - 1;
                  return (
                    <View
                      key={draft.key}
                      style={[
                        styles.optionCard,
                        { borderColor: expanded ? colors.brand : colors.border, backgroundColor: colors.surface },
                      ]}>
                      <View style={styles.optionHeader}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setExpandedKey(expanded ? null : draft.key)}
                          style={({ pressed }) => [styles.optionHeaderMain, { opacity: pressed ? 0.55 : 1 }]}>
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
                        {/* Reorder controls — persisted via sort_order on save. */}
                        {drafts.length > 1 ? (
                          <View style={styles.reorderCol}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Move ${draft.name.trim() || 'option'} up`}
                              accessibilityState={{ disabled: isFirst }}
                              disabled={isFirst}
                              hitSlop={6}
                              onPress={() => moveOption(draft.key, -1)}
                              style={styles.reorderBtn}>
                              <Text variant="bodyMedium" color={isFirst ? colors.textMuted : colors.textSecondary}>
                                ▲
                              </Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Move ${draft.name.trim() || 'option'} down`}
                              accessibilityState={{ disabled: isLast }}
                              disabled={isLast}
                              hitSlop={6}
                              onPress={() => moveOption(draft.key, 1)}
                              style={styles.reorderBtn}>
                              <Text variant="bodyMedium" color={isLast ? colors.textMuted : colors.textSecondary}>
                                ▼
                              </Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>

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
                          {/* Per-variant processing-time blocks (gaps inside this option). */}
                          <ProcessingTimeBlocksEditor
                            drafts={draft.processingDrafts}
                            onChange={(processingDrafts) => patchDraft(draft.key, { processingDrafts })}
                            durationMinutes={Number(draft.duration) || 0}
                            bufferMinutes={Number(draft.buffer) || 0}
                          />
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
    paddingRight: spacing.sm,
  },
  optionHeaderMain: {
    flex: 1,
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
  reorderCol: {
    gap: spacing.xs,
  },
  reorderBtn: {
    minWidth: 44,
    minHeight: 22,
    alignItems: 'center',
    justifyContent: 'center',
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
