/**
 * AvailabilityBlocksSection — Closures, Amended Hours & Capacity
 *
 * Mobile-native implementation of the web's BusinessClosuresSection.
 * Features:
 *  - Upcoming and past block lists with edit/delete
 *  - Bottom-sheet BlockForm: type picker, date/time text inputs, conditional
 *    fields, reason input
 *  - Full CRUD wired to the availability-blocks hooks
 *  - Admin-only write; staff see read-only list
 */
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { minutesToTime } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { hapticError, hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useAvailabilityBlocks,
  useCreateBlock,
  useDeleteBlock,
  usePatchBlock,
} from '@/lib/queries/useAvailabilityBlocks';
import type {
  AvailabilityBlock,
  BlockType,
  CreateBlockInput,
  OverridePeriod,
  PatchBlockInput,
} from '@/lib/queries/useAvailabilityBlocks';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  closed: 'Closure',
  amended_hours: 'Amended Hours',
  reduced_capacity: 'Reduced Capacity',
  special_event: 'Special Event',
};

const BLOCK_TYPES: BlockType[] = ['closed', 'amended_hours', 'reduced_capacity', 'special_event'];

// Colour palette keys per block type (mapped from ThemeColors)
const BLOCK_BG_KEY: Record<BlockType, string> = {
  closed: 'dangerSurface',
  amended_hours: 'warningSurface',
  reduced_capacity: 'accentSubtle',
  special_event: 'infoSurface',
};

const BLOCK_TEXT_KEY: Record<BlockType, string> = {
  closed: 'danger',
  amended_hours: 'warning',
  reduced_capacity: 'accent',
  special_event: 'brand',
};

// ---------------------------------------------------------------------------
// Draft state
// ---------------------------------------------------------------------------

interface DraftState {
  block_type: BlockType;
  date_start: string;
  date_end: string;
  time_start: string;
  time_end: string;
  reason: string;
  p1Open: string;
  p1Close: string;
  p2Open: string;
  p2Close: string;
  override_max_covers: string;
}

function emptyDraft(): DraftState {
  // Seed dates to today so the native pickers show a concrete, valid value the
  // moment the sheet opens (an OS picker can't represent "empty"). The user
  // adjusts from there; the rest stays blank/optional as before.
  const today = new Date().toISOString().slice(0, 10);
  return {
    block_type: 'closed',
    date_start: today,
    date_end: today,
    time_start: '',
    time_end: '',
    reason: '',
    p1Open: '',
    p1Close: '',
    p2Open: '',
    p2Close: '',
    override_max_covers: '',
  };
}

function draftFromBlock(b: AvailabilityBlock): DraftState {
  const periods = b.override_periods ?? [];
  return {
    block_type: b.block_type,
    date_start: b.date_start,
    date_end: b.date_end,
    time_start: b.time_start ?? '',
    time_end: b.time_end ?? '',
    reason: b.reason ?? '',
    p1Open: periods[0]?.open ?? '',
    p1Close: periods[0]?.close ?? '',
    p2Open: periods[1]?.open ?? '',
    p2Close: periods[1]?.close ?? '',
    override_max_covers: b.override_max_covers != null ? String(b.override_max_covers) : '',
  };
}

function draftToCreatePayload(d: DraftState): CreateBlockInput {
  const base: CreateBlockInput = {
    block_type: d.block_type,
    date_start: d.date_start,
    date_end: d.date_end,
    reason: d.reason.trim() || null,
    time_start: null,
    time_end: null,
    override_max_covers: null,
    override_periods: null,
    yield_overrides: null,
  };

  if (d.block_type === 'closed') {
    base.time_start = d.time_start || null;
    base.time_end = d.time_end || null;
  }

  if (d.block_type === 'amended_hours') {
    const periods: OverridePeriod[] = [];
    if (d.p1Open && d.p1Close) periods.push({ open: d.p1Open, close: d.p1Close });
    if (d.p2Open && d.p2Close) periods.push({ open: d.p2Open, close: d.p2Close });
    base.override_periods = periods.length > 0 ? periods : null;
  }

  if (d.block_type === 'reduced_capacity') {
    const max = parseInt(d.override_max_covers, 10);
    base.override_max_covers = isNaN(max) ? null : max;
  }

  return base;
}

function draftToPatchPayload(d: DraftState, id: string): PatchBlockInput {
  return { id, ...draftToCreatePayload(d) };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function validateDraft(d: DraftState): string | null {
  if (!d.date_start || !DATE_RE.test(d.date_start)) return 'Start date required (YYYY-MM-DD).';
  if (!d.date_end || !DATE_RE.test(d.date_end)) return 'End date required (YYYY-MM-DD).';
  if (d.date_end < d.date_start) return 'End date must be on or after start date.';
  if (d.time_start && !TIME_RE.test(d.time_start)) return 'Start time must be HH:MM.';
  if (d.time_end && !TIME_RE.test(d.time_end)) return 'End time must be HH:MM.';
  if (d.block_type === 'amended_hours') {
    if (!d.p1Open || !d.p1Close) return 'At least one open period is required for amended hours.';
    if (!TIME_RE.test(d.p1Open) || !TIME_RE.test(d.p1Close)) return 'Period times must be HH:MM.';
    if (d.p1Open >= d.p1Close) return 'Period 1 close must be after open.';
    if (d.p2Open || d.p2Close) {
      if (!d.p2Open || !d.p2Close || !TIME_RE.test(d.p2Open) || !TIME_RE.test(d.p2Close)) {
        return 'Both period 2 open and close are required when using a second period.';
      }
      if (d.p2Open >= d.p2Close) return 'Period 2 close must be after open.';
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateRange(b: AvailabilityBlock): string {
  if (b.date_start === b.date_end) return b.date_start;
  return `${b.date_start} – ${b.date_end}`;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- HH:MM <-> minutes bridge for the native TimePickerField ----------------
/** "HH:MM" → minutes since midnight; invalid/empty → fallback. */
function timeToMinutes(hhmm: string, fallback = 540): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return fallback;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(mins) ? Math.max(0, Math.min(23 * 60 + 59, mins)) : fallback;
}

/** Default times when first revealing an optional picker (09:00 open, 17:00 close). */
const DEFAULT_OPEN_MINUTES = 9 * 60;
const DEFAULT_CLOSE_MINUTES = 17 * 60;

/** "YYYY-MM-DD" → a local noon Date (noon avoids tz day-boundary slip) for picker bounds. */
function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

// ---------------------------------------------------------------------------
// Block type badge
// ---------------------------------------------------------------------------

function BlockTypeBadge({ type }: { type: BlockType }) {
  const { colors } = useTheme();
  const bg = (colors as Record<string, string>)[BLOCK_BG_KEY[type]] ?? colors.surface;
  const textColor = (colors as Record<string, string>)[BLOCK_TEXT_KEY[type]] ?? colors.text;
  return (
    <View style={[styles.typeBadge, { backgroundColor: bg }]}>
      <Text variant="caption" color={textColor}>
        {BLOCK_TYPE_LABELS[type]}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Block row
// ---------------------------------------------------------------------------

function BlockRow({
  block,
  onEdit,
  onDelete,
  isAdmin,
}: {
  block: AvailabilityBlock;
  onEdit: (b: AvailabilityBlock) => void;
  onDelete: (id: string) => void;
  isAdmin: boolean;
}) {
  const { colors } = useTheme();
  // Two-step inline confirm — Alert.alert's confirm is a no-op on web.
  const [armed, setArmed] = useState(false);
  return (
    <Pressable
      onPress={() => isAdmin && onEdit(block)}
      accessibilityRole={isAdmin ? 'button' : 'none'}
      style={({ pressed }) => [
        styles.blockRow,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed && isAdmin ? 0.8 : 1,
        },
      ]}>
      <View style={styles.blockRowMain}>
        <View style={styles.blockRowTopLine}>
          <BlockTypeBadge type={block.block_type} />
          <Text variant="bodySmall" style={styles.blockRowDate}>
            {formatDateRange(block)}
          </Text>
          {block.time_start && block.time_end ? (
            <Text variant="caption" tone="muted">
              {block.time_start}–{block.time_end}
            </Text>
          ) : null}
        </View>
        {block.block_type === 'amended_hours' && block.override_periods?.length ? (
          <Text variant="caption" tone="muted">
            {block.override_periods.map((p) => `${p.open}–${p.close}`).join(', ')}
          </Text>
        ) : null}
        {block.override_max_covers != null ? (
          <Text variant="caption" tone="muted">
            Capacity: {block.override_max_covers}
          </Text>
        ) : null}
        {block.reason ? (
          <Text variant="caption" tone="secondary">
            {block.reason}
          </Text>
        ) : null}
      </View>
      {isAdmin ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            if (armed) {
              onDelete(block.id);
              setArmed(false);
            } else {
              setArmed(true);
            }
          }}
          hitSlop={8}
          accessibilityLabel={armed ? 'Confirm delete block' : 'Delete block'}
          accessibilityRole="button"
          style={styles.blockRowDeleteBtn}>
          <Text variant="caption" tone="danger">
            {armed ? 'Confirm' : 'Delete'}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Type selector (horizontal scroll pills)
// ---------------------------------------------------------------------------

function TypeSelector({
  value,
  onChange,
}: {
  value: BlockType;
  onChange: (t: BlockType) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.fieldWrapper}>
      <Text variant="label" tone="secondary">
        Type
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
        {BLOCK_TYPES.map((t) => (
          <Pressable
            key={t}
            onPress={() => onChange(t)}
            style={[
              styles.typeOption,
              {
                backgroundColor: value === t ? colors.brand : colors.surface,
                borderColor: value === t ? colors.brand : colors.border,
              },
            ]}>
            <Text
              variant="label"
              color={value === t ? colors.onBrand : colors.text}>
              {BLOCK_TYPE_LABELS[t]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Time pickers (native) — required + optional variants
// ---------------------------------------------------------------------------

/** A labelled, always-present native time field (value stored as "HH:MM"). */
function LabeledTimePicker({
  label,
  value,
  fallbackMinutes,
  onChange,
}: {
  label: string;
  value: string;
  fallbackMinutes: number;
  onChange: (hhmm: string) => void;
}) {
  return (
    <View style={styles.fieldWrapper}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <TimePickerField
        value={timeToMinutes(value, fallbackMinutes)}
        onChange={(mins) => onChange(minutesToTime(mins))}
        accessibilityLabel={label}
      />
    </View>
  );
}

/**
 * Optional native time field: shows a "Set time" button while empty (so the
 * draft keeps the empty string the payload/validation expect), and the native
 * picker plus a Clear control once a time is chosen.
 */
function OptionalTimePicker({
  label,
  value,
  defaultMinutes,
  onChange,
}: {
  label: string;
  value: string;
  defaultMinutes: number;
  onChange: (hhmm: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.fieldWrapper}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      {value ? (
        <View style={styles.optionalTimeRow}>
          <TimePickerField
            value={timeToMinutes(value, defaultMinutes)}
            onChange={(mins) => onChange(minutesToTime(mins))}
            accessibilityLabel={label}
          />
          <Pressable
            onPress={() => onChange('')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            style={styles.clearTimeBtn}>
            <Text variant="caption" tone="muted">
              Clear
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => onChange(minutesToTime(defaultMinutes))}
          accessibilityRole="button"
          accessibilityLabel={`Set ${label}`}
          style={({ pressed }) => [
            styles.setTimeBtn,
            { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text variant="bodySmall" tone="secondary">
            Set time
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// BlockForm sheet
// ---------------------------------------------------------------------------

function BlockForm({
  visible,
  editingBlock,
  onClose,
}: {
  visible: boolean;
  editingBlock: AvailabilityBlock | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const createBlock = useCreateBlock();
  const patchBlock = usePatchBlock();
  const isSaving = createBlock.isPending || patchBlock.isPending;

  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const today = todayYmd();

  // Sync draft whenever the sheet opens (editingBlock may change).
  const handleSheetVisible = useCallback(() => {
    setDraft(editingBlock ? draftFromBlock(editingBlock) : emptyDraft());
    setError(null);
  }, [editingBlock]);

  const pd = draft;
  const set = useCallback(
    (patch: Partial<DraftState>) => setDraft((prev) => ({ ...prev, ...patch })),
    [],
  );

  async function handleSave() {
    const valErr = validateDraft(pd);
    if (valErr) {
      setError(valErr);
      hapticWarning();
      return;
    }
    setError(null);
    try {
      if (editingBlock) {
        await patchBlock.mutateAsync(draftToPatchPayload(pd, editingBlock.id));
      } else {
        await createBlock.mutateAsync(draftToCreatePayload(pd));
      }
      hapticSuccess();
      onClose();
    } catch (e) {
      hapticError();
      setError(e instanceof Error ? e.message : 'Could not save block.');
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      maxHeight="92%"
      fill>
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
        onLayout={handleSheetVisible}>

        <Text variant="subheading">
          {editingBlock ? 'Edit Block' : 'New Block'}
        </Text>

        <TypeSelector
          value={pd.block_type}
          onChange={(t) =>
            // Seed required period-1 times when first switching to amended hours so the
            // shown defaults are actually in the draft (an OS picker can't be empty).
            set(
              t === 'amended_hours' && !pd.p1Open && !pd.p1Close
                ? {
                    block_type: t,
                    p1Open: minutesToTime(DEFAULT_OPEN_MINUTES),
                    p1Close: minutesToTime(DEFAULT_CLOSE_MINUTES),
                  }
                : { block_type: t },
            )
          }
        />

        {/* Date range — native OS date pickers */}
        <View style={styles.row2}>
          <View style={styles.halfField}>
            <Text variant="label" tone="secondary">
              Start date
            </Text>
            <DatePickerField
              value={pd.date_start || today}
              onChange={(v) =>
                // Keep end ≥ start: mirror to end when empty or now behind start.
                set({ date_start: v, date_end: !pd.date_end || pd.date_end < v ? v : pd.date_end })
              }
              accessibilityLabel="Closure start date"
            />
          </View>
          <View style={styles.halfField}>
            <Text variant="label" tone="secondary">
              End date
            </Text>
            <DatePickerField
              value={pd.date_end || pd.date_start || today}
              onChange={(v) => set({ date_end: v })}
              minimumDate={pd.date_start ? isoToLocalDate(pd.date_start) : undefined}
              accessibilityLabel="Closure end date"
            />
          </View>
        </View>

        {/* Partial-day times — closed only (optional native time pickers) */}
        {pd.block_type === 'closed' ? (
          <View style={styles.row2}>
            <View style={styles.halfField}>
              <OptionalTimePicker
                label="Start time (optional)"
                value={pd.time_start}
                defaultMinutes={DEFAULT_OPEN_MINUTES}
                onChange={(v) => set({ time_start: v })}
              />
            </View>
            <View style={styles.halfField}>
              <OptionalTimePicker
                label="End time (optional)"
                value={pd.time_end}
                defaultMinutes={DEFAULT_CLOSE_MINUTES}
                onChange={(v) => set({ time_end: v })}
              />
            </View>
          </View>
        ) : null}

        {/* Amended hours periods */}
        {pd.block_type === 'amended_hours' ? (
          <>
            <Text variant="label" tone="secondary">
              Override periods
            </Text>
            <View style={styles.row2}>
              <View style={styles.halfField}>
                <LabeledTimePicker
                  label="Period 1 open"
                  value={pd.p1Open || minutesToTime(DEFAULT_OPEN_MINUTES)}
                  fallbackMinutes={DEFAULT_OPEN_MINUTES}
                  onChange={(v) => set({ p1Open: v })}
                />
              </View>
              <View style={styles.halfField}>
                <LabeledTimePicker
                  label="Period 1 close"
                  value={pd.p1Close || minutesToTime(DEFAULT_CLOSE_MINUTES)}
                  fallbackMinutes={DEFAULT_CLOSE_MINUTES}
                  onChange={(v) => set({ p1Close: v })}
                />
              </View>
            </View>
            <View style={styles.row2}>
              <View style={styles.halfField}>
                <OptionalTimePicker
                  label="Period 2 open (opt.)"
                  value={pd.p2Open}
                  defaultMinutes={DEFAULT_OPEN_MINUTES}
                  onChange={(v) => set({ p2Open: v })}
                />
              </View>
              <View style={styles.halfField}>
                <OptionalTimePicker
                  label="Period 2 close (opt.)"
                  value={pd.p2Close}
                  defaultMinutes={DEFAULT_CLOSE_MINUTES}
                  onChange={(v) => set({ p2Close: v })}
                />
              </View>
            </View>
          </>
        ) : null}

        {/* Reduced capacity */}
        {pd.block_type === 'reduced_capacity' ? (
          <Input
            label="Override max covers"
            value={pd.override_max_covers}
            onChangeText={(v) => set({ override_max_covers: v })}
            keyboardType="number-pad"
            placeholder="e.g. 20"
          />
        ) : null}

        {/* Reason */}
        <Input
          label="Reason (optional)"
          value={pd.reason}
          onChangeText={(v) => set({ reason: v })}
          placeholder="e.g. Bank Holiday, Staff training"
          autoCapitalize="sentences"
        />

        {error ? (
          <View
            style={[
              styles.errorBanner,
              { backgroundColor: colors.dangerSurface, borderColor: colors.danger },
            ]}>
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          </View>
        ) : null}

        <Button
          label={isSaving ? 'Saving…' : editingBlock ? 'Save Changes' : 'Add Block'}
          fullWidth
          loading={isSaving}
          disabled={!pd.date_start || !pd.date_end}
          onPress={() => void handleSave()}
        />

        <Button label="Cancel" variant="secondary" fullWidth onPress={onClose} />
      </ScrollView>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

type AvailabilityBlocksSectionProps = {
  isAdmin: boolean;
};

export function AvailabilityBlocksSection({ isAdmin }: AvailabilityBlocksSectionProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const { data: blocks = [], isLoading, refetch } = useAvailabilityBlocks();
  const deleteBlock = useDeleteBlock();

  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingBlock, setEditingBlock] = useState<AvailabilityBlock | null>(null);
  const [showPast, setShowPast] = useState(false);

  const today = todayYmd();

  const upcoming = useMemo(
    () =>
      blocks
        .filter((b) => b.date_end >= today)
        .sort((a, b) => a.date_start.localeCompare(b.date_start)),
    [blocks, today],
  );

  const past = useMemo(
    () =>
      blocks
        .filter((b) => b.date_end < today)
        .sort((a, b) => b.date_start.localeCompare(a.date_start)),
    [blocks, today],
  );

  function openCreate() {
    setEditingBlock(null);
    setSheetVisible(true);
  }

  const openEdit = useCallback((b: AvailabilityBlock) => {
    if (!isAdmin) return;
    setEditingBlock(b);
    setSheetVisible(true);
  }, [isAdmin]);

  // The row arms its own two-step confirm (Alert.alert's confirm is a no-op on web),
  // so this just runs the delete and reports the result.
  function confirmDelete(id: string) {
    deleteBlock.mutate(id, {
      onSuccess: () => {
        hapticSuccess();
        toast.success('Closure removed.');
      },
      onError: () => {
        hapticError();
        toast.error('Could not remove the closure.');
      },
    });
  }

  return (
    <Card padded={false}>
      {/* Card header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text variant="subheading">Closures &amp; Exceptions</Text>
          <Text variant="caption" tone="muted">
            One-off closures, amended hours, and capacity changes.
          </Text>
        </View>
        {isAdmin ? (
          <Button label="Add" size="sm" onPress={openCreate} style={styles.addBtn} />
        ) : null}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.skeletonPad}>
          {[1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={60} radius={8} />
          ))}
        </View>
      ) : (
        <>
          {upcoming.length === 0 ? (
            <View style={styles.emptyPad}>
              <Text variant="bodySmall" tone="muted" style={styles.emptyText}>
                No upcoming closures or exceptions.
                {isAdmin ? ' Tap Add to create one.' : ''}
              </Text>
            </View>
          ) : (
            <View style={styles.blockList}>
              {upcoming.map((b) => (
                <BlockRow
                  key={b.id}
                  block={b}
                  onEdit={openEdit}
                  onDelete={confirmDelete}
                  isAdmin={isAdmin}
                />
              ))}
            </View>
          )}

          {past.length > 0 ? (
            <Pressable
              onPress={() => setShowPast((s) => !s)}
              style={[styles.pastToggle, { borderTopColor: colors.border }]}>
              <Text variant="label" tone="secondary">
                {showPast ? 'Hide' : 'Show'} past blocks ({past.length})
              </Text>
            </Pressable>
          ) : null}

          {showPast ? (
            <View style={styles.blockList}>
              {past.map((b) => (
                <BlockRow
                  key={b.id}
                  block={b}
                  onEdit={openEdit}
                  onDelete={confirmDelete}
                  isAdmin={isAdmin}
                />
              ))}
            </View>
          ) : null}
        </>
      )}

      <BlockForm
        visible={sheetVisible}
        editingBlock={editingBlock}
        onClose={() => {
          setSheetVisible(false);
          void refetch();
        }}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: spacing.base,
    gap: spacing.sm,
  },
  cardHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  addBtn: {
    alignSelf: 'flex-start',
  },
  skeletonPad: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  blockList: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
    gap: spacing.sm,
  },
  emptyPad: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
  emptyText: {
    textAlign: 'center',
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  blockRowMain: {
    flex: 1,
    gap: spacing.xs,
  },
  blockRowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  blockRowDate: {
    flex: 1,
  },
  blockRowDeleteBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pastToggle: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: spacing.base,
    alignItems: 'center',
  },
  // Sheet form
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
    gap: spacing.base,
  },
  typeRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  typeOption: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  row2: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfField: {
    flex: 1,
  },
  fieldWrapper: {
    gap: spacing.sm,
  },
  optionalTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  clearTimeBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  setTimeBtn: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
