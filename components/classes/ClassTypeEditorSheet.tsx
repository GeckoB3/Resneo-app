import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { parsePoundsToPence, penceToPoundsInput } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useCreateClassType, useUpdateClassType } from '@/lib/queries/useClassesManage';
import { useCreateHostCalendar } from '@/lib/queries/usePractitioners';
import { useSetupStatus } from '@/lib/queries/useSetupStatus';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  ClassCalendarColumn,
  ClassPaymentRequirement,
  ManagedClassType,
} from '@/types/classes-manage';

/** Web class colour presets (`BLANK_CT.colour` + the swatch row defaults). */
const COLOUR_OPTIONS = [
  '#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316',
];

/** Matches the server `colour` field — `#rrggbb`. */
const HEX_COLOUR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * The four payment options every venue can choose from (exact web copy). Card
 * hold (spec 6.2) is a standard option; it is no longer gated by a venue flag.
 */
const PAYMENT_OPTIONS: { value: ClassPaymentRequirement; label: string; hint: string }[] = [
  { value: 'none', label: 'No online payment', hint: 'Pay at the venue or arrange separately' },
  { value: 'deposit', label: 'Custom deposit', hint: 'Fixed amount paid online when booking' },
  { value: 'full_payment', label: 'Pay in full online', hint: 'Full price taken at booking' },
  {
    value: 'card_hold',
    label: 'Card hold',
    hint: 'No payment is taken when the client books. Their card is stored securely and you can charge a no-show fee if they do not attend.',
  },
];

/** What the sheet is editing: a brand-new class type, or an existing one. */
export type ClassTypeEditorTarget =
  | { mode: 'create' }
  | { mode: 'edit'; classType: ManagedClassType };

type ClassTypeEditorSheetProps = {
  target: ClassTypeEditorTarget | null;
  /**
   * Team calendar columns to assign the class to (GET `unified_calendars`,
   * falling back to `practitioners`). The selected column id is sent as
   * `instructor_id` — required by the API.
   */
  calendarColumns: ClassCalendarColumn[];
  onClose: () => void;
  /** Called after a successful create/update so the parent can refresh + toast. */
  onSaved?: () => void;
};

/**
 * Full create/edit editor for a class type. Sections: Basics (name,
 * description, colour, active), Session defaults (duration, capacity), Calendar
 * column (required single-select), Booking rules, and Price & payment (radio
 * none/deposit/full_payment/card_hold + conditional deposit or no-show fee).
 * Client validation mirrors the server `classTypeSchema` so errors surface
 * before the request, matching how the services editor's `handleSave` validates.
 *
 * @see _reference/Resneo/src/app/api/venue/classes/route.ts (classTypeSchema)
 */
export function ClassTypeEditorSheet({
  target,
  calendarColumns,
  onClose,
  onSaved,
}: ClassTypeEditorSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';
  const create = useCreateClassType();
  const update = useUpdateClassType();
  const createCalendar = useCreateHostCalendar();
  // Stripe-connected state for the deposit/full-payment warning (web parity).
  const setupStatus = useSetupStatus(isAdmin);
  const stripeConnected = setupStatus.data?.stripe_connected ?? true;

  const editing = target?.mode === 'edit' ? target.classType : null;

  // Form state.
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [colour, setColour] = useState(COLOUR_OPTIONS[0]!);
  const [isActive, setIsActive] = useState(true);
  const [duration, setDuration] = useState('60');
  const [capacity, setCapacity] = useState('10');
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [instructorName, setInstructorName] = useState('');
  const [advanceDays, setAdvanceDays] = useState('90');
  const [noticeHours, setNoticeHours] = useState('1');
  const [cancelHours, setCancelHours] = useState('48');
  const [sameDay, setSameDay] = useState(true);
  const [paymentReq, setPaymentReq] = useState<ClassPaymentRequirement>('none');
  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Inline "Add calendar column" — columns created here are held locally and
  // selected optimistically, so a fresh venue with zero columns isn't blocked
  // waiting for the classes feed to refetch.
  const [addedColumns, setAddedColumns] = useState<ClassCalendarColumn[]>([]);
  const [showAddCalendar, setShowAddCalendar] = useState(false);
  const [newCalendarName, setNewCalendarName] = useState('');
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // Calendar option that was saved on the class but is no longer in the list
  // (e.g. column deleted) — keep it selectable so editing doesn't silently drop it.
  const orphanColumn = useMemo<ClassCalendarColumn | null>(() => {
    if (!editing?.instructor_id) return null;
    if (calendarColumns.some((c) => c.id === editing.instructor_id)) return null;
    if (addedColumns.some((c) => c.id === editing.instructor_id)) return null;
    return { id: editing.instructor_id, name: editing.instructor_name?.trim() || 'Saved calendar' };
  }, [editing, calendarColumns, addedColumns]);

  const columnOptions = useMemo<ClassCalendarColumn[]>(() => {
    // De-dupe in case a freshly-added column also lands in the refetched feed.
    const seen = new Set<string>();
    const merged: ClassCalendarColumn[] = [];
    for (const col of [...calendarColumns, ...addedColumns, ...(orphanColumn ? [orphanColumn] : [])]) {
      if (seen.has(col.id)) continue;
      seen.add(col.id);
      merged.push(col);
    }
    return merged;
  }, [calendarColumns, addedColumns, orphanColumn]);

  // Seed the form whenever the target changes (open).
  useEffect(() => {
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when target changes
    setError(null);
    setAddedColumns([]);
    setShowAddCalendar(false);
    setNewCalendarName('');
    setCalendarError(null);
    if (target.mode === 'edit') {
      const ct = target.classType;
      setName(ct.name);
      setDescription(ct.description ?? '');
      setColour(ct.colour ?? COLOUR_OPTIONS[0]!);
      setIsActive(ct.is_active !== false);
      setDuration(String(ct.duration_minutes));
      setCapacity(String(ct.capacity));
      setCalendarId(ct.instructor_id ?? ct.instructor_calendar_id ?? null);
      setInstructorName(ct.instructor_name ?? '');
      setAdvanceDays(String(ct.max_advance_booking_days ?? 90));
      setNoticeHours(String(ct.min_booking_notice_hours ?? 1));
      setCancelHours(String(ct.cancellation_notice_hours ?? 48));
      setSameDay(ct.allow_same_day_booking !== false);
      setPaymentReq(ct.payment_requirement ?? 'none');
      setPrice(penceToPoundsInput(ct.price_pence));
      setDeposit(penceToPoundsInput(ct.deposit_amount_pence));
    } else {
      setName('');
      setDescription('');
      setColour(COLOUR_OPTIONS[0]!);
      setIsActive(true);
      setDuration('60');
      setCapacity('10');
      // Default to the first column so the required field starts valid.
      setCalendarId(calendarColumns[0]?.id ?? null);
      setInstructorName('');
      setAdvanceDays('90');
      setNoticeHours('1');
      setCancelHours('48');
      setSameDay(true);
      setPaymentReq('none');
      setPrice('');
      setDeposit('');
    }
    // calendarColumns intentionally excluded: only re-seed when the target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const saving = create.isPending || update.isPending;

  async function handleSave() {
    setError(null);
    const durationMinutes = Number(duration);
    const capacityValue = Number(capacity);
    const advance = Number(advanceDays);
    const notice = Number(noticeHours);
    const cancel = Number(cancelHours);

    if (!name.trim()) { setError('Name is required.'); return; }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
      setError('Duration must be 5–480 minutes.'); return;
    }
    if (!Number.isInteger(capacityValue) || capacityValue < 1) {
      setError('Capacity must be at least 1.'); return;
    }
    if (!calendarId) {
      setError('Choose a calendar column for this class.'); return;
    }
    if (!Number.isInteger(advance) || advance < 1 || advance > 365) {
      setError('Book ahead must be 1–365 days.'); return;
    }
    if (!Number.isInteger(notice) || notice < 0 || notice > 168) {
      setError('Min notice must be 0–168 hours.'); return;
    }
    if (!Number.isInteger(cancel) || cancel < 0 || cancel > 168) {
      setError('Cancellation notice must be 0–168 hours.'); return;
    }

    const pricePence = parsePoundsToPence(price);
    const depositPence = parsePoundsToPence(deposit);
    if (pricePence === undefined || depositPence === undefined) {
      setError('Price and deposit must be valid amounts.'); return;
    }
    // Cross-field rules mirror the server `classTypeSchema.superRefine`.
    const effectivePrice = pricePence ?? 0;
    if ((paymentReq === 'deposit' || paymentReq === 'full_payment') && effectivePrice <= 0) {
      setError('Set a price per person before choosing deposit or full payment.'); return;
    }
    if (paymentReq === 'deposit') {
      if (!(depositPence != null && depositPence > 0)) {
        setError('Enter a deposit amount greater than zero.'); return;
      }
      if (effectivePrice > 0 && depositPence > effectivePrice) {
        setError('Deposit cannot exceed the price per person.'); return;
      }
    }
    // Card hold (spec 6.2): no price relationship — the per-person no-show fee
    // just has to be £1 to £150.
    if (paymentReq === 'card_hold') {
      if (!(depositPence != null && depositPence >= 100)) {
        setError('No-show fee must be at least £1 per person.'); return;
      }
      if (depositPence > 15000) {
        setError('No-show fee cannot exceed £150 per person.'); return;
      }
    }

    const colourValue = colour.trim().toLowerCase();
    if (!HEX_COLOUR_RE.test(colourValue)) {
      setError('Colour must be a hex value like #3b82f6.'); return;
    }

    const shared = {
      name: name.trim(),
      description: description.trim() || null,
      duration_minutes: durationMinutes,
      capacity: capacityValue,
      instructor_id: calendarId,
      instructor_name: instructorName.trim() || null,
      colour: colourValue,
      is_active: isActive,
      price_pence: pricePence ?? null,
      payment_requirement: paymentReq,
      // Only send an amount when deposit or card hold is active ('card_hold'
      // stores the per-person no-show fee in the same column, spec D5).
      deposit_amount_pence:
        paymentReq === 'deposit' || paymentReq === 'card_hold' ? depositPence ?? null : null,
      max_advance_booking_days: advance,
      min_booking_notice_hours: notice,
      cancellation_notice_hours: cancel,
      allow_same_day_booking: sameDay,
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...shared });
      } else {
        await create.mutateAsync({ ...shared, instructor_id: calendarId });
      }
      hapticSuccess();
      toast.success(editing ? 'Class updated.' : 'Class created.');
      onSaved?.();
      onClose();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save the class.');
    }
  }

  /** Create a new calendar column inline and select it (optimistic). */
  async function handleAddCalendar() {
    const trimmed = newCalendarName.trim();
    setCalendarError(null);
    if (!trimmed) {
      setCalendarError('Enter a name for the calendar.');
      return;
    }
    try {
      const created = await createCalendar.mutateAsync({ name: trimmed });
      const column: ClassCalendarColumn = {
        id: created.id,
        name: created.name,
        sort_order: created.sort_order,
      };
      setAddedColumns((prev) => [...prev, column]);
      setCalendarId(created.id);
      setShowAddCalendar(false);
      setNewCalendarName('');
      hapticSuccess();
      toast.success('Calendar added.');
    } catch (e) {
      hapticWarning();
      // Surface the plan calendar-limit (403 upgrade_required) and other errors.
      setCalendarError(
        e instanceof ApiError ? e.message : 'Could not add the calendar. Please try again.',
      );
    }
  }

  return (
    <Sheet visible={target !== null} onClose={onClose} maxHeight="92%" fill>
      <View style={styles.bodyWrap}>
        <Text variant="overline" tone="muted">
          {editing ? 'Edit class' : 'New class'}
        </Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled">
          {/* Basics */}
          <Input label="Name" value={name} onChangeText={setName} maxLength={200} />
          <Input
            label="Description (optional)"
            value={description}
            onChangeText={setDescription}
            multiline
            style={styles.multiline}
            maxLength={2000}
          />

          <Text variant="overline" tone="muted">Class colour</Text>
          <View style={styles.swatchRow}>
            {COLOUR_OPTIONS.map((option) => {
              const selected = colour.toUpperCase() === option.toUpperCase();
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityLabel={`Colour ${option}`}
                  accessibilityState={{ selected }}
                  onPress={() => setColour(option.toLowerCase())}
                  style={({ pressed }) => [
                    styles.swatch,
                    { backgroundColor: option, opacity: pressed ? 0.7 : 1 },
                    selected
                      ? { borderColor: colors.text, borderWidth: 2.5 }
                      : { borderColor: 'transparent', borderWidth: 2.5 },
                  ]}
                />
              );
            })}
          </View>
          <View style={styles.hexRow}>
            <View
              style={[
                styles.hexPreview,
                {
                  backgroundColor: HEX_COLOUR_RE.test(colour.trim()) ? colour.trim() : 'transparent',
                  borderColor: colors.border,
                },
              ]}
            />
            <View style={styles.field}>
              <Input
                label="Hex colour"
                helper="Any colour, e.g. #3b82f6."
                value={colour}
                onChangeText={(v) => setColour(v.toLowerCase())}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
              />
            </View>
          </View>

          <View style={styles.switchRow}>
            <Text variant="bodyMedium">Active (bookable by guests)</Text>
            <Switch value={isActive} onValueChange={setIsActive} />
          </View>

          {/* Session defaults */}
          <Text variant="overline" tone="muted">Session defaults</Text>
          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Duration (mins)"
                value={duration}
                onChangeText={setDuration}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.field}>
              <Input
                label="Capacity"
                value={capacity}
                onChangeText={setCapacity}
                keyboardType="number-pad"
              />
            </View>
          </View>

          {/* Calendar column — required single-select */}
          <Text variant="overline" tone="muted">Calendar column</Text>
          <Text variant="caption" tone="muted">
            The team calendar this class&apos;s sessions are placed on.
          </Text>
          {columnOptions.length === 0 ? (
            <Text variant="bodySmall" tone={isAdmin ? 'secondary' : 'danger'}>
              {isAdmin
                ? 'No calendar columns yet. Add one below to place this class on the calendar.'
                : 'No calendar columns are available. A venue admin can add one.'}
            </Text>
          ) : (
            <View style={styles.columnWrap}>
              {columnOptions.map((column) => {
                const selected = calendarId === column.id;
                return (
                  <Pressable
                    key={column.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setCalendarId(column.id)}
                    style={({ pressed }) => [
                      styles.columnChip,
                      {
                        backgroundColor: selected ? colors.brand : colors.surface,
                        borderColor: selected ? colors.brand : colors.border,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}>
                    <Text
                      variant="label"
                      color={selected ? colors.onBrand : colors.textSecondary}
                      numberOfLines={1}>
                      {column.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Inline add-calendar (admin) — POST /api/venue/practitioners */}
          {isAdmin ? (
            showAddCalendar ? (
              <View style={styles.addCalendarWrap}>
                <Input
                  label="New calendar name"
                  value={newCalendarName}
                  onChangeText={setNewCalendarName}
                  maxLength={200}
                  placeholder="e.g. Studio A"
                  autoCapitalize="words"
                />
                {calendarError ? (
                  <Text variant="caption" tone="danger">
                    {calendarError}
                  </Text>
                ) : null}
                <View style={styles.addCalendarActions}>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    size="sm"
                    style={styles.flex1}
                    disabled={createCalendar.isPending}
                    onPress={() => {
                      setShowAddCalendar(false);
                      setNewCalendarName('');
                      setCalendarError(null);
                    }}
                  />
                  <Button
                    label="Add"
                    size="sm"
                    style={styles.flex1}
                    loading={createCalendar.isPending}
                    onPress={() => void handleAddCalendar()}
                  />
                </View>
              </View>
            ) : (
              <Button
                label="Add calendar"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setCalendarError(null);
                  setNewCalendarName('');
                  setShowAddCalendar(true);
                }}
              />
            )
          ) : null}
          <Input
            label="Instructor label (optional)"
            helper="Shown to guests instead of the calendar name."
            value={instructorName}
            onChangeText={setInstructorName}
            maxLength={200}
          />

          {/* Booking rules */}
          <Text variant="overline" tone="muted">Booking rules</Text>
          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Book ahead (days)"
                value={advanceDays}
                onChangeText={setAdvanceDays}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.field}>
              <Input
                label="Min notice (hours)"
                value={noticeHours}
                onChangeText={setNoticeHours}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <Input
            label="Cancellation notice (hours)"
            helper="Refund cut-off for deposits and online payments."
            value={cancelHours}
            onChangeText={setCancelHours}
            keyboardType="number-pad"
          />
          <View style={styles.switchRow}>
            <Text variant="bodyMedium">Allow same-day bookings</Text>
            <Switch value={sameDay} onValueChange={setSameDay} />
          </View>

          {/* Price & payment */}
          <Text variant="overline" tone="muted">Price &amp; payment</Text>
          {PAYMENT_OPTIONS.map((option) => {
            const selected = paymentReq === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setPaymentReq(option.value)}
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
                  <Text variant="bodyMedium">{option.label}</Text>
                  <Text variant="caption" tone="muted">{option.hint}</Text>
                </View>
              </Pressable>
            );
          })}
          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Price per person (£)"
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
              />
            </View>
            {paymentReq === 'deposit' || paymentReq === 'card_hold' ? (
              <View style={styles.field}>
                <Input
                  label={paymentReq === 'card_hold' ? 'No-show fee per person (£)' : 'Deposit (£)'}
                  helper={paymentReq === 'card_hold' ? '£1 to £150 per person.' : undefined}
                  value={deposit}
                  onChangeText={setDeposit}
                  keyboardType="decimal-pad"
                />
              </View>
            ) : null}
          </View>
          {/* Stripe-not-connected warning when an online payment is required (web parity). */}
          {paymentReq !== 'none' && !stripeConnected ? (
            <Text variant="caption" color={colors.warning}>
              Connect Stripe (Plan &amp; payments) to take online payments — bookings will fall back
              to pay-at-venue until then.
            </Text>
          ) : null}

          {error ? (
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
          <Button
            label="Save"
            style={styles.flex1}
            loading={saving}
            onPress={() => void handleSave()}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bodyWrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  scroll: {
    flex: 1,
  },
  body: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  field: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
  },
  hexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hexPreview: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  columnWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  columnChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  addCalendarWrap: {
    gap: spacing.sm,
  },
  addCalendarActions: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
});
