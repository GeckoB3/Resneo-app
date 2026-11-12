import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { FollowOnOrderList, FollowOnServicePicker } from '@/components/manage/FollowOnServicePicker';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  DEFAULT_FOLLOW_ON_QUESTION,
  FOLLOW_ON_NAME_MAX,
  FOLLOW_ON_QUESTION_MAX,
  followOnGroupInputProblem,
  followOnQuestion,
} from '@/lib/follow-ons/group-input';
import type { FollowOnServiceOption } from '@/lib/follow-ons/service-options';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useCreateFollowOnGroup,
  useDeleteFollowOnGroup,
  useUpdateFollowOnGroup,
} from '@/lib/queries/useFollowOnGroups';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { FollowOnGroup, FollowOnGroupInput } from '@/types/follow-on-groups';

/** What the follow-on group sheet edits (web `FollowOnGroupEditorValue`). */
export interface FollowOnGroupEditorValue {
  name: string;
  prompt_to_client: string;
  selection_type: 'single' | 'multi';
  required: boolean;
  is_active: boolean;
  offered_service_ids: string[];
  trigger_service_ids: string[];
}

export type FollowOnGroupEditorTarget =
  /** `triggerServiceIds`: a new group started from a service's form asks after that service. */
  | { mode: 'create'; triggerServiceIds?: string[] }
  | { mode: 'edit'; group: FollowOnGroup };

export function emptyFollowOnGroupValue(triggerServiceIds: string[] = []): FollowOnGroupEditorValue {
  return {
    name: '',
    prompt_to_client: '',
    selection_type: 'single',
    required: false,
    is_active: true,
    offered_service_ids: [],
    trigger_service_ids: [...triggerServiceIds],
  };
}

export function followOnGroupEditorValue(group: FollowOnGroup): FollowOnGroupEditorValue {
  return {
    name: group.name,
    prompt_to_client: group.prompt_to_client ?? '',
    selection_type: group.selection_type,
    required: group.required,
    is_active: group.is_active,
    offered_service_ids: [...group.offered_service_ids],
    trigger_service_ids: [...group.trigger_service_ids],
  };
}

/** The `group` POST and PATCH /api/venue/follow-on-groups take (web `followOnGroupRequestBody`). */
export function followOnGroupInput(value: FollowOnGroupEditorValue): FollowOnGroupInput {
  return {
    name: value.name.trim(),
    prompt_to_client: value.prompt_to_client.trim() || null,
    selection_type: value.selection_type,
    required: value.required,
    is_active: value.is_active,
    offered_service_ids: value.offered_service_ids,
    trigger_service_ids: value.trigger_service_ids,
  };
}

const HOW_MANY = [
  { value: 'single' as const, label: 'One' },
  { value: 'multi' as const, label: 'Any number' },
];

/**
 * The New / Edit follow-on group sheet (web `FollowOnGroupEditor`, follow-on plan 6.2): name,
 * question, services to offer in the order clients see them, services to ask after, how many, and
 * "Clients must choose one". The same sheet opens from the Follow-ons tab and from a service's
 * Follow-on services card. Admin only; the parent never opens it on a group the host sets.
 */
export function FollowOnGroupEditorSheet({
  target,
  services,
  onClose,
  onSaved,
}: {
  target: FollowOnGroupEditorTarget | null;
  services: readonly FollowOnServiceOption[];
  onClose: () => void;
  /** The saved group, so the service form can keep its own list in step. */
  onSaved?: (group: FollowOnGroup, mode: 'create' | 'edit') => void;
}) {
  const { colors } = useTheme();
  const createMutation = useCreateFollowOnGroup();
  const updateMutation = useUpdateFollowOnGroup();
  const deleteMutation = useDeleteFollowOnGroup();
  const [value, setValue] = useState<FollowOnGroupEditorValue>(() => emptyFollowOnGroupValue());
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [seededKey, setSeededKey] = useState<string | null>(null);

  const targetKey = target ? (target.mode === 'create' ? '__create__' : target.group.id) : null;
  // Seed on each open, never on a parent re-render, so an edit in progress is not wiped.
  useEffect(() => {
    if (!target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeededKey(null);
      return;
    }
    if (targetKey === seededKey) return;
    setValue(
      target.mode === 'create'
        ? emptyFollowOnGroupValue(target.triggerServiceIds ?? [])
        : followOnGroupEditorValue(target.group),
    );
    setError(null);
    setConfirmingDelete(false);
    setSeededKey(targetKey);
    // seededKey left out on purpose: it is what this effect sets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, targetKey]);

  const byId = useMemo(() => new Map(services.map((s) => [s.id, s] as const)), [services]);
  const offered = value.offered_service_ids
    .map((id) => byId.get(id))
    .filter((s): s is FollowOnServiceOption => Boolean(s));
  const offeredSet = useMemo(() => new Set(value.offered_service_ids), [value.offered_service_ids]);
  const triggerSet = useMemo(() => new Set(value.trigger_service_ids), [value.trigger_service_ids]);
  /** A member's services on its collective page ask the host's questions only (RN008). */
  const pageSet = useMemo(() => new Set(services.filter((s) => s.on_collective_page).map((s) => s.id)), [services]);
  const triggerBlocked = useMemo(() => new Set([...offeredSet, ...pageSet]), [offeredSet, pageSet]);
  const hiddenOnline = offered.filter((s) => !s.is_bookable_online || !s.is_active);
  const nothingOnline = value.required && offered.length > 0 && hiddenOnline.length === offered.length;

  const update = <K extends keyof FollowOnGroupEditorValue>(key: K, next: FollowOnGroupEditorValue[K]) =>
    setValue((v) => ({ ...v, [key]: next }));

  async function handleSave() {
    setError(null);
    const problem = followOnGroupInputProblem(value);
    if (problem) {
      hapticWarning();
      setError(problem);
      return;
    }
    const group = followOnGroupInput(value);
    try {
      const result =
        target?.mode === 'edit'
          ? await updateMutation.mutateAsync({ id: target.group.id, group })
          : await createMutation.mutateAsync(group);
      hapticSuccess();
      onSaved?.(result.group, target?.mode === 'edit' ? 'edit' : 'create');
      onClose();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Failed to save the follow-on group');
    }
  }

  async function runDelete() {
    if (target?.mode !== 'edit') return;
    try {
      await deleteMutation.mutateAsync(target.group.id);
      hapticSuccess();
      setConfirmingDelete(false);
      onClose();
    } catch (e) {
      hapticWarning();
      setConfirmingDelete(false);
      setError(e instanceof ApiError ? e.message : 'Failed to delete the follow-on group');
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;
  const seeded = target && seededKey === targetKey;

  return (
    <Sheet visible={!!target} onClose={onClose} maxHeight="92%" fill>
      {seeded ? (
        <View style={styles.body}>
          <View style={styles.header}>
            <Text variant="overline" tone="muted">
              {target.mode === 'create' ? 'New follow-on group' : 'Edit follow-on group'}
            </Text>
            {target.mode === 'edit' && !confirmingDelete ? (
              <Button label="Delete" variant="ghost" size="sm" onPress={() => setConfirmingDelete(true)} />
            ) : null}
          </View>

          {/* Inline confirm: a sheet over a sheet is unreliable on iOS. */}
          {target.mode === 'edit' && confirmingDelete ? (
            <View style={styles.deleteConfirm}>
              <Text variant="bodySmall" tone="secondary">
                {`Delete "${target.group.name}"? Clients will no longer be asked "${followOnQuestion(
                  target.group.prompt_to_client,
                )}". Bookings already made are not changed.`}
              </Text>
              <View style={styles.actions}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  size="sm"
                  style={styles.flex1}
                  onPress={() => setConfirmingDelete(false)}
                />
                <Button
                  label="Delete group"
                  variant="danger"
                  size="sm"
                  style={styles.flex1}
                  loading={deleteMutation.isPending}
                  onPress={() => void runDelete()}
                />
              </View>
            </View>
          ) : null}

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
            <Input
              label="Name, for you only"
              placeholder="Cut after colour"
              value={value.name}
              onChangeText={(v) => update('name', v)}
              maxLength={FOLLOW_ON_NAME_MAX}
            />
            <Input
              label="Question for clients"
              optional
              placeholder={DEFAULT_FOLLOW_ON_QUESTION}
              helper={`Shown as the heading of this step. If you leave it empty, clients see "${DEFAULT_FOLLOW_ON_QUESTION}"`}
              value={value.prompt_to_client}
              onChangeText={(v) => update('prompt_to_client', v)}
              maxLength={FOLLOW_ON_QUESTION_MAX}
            />

            <FollowOnServicePicker
              testID="follow-on-offered"
              label="Services to offer"
              help="Each one is booked as its own appointment, possibly with someone else. Use the arrows to change the order clients see."
              services={services}
              selectedIds={value.offered_service_ids}
              blockedIds={triggerSet}
              blockedNote="Services ticked under “Ask after these services” cannot be offered here."
              onChange={(next) => update('offered_service_ids', next)}
            />
            <FollowOnOrderList
              services={services}
              orderedIds={value.offered_service_ids}
              onChange={(next) => update('offered_service_ids', next)}
            />

            <FollowOnServicePicker
              testID="follow-on-triggers"
              label="Ask after these services"
              help="When a client picks one of these, they are asked the question."
              foot={
                pageSet.size > 0
                  ? "Services offered above cannot be picked here. Nor can services on your collective page: they ask the host's questions only."
                  : 'Services offered above cannot be picked here.'
              }
              services={services}
              selectedIds={value.trigger_service_ids}
              blockedIds={triggerBlocked}
              onChange={(next) => update('trigger_service_ids', next)}
            />

            <Text variant="bodyMedium">How many can clients choose?</Text>
            <View style={styles.howMany}>
              {HOW_MANY.map((opt) => {
                const selected = value.selection_type === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={opt.label}
                    onPress={() => update('selection_type', opt.value)}
                    style={({ pressed }) => [
                      styles.radioRow,
                      {
                        borderColor: selected ? colors.brand : colors.border,
                        backgroundColor: selected ? colors.brandSubtle : colors.surface,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}>
                    <View style={[styles.radioDot, { borderColor: selected ? colors.brand : colors.borderStrong }]}>
                      {selected ? <View style={[styles.radioDotInner, { backgroundColor: colors.brand }]} /> : null}
                    </View>
                    <Text variant="bodyMedium">{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.switchCard}>
              <View style={styles.switchLabel}>
                <Text variant="bodyMedium">Clients must choose one</Text>
                <Text variant="caption" tone="muted">
                  Clients booking online cannot continue without choosing, so they cannot book the first service on its own. Staff can always skip.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Clients must choose one"
                value={value.required}
                onValueChange={(v) => update('required', v)}
              />
            </View>

            {target.mode === 'edit' ? (
              <View style={styles.switchCard}>
                <Text variant="bodyMedium" style={styles.switchLabel}>
                  Switched on (clients are asked this question)
                </Text>
                <Switch
                  accessibilityLabel="Switched on (clients are asked this question)"
                  value={value.is_active}
                  onValueChange={(v) => update('is_active', v)}
                />
              </View>
            ) : null}

            {hiddenOnline.map((s) => (
              <Text key={s.id} variant="caption" color={colors.warning}>
                Clients will not see {s.name} online.
              </Text>
            ))}
            {nothingOnline ? (
              <Text variant="caption" color={colors.warning}>
                Clients will not be asked, because none of these services can be booked online.
              </Text>
            ) : null}

          </ScrollView>

          {/* Above the buttons, not at the end of the form: the service lists make it long, and an
              error drawn below them was out of sight when Create group did nothing (device run). */}
          {error ? (
            <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} disabled={saving} />
            <Button
              label={target.mode === 'create' ? 'Create group' : 'Save changes'}
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
  body: { flex: 1, gap: spacing.md, paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deleteConfirm: { gap: spacing.sm },
  scroll: { flex: 1 },
  scrollBody: { gap: spacing.md, paddingBottom: spacing.sm },
  howMany: { flexDirection: 'row', gap: spacing.md },
  radioRow: {
    flex: 1,
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
  radioDotInner: { width: 10, height: 10, borderRadius: radius.full },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  switchLabel: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex1: { flex: 1 },
});
