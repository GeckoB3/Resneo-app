import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { penceToPoundsInput } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  courseStateToPayload,
  creditStateToPayload,
  membershipStateToPayload,
  useCreateCourseProduct,
  useCreateCreditProduct,
  useCreateMembershipProduct,
  useUpdateCourseProduct,
  useUpdateCreditProduct,
  useUpdateMembershipProduct,
} from '@/lib/queries/useClassProducts';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  ClassCourseProduct,
  ClassCreditProduct,
  ClassInstanceOption,
  ClassMembershipProduct,
  ClassTypeOption,
  CourseFormState,
  CreditFormState,
  MembershipFormState,
  MembershipRecurringInterval,
} from '@/types/class-products';

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/** A labelled boolean toggle row (web checkbox parity). */
function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <Text variant="body" style={styles.flex1}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.brand, false: colors.border }}
      />
    </View>
  );
}

/** "Eligible classes" multi-select chip row (empty = all classes). */
function EligibleClassesPicker({
  classTypes,
  value,
  onChange,
}: {
  classTypes: ClassTypeOption[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }
  return (
    <View style={styles.fieldGroup}>
      <Text variant="label" tone="secondary">
        Eligible classes
      </Text>
      {classTypes.length === 0 ? (
        <Text variant="caption" tone="muted">
          No class types yet.
        </Text>
      ) : (
        <View style={styles.chipWrap}>
          {classTypes.map((ct) => (
            <Chip
              key={ct.id}
              label={ct.name}
              selected={value.includes(ct.id)}
              onPress={() => toggle(ct.id)}
            />
          ))}
        </View>
      )}
      <Text variant="caption" tone="muted">
        Leave empty for all classes.
      </Text>
    </View>
  );
}

/** Pinned Save/Cancel action bar reused by every editor sheet. */
function EditorActions({
  saving,
  onCancel,
  onSave,
  saveLabel,
}: {
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <View style={styles.actionsRow}>
      <Button
        label="Cancel"
        variant="secondary"
        style={styles.flex1}
        disabled={saving}
        onPress={onCancel}
      />
      <Button label={saveLabel} style={styles.flex1} loading={saving} onPress={onSave} />
    </View>
  );
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

// ===========================================================================
// Credit pack editor
// ===========================================================================

export type CreditEditorTarget =
  | { mode: 'create' }
  | { mode: 'edit'; product: ClassCreditProduct };

const EMPTY_CREDIT: CreditFormState = {
  name: '',
  description: '',
  credits_count: '10',
  price: '',
  validity_days: '',
  eligible_class_type_ids: [],
  active: true,
};

function creditToState(p: ClassCreditProduct): CreditFormState {
  return {
    name: p.name,
    description: p.description ?? '',
    credits_count: String(p.credits_count),
    price: penceToPoundsInput(p.price_pence),
    validity_days: p.validity_days != null ? String(p.validity_days) : '',
    eligible_class_type_ids: p.eligible_class_type_ids ?? [],
    active: p.active,
  };
}

export function CreditEditorSheet({
  target,
  classTypes,
  onClose,
  onSaved,
}: {
  target: CreditEditorTarget | null;
  classTypes: ClassTypeOption[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const create = useCreateCreditProduct();
  const update = useUpdateCreditProduct();
  const [state, setState] = useState<CreditFormState>(EMPTY_CREDIT);

  useEffect(() => {
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when target changes
    setState(target.mode === 'edit' ? creditToState(target.product) : EMPTY_CREDIT);
  }, [target]);

  const saving = create.isPending || update.isPending;
  const valid = state.name.trim().length > 0 && Number(state.credits_count) > 0;

  function onSave() {
    if (!target || !valid) return;
    const payload = creditStateToPayload(state);
    const onSuccess = () => {
      hapticSuccess();
      toast.success(target.mode === 'edit' ? 'Credit pack saved.' : 'Credit pack created.');
      onSaved?.();
      onClose();
    };
    const onError = (e: unknown) => {
      hapticWarning();
      toast.error(errorMessage(e, 'Could not save the credit pack.'));
    };
    if (target.mode === 'edit') {
      update.mutate({ id: target.product.id, patch: payload }, { onSuccess, onError });
    } else {
      create.mutate(payload, { onSuccess, onError });
    }
  }

  return (
    <Sheet visible={target !== null} onClose={onClose} maxHeight="92%" fill>
      <View style={styles.header}>
        <Text variant="subheading">
          {target?.mode === 'edit' ? 'Edit credit pack' : 'New credit pack'}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Input
          label="Pack name"
          required
          value={state.name}
          onChangeText={(name) => setState((s) => ({ ...s, name }))}
          placeholder="10 Class Pass"
        />
        <Input
          label="Description"
          optional
          value={state.description}
          onChangeText={(description) => setState((s) => ({ ...s, description }))}
          placeholder="Great for regular weekly classes."
          multiline
        />
        <Input
          label="Credits"
          required
          value={state.credits_count}
          onChangeText={(v) => setState((s) => ({ ...s, credits_count: v.replace(/[^0-9]/g, '') }))}
          keyboardType="number-pad"
        />
        <Input
          label="Price (£)"
          required
          value={state.price}
          onChangeText={(price) => setState((s) => ({ ...s, price }))}
          keyboardType="decimal-pad"
          placeholder="90"
        />
        <Input
          label="Valid for days"
          optional
          helper="Leave blank for no expiry."
          value={state.validity_days}
          onChangeText={(v) => setState((s) => ({ ...s, validity_days: v.replace(/[^0-9]/g, '') }))}
          keyboardType="number-pad"
          placeholder="90"
        />
        <EligibleClassesPicker
          classTypes={classTypes}
          value={state.eligible_class_type_ids}
          onChange={(eligible_class_type_ids) =>
            setState((s) => ({ ...s, eligible_class_type_ids }))
          }
        />
        <ToggleRow
          label="Visible and available to buy"
          value={state.active}
          onValueChange={(active) => setState((s) => ({ ...s, active }))}
        />
        <EditorActions
          saving={saving}
          onCancel={onClose}
          onSave={onSave}
          saveLabel={target?.mode === 'edit' ? 'Save changes' : 'Create credit pack'}
        />
        <View style={styles.spacer} />
      </ScrollView>
    </Sheet>
  );
}

// ===========================================================================
// Course editor
// ===========================================================================

export type CourseEditorTarget =
  | { mode: 'create' }
  | { mode: 'edit'; product: ClassCourseProduct };

const EMPTY_COURSE: CourseFormState = {
  name: '',
  description: '',
  price: '',
  max_enrollments: '',
  session_instance_ids: [],
  cancellation_window_days: '',
  active: true,
};

function courseToState(p: ClassCourseProduct): CourseFormState {
  return {
    name: p.name,
    description: p.description ?? '',
    price: penceToPoundsInput(p.price_pence),
    max_enrollments: p.max_enrollments != null ? String(p.max_enrollments) : '',
    session_instance_ids: p.session_instance_ids ?? [],
    cancellation_window_days:
      p.cancellation_window_days != null ? String(p.cancellation_window_days) : '',
    active: p.active,
  };
}

/** "ClassName · YYYY-MM-DD HH:mm" for a session option. */
function sessionLabel(
  inst: ClassInstanceOption,
  classTypeName: string | undefined,
): string {
  const time = String(inst.start_time).slice(0, 5);
  return `${classTypeName ?? 'Class'} · ${inst.instance_date} ${time}`;
}

export function CourseEditorSheet({
  target,
  classTypes,
  instances,
  onClose,
  onSaved,
}: {
  target: CourseEditorTarget | null;
  classTypes: ClassTypeOption[];
  instances: ClassInstanceOption[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const create = useCreateCourseProduct();
  const update = useUpdateCourseProduct();
  const [state, setState] = useState<CourseFormState>(EMPTY_COURSE);

  useEffect(() => {
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when target changes
    setState(target.mode === 'edit' ? courseToState(target.product) : EMPTY_COURSE);
  }, [target]);

  const saving = create.isPending || update.isPending;
  // Active courses must list ≥1 session (server enforces too).
  const valid =
    state.name.trim().length > 0 &&
    (!state.active || state.session_instance_ids.length > 0);

  const classTypeName = useMemo(() => {
    const map = new Map<string, string>();
    for (const ct of classTypes) map.set(ct.id, ct.name);
    return map;
  }, [classTypes]);

  function toggleSession(id: string) {
    setState((s) => ({
      ...s,
      session_instance_ids: s.session_instance_ids.includes(id)
        ? s.session_instance_ids.filter((v) => v !== id)
        : [...s.session_instance_ids, id],
    }));
  }

  function onSave() {
    if (!target || !valid) return;
    const payload = courseStateToPayload(state);
    const onSuccess = () => {
      hapticSuccess();
      toast.success(target.mode === 'edit' ? 'Course saved.' : 'Course created.');
      onSaved?.();
      onClose();
    };
    const onError = (e: unknown) => {
      hapticWarning();
      toast.error(errorMessage(e, 'Could not save the course.'));
    };
    if (target.mode === 'edit') {
      update.mutate({ id: target.product.id, patch: payload }, { onSuccess, onError });
    } else {
      create.mutate(payload, { onSuccess, onError });
    }
  }

  return (
    <Sheet visible={target !== null} onClose={onClose} maxHeight="92%" fill>
      <View style={styles.header}>
        <Text variant="subheading">
          {target?.mode === 'edit' ? 'Edit course' : 'New course'}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Input
          label="Course name"
          required
          value={state.name}
          onChangeText={(name) => setState((s) => ({ ...s, name }))}
          placeholder="6 Week Beginners Pilates"
        />
        <Input
          label="Description"
          optional
          value={state.description}
          onChangeText={(description) => setState((s) => ({ ...s, description }))}
          placeholder="A fixed programme for a cohort of attendees."
          multiline
        />
        <Input
          label="Course price (£)"
          value={state.price}
          onChangeText={(price) => setState((s) => ({ ...s, price }))}
          keyboardType="decimal-pad"
          placeholder="120"
        />
        <Input
          label="Max enrollments"
          optional
          value={state.max_enrollments}
          onChangeText={(v) =>
            setState((s) => ({ ...s, max_enrollments: v.replace(/[^0-9]/g, '') }))
          }
          keyboardType="number-pad"
          placeholder="12"
        />

        <View style={styles.fieldGroup}>
          <Text variant="label" tone="secondary">
            Included sessions
            {state.session_instance_ids.length > 0
              ? ` · ${state.session_instance_ids.length} selected`
              : ''}
          </Text>
          {instances.length === 0 ? (
            <Text variant="caption" tone="muted">
              No upcoming sessions. Add sessions to the timetable first.
            </Text>
          ) : (
            <View style={styles.sessionPickList}>
              {instances.map((inst) => {
                const selected = state.session_instance_ids.includes(inst.id);
                return (
                  <Pressable
                    key={inst.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => toggleSession(inst.id)}
                    style={styles.sessionPickRow}>
                    <Chip label={selected ? '✓' : '+'} selected={selected} onPress={() => toggleSession(inst.id)} />
                    <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.flex1}>
                      {sessionLabel(inst, classTypeName.get(inst.class_type_id))}
                      {inst.booked_spots ? ` · ${inst.booked_spots} booked` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Text variant="caption" tone="muted">
            Pick the sessions that make up this course. Active courses need at least one.
          </Text>
        </View>

        <Input
          label="Cancellation window (days)"
          optional
          helper="Days before the first session a guest can self-cancel for a full refund. Blank = non-refundable."
          value={state.cancellation_window_days}
          onChangeText={(v) =>
            setState((s) => ({ ...s, cancellation_window_days: v.replace(/[^0-9]/g, '') }))
          }
          keyboardType="number-pad"
          placeholder="7"
        />
        <ToggleRow
          label="Open for enrollment"
          value={state.active}
          onValueChange={(active) => setState((s) => ({ ...s, active }))}
        />
        <EditorActions
          saving={saving}
          onCancel={onClose}
          onSave={onSave}
          saveLabel={target?.mode === 'edit' ? 'Save changes' : 'Create course'}
        />
        <View style={styles.spacer} />
      </ScrollView>
    </Sheet>
  );
}

// ===========================================================================
// Membership editor
// ===========================================================================

export type MembershipEditorTarget =
  | { mode: 'create' }
  | { mode: 'edit'; product: ClassMembershipProduct };

const INTERVALS: { value: MembershipRecurringInterval; label: string }[] = [
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

const EMPTY_MEMBERSHIP: MembershipFormState = {
  name: '',
  description: '',
  recurring_price: '',
  recurring_interval: 'month',
  recurring_interval_count: '1',
  stripe_price_id: '',
  allowance_per_period: '',
  rollover_limit: '',
  discount_percent: '',
  booking_window_days: '',
  members_only_priority_hours: '',
  eligible_class_type_ids: [],
  unlimited: false,
  rollover: false,
  allow_recurring: false,
  active: true,
};

function membershipToState(p: ClassMembershipProduct): MembershipFormState {
  const r = p.rules ?? {};
  return {
    name: p.name,
    description: p.description ?? '',
    recurring_price: '',
    recurring_interval: r.recurring_interval ?? 'month',
    recurring_interval_count: r.recurring_interval_count
      ? String(r.recurring_interval_count)
      : '1',
    stripe_price_id: p.stripe_price_id ?? '',
    allowance_per_period: r.allowance_per_period != null ? String(r.allowance_per_period) : '',
    rollover_limit: r.rollover_limit != null ? String(r.rollover_limit) : '',
    discount_percent: r.discount_percent != null ? String(r.discount_percent) : '',
    booking_window_days: r.booking_window_days != null ? String(r.booking_window_days) : '',
    members_only_priority_hours:
      r.members_only_priority_hours != null ? String(r.members_only_priority_hours) : '',
    eligible_class_type_ids: r.eligible_class_type_ids ?? [],
    unlimited: Boolean(r.unlimited),
    rollover: Boolean(r.rollover),
    allow_recurring: Boolean(r.allow_recurring),
    active: p.active,
  };
}

export function MembershipEditorSheet({
  target,
  classTypes,
  onClose,
  onSaved,
}: {
  target: MembershipEditorTarget | null;
  classTypes: ClassTypeOption[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const create = useCreateMembershipProduct();
  const update = useUpdateMembershipProduct();
  const [state, setState] = useState<MembershipFormState>(EMPTY_MEMBERSHIP);

  useEffect(() => {
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when target changes
    setState(target.mode === 'edit' ? membershipToState(target.product) : EMPTY_MEMBERSHIP);
  }, [target]);

  const saving = create.isPending || update.isPending;
  // An active membership needs billing: a recurring price + interval, OR a
  // manual Stripe price id, OR (on edit) an existing connected price.
  const hasRecurring = Number(state.recurring_price.trim().replace('£', '')) > 0;
  const hasManual = state.stripe_price_id.trim().length > 0;
  const hadPrice = target?.mode === 'edit' && Boolean(target.product.stripe_price_id);
  const valid =
    state.name.trim().length > 0 && (!state.active || hasRecurring || hasManual || hadPrice);

  function onSave() {
    if (!target || !valid) return;
    const payload = membershipStateToPayload(state);
    const onSuccess = () => {
      hapticSuccess();
      toast.success(target.mode === 'edit' ? 'Membership saved.' : 'Membership created.');
      onSaved?.();
      onClose();
    };
    const onError = (e: unknown) => {
      hapticWarning();
      toast.error(errorMessage(e, 'Could not save the membership.'));
    };
    if (target.mode === 'edit') {
      update.mutate({ id: target.product.id, patch: payload }, { onSuccess, onError });
    } else {
      create.mutate(payload, { onSuccess, onError });
    }
  }

  return (
    <Sheet visible={target !== null} onClose={onClose} maxHeight="92%" fill>
      <View style={styles.header}>
        <Text variant="subheading">
          {target?.mode === 'edit' ? 'Edit membership' : 'New membership'}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Input
          label="Membership name"
          required
          value={state.name}
          onChangeText={(name) => setState((s) => ({ ...s, name }))}
          placeholder="Unlimited Monthly"
        />
        <Input
          label="Description"
          optional
          value={state.description}
          onChangeText={(description) => setState((s) => ({ ...s, description }))}
          placeholder="Best for guests who attend multiple times per week."
          multiline
        />

        <View style={styles.fieldGroup}>
          <Text variant="overline" tone="muted">
            Recurring billing
          </Text>
          <Text variant="caption" tone="muted">
            Enter a price + interval to auto-create a Stripe Product + Price on your venue account,
            or leave blank and paste a manual Price ID below.
          </Text>
          <Input
            label="Price (£ / period)"
            value={state.recurring_price}
            onChangeText={(recurring_price) => setState((s) => ({ ...s, recurring_price }))}
            keyboardType="decimal-pad"
            placeholder="49.00"
          />
          <Text variant="label" tone="secondary">
            Interval
          </Text>
          <View style={styles.chipWrap}>
            {INTERVALS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={state.recurring_interval === opt.value}
                onPress={() => setState((s) => ({ ...s, recurring_interval: opt.value }))}
              />
            ))}
          </View>
          <Input
            label="Every (intervals)"
            helper="e.g. 1 = each month"
            value={state.recurring_interval_count}
            onChangeText={(v) =>
              setState((s) => ({
                ...s,
                recurring_interval_count: v.replace(/[^0-9]/g, ''),
              }))
            }
            keyboardType="number-pad"
          />
          <Input
            label="Manual Stripe Price ID"
            optional
            helper="Overrides auto-billing. Must exist on your connected Stripe account."
            value={state.stripe_price_id}
            onChangeText={(stripe_price_id) => setState((s) => ({ ...s, stripe_price_id }))}
            placeholder="price_…"
            autoCapitalize="none"
          />
        </View>

        <ToggleRow
          label="Unlimited class access"
          value={state.unlimited}
          onValueChange={(unlimited) => setState((s) => ({ ...s, unlimited }))}
        />
        {!state.unlimited ? (
          <Input
            label="Classes per period"
            optional
            value={state.allowance_per_period}
            onChangeText={(v) =>
              setState((s) => ({ ...s, allowance_per_period: v.replace(/[^0-9]/g, '') }))
            }
            keyboardType="number-pad"
            placeholder="8"
          />
        ) : null}
        <ToggleRow
          label="Unused allowance rolls over"
          value={state.rollover}
          onValueChange={(rollover) => setState((s) => ({ ...s, rollover }))}
        />
        {state.rollover ? (
          <Input
            label="Rollover limit"
            optional
            value={state.rollover_limit}
            onChangeText={(v) =>
              setState((s) => ({ ...s, rollover_limit: v.replace(/[^0-9]/g, '') }))
            }
            keyboardType="number-pad"
            placeholder="4"
          />
        ) : null}
        <Input
          label="Member discount %"
          optional
          value={state.discount_percent}
          onChangeText={(v) =>
            setState((s) => ({ ...s, discount_percent: v.replace(/[^0-9]/g, '') }))
          }
          keyboardType="number-pad"
          placeholder="10"
        />
        <Input
          label="Booking window days"
          optional
          value={state.booking_window_days}
          onChangeText={(v) =>
            setState((s) => ({ ...s, booking_window_days: v.replace(/[^0-9]/g, '') }))
          }
          keyboardType="number-pad"
          placeholder="30"
        />
        <Input
          label="Members-only priority hours"
          optional
          value={state.members_only_priority_hours}
          onChangeText={(v) =>
            setState((s) => ({ ...s, members_only_priority_hours: v.replace(/[^0-9]/g, '') }))
          }
          keyboardType="number-pad"
          placeholder="24"
        />
        <EligibleClassesPicker
          classTypes={classTypes}
          value={state.eligible_class_type_ids}
          onChange={(eligible_class_type_ids) =>
            setState((s) => ({ ...s, eligible_class_type_ids }))
          }
        />
        <ToggleRow
          label="Allow recurring reservations"
          value={state.allow_recurring}
          onValueChange={(allow_recurring) => setState((s) => ({ ...s, allow_recurring }))}
        />
        <ToggleRow
          label="Visible and available to buy"
          value={state.active}
          onValueChange={(active) => setState((s) => ({ ...s, active }))}
        />
        {state.active && !valid ? (
          <Text variant="caption" color={colors.danger}>
            Active memberships need a recurring price + interval or a manual Stripe Price ID.
          </Text>
        ) : null}
        <EditorActions
          saving={saving}
          onCancel={onClose}
          onSave={onSave}
          saveLabel={target?.mode === 'edit' ? 'Save changes' : 'Create membership'}
        />
        <View style={styles.spacer} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
  },
  form: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sessionPickList: {
    gap: spacing.xs,
  },
  sessionPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  spacer: {
    height: spacing.xl,
  },
});
