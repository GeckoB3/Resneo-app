import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ClassRuleSheet, type ClassRuleTarget } from '@/components/classes/ClassRuleSheet';
import { ClassScheduleSheet, type ClassScheduleTarget } from '@/components/classes/ClassScheduleSheet';
import {
  ClassTypeEditorSheet,
  type ClassTypeEditorTarget,
} from '@/components/classes/ClassTypeEditorSheet';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { formatPence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useCancelClassInstance,
  useDeleteClassEntity,
  useGenerateInstances,
  useManagedClasses,
} from '@/lib/queries/useClassesManage';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { minTouchTarget, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  ClassCalendarColumn,
  ManagedClassInstance,
  ManagedClassTimetableEntry,
  ManagedClassType,
} from '@/types/classes-manage';

type ClassTypesManagerSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** Payment summary line, mirroring the web `paymentRuleSummary`. */
function paymentSummary(ct: ManagedClassType): string {
  const req = ct.payment_requirement ?? 'none';
  if (req === 'full_payment') return 'Full payment online';
  if (req === 'deposit') {
    const amount = formatPence(ct.deposit_amount_pence ?? null);
    return amount ? `Deposit ${amount}` : 'Deposit online';
  }
  return 'No online payment';
}

/** "HH:mm" from a stored "HH:mm[:ss]" start time. */
function shortTime(time: string): string {
  return time.slice(0, 5);
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** One-line human summary of a weekly rule, mirroring the web rule list. */
function ruleSummary(rule: ManagedClassTimetableEntry): string {
  const parts = [`${DAY_SHORT[rule.day_of_week] ?? '—'} ${shortTime(rule.start_time)}`];
  const interval = rule.interval_weeks ?? 1;
  if (interval > 1) parts.push(`every ${interval} wks`);
  if (rule.recurrence_end_date) {
    parts.push(`until ${String(rule.recurrence_end_date).slice(0, 10)}`);
  } else if (rule.total_occurrences != null && rule.total_occurrences > 0) {
    parts.push(`max ${rule.total_occurrences}`);
  }
  return parts.join(' · ');
}

/**
 * In-app class-types manager — opened from the header "+" on /classes. Lists
 * each class type with its session defaults, payment rule and calendar column,
 * with Edit, "New class", "Schedule session", "Weekly rule" and Delete, plus the
 * next few upcoming sessions per class (Edit / Cancel / Remove).
 *
 * Permissions mirror the web class timetable: admins manage every class; other
 * staff create/edit/delete and schedule classes only on the calendars assigned
 * to them ({@link staffManagesClassType}), which the API enforces too. Cancel-
 * with-guest-notification and generating sessions from rules stay admin-only.
 */
export function ClassTypesManagerSheet({ visible, onClose }: ClassTypesManagerSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';
  const staffMe = useStaffMe();

  const query = useManagedClasses();
  const deleteEntity = useDeleteClassEntity();
  const cancelInstance = useCancelClassInstance();
  const generate = useGenerateInstances();

  // Web parity: admins manage every class; other staff manage classes only on
  // the calendars assigned to them. `linked_calendar_ids` here is the same set
  // the web dashboard calls `linkedPractitionerIds`, and the API enforces the
  // same scope on every write.
  const linkedCalendarIds = useMemo(
    () => (isAdmin ? [] : staffMe.data?.staff.linked_calendar_ids ?? []),
    [isAdmin, staffMe.data],
  );
  const canManageClasses = isAdmin || linkedCalendarIds.length > 0;
  const staffManagesClassType = useCallback(
    (ct: ManagedClassType): boolean => {
      if (isAdmin) return true;
      const calId = ct.instructor_calendar_id ?? ct.instructor_id ?? null;
      return calId != null && linkedCalendarIds.includes(calId);
    },
    [isAdmin, linkedCalendarIds],
  );

  const [editorTarget, setEditorTarget] = useState<ClassTypeEditorTarget | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<ClassScheduleTarget | null>(null);
  const [ruleTarget, setRuleTarget] = useState<ClassRuleTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedClassType | null>(null);
  const [cancelTarget, setCancelTarget] = useState<
    { classType: ManagedClassType; instance: ManagedClassInstance } | null
  >(null);
  const [cancelReason, setCancelReason] = useState('');
  // Hard-delete confirm targets (distinct from cancel-and-notify / class delete).
  const [removeSessionTarget, setRemoveSessionTarget] = useState<
    { classType: ManagedClassType; instance: ManagedClassInstance } | null
  >(null);
  const [removeRuleTarget, setRemoveRuleTarget] = useState<
    { classType: ManagedClassType; rule: ManagedClassTimetableEntry } | null
  >(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateWeeks, setGenerateWeeks] = useState('8');

  const classTypes = useMemo(
    () => [...(query.data?.class_types ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [query.data?.class_types],
  );

  // Team calendar columns for the picker: unified calendars, else legacy practitioners.
  // Non-admins may only place classes on calendars assigned to them (web parity).
  const calendarColumns = useMemo<ClassCalendarColumn[]>(() => {
    const unified = query.data?.unified_calendars ?? [];
    const cols = unified.length > 0 ? unified : query.data?.practitioners ?? [];
    const scoped = isAdmin ? cols : cols.filter((c) => linkedCalendarIds.includes(c.id));
    return [...scoped].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [query.data?.unified_calendars, query.data?.practitioners, isAdmin, linkedCalendarIds]);

  const calendarNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of calendarColumns) map.set(c.id, c.name);
    return map;
  }, [calendarColumns]);

  // Upcoming, non-cancelled sessions grouped by class type (next few each).
  const upcomingByType = useMemo(() => {
    const map = new Map<string, ManagedClassInstance[]>();
    const sorted = [...(query.data?.instances ?? [])]
      .filter((i) => !i.is_cancelled)
      .sort(
        (a, b) =>
          a.instance_date.localeCompare(b.instance_date) ||
          a.start_time.localeCompare(b.start_time),
      );
    for (const inst of sorted) {
      const list = map.get(inst.class_type_id) ?? [];
      list.push(inst);
      map.set(inst.class_type_id, list);
    }
    return map;
  }, [query.data?.instances]);

  // Active recurring weekly rules grouped by class type.
  const rulesByType = useMemo(() => {
    const map = new Map<string, ManagedClassTimetableEntry[]>();
    for (const rule of query.data?.timetable ?? []) {
      if (rule.is_active === false) continue;
      const list = map.get(rule.class_type_id) ?? [];
      list.push(rule);
      map.set(rule.class_type_id, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
      );
    }
    return map;
  }, [query.data?.timetable]);

  // Whether any active rule exists — gates the "Generate sessions" affordance.
  const hasRules = useMemo(
    () => (query.data?.timetable ?? []).some((r) => r.is_active !== false),
    [query.data?.timetable],
  );

  const onDelete = useCallback(() => {
    const ct = deleteTarget;
    if (!ct) return;
    deleteEntity.mutate(
      { id: ct.id, entity_type: 'class_type' },
      {
        onSuccess: () => {
          hapticSuccess();
          setDeleteTarget(null);
          toast.success(`"${ct.name}" deleted.`);
        },
        onError: (e) => {
          hapticWarning();
          setDeleteTarget(null);
          toast.error(
            e instanceof ApiError ? e.message : 'Could not delete the class. Please try again.',
          );
        },
      },
    );
  }, [deleteTarget, deleteEntity, toast]);

  const onCancelSession = useCallback(() => {
    const t = cancelTarget;
    if (!t) return;
    const reason = cancelReason.trim();
    cancelInstance.mutate(
      { classInstanceId: t.instance.id, cancel_reason: reason || undefined },
      {
        onSuccess: (result) => {
          hapticSuccess();
          setCancelTarget(null);
          setCancelReason('');
          const n = result.bookings_cancelled ?? 0;
          toast.success(
            n > 0
              ? `Session cancelled. ${n} booking${n === 1 ? '' : 's'} refunded and notified.`
              : 'Session cancelled.',
          );
        },
        onError: (e) => {
          hapticWarning();
          // Keep the sheet open so the admin can read the failure and retry.
          toast.error(
            e instanceof ApiError ? e.message : 'Could not cancel the session. Please try again.',
          );
        },
      },
    );
  }, [cancelTarget, cancelReason, cancelInstance, toast]);

  const onRemoveSession = useCallback(() => {
    const t = removeSessionTarget;
    if (!t) return;
    deleteEntity.mutate(
      { id: t.instance.id, entity_type: 'instance' },
      {
        onSuccess: () => {
          hapticSuccess();
          setRemoveSessionTarget(null);
          toast.success('Session removed from the calendar.');
        },
        onError: (e) => {
          hapticWarning();
          // Keep the sheet open so the admin can read the failure and retry.
          // The API returns 409 when the session has active bookings.
          toast.error(
            e instanceof ApiError ? e.message : 'Could not remove the session. Please try again.',
          );
        },
      },
    );
  }, [removeSessionTarget, deleteEntity, toast]);

  const onRemoveRule = useCallback(() => {
    const t = removeRuleTarget;
    if (!t) return;
    deleteEntity.mutate(
      { id: t.rule.id, entity_type: 'timetable' },
      {
        onSuccess: () => {
          hapticSuccess();
          setRemoveRuleTarget(null);
          toast.success('Weekly rule removed.');
        },
        onError: (e) => {
          hapticWarning();
          toast.error(
            e instanceof ApiError ? e.message : 'Could not remove the rule. Please try again.',
          );
        },
      },
    );
  }, [removeRuleTarget, deleteEntity, toast]);

  const onGenerate = useCallback(() => {
    const weeks = Number(generateWeeks);
    const clamped = Number.isInteger(weeks) ? Math.min(26, Math.max(1, weeks)) : 8;
    generate.mutate(
      { weeks: clamped },
      {
        onSuccess: (result) => {
          hapticSuccess();
          setGenerateOpen(false);
          const created = result.created ?? 0;
          toast.success(
            created > 0
              ? `Generated ${created} session${created === 1 ? '' : 's'}.`
              : 'No new sessions to generate.',
          );
        },
        onError: (e) => {
          hapticWarning();
          toast.error(
            e instanceof ApiError ? e.message : 'Could not generate sessions. Please try again.',
          );
        },
      },
    );
  }, [generateWeeks, generate, toast]);

  return (
    <>
      <Sheet visible={visible} onClose={onClose} maxHeight="92%" fill>
        <View style={styles.header}>
          <Text variant="subheading">Classes</Text>
          <IconButton
            icon={{ ios: 'xmark', android: 'close', web: 'close' }}
            accessibilityLabel="Close"
            tint={colors.textSecondary}
            onPress={onClose}
          />
        </View>

        {query.isLoading ? (
          <ListSkeleton />
        ) : query.isError ? (
          <View style={styles.stateWrap}>
            <ErrorState
              message={
                query.error instanceof ApiError ? query.error.message : 'Could not load classes.'
              }
              onRetry={() => void query.refetch()}
            />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
                tintColor={colors.brand}
              />
            }>
            {canManageClasses ? (
              <Button
                label="New class"
                fullWidth
                onPress={() => setEditorTarget({ mode: 'create' })}
              />
            ) : null}

            {!isAdmin ? (
              <Text variant="caption" tone="muted">
                {linkedCalendarIds.length === 0
                  ? "Your account isn't linked to a calendar yet. Ask an admin to assign one before you can manage classes."
                  : 'You can create, edit and schedule classes on the calendars assigned to you. Cancelling a class with guest notifications is admin-only.'}
              </Text>
            ) : null}

            {isAdmin && hasRules ? (
              <Button
                label="Generate sessions"
                variant="secondary"
                fullWidth
                loading={generate.isPending}
                onPress={() => {
                  setGenerateWeeks('8');
                  setGenerateOpen(true);
                }}
              />
            ) : null}

            {classTypes.length === 0 ? (
              <EmptyState
                title="No classes yet"
                message={
                  canManageClasses
                    ? 'Create your first class type, then schedule sessions for it.'
                    : 'No class types have been created yet. A venue admin can add them.'
                }
              />
            ) : (
              classTypes.map((ct) => {
                const upcoming = upcomingByType.get(ct.id) ?? [];
                const calendarName = ct.instructor_id
                  ? calendarNameById.get(ct.instructor_id) ?? ct.instructor_name ?? null
                  : null;
                const price = formatPence(ct.price_pence);
                return (
                  <Card key={ct.id} style={styles.classCard}>
                    <View style={styles.classHeader}>
                      <View style={[styles.dot, { backgroundColor: ct.colour ?? colors.brand }]} />
                      <View style={styles.classText}>
                        <Text variant="bodyMedium" numberOfLines={1}>
                          {ct.name}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {ct.duration_minutes} min · up to {ct.capacity}
                          {price ? ` · ${price}` : ''}
                        </Text>
                      </View>
                      {ct.is_active === false ? <Badge label="Inactive" tone="neutral" /> : null}
                    </View>

                    <View style={styles.metaGrid}>
                      {calendarName ? (
                        <Text variant="caption" tone="secondary">
                          {calendarName}
                        </Text>
                      ) : (
                        <Text variant="caption" tone="danger">
                          No calendar column
                        </Text>
                      )}
                      <Text variant="caption" tone="muted">
                        {paymentSummary(ct)}
                      </Text>
                    </View>

                    {(() => {
                      const rules = rulesByType.get(ct.id) ?? [];
                      if (rules.length === 0) return null;
                      return (
                        <View style={styles.upcomingWrap}>
                          <Text variant="overline" tone="muted">
                            Weekly rules
                          </Text>
                          {rules.map((rule) => (
                            <View key={rule.id} style={styles.sessionRow}>
                              <Text
                                variant="caption"
                                tone="secondary"
                                style={styles.sessionLabel}
                                numberOfLines={1}>
                                {ruleSummary(rule)}
                              </Text>
                              {staffManagesClassType(ct) ? (
                                <View style={styles.sessionActions}>
                                  <Button
                                    label="Edit"
                                    variant="ghost"
                                    size="sm"
                                    onPress={() =>
                                      setRuleTarget({ mode: 'edit', classType: ct, rule })
                                    }
                                  />
                                  <Button
                                    label="Remove"
                                    variant="ghost"
                                    size="sm"
                                    customColors={{ background: 'transparent', text: colors.danger }}
                                    onPress={() => setRemoveRuleTarget({ classType: ct, rule })}
                                  />
                                </View>
                              ) : null}
                            </View>
                          ))}
                        </View>
                      );
                    })()}

                    {upcoming.length > 0 ? (
                      <View style={styles.upcomingWrap}>
                        <Text variant="overline" tone="muted">
                          Next sessions
                        </Text>
                        {upcoming.slice(0, 3).map((inst) => (
                          <View key={inst.id} style={styles.sessionRow}>
                            <Text variant="caption" tone="secondary" style={styles.sessionLabel}>
                              {formatDayHeading(inst.instance_date)} · {shortTime(inst.start_time)}
                              {(inst.booked_spots ?? 0) > 0 ? ` · ${inst.booked_spots} booked` : ''}
                            </Text>
                            <View style={styles.sessionActions}>
                              {staffManagesClassType(ct) ? (
                                <Button
                                  label="Edit"
                                  variant="ghost"
                                  size="sm"
                                  onPress={() =>
                                    setScheduleTarget({ mode: 'edit', classType: ct, instance: inst })
                                  }
                                />
                              ) : null}
                              {isAdmin ? (
                                <Button
                                  label="Cancel"
                                  variant="ghost"
                                  size="sm"
                                  customColors={{ background: 'transparent', text: colors.danger }}
                                  onPress={() => {
                                    setCancelReason('');
                                    setCancelTarget({ classType: ct, instance: inst });
                                  }}
                                />
                              ) : null}
                              {staffManagesClassType(ct) ? (
                                <Button
                                  label="Remove"
                                  variant="ghost"
                                  size="sm"
                                  customColors={{ background: 'transparent', text: colors.danger }}
                                  onPress={() => setRemoveSessionTarget({ classType: ct, instance: inst })}
                                />
                              ) : null}
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {staffManagesClassType(ct) ? (
                      <View style={styles.actionsRow}>
                        <Button
                          label="Schedule session"
                          variant="secondary"
                          size="sm"
                          style={styles.flex1}
                          onPress={() => setScheduleTarget({ mode: 'schedule', classType: ct })}
                        />
                        <Button
                          label="Weekly rule"
                          variant="secondary"
                          size="sm"
                          style={styles.flex1}
                          onPress={() => setRuleTarget({ mode: 'create', classType: ct })}
                        />
                      </View>
                    ) : null}
                    {staffManagesClassType(ct) ? (
                      <View style={styles.actionsRow}>
                        <Button
                          label="Edit"
                          variant="ghost"
                          size="sm"
                          style={styles.flex1}
                          onPress={() => setEditorTarget({ mode: 'edit', classType: ct })}
                        />
                        <Button
                          label="Delete class"
                          variant="ghost"
                          size="sm"
                          style={styles.flex1}
                          customColors={{ background: 'transparent', text: colors.danger }}
                          onPress={() => setDeleteTarget(ct)}
                        />
                      </View>
                    ) : null}
                  </Card>
                );
              })
            )}
            <View style={styles.spacer} />
          </ScrollView>
        )}
      </Sheet>

      {/* Create / edit a class type */}
      <ClassTypeEditorSheet
        target={editorTarget}
        calendarColumns={calendarColumns}
        onClose={() => setEditorTarget(null)}
      />

      {/* Schedule single / weekly-repeat / every-N-days, or edit an instance */}
      <ClassScheduleSheet target={scheduleTarget} onClose={() => setScheduleTarget(null)} />

      {/* Create / edit a recurring weekly rule (admin) */}
      <ClassRuleSheet target={ruleTarget} onClose={() => setRuleTarget(null)} />

      {/* Admin cancel-and-notify for a single upcoming session (distinct from delete) */}
      <Sheet
        visible={cancelTarget !== null}
        onClose={() => {
          if (!cancelInstance.isPending) setCancelTarget(null);
        }}>
        <View style={styles.deleteSheet}>
          <Text variant="subheading">Cancel session</Text>
          {cancelTarget ? (
            <Text variant="bodySmall" tone="secondary">
              Cancel &quot;{cancelTarget.classType.name}&quot; on{' '}
              {formatDayHeading(cancelTarget.instance.instance_date)} at{' '}
              {shortTime(cancelTarget.instance.start_time)}?
              {(cancelTarget.instance.booked_spots ?? 0) > 0
                ? ` ${cancelTarget.instance.booked_spots} booking(s) will be cancelled, refunded per your policy, and the guests notified.`
                : ' This frees the calendar slot and notifies any booked guests.'}
            </Text>
          ) : null}
          <Input
            label="Reason for guests (optional)"
            optional
            value={cancelReason}
            onChangeText={setCancelReason}
            maxLength={500}
            placeholder="e.g. Instructor unavailable"
          />
          <View style={styles.actionsRow}>
            <Button
              label="Keep session"
              variant="secondary"
              style={styles.flex1}
              disabled={cancelInstance.isPending}
              onPress={() => setCancelTarget(null)}
            />
            <Button
              label="Cancel session"
              variant="danger"
              style={styles.flex1}
              loading={cancelInstance.isPending}
              onPress={onCancelSession}
            />
          </View>
        </View>
      </Sheet>

      {/* Admin hard-delete of a single session ("Remove from calendar") — distinct
          from cancel-and-notify. The API 409s when the session has active bookings. */}
      <Sheet
        visible={removeSessionTarget !== null}
        onClose={() => {
          if (!deleteEntity.isPending) setRemoveSessionTarget(null);
        }}>
        <View style={styles.deleteSheet}>
          <Text variant="subheading">Remove session</Text>
          {removeSessionTarget ? (
            <Text variant="bodySmall" tone="secondary">
              Remove &quot;{removeSessionTarget.classType.name}&quot; on{' '}
              {formatDayHeading(removeSessionTarget.instance.instance_date)} at{' '}
              {shortTime(removeSessionTarget.instance.start_time)} from the calendar? This deletes the
              session without notifying guests, and is blocked if it has active bookings — cancel the
              session instead to refund and notify them.
            </Text>
          ) : null}
          <View style={styles.actionsRow}>
            <Button
              label="Keep session"
              variant="secondary"
              style={styles.flex1}
              disabled={deleteEntity.isPending}
              onPress={() => setRemoveSessionTarget(null)}
            />
            <Button
              label="Remove"
              variant="danger"
              style={styles.flex1}
              loading={deleteEntity.isPending}
              onPress={onRemoveSession}
            />
          </View>
        </View>
      </Sheet>

      {/* Admin remove of a weekly rule (timetable entry). 409s if it blocks. */}
      <Sheet
        visible={removeRuleTarget !== null}
        onClose={() => {
          if (!deleteEntity.isPending) setRemoveRuleTarget(null);
        }}>
        <View style={styles.deleteSheet}>
          <Text variant="subheading">Remove weekly rule</Text>
          {removeRuleTarget ? (
            <Text variant="bodySmall" tone="secondary">
              Remove the {ruleSummary(removeRuleTarget.rule)} rule for &quot;
              {removeRuleTarget.classType.name}&quot;? Sessions already on the calendar stay; this
              only stops future generation from this rule.
            </Text>
          ) : null}
          <View style={styles.actionsRow}>
            <Button
              label="Keep rule"
              variant="secondary"
              style={styles.flex1}
              disabled={deleteEntity.isPending}
              onPress={() => setRemoveRuleTarget(null)}
            />
            <Button
              label="Remove"
              variant="danger"
              style={styles.flex1}
              loading={deleteEntity.isPending}
              onPress={onRemoveRule}
            />
          </View>
        </View>
      </Sheet>

      {/* Generate sessions from active weekly rules (admin) */}
      <Sheet
        visible={generateOpen}
        onClose={() => {
          if (!generate.isPending) setGenerateOpen(false);
        }}>
        <View style={styles.deleteSheet}>
          <Text variant="subheading">Generate sessions</Text>
          <Text variant="bodySmall" tone="secondary">
            Create bookable sessions from your active weekly rules for the weeks ahead. Existing
            sessions are skipped, and each rule&apos;s end date or session cap is respected.
          </Text>
          <Input
            label="Weeks ahead"
            helper="How far to generate (1–26)."
            value={generateWeeks}
            onChangeText={(v) => setGenerateWeeks(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
          />
          <View style={styles.actionsRow}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              disabled={generate.isPending}
              onPress={() => setGenerateOpen(false)}
            />
            <Button
              label="Generate"
              style={styles.flex1}
              loading={generate.isPending}
              onPress={onGenerate}
            />
          </View>
        </View>
      </Sheet>

      {/* Delete confirm — a Sheet, since Alert.alert's confirm is a no-op on web. */}
      <Sheet visible={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <View style={styles.deleteSheet}>
          <Text variant="subheading">Delete class</Text>
          <Text variant="bodySmall" tone="secondary">
            Delete &quot;{deleteTarget?.name}&quot;? This cannot be undone, and will be blocked if
            upcoming bookings or scheduled sessions exist.
          </Text>
          <View style={styles.actionsRow}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              onPress={() => setDeleteTarget(null)}
            />
            <Button
              label="Delete"
              variant="danger"
              style={styles.flex1}
              loading={deleteEntity.isPending}
              onPress={onDelete}
            />
          </View>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  classCard: {
    gap: spacing.sm,
  },
  classHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  classText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  upcomingWrap: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: minTouchTarget,
  },
  sessionLabel: {
    flex: 1,
    minWidth: 0,
  },
  sessionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  spacer: {
    height: spacing.xl,
  },
  deleteSheet: {
    gap: spacing.md,
  },
});
