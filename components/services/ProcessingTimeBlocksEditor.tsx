import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import {
  PROCESSING_BLOCK_MIN_MINUTES,
  PROCESSING_TAIL_MAX_MINUTES,
  placeNewProcessingBlock,
  processingTailMinutes,
  resizeProcessingBlock,
} from '@/lib/booking/processing-time-fit';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ProcessingTimeBlock } from '@/types/services-manage';

export { PROCESSING_BLOCK_MIN_MINUTES };
/** Server cap (`processingTimeBlocksSchema.max(20)`). */
const MAX_BLOCKS = 20;

/** Local draft mirrors the server shape but keeps numbers as strings for the inputs. */
export interface ProcessingBlockDraft {
  /** Stable local key (existing id or a draft key). */
  key: string;
  id?: string;
  start: string;
  duration: string;
}

let draftSeq = 0;
function nextKey(): string {
  draftSeq += 1;
  return `pt-draft-${draftSeq}`;
}

/** Seed editor drafts from the persisted blocks. */
export function processingBlocksToDrafts(
  blocks: ProcessingTimeBlock[] | null | undefined,
): ProcessingBlockDraft[] {
  return (blocks ?? [])
    .slice()
    .sort((a, b) => a.start_minute - b.start_minute)
    .map((b) => ({
      key: b.id ?? nextKey(),
      id: b.id,
      start: String(b.start_minute),
      duration: String(b.duration_minutes),
    }));
}

export interface ProcessingBlocksValidation {
  ok: boolean;
  error?: string;
  blocks?: ProcessingTimeBlock[];
}

/**
 * Validate + normalise drafts against the service duration. Mirrors the web
 * `validateProcessingTimeBlocks` (#185): each block at least 5 min, starting
 * inside the service or exactly at its end, running no more than
 * `PROCESSING_TAIL_MAX_MINUTES` past the end, and no overlaps.
 */
export function validateProcessingBlocks(
  drafts: ProcessingBlockDraft[],
  durationMinutes: number,
): ProcessingBlocksValidation {
  if (drafts.length === 0) return { ok: true, blocks: [] };
  if (!Number.isInteger(durationMinutes) || durationMinutes < PROCESSING_BLOCK_MIN_MINUTES) {
    return { ok: false, error: 'Set a valid service duration before adding processing time.' };
  }
  const parsed: ProcessingTimeBlock[] = [];
  for (const d of drafts) {
    const start = Number(d.start);
    const duration = Number(d.duration);
    if (!Number.isInteger(start) || start < 0) {
      return { ok: false, error: 'Processing start must be a whole number of minutes.' };
    }
    if (!Number.isInteger(duration) || duration < PROCESSING_BLOCK_MIN_MINUTES) {
      return {
        ok: false,
        error: `Each processing period must be at least ${PROCESSING_BLOCK_MIN_MINUTES} minutes.`,
      };
    }
    if (start > durationMinutes) {
      return {
        ok: false,
        error: 'Processing periods must start within the service, or at its end.',
      };
    }
    if (start + duration > durationMinutes + PROCESSING_TAIL_MAX_MINUTES) {
      return {
        ok: false,
        error: `Processing time cannot run more than ${PROCESSING_TAIL_MAX_MINUTES} minutes past the end of the service.`,
      };
    }
    parsed.push({ ...(d.id ? { id: d.id } : {}), start_minute: start, duration_minutes: duration });
  }
  const sorted = [...parsed].sort((a, b) => a.start_minute - b.start_minute);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.start_minute < prev.start_minute + prev.duration_minutes) {
      return { ok: false, error: 'Processing periods must not overlap.' };
    }
  }
  return { ok: true, blocks: sorted };
}

/** The drafts as numbers, for the placement and resize helpers; unparsable fields read as 0. */
function draftBlocks(drafts: ProcessingBlockDraft[]): ProcessingTimeBlock[] {
  return drafts.map((d) => ({
    start_minute: Number(d.start) || 0,
    duration_minutes: Number(d.duration) || 0,
  }));
}

/** Where a period sits relative to the service, in words (web's per-row hint). */
export function describeProcessingBlockPlacement(
  block: Pick<ProcessingTimeBlock, 'start_minute' | 'duration_minutes'>,
  durationMinutes: number,
): string {
  const end = block.start_minute + block.duration_minutes;
  if (block.start_minute >= durationMinutes) return `After the service, ${block.duration_minutes} min`;
  if (end > durationMinutes) return `Runs ${end - durationMinutes} min past the end of the service`;
  return `${block.start_minute} to ${end} min into the service`;
}

interface ProcessingTimeBlocksEditorProps {
  drafts: ProcessingBlockDraft[];
  onChange: (next: ProcessingBlockDraft[]) => void;
  /** Service core duration in minutes (drives placement, the hints and the summary). */
  durationMinutes: number;
  bufferMinutes?: number;
}

/**
 * Simple add/remove list of processing-time periods — waits where the client
 * stays but the practitioner can take another booking. A period can sit inside
 * the service, or start at its end and run on afterwards (web #185): that tail
 * is not part of the service length, and the next service of a visit waits
 * behind it. Deliberately NOT a drag timeline (web parity kept to the data, not
 * the gesture). Controlled component: parent owns the draft array.
 */
export function ProcessingTimeBlocksEditor({
  drafts,
  onChange,
  durationMinutes,
  bufferMinutes = 0,
}: ProcessingTimeBlocksEditorProps) {
  const { colors } = useTheme();

  const patch = (key: string, next: Partial<ProcessingBlockDraft>) =>
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...next } : d)));

  const remove = (key: string) => onChange(drafts.filter((d) => d.key !== key));

  const add = () => {
    hapticSelect();
    // The first period goes after the service (the common case: the client
    // waits while colour develops and the chair is free); further ones fill
    // backwards inside it. Nothing fits: fall back to a block at the start so
    // the validator's message explains why rather than the button silently
    // doing nothing.
    const placed = placeNewProcessingBlock(draftBlocks(drafts), durationMinutes) ?? {
      start_minute: 0,
      duration_minutes: PROCESSING_BLOCK_MIN_MINUTES,
    };
    onChange([
      ...drafts,
      { key: nextKey(), start: String(placed.start_minute), duration: String(placed.duration_minutes) },
    ]);
  };

  /**
   * A length edit. A period that ends exactly at the end of the service stays
   * anchored there (longer = starts earlier); one that starts at the end grows
   * on past it, which is how a wait after the service is set. A field that is
   * not a usable number yet (cleared, mid-typing) is stored as typed and judged
   * by the validator on save.
   */
  const updateLength = (draft: ProcessingBlockDraft, raw: string) => {
    const next = Number(raw);
    if (!Number.isInteger(next) || next < PROCESSING_BLOCK_MIN_MINUTES) {
      patch(draft.key, { duration: raw });
      return;
    }
    const resized = resizeProcessingBlock(
      { start_minute: Number(draft.start) || 0, duration_minutes: Number(draft.duration) || 0 },
      next,
      durationMinutes,
    );
    patch(draft.key, { start: String(resized.start_minute), duration: raw });
  };

  const blocks = draftBlocks(drafts);
  const activeTotal = blocks.reduce((sum, b) => sum + b.duration_minutes, 0);
  const tail = processingTailMinutes(blocks, durationMinutes);

  return (
    <View style={styles.container}>
      <Text variant="overline" tone="muted">
        Processing time
      </Text>
      <Text variant="caption" tone="muted">
        Time the client waits (colour developing, a mask setting) while you are free to see someone
        else. A period can sit inside the {durationMinutes || '—'} min service, or start at its end
        and run on afterwards. The next service in the same visit waits until it has finished.
        {bufferMinutes ? ` Your ${bufferMinutes} min buffer comes after all of it.` : ''}
      </Text>

      {drafts.length > 0 ? (
        <View style={styles.list}>
          {drafts.map((draft, index) => (
            <View
              key={draft.key}
              style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.fields}>
                <View style={styles.field}>
                  <Input
                    label="Start (min)"
                    value={draft.start}
                    onChangeText={(start) => patch(draft.key, { start })}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Length (min)"
                    value={draft.duration}
                    onChangeText={(duration) => updateLength(draft, duration)}
                    keyboardType="number-pad"
                  />
                </View>
                <Button
                  label="Remove"
                  variant="ghost"
                  size="sm"
                  onPress={() => remove(draft.key)}
                />
              </View>
              <Text variant="caption" tone="muted" testID={`processing-placement-${index}`}>
                {describeProcessingBlockPlacement(blocks[index]!, durationMinutes)}
              </Text>
            </View>
          ))}
          <Text variant="caption" tone="muted">
            {activeTotal} min of processing across {drafts.length} period
            {drafts.length === 1 ? '' : 's'}.
            {tail > 0 ? ` Service: ${durationMinutes} min, then ${tail} min after it.` : ''}
          </Text>
        </View>
      ) : null}

      <Button
        label="Add processing period"
        variant="secondary"
        size="sm"
        onPress={add}
        disabled={drafts.length >= MAX_BLOCKS}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  fields: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  field: {
    flex: 1,
  },
});
