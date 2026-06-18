/**
 * BookableCalendarsManager — in-app "Calendars" admin surface (web parity with
 * `_reference/Resneo/src/app/dashboard/availability/BookableCalendarsPanel.tsx`).
 *
 * Admins can:
 *  - see every bookable calendar column (from `usePractitioners`), in display order
 *  - create a new column (`useCreateHostCalendar`) — plan calendar-limit 403
 *    (`upgrade_required`) surfaces as an inline upgrade notice, not a raw toast
 *  - rename + activate/deactivate (`usePatchPractitioner` name / is_active)
 *  - reorder with up/down buttons (PATCH `sort_order` per column — the web uses
 *    drag, but @dnd-kit is web-only; up/down matches the panel's mobile fallback)
 *  - edit a per-calendar booking-link slug + copy the public URL
 *  - delete a column (`useDeletePractitioner`)
 *  - see which services / classes / resources / events are assigned to each column
 *
 * Reachable from a header action on `app/(app)/availability.tsx` (opens this in a
 * fill Sheet) and as the dedicated `availability/calendars` Stack route.
 */
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { getWebUrl } from '@/lib/env';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useDeletePractitioner,
  usePatchPractitioner,
} from '@/lib/queries/useAvailabilityManage';
import { useManagedClasses } from '@/lib/queries/useClassesManage';
import { useManagedEvents } from '@/lib/queries/useEventsManage';
import { useCreateHostCalendar, usePractitioners } from '@/lib/queries/usePractitioners';
import { useResourcesManageList } from '@/lib/queries/useResourcesManage';
import { useManagedServices } from '@/lib/queries/useServicesManage';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { Practitioner } from '@/types/practitioner';

// --- Slug validation (mirrors web `bookingSlugDraftError`) -------------------
export function bookingSlugDraftError(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (t === '') return null;
  if (t.length > 64) return 'Booking link must be 64 characters or fewer.';
  if (!/^[a-z0-9-]+$/.test(t)) {
    return 'Use lowercase letters, numbers, and hyphens only.';
  }
  return null;
}

/** Stable display order (lower sort_order first), matching the web panel + staff calendar columns. */
function sortByOrder(rows: Practitioner[]): Practitioner[] {
  return [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/** Is the create 403 a plan calendar-limit (so we show an upgrade nudge, not a generic error)? */
function isCalendarLimitError(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  if (e.status !== 403) return false;
  const body = e.body as { code?: string; error?: string } | undefined;
  const code = body?.code?.toLowerCase() ?? '';
  const msg = (body?.error ?? e.message ?? '').toLowerCase();
  return code.includes('upgrade') || code.includes('limit') || msg.includes('plan') || msg.includes('upgrade') || msg.includes('limit');
}

type AssignmentMaps = {
  services: Map<string, string[]>;
  classes: Map<string, string[]>;
  resources: Map<string, string[]>;
  events: Map<string, string[]>;
};

// ---------------------------------------------------------------------------
// One calendar card
// ---------------------------------------------------------------------------

function CalendarCard({
  calendar,
  index,
  total,
  venueSlug,
  assignments,
  busy,
  onMove,
  onRename,
  onToggleActive,
  onSaveSlug,
  onDelete,
}: {
  calendar: Practitioner;
  index: number;
  total: number;
  venueSlug: string | null;
  assignments: AssignmentMaps;
  busy: boolean;
  onMove: (offset: -1 | 1) => void;
  onRename: (name: string) => Promise<void>;
  onToggleActive: (active: boolean) => void;
  onSaveSlug: (slug: string | null) => Promise<void>;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();

  const savedName = calendar.name;
  const savedSlug = (calendar.slug ?? '').trim().toLowerCase();

  const [nameDraft, setNameDraft] = useState(savedName);
  const [slugDraft, setSlugDraft] = useState(calendar.slug ?? '');
  const [savingName, setSavingName] = useState(false);
  const [savingSlug, setSavingSlug] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-seed editable fields when the underlying record changes (e.g. refetch).
  useEffect(() => {
    setNameDraft(savedName);
  }, [savedName]);
  useEffect(() => {
    setSlugDraft(calendar.slug ?? '');
  }, [calendar.slug]);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const slugLiveErr = bookingSlugDraftError(slugDraft);
  const draftNorm = slugDraft.trim().toLowerCase();
  const slugDirty = draftNorm !== savedSlug;
  const nameDirty = nameDraft.trim() !== savedName && nameDraft.trim().length > 0;
  const canCopy = Boolean(venueSlug && savedSlug && draftNorm === savedSlug && !slugLiveErr);

  const svc = assignments.services.get(calendar.id) ?? [];
  const cls = assignments.classes.get(calendar.id) ?? [];
  const res = assignments.resources.get(calendar.id) ?? [];
  const evt = assignments.events.get(calendar.id) ?? [];

  async function handleSaveName() {
    if (!nameDirty || savingName) return;
    setSavingName(true);
    try {
      await onRename(nameDraft.trim());
    } finally {
      setSavingName(false);
    }
  }

  async function handleSaveSlug() {
    if (!slugDirty || slugLiveErr || savingSlug) return;
    setSavingSlug(true);
    try {
      await onSaveSlug(draftNorm === '' ? null : draftNorm);
    } finally {
      setSavingSlug(false);
    }
  }

  async function handleCopy() {
    if (!canCopy || !venueSlug) return;
    const url = `${getWebUrl() || 'https://app.resneo.com'}/book/${encodeURIComponent(venueSlug)}/${encodeURIComponent(savedSlug)}`;
    try {
      await Clipboard.setStringAsync(url);
      hapticSuccess();
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  }

  return (
    <Card>
      {/* Header row: name + active badge + reorder/delete actions */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <View style={styles.titleRow}>
            <Text variant="bodyMedium" numberOfLines={1} style={styles.flexShrink}>
              {savedName}
            </Text>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: calendar.is_active ? colors.successSurface : colors.surface,
                  borderColor: calendar.is_active ? colors.success : colors.border,
                },
              ]}>
              <Text variant="overline" color={calendar.is_active ? colors.success : colors.textMuted}>
                {calendar.is_active ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.headerActions}>
          {total > 1 ? (
            <>
              <IconButton
                icon={{ ios: 'chevron.up', android: 'keyboard_arrow_up', web: 'keyboard_arrow_up' }}
                accessibilityLabel={`Move ${savedName} up`}
                variant="bordered"
                disabled={index === 0 || busy}
                onPress={() => onMove(-1)}
              />
              <IconButton
                icon={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }}
                accessibilityLabel={`Move ${savedName} down`}
                variant="bordered"
                disabled={index === total - 1 || busy}
                onPress={() => onMove(1)}
              />
              <IconButton
                icon={{ ios: 'trash', android: 'delete', web: 'delete' }}
                accessibilityLabel={`Delete ${savedName}`}
                variant="bordered"
                tint={colors.danger}
                disabled={busy}
                onPress={onDelete}
              />
            </>
          ) : null}
        </View>
      </View>

      {/* Active toggle */}
      <View style={styles.switchRow}>
        <Text variant="bodySmall" tone="secondary">
          Bookable (Active)
        </Text>
        <Switch
          value={calendar.is_active}
          onValueChange={onToggleActive}
          disabled={busy}
          trackColor={{ true: colors.brand, false: colors.border }}
          thumbColor={colors.surfaceRaised}
        />
      </View>

      {/* Rename */}
      <Input
        label="Name"
        value={nameDraft}
        onChangeText={setNameDraft}
        maxLength={200}
        autoCapitalize="words"
      />
      {nameDirty ? (
        <Button
          label="Save name"
          variant="secondary"
          size="sm"
          loading={savingName}
          onPress={() => void handleSaveName()}
        />
      ) : null}

      {/* Booking link slug */}
      <View style={styles.slugBlock}>
        <Text variant="overline" tone="muted">
          Booking link
        </Text>
        {venueSlug ? (
          <>
            <Text variant="caption" tone="muted">
              {`${(getWebUrl() || 'app.resneo.com').replace(/^https?:\/\//, '')}/book/${venueSlug}/`}
            </Text>
            <Input
              label="URL segment (optional)"
              helper="e.g. staff name — gives this calendar a direct booking URL."
              value={slugDraft}
              onChangeText={setSlugDraft}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={64}
              placeholder="segment"
              error={slugLiveErr ?? undefined}
            />
            <View style={styles.slugActions}>
              <Button
                label="Save link"
                variant="secondary"
                size="sm"
                style={styles.flex1}
                disabled={!slugDirty || Boolean(slugLiveErr)}
                loading={savingSlug}
                onPress={() => void handleSaveSlug()}
              />
              <Button
                label={copied ? 'Copied' : 'Copy URL'}
                variant="ghost"
                size="sm"
                style={styles.flex1}
                disabled={!canCopy}
                onPress={() => void handleCopy()}
              />
            </View>
          </>
        ) : (
          <Text variant="caption" tone="muted">
            Set your venue booking slug under Settings → Booking page first to enable per-calendar
            links.
          </Text>
        )}
      </View>

      {/* Assignments — read-only summary (assignment editing lives in each editor) */}
      <View style={styles.assignBlock}>
        <AssignmentLine label="Services" names={svc} />
        <AssignmentLine label="Classes" names={cls} />
        <AssignmentLine label="Resources" names={res} />
        <AssignmentLine label="Events" names={evt} />
      </View>
    </Card>
  );
}

function AssignmentLine({ label, names }: { label: string; names: string[] }) {
  return (
    <View style={styles.assignLine}>
      <Text variant="caption" tone="muted" style={styles.assignLabel}>
        {label}
      </Text>
      <Text variant="caption" tone="secondary" style={styles.flex1} numberOfLines={2}>
        {names.length > 0 ? names.join(', ') : '—'}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Manager (the whole panel)
// ---------------------------------------------------------------------------

export function BookableCalendarsManager() {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';
  const venueSlug = venue?.slug ?? null;

  const practitionersQuery = usePractitioners();
  const servicesQuery = useManagedServices();
  const classesQuery = useManagedClasses();
  const resourcesQuery = useResourcesManageList();
  const eventsQuery = useManagedEvents();

  const patch = usePatchPractitioner();
  const create = useCreateHostCalendar();
  const remove = useDeletePractitioner();

  const calendars = useMemo(
    () => sortByOrder(practitionersQuery.data?.practitioners ?? []),
    [practitionersQuery.data?.practitioners],
  );

  // Build calendar-id → assigned-name[] maps for each offering type.
  const assignments = useMemo<AssignmentMaps>(() => {
    const services = new Map<string, string[]>();
    const classes = new Map<string, string[]>();
    const resources = new Map<string, string[]>();
    const events = new Map<string, string[]>();

    const push = (map: Map<string, string[]>, key: string | null | undefined, name: string) => {
      if (!key) return;
      const list = map.get(key) ?? [];
      list.push(name);
      map.set(key, list);
    };

    const svcById = new Map(
      (servicesQuery.data?.services ?? []).map((s) => [s.id, s.name] as const),
    );
    for (const link of servicesQuery.data?.practitioner_services ?? []) {
      const name = svcById.get(link.service_id);
      if (name) push(services, link.practitioner_id, name);
    }
    for (const ct of classesQuery.data?.class_types ?? []) {
      push(classes, ct.instructor_calendar_id ?? ct.instructor_id, ct.name);
    }
    for (const r of resourcesQuery.data ?? []) {
      push(resources, r.display_on_calendar_id, r.name);
    }
    for (const e of eventsQuery.data ?? []) {
      push(events, e.calendar_id, e.name);
    }
    return { services, classes, resources, events };
  }, [
    servicesQuery.data,
    classesQuery.data?.class_types,
    resourcesQuery.data,
    eventsQuery.data,
  ]);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Practitioner | null>(null);

  // Track which calendar has an in-flight mutation (so we can disable its row).
  const [busyId, setBusyId] = useState<string | null>(null);

  const moveCalendar = useCallback(
    async (calendarId: string, offset: -1 | 1) => {
      const ordered = sortByOrder(practitionersQuery.data?.practitioners ?? []);
      const oldIndex = ordered.findIndex((c) => c.id === calendarId);
      const newIndex = oldIndex + offset;
      if (oldIndex < 0 || newIndex < 0 || newIndex >= ordered.length) return;
      const reordered = [...ordered];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved!);
      setBusyId(calendarId);
      try {
        // Persist every column's new index so sort_order stays a dense 0..n-1.
        await Promise.all(
          reordered.map((c, idx) =>
            c.sort_order === idx ? null : patch.mutateAsync({ id: c.id, sort_order: idx }),
          ),
        );
        hapticSuccess();
      } catch (e) {
        hapticWarning();
        toast.error(e instanceof ApiError ? e.message : 'Could not save column order.');
        void practitionersQuery.refetch();
      } finally {
        setBusyId(null);
      }
    },
    [patch, practitionersQuery, toast],
  );

  const renameCalendar = useCallback(
    async (id: string, name: string) => {
      setBusyId(id);
      try {
        await patch.mutateAsync({ id, name });
        hapticSuccess();
        toast.success('Calendar renamed.');
      } catch (e) {
        hapticWarning();
        toast.error(e instanceof ApiError ? e.message : 'Could not rename calendar.');
        throw e;
      } finally {
        setBusyId(null);
      }
    },
    [patch, toast],
  );

  const toggleActive = useCallback(
    async (id: string, active: boolean) => {
      setBusyId(id);
      try {
        await patch.mutateAsync({ id, is_active: active });
        hapticSuccess();
      } catch (e) {
        hapticWarning();
        toast.error(e instanceof ApiError ? e.message : 'Could not update calendar.');
      } finally {
        setBusyId(null);
      }
    },
    [patch, toast],
  );

  const saveSlug = useCallback(
    async (id: string, slug: string | null) => {
      setBusyId(id);
      try {
        await patch.mutateAsync({ id, slug });
        hapticSuccess();
        toast.success('Booking link saved.');
      } catch (e) {
        hapticWarning();
        toast.error(e instanceof ApiError ? e.message : 'Could not save booking link.');
        throw e;
      } finally {
        setBusyId(null);
      }
    },
    [patch, toast],
  );

  async function handleCreate() {
    const trimmed = newName.trim();
    setCreateError(null);
    if (!trimmed) {
      setCreateError('Enter a name for the calendar.');
      return;
    }
    try {
      await create.mutateAsync({ name: trimmed });
      hapticSuccess();
      toast.success('Calendar added.');
      setShowCreate(false);
      setNewName('');
      setLimitReached(false);
    } catch (e) {
      hapticWarning();
      if (isCalendarLimitError(e)) {
        // Plan calendar-limit — show the upgrade nudge instead of a raw error.
        setLimitReached(true);
        setCreateError(
          e instanceof ApiError
            ? e.message
            : 'You have reached your plan’s calendar limit. Upgrade on the web dashboard to add more.',
        );
      } else {
        setCreateError(
          e instanceof ApiError ? e.message : 'Could not add the calendar. Please try again.',
        );
      }
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setBusyId(id);
    try {
      await remove.mutateAsync(id);
      hapticSuccess();
      toast.success('Calendar removed.');
      setDeleteTarget(null);
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not remove calendar.');
    } finally {
      setBusyId(null);
    }
  }

  const isLoading = practitionersQuery.isLoading;
  const isError = practitionersQuery.isError;

  if (!isAdmin) {
    return (
      <View style={styles.statePad}>
        <EmptyState
          title="Admins only"
          message="Calendar management is available to venue admins."
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.statePad}>
        <ListSkeleton rows={3} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.statePad}>
        <ErrorState
          message={
            practitionersQuery.error instanceof ApiError
              ? practitionersQuery.error.message
              : 'Could not load calendars.'
          }
          onRetry={() => void practitionersQuery.refetch()}
        />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={practitionersQuery.isRefetching}
          onRefresh={() => void practitionersQuery.refetch()}
          tintColor={colors.brand}
        />
      }>
      <Text variant="caption" tone="muted">
        Each calendar is a bookable column on your public page and the staff calendar. Reorder to set
        the column order. Assign services, classes, resources and events from their own editors.
      </Text>

      {calendars.length === 0 ? (
        <EmptyState
          title="No calendars yet"
          message="Add your first bookable calendar column below."
        />
      ) : (
        calendars.map((c, idx) => (
          <CalendarCard
            key={c.id}
            calendar={c}
            index={idx}
            total={calendars.length}
            venueSlug={venueSlug}
            assignments={assignments}
            busy={busyId === c.id}
            onMove={(offset) => void moveCalendar(c.id, offset)}
            onRename={(name) => renameCalendar(c.id, name)}
            onToggleActive={(active) => void toggleActive(c.id, active)}
            onSaveSlug={(slug) => saveSlug(c.id, slug)}
            onDelete={() => setDeleteTarget(c)}
          />
        ))
      )}

      {/* Create */}
      {showCreate ? (
        <Card>
          <Text variant="label">New calendar</Text>
          <Input
            label="Name"
            value={newName}
            onChangeText={(v) => {
              setNewName(v);
              setCreateError(null);
              setLimitReached(false);
            }}
            maxLength={200}
            placeholder="e.g. Studio A"
            autoCapitalize="words"
          />
          {createError ? (
            <View
              style={[
                styles.noticeBanner,
                {
                  backgroundColor: limitReached ? colors.warningSurface : colors.dangerSurface,
                  borderColor: limitReached ? colors.warning : colors.danger,
                },
              ]}>
              <Text variant="caption" color={limitReached ? colors.warning : colors.danger}>
                {createError}
              </Text>
            </View>
          ) : null}
          <View style={styles.createActions}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              disabled={create.isPending}
              onPress={() => {
                setShowCreate(false);
                setNewName('');
                setCreateError(null);
                setLimitReached(false);
              }}
            />
            <Button
              label="Add"
              style={styles.flex1}
              loading={create.isPending}
              onPress={() => void handleCreate()}
            />
          </View>
        </Card>
      ) : (
        <Button
          label="Add calendar"
          variant="secondary"
          onPress={() => {
            setCreateError(null);
            setLimitReached(false);
            setNewName('');
            setShowCreate(true);
          }}
        />
      )}

      <View style={styles.spacer} />

      <ConfirmSheet
        visible={deleteTarget != null}
        title="Remove calendar?"
        message={
          deleteTarget
            ? `${deleteTarget.name} will be removed. Staff linked to this column are unassigned, and the practitioner on existing bookings may be cleared. Existing bookings stay on the diary.`
            : undefined
        }
        confirmLabel="Remove calendar"
        loading={remove.isPending}
        onConfirm={() => void handleConfirmDelete()}
        onClose={() => {
          if (!remove.isPending) setDeleteTarget(null);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  statePad: {
    flex: 1,
    padding: spacing.base,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  flexShrink: {
    flexShrink: 1,
  },
  statusPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  slugBlock: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  slugActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  assignBlock: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  assignLine: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  assignLabel: {
    width: 72,
  },
  createActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  noticeBanner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  spacer: {
    height: spacing.xl,
  },
});
