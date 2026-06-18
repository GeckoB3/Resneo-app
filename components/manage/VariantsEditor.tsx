import { useRef } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import {
  ProcessingTimeBlocksEditor,
  processingBlocksToDrafts,
  validateProcessingBlocks,
  type ProcessingBlockDraft,
} from '@/components/services/ProcessingTimeBlocksEditor';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { parsePoundsToPence, penceToPoundsInput } from '@/lib/format';
import { hapticSelect } from '@/lib/haptics';
import type { VariantWriteInput } from '@/lib/queries/useServicesManage';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ProcessingTimeBlock, ServicePaymentRequirement } from '@/types/services-manage';

/** One editable option row in the service form's "Service options" section. */
export type DraftVariant = {
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
  /** Per-variant processing gaps, edited in place. */
  processingDrafts: ProcessingBlockDraft[];
};

/** Persisted variant shape used to seed the editor (subset of the catalog variant). */
export type SeedVariant = {
  id: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  buffer_minutes?: number | null;
  price_pence: number | null;
  deposit_pence: number | null;
  is_active?: boolean;
  processing_time_blocks?: ProcessingTimeBlock[] | null;
};

/** Map persisted service variants → editable drafts (replace-on-save fidelity). */
export function variantDraftsFromService(variants: SeedVariant[]): DraftVariant[] {
  return variants.map((variant) => ({
    key: variant.id,
    id: variant.id,
    name: variant.name,
    description: variant.description ?? '',
    duration: String(variant.duration_minutes),
    buffer: String(variant.buffer_minutes ?? 0),
    price: penceToPoundsInput(variant.price_pence),
    deposit: penceToPoundsInput(variant.deposit_pence),
    isActive: variant.is_active !== false,
    // Round-trip so the replace-on-save can't wipe these (the editor doesn't expose them per-block).
    processingDrafts: processingBlocksToDrafts(variant.processing_time_blocks),
  }));
}

/** A fresh blank option, optionally seeded from the service's base fields (web parity). */
export function makeVariantDraft(
  key: string,
  seed?: { duration?: string; buffer?: string; price?: string; deposit?: string },
): DraftVariant {
  return {
    key,
    name: '',
    description: '',
    duration: seed?.duration || '30',
    buffer: seed?.buffer || '0',
    price: seed?.price ?? '',
    deposit: seed?.deposit ?? '',
    isActive: true,
    processingDrafts: [],
  };
}

export type BuildVariantsResult =
  | { ok: true; variants: VariantWriteInput[] }
  | { ok: false; error: string; key?: string };

/**
 * Validate the drafts and build the FULL `variants` array for the service payload
 * (replace semantics on the API). Mirrors the web rules in
 * `appointment-service-form-to-payload.ts`: every option needs a name + valid
 * 5–480 duration; under full online payment every ACTIVE option needs a price > 0;
 * and at least one option must be active.
 */
export function buildVariantsPayload(
  drafts: DraftVariant[],
  paymentRequirement: ServicePaymentRequirement,
): BuildVariantsResult {
  const result: VariantWriteInput[] = [];
  let anyActive = false;
  for (let index = 0; index < drafts.length; index++) {
    const draft = drafts[index]!;
    const name = draft.name.trim();
    const duration = Number(draft.duration);
    const buffer = Number(draft.buffer || '0');
    if (!name) {
      return { ok: false, error: 'Every option needs a name.', key: draft.key };
    }
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
      return { ok: false, error: `"${name}": duration must be 5–480 minutes.`, key: draft.key };
    }
    if (!Number.isInteger(buffer) || buffer < 0 || buffer > 120) {
      return { ok: false, error: `"${name}": buffer must be 0–120 minutes.`, key: draft.key };
    }
    const price = parsePoundsToPence(draft.price);
    const deposit = parsePoundsToPence(draft.deposit);
    if (price === undefined || deposit === undefined) {
      return { ok: false, error: `"${name}": price and deposit must be valid amounts.`, key: draft.key };
    }
    if (paymentRequirement === 'full_payment' && draft.isActive && !(price != null && price > 0)) {
      return {
        ok: false,
        error: `Option "${name}": set a price — full online payment applies to each option.`,
        key: draft.key,
      };
    }
    const proc = validateProcessingBlocks(draft.processingDrafts, duration);
    if (!proc.ok) {
      return { ok: false, error: `"${name}": ${proc.error ?? 'processing time is invalid.'}`, key: draft.key };
    }
    if (draft.isActive) anyActive = true;
    result.push({
      ...(draft.id ? { id: draft.id } : {}),
      name,
      description: draft.description.trim() || null,
      duration_minutes: duration,
      buffer_minutes: buffer,
      price_pence: price,
      deposit_pence: deposit,
      is_active: draft.isActive,
      sort_order: index,
      processing_time_blocks: proc.blocks ?? [],
    });
  }
  if (drafts.length > 0 && !anyActive) {
    return {
      ok: false,
      error: 'Turn on at least one bookable option, or remove all options to use one fixed price.',
    };
  }
  return { ok: true, variants: result };
}

type VariantsEditorProps = {
  drafts: DraftVariant[];
  onChange: (drafts: DraftVariant[]) => void;
  /** Parent service's online-payment mode (drives the per-option price hint). */
  paymentRequirement: ServicePaymentRequirement;
  /** Seed used for the FIRST option (web parity — carries the base duration/price). */
  firstOptionSeed?: { duration?: string; buffer?: string; price?: string; deposit?: string };
  /** Controlled expand state so the parent can reveal the option that failed validation. */
  expandedKey: string | null;
  onExpandedKeyChange: (key: string | null) => void;
};

/**
 * Inline (controlled) editor for a service's bookable options (variants). Add /
 * edit / remove / reorder; each option expands in place. Renders no scroll
 * container of its own — it lives inside the service form's scroll view, so
 * nesting a same-axis ScrollView here would break scrolling.
 */
export function VariantsEditor({
  drafts,
  onChange,
  paymentRequirement,
  firstOptionSeed,
  expandedKey,
  onExpandedKeyChange,
}: VariantsEditorProps) {
  const { colors } = useTheme();
  // Monotonic counter for new-option keys — never collides with seeded variant ids
  // or with a key freed by a remove + re-add.
  const counter = useRef(0);

  const patchDraft = (key: string, patch: Partial<DraftVariant>) => {
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const addOption = () => {
    hapticSelect();
    const key = `draft-${counter.current++}`;
    // Seed the very first option from the service's base fields (web parity); later
    // options copy the previous option's duration/buffer.
    const last = drafts[drafts.length - 1];
    const seed =
      drafts.length === 0
        ? firstOptionSeed
        : { duration: last?.duration, buffer: last?.buffer };
    onChange([...drafts, makeVariantDraft(key, seed)]);
    onExpandedKeyChange(key);
  };

  const removeOption = (key: string) => {
    onChange(drafts.filter((d) => d.key !== key));
    if (expandedKey === key) onExpandedKeyChange(null);
  };

  /** Move an option up/down — persisted via `sort_order` on save. */
  const moveOption = (key: string, direction: -1 | 1) => {
    hapticSelect();
    const index = drafts.findIndex((d) => d.key === key);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= drafts.length) return;
    const next = [...drafts];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    onChange(next);
  };

  return (
    <View style={styles.root}>
      {drafts.length === 0 ? (
        <Text variant="bodySmall" tone="muted">
          No options — this service uses one fixed duration and price. Add options to let clients pick a
          version (e.g. 30 vs 60 minutes) with its own duration and price.
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
                onPress={() => onExpandedKeyChange(expanded ? null : draft.key)}
                style={({ pressed }) => [styles.optionHeaderMain, { opacity: pressed ? 0.55 : 1 }]}>
                <View style={styles.optionText}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {draft.name.trim() || `Option ${index + 1}`}
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
                      helper={paymentRequirement === 'deposit' ? 'Blank = service default' : undefined}
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
                {/* Per-option processing-time blocks (gaps inside this option). */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
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
});
