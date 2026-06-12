import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ProcessingTimeBlock } from '@/types/services-manage';

/** Minimum block length the API enforces (`PROCESSING_BLOCK_MIN_MINUTES`). */
export const PROCESSING_BLOCK_MIN_MINUTES = 5;
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
 * `validateProcessingTimeBlocks`: each block ≥ 5 min, must lie within the core
 * duration (before buffer), and blocks must not overlap.
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
    if (start + duration > durationMinutes) {
      return {
        ok: false,
        error: 'Processing periods must fit within the service duration (before buffer).',
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

interface ProcessingTimeBlocksEditorProps {
  drafts: ProcessingBlockDraft[];
  onChange: (next: ProcessingBlockDraft[]) => void;
  /** Service core duration in minutes (drives the "fits within" hint + defaults). */
  durationMinutes: number;
  bufferMinutes?: number;
}

/**
 * Simple add/remove list of processing-time periods — gaps inside the
 * appointment where the client stays but the practitioner can take another
 * booking. Deliberately NOT a drag timeline (web parity kept to the data, not
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
    // Default the next start to the end of the last block (clamped into range).
    const sorted = [...drafts].sort((a, b) => Number(a.start) - Number(b.start));
    const last = sorted[sorted.length - 1];
    const lastEnd = last ? Number(last.start || '0') + Number(last.duration || '0') : 0;
    const maxStart = Math.max(0, durationMinutes - PROCESSING_BLOCK_MIN_MINUTES);
    const start = Math.max(0, Math.min(Number.isFinite(lastEnd) ? lastEnd : 0, maxStart));
    const duration = Math.min(
      PROCESSING_BLOCK_MIN_MINUTES * 2,
      Math.max(PROCESSING_BLOCK_MIN_MINUTES, durationMinutes - start),
    );
    onChange([
      ...drafts,
      { key: nextKey(), start: String(start), duration: String(duration) },
    ]);
  };

  const activeTotal = drafts.reduce((sum, d) => sum + (Number(d.duration) || 0), 0);

  return (
    <View style={styles.container}>
      <Text variant="overline" tone="muted">
        Processing time
      </Text>
      <Text variant="caption" tone="muted">
        Gaps inside the {durationMinutes || '—'} min appointment where the client stays but you are
        free to take another booking{bufferMinutes ? ` (buffer of ${bufferMinutes} min applies after)` : ''}.
      </Text>

      {drafts.length > 0 ? (
        <View style={styles.list}>
          {drafts.map((draft) => (
            <View
              key={draft.key}
              style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
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
                  onChangeText={(duration) => patch(draft.key, { duration })}
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
          ))}
          <Text variant="caption" tone="muted">
            {activeTotal} min of processing across {drafts.length} period
            {drafts.length === 1 ? '' : 's'}.
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
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  field: {
    flex: 1,
  },
});
