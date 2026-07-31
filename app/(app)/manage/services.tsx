import { Stack, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  type ListRenderItem,
} from 'react-native';

import {
  AddonGroupEditorSheet,
  type AddonGroupEditorTarget,
} from '@/components/manage/AddonGroupEditorSheet';
import {
  AddonLinksEditor,
  addonSelectionRuleLabel,
  type AddonLink,
} from '@/components/manage/AddonLinksEditor';
import {
  VariantsEditor,
  buildVariantsPayload,
  variantDraftsFromService,
  type DraftVariant,
} from '@/components/manage/VariantsEditor';
import {
  ServiceCustomAvailabilityEditor,
  isScheduleEmpty,
  toScheduleV2,
  validateSchedule,
} from '@/components/services/ServiceCustomAvailabilityEditor';
import { ComplianceRequirementsEditor } from '@/components/compliance/ComplianceRequirementsEditor';
import {
  StaffServiceOverrideSheet,
  type OverrideCalendarChoice,
} from '@/components/manage/StaffServiceOverrideSheet';
import { ServiceLocationSection, isValidMeetingUrl, normalizeMeetingUrl } from '@/components/services/ServiceLocationSection';
import {
  ProcessingTimeBlocksEditor,
  processingBlocksToDrafts,
  validateProcessingBlocks,
  type ProcessingBlockDraft,
} from '@/components/services/ProcessingTimeBlocksEditor';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence, formatPositivePence, parsePoundsToPence, penceToPoundsInput } from '@/lib/format';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useAddonGroups } from '@/lib/queries/useAddonGroups';
import {
  useCreateService,
  useDeleteService,
  useManagedServices,
  useReorderServices,
  useUpdateService,
  type VariantWriteInput,
} from '@/lib/queries/useServicesManage';
import { useCreateHostCalendar, usePractitioners } from '@/lib/queries/usePractitioners';
import { useSetupStatus } from '@/lib/queries/useSetupStatus';
import { useFeatureFlags } from '@/lib/queries/useVenueSettings';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import {
  nextCalendarServiceIds,
  useToggleCalendarService,
} from '@/lib/queries/useToggleCalendarService';
import { staffMayCustomizeAny } from '@/lib/services/service-override';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  ManagedService,
  ServiceCustomScheduleV2,
  ServiceLocationType,
  ServicePaymentRequirement,
} from '@/types/services-manage';

type EditTarget = {
  id: string;
  practitionerIds: string[];
};

type ActiveTab = 'services' | 'addons';

/**
 * Booking-start fields the API round-trips but that aren't on `ManagedService`
 * (the shared type lives in a file this screen doesn't own). Read via this cast.
 */
type BookingStartReadFields = {
  booking_interval_minutes?: number | null;
  booking_minute_marks?: number[] | null;
};

// --- Booking interval + per-hour start marks (web parity) --------------------
// Mirrors _reference/Resneo/src/lib/appointments/booking-interval.ts so the app
// agrees with the availability engine + API on the grid and on what restricts it.

const DEFAULT_BOOKING_INTERVAL_MINUTES = 15;
const MIN_BOOKING_INTERVAL_MINUTES = 1;
const MAX_BOOKING_INTERVAL_MINUTES = 60;
/** Interval presets surfaced as quick-pick chips (any 1-60 value is still valid). */
const BOOKING_INTERVAL_PRESETS = [5, 10, 15, 20, 30, 60];

/** Clamp/floor an interval to 1-60; falls back to the default when invalid. */
function normalizeBookingIntervalMinutes(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_BOOKING_INTERVAL_MINUTES;
  const floored = Math.floor(n);
  if (floored < MIN_BOOKING_INTERVAL_MINUTES) return MIN_BOOKING_INTERVAL_MINUTES;
  if (floored > MAX_BOOKING_INTERVAL_MINUTES) return MAX_BOOKING_INTERVAL_MINUTES;
  return floored;
}

/** Every start-minute offset within an hour for the given interval, anchored at :00. */
function bookingIntervalGrid(intervalMinutes: number): number[] {
  const interval = normalizeBookingIntervalMinutes(intervalMinutes);
  const grid: number[] = [];
  for (let m = 0; m < 60; m += interval) grid.push(m);
  return grid;
}

/** Sanitize raw marks to unique, in-range, on-grid, ascending offsets. */
function sanitizeBookingMinuteMarks(raw: unknown, intervalMinutes: number): number[] {
  if (!Array.isArray(raw)) return [];
  const grid = new Set(bookingIntervalGrid(intervalMinutes));
  return [
    ...new Set(
      raw
        .map((m) => (typeof m === 'number' ? m : Number(m)))
        .filter((m) => Number.isInteger(m) && grid.has(m)),
    ),
  ].sort((a, b) => a - b);
}

/** Human-readable summary like ":00, :05, :10". */
function describeBookingStartOffsets(offsets: number[]): string {
  return offsets.map((m) => `:${String(m).padStart(2, '0')}`).join(', ');
}

/**
 * Storage normalization for the API: a full-grid or empty mark set collapses to
 * NULL ("no restriction") so the engine treats it as a plain interval. Matches
 * the web's `normalizeBookingStartForStorage`.
 */
function normalizeBookingStartForStorage(
  intervalMinutes: number,
  minuteMarks: number[] | null,
): { booking_interval_minutes: number; booking_minute_marks: number[] | null } {
  const interval = normalizeBookingIntervalMinutes(intervalMinutes);
  if (minuteMarks == null) {
    return { booking_interval_minutes: interval, booking_minute_marks: null };
  }
  const grid = bookingIntervalGrid(interval);
  const marks = sanitizeBookingMinuteMarks(minuteMarks, interval);
  const restricted = marks.length > 0 && marks.length < grid.length;
  return { booking_interval_minutes: interval, booking_minute_marks: restricted ? marks : null };
}

/** Stable fingerprint of the booking-start config, for change detection on save. */
function bookingStartFingerprint(intervalMinutes: number, minuteMarks: number[] | null): string {
  const norm = normalizeBookingStartForStorage(intervalMinutes, minuteMarks);
  return `${norm.booking_interval_minutes}|${norm.booking_minute_marks ? norm.booking_minute_marks.join(',') : 'null'}`;
}

/** Web service colour presets (`APPOINTMENT_SERVICE_COLOUR_OPTIONS`). */
const COLOUR_OPTIONS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

const PAYMENT_OPTIONS: { value: ServicePaymentRequirement; label: string; hint: string }[] = [
  { value: 'none', label: 'No online payment', hint: 'Pay at the venue or arrange separately' },
  { value: 'deposit', label: 'Custom deposit', hint: 'Fixed amount paid online when booking' },
  { value: 'full_payment', label: 'Pay in full online', hint: 'Full price taken at booking' },
];

/**
 * Fourth payment option (spec 6.2), appended only when the venue's
 * `card_hold_deposits` flag is on. Exact web copy.
 */
const CARD_HOLD_PAYMENT_OPTION: { value: ServicePaymentRequirement; label: string; hint: string } = {
  value: 'card_hold',
  label: 'Card hold',
  hint: 'No payment is taken when the client books. Their card is stored securely and you can charge a no-show fee if they do not attend.',
};

/** Editor note when a service is configured card_hold but the venue flag is off (spec 6.3). */
const CARD_HOLD_DISABLED_NOTE =
  'Card hold is disabled for this venue; this service currently takes no deposit.';

/** Short label for a service's delivery location (collapsed-section summary). */
const LOCATION_TYPE_LABELS: Record<ServiceLocationType, string> = {
  business_venue: 'At your venue',
  client_address: "At the client's address",
  online: 'Online',
};

/** The seven staff_may_customize_* flags shown in admin-only form section. */
const STAFF_MAY_FIELDS: { key: keyof StaffMayState; label: string }[] = [
  { key: 'name', label: 'Display name' },
  { key: 'description', label: 'Description' },
  { key: 'duration', label: 'Duration' },
  { key: 'buffer', label: 'Buffer time' },
  { key: 'price', label: 'Price' },
  { key: 'deposit', label: 'Deposit' },
  { key: 'colour', label: 'Colour' },
];

type StaffMayState = {
  name: boolean;
  description: boolean;
  duration: boolean;
  buffer: boolean;
  price: boolean;
  deposit: boolean;
  colour: boolean;
};

const DEFAULT_STAFF_MAY: StaffMayState = {
  name: false,
  description: false,
  duration: false,
  buffer: false,
  price: false,
  deposit: false,
  colour: false,
};

/** Order-independent fingerprint of processing drafts, for change detection. */
function processingFingerprint(drafts: ProcessingBlockDraft[]): string {
  return JSON.stringify(
    drafts
      .map((d) => [Number(d.start) || 0, Number(d.duration) || 0])
      .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!),
  );
}

/**
 * Booking interval (1-60 min) plus an optional selector for which minute marks
 * within each hour are bookable. Mirrors the web `BookingIntervalEditor`:
 * restriction is opt-in; when on, every interval mark for one representative hour
 * is a toggle, and the pattern repeats each hour anchored to :00.
 */
function BookingIntervalEditor({
  intervalMinutes,
  minuteMarks,
  onChange,
}: {
  intervalMinutes: number;
  /** `null` = no per-hour restriction (every interval mark is bookable). */
  minuteMarks: number[] | null;
  onChange: (next: { intervalMinutes: number; minuteMarks: number[] | null }) => void;
}) {
  const { colors } = useTheme();
  const interval = normalizeBookingIntervalMinutes(intervalMinutes);
  const grid = useMemo(() => bookingIntervalGrid(interval), [interval]);
  const restricted = minuteMarks !== null;
  const selected = useMemo(
    () => new Set(restricted ? sanitizeBookingMinuteMarks(minuteMarks, interval) : grid),
    [restricted, minuteMarks, interval, grid],
  );
  const selectedSorted = useMemo(() => [...selected].sort((a, b) => a - b), [selected]);

  const setInterval = (next: number) => {
    const nextInterval = normalizeBookingIntervalMinutes(next);
    // Re-anchor any existing restriction to the new grid (drop off-grid marks).
    const nextMarks = restricted ? sanitizeBookingMinuteMarks(minuteMarks, nextInterval) : null;
    onChange({ intervalMinutes: nextInterval, minuteMarks: nextMarks });
  };

  const setRestricted = (on: boolean) => {
    // Turning restriction on starts from "all marks" so the venue carves marks away.
    onChange({ intervalMinutes: interval, minuteMarks: on ? [...grid] : null });
  };

  const toggleMark = (offset: number) => {
    hapticSelect();
    const next = new Set(selected);
    if (next.has(offset)) next.delete(offset);
    else next.add(offset);
    onChange({ intervalMinutes: interval, minuteMarks: [...next].sort((a, b) => a - b) });
  };

  const noneSelected = restricted && selectedSorted.length === 0;
  const summary =
    selectedSorted.length > 0
      ? describeBookingStartOffsets(selectedSorted)
      : describeBookingStartOffsets(grid);

  return (
    <View style={styles.intervalCard}>
      <Text variant="caption" tone="muted">
        How often a booking can start. Times are anchored to the top of each hour and apply to this
        service&apos;s online bookable slots.
      </Text>

      {/* Interval (minutes) — number input + quick-pick presets */}
      <View style={styles.intervalInputRow}>
        <View style={styles.intervalInputField}>
          <Input
            label="Interval (mins)"
            value={String(interval)}
            onChangeText={(v) => setInterval(Number(v))}
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>
        <View style={styles.intervalPresets}>
          {BOOKING_INTERVAL_PRESETS.map((preset) => {
            const active = interval === preset;
            return (
              <Pressable
                key={preset}
                accessibilityRole="button"
                accessibilityLabel={`Set interval to ${preset} minutes`}
                accessibilityState={{ selected: active }}
                onPress={() => setInterval(preset)}
                style={({ pressed }) => [
                  styles.intervalPreset,
                  {
                    backgroundColor: active ? colors.brand : colors.surface,
                    borderColor: active ? colors.brand : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <Text variant="caption" color={active ? colors.onBrand : colors.textSecondary}>
                  {preset}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Restrict toggle */}
      <View style={styles.switchRow}>
        <View style={styles.intervalSwitchText}>
          <Text variant="bodyMedium">Restrict start times within each hour</Text>
          <Text variant="caption" tone="muted">
            Choose exactly which marks are bookable, e.g. only the first half-hour.
          </Text>
        </View>
        <Switch value={restricted} onValueChange={setRestricted} />
      </View>

      {restricted ? (
        <View style={[styles.markGridWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text variant="caption" tone="muted">
            Tap the minutes past the hour when bookings can start:
          </Text>
          <View style={styles.markGrid}>
            {grid.map((offset) => {
              const on = selected.has(offset);
              return (
                <Pressable
                  key={offset}
                  accessibilityRole="button"
                  accessibilityLabel={`Toggle start time at ${offset} minutes past the hour`}
                  accessibilityState={{ selected: on }}
                  onPress={() => toggleMark(offset)}
                  style={({ pressed }) => [
                    styles.markChip,
                    {
                      backgroundColor: on ? colors.brand : colors.surface,
                      borderColor: on ? colors.brand : colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}>
                  <Text variant="label" color={on ? colors.onBrand : colors.textSecondary}>
                    :{String(offset).padStart(2, '0')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {noneSelected ? (
            <Text variant="caption" color={colors.warning}>
              Select at least one start time, or turn off &quot;Restrict start times&quot; to allow
              every interval.
            </Text>
          ) : null}
        </View>
      ) : null}

      <Text variant="caption" tone="muted">
        {noneSelected
          ? `No start times selected — bookings will fall back to every ${interval}-minute mark.`
          : `Bookings can start at ${summary} past each hour.`}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ServiceRow
// ---------------------------------------------------------------------------

/** Per-calendar offer state for the non-admin "Offer on your calendars" toggles. */
type OfferCalendar = { id: string; name: string; enabled: boolean };

function ServiceRowBase({
  service,
  expanded,
  isAdmin,
  canManage,
  offerCalendars,
  canOverride,
  togglingKey,
  onToggle,
  onEdit,
  onDelete,
  onToggleCalendar,
  onOverride,
  onMoveUp = null,
  onMoveDown = null,
  reorderPending = false,
}: {
  service: ManagedService;
  expanded: boolean;
  isAdmin: boolean;
  /** Admin, or the non-admin creator of this service — may Edit/Delete it. */
  canManage: boolean;
  /**
   * Non-admin self-service "Offer on your calendars" toggles (the staff
   * member's managed calendars + whether each currently offers this service).
   * Empty for admins (they manage links in the form's "Offered by" section).
   */
  offerCalendars: OfferCalendar[];
  /** Non-admin may set per-calendar field overrides (service permits + offers). */
  canOverride: boolean;
  /** `${serviceId}:${calendarId}` currently saving a toggle, or null. */
  togglingKey: string | null;
  onToggle: (id: string) => void;
  onEdit: (service: ManagedService) => void;
  onDelete: (service: ManagedService) => void;
  onToggleCalendar: (serviceId: string, calendarId: string, nextEnabled: boolean) => void;
  onOverride: (service: ManagedService) => void;
  /** Admin display-order controls; null at the list edges. */
  onMoveUp?: (() => void) | null;
  onMoveDown?: (() => void) | null;
  reorderPending?: boolean;
}) {
  const { colors } = useTheme();
  const price = formatPence(service.price_pence);
  // Positive-only: non-deposit services now persist deposit_pence: 0 (web parity),
  // so format with the zero-hiding helper to avoid a misleading "Deposit £0.00" row.
  const deposit = formatPositivePence(service.deposit_pence);
  const variants = service.variants ?? [];
  const addonGroups = service.addon_groups ?? [];
  // D5: for card-hold services the deposit column holds the no-show fee.
  const isCardHold = service.payment_requirement === 'card_hold';
  const cardHoldEnabled = Boolean(useFeatureFlags().data?.resolved?.card_hold_deposits);

  return (
    <Card padded={false} style={styles.serviceCard}>
      <Pressable
        onPress={() => onToggle(service.id)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.serviceHeader, { opacity: pressed ? 0.55 : 1 }]}>
        <View style={[styles.colourDot, { backgroundColor: service.colour ?? colors.brand }]} />
        <View style={styles.serviceText}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {service.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {service.duration_minutes} min
            {price ? ` · ${price}` : ''}
            {variants.length ? ` · ${variants.length} option${variants.length === 1 ? '' : 's'}` : ''}
            {addonGroups.length ? ` · ${addonGroups.length} add-on group${addonGroups.length === 1 ? '' : 's'}` : ''}
          </Text>
        </View>
        {service.is_active === false ? <Badge label="Inactive" tone="neutral" /> : null}
        <Text variant="title" tone="muted">
          {expanded ? '▾' : '›'}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={[styles.serviceBody, { borderTopColor: colors.border }]}>
          {service.description?.trim() ? (
            <Text variant="bodySmall" tone="secondary">
              {service.description}
            </Text>
          ) : null}
          <View style={styles.metaGrid}>
            {isCardHold ? (
              <Text variant="caption" tone="muted">
                {deposit ? `Card hold: ${deposit} no-show fee` : 'Card hold'}
              </Text>
            ) : deposit ? (
              <Text variant="caption" tone="muted">Deposit {deposit}</Text>
            ) : null}
            {service.buffer_minutes ? (
              <Text variant="caption" tone="muted">Buffer {service.buffer_minutes} min</Text>
            ) : null}
            {!isCardHold && service.payment_requirement && service.payment_requirement !== 'none' ? (
              <Text variant="caption" tone="muted">
                Payment: {service.payment_requirement.replace('_', ' ')}
              </Text>
            ) : null}
            {isCardHold && !cardHoldEnabled ? (
              <Text variant="caption" color={colors.warning}>
                Card holds are switched off in Settings
              </Text>
            ) : null}
            {service.cancellation_notice_hours != null ? (
              <Text variant="caption" tone="muted">
                Cancel notice {service.cancellation_notice_hours}h
              </Text>
            ) : null}
            {service.custom_availability_enabled ? (
              <Text variant="caption" tone="muted">Custom schedule</Text>
            ) : null}
          </View>

          {variants.length > 0 ? (
            <View style={styles.subList}>
              <Text variant="overline" tone="muted">Options</Text>
              {variants.map((variant) => {
                const staffVariant = variant as typeof variant & { is_active?: boolean };
                return (
                  <Text key={variant.id} variant="bodySmall" tone="secondary">
                    • {variant.name} — {variant.duration_minutes} min
                    {variant.price_pence != null ? ` · ${formatPence(variant.price_pence)}` : ''}
                    {staffVariant.is_active === false ? ' (inactive)' : ''}
                  </Text>
                );
              })}
            </View>
          ) : null}

          {addonGroups.length > 0 ? (
            <View style={styles.subList}>
              <Text variant="overline" tone="muted">Add-on groups</Text>
              {addonGroups.map((group) => (
                <Text key={group.group.id} variant="bodySmall" tone="secondary">
                  • {group.group.name} ({group.addons.length} add-on
                  {group.addons.length === 1 ? '' : 's'})
                </Text>
              ))}
            </View>
          ) : null}

          {/* Non-admin self-service: "Offer on your calendars" toggles (web
              parity). Each toggle replaces the FULL service set for that one
              calendar via PUT /api/venue/practitioner-services, scoped to
              calendars the staff member manages — so the old re-link privilege
              hole stays closed (admins still edit every link in the form). */}
          {!isAdmin && offerCalendars.length > 0 ? (
            <View style={styles.offerBox}>
              <Text variant="overline" tone="muted">
                Offer on your calendars
              </Text>
              {offerCalendars.map((cal) => (
                <View
                  key={cal.id}
                  style={[styles.offerRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <Text variant="bodySmall" numberOfLines={1} style={styles.offerName}>
                    {cal.name}
                  </Text>
                  <Switch
                    value={cal.enabled}
                    disabled={togglingKey === `${service.id}:${cal.id}`}
                    onValueChange={(next) => onToggleCalendar(service.id, cal.id, next)}
                    accessibilityLabel={`Offer ${service.name} on ${cal.name}`}
                  />
                </View>
              ))}
            </View>
          ) : null}

          {/* Per-calendar field overrides — non-admin, when the service permits
              customisation and the staff member offers it. */}
          {!isAdmin && canOverride ? (
            <Button
              label="Edit your settings"
              variant="secondary"
              size="sm"
              onPress={() => onOverride(service)}
            />
          ) : null}

          {/* Display order — admins reorder the venue's service list (web 2026-07:
              the saved order drives the booking page and staff booking form). */}
          {isAdmin && (onMoveUp || onMoveDown) ? (
            <View style={styles.editRow}>
              <Button
                label="Move up"
                variant="secondary"
                size="sm"
                style={styles.editBtnFull}
                disabled={!onMoveUp || reorderPending}
                onPress={() => onMoveUp?.()}
              />
              <Button
                label="Move down"
                variant="secondary"
                size="sm"
                style={styles.editBtnFull}
                disabled={!onMoveDown || reorderPending}
                onPress={() => onMoveDown?.()}
              />
            </View>
          ) : null}

          {/* Edit/Delete — admins, or the non-admin who created this service
              (created_by_staff_id-scoped, matching the API's own enforcement). */}
          {canManage ? (
            <View style={styles.editRow}>
              <Button label="Edit" variant="secondary" size="sm" style={styles.editBtnFull} onPress={() => onEdit(service)} />
            </View>
          ) : null}
          {canManage ? (
            <Button
              label="Delete service"
              variant="ghost"
              size="sm"
              onPress={() => onDelete(service)}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/** Memoized so untouched rows don't re-render when another row expands/collapses. */
const ServiceRow = memo(ServiceRowBase);

// ---------------------------------------------------------------------------
// Add-ons library tab
// ---------------------------------------------------------------------------

function AddonsTab({
  isAdmin,
  addonGroupsQuery,
  includeInactive,
  setIncludeInactive,
  serviceNameById,
  onPressService,
  onEdit,
  onCreate,
}: {
  isAdmin: boolean;
  addonGroupsQuery: ReturnType<typeof useAddonGroups>;
  includeInactive: boolean;
  setIncludeInactive: (v: boolean) => void;
  /** id → name for every managed service, to render "Used by" chips. */
  serviceNameById: Map<string, string>;
  /** Jump to a service from a "Used by" chip. */
  onPressService: (serviceId: string) => void;
  onEdit: (target: AddonGroupEditorTarget) => void;
  onCreate: () => void;
}) {
  const { colors } = useTheme();
  const groups = addonGroupsQuery.data?.groups ?? [];
  const addonsByGroup = addonGroupsQuery.data?.addons_by_group ?? {};
  const serviceLinks = addonGroupsQuery.data?.service_links ?? [];

  /** Services linked to a group, named and sorted (web parity: usedByForGroup). */
  const usedByForGroup = (groupId: string) => {
    const ids = new Set<string>();
    for (const link of serviceLinks) {
      if (link.addon_group_id === groupId) {
        const sid = link.service_item_id ?? link.appointment_service_id;
        if (sid) ids.add(sid);
      }
    }
    return [...ids]
      .map((id) => ({ id, name: serviceNameById.get(id) ?? 'Unknown service' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  if (addonGroupsQuery.isLoading) return <ListSkeleton />;
  if (addonGroupsQuery.isError) {
    return (
      <View style={styles.stateWrap}>
        <ErrorState
          message={
            addonGroupsQuery.error instanceof ApiError
              ? addonGroupsQuery.error.message
              : 'Could not load add-on groups.'
          }
          onRetry={() => void addonGroupsQuery.refetch()}
        />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={addonGroupsQuery.isRefetching}
          onRefresh={() => void addonGroupsQuery.refetch()}
        />
      }>
      {isAdmin ? <Button label="New add-on group" onPress={onCreate} fullWidth /> : null}
      <View style={styles.switchRow}>
        <Text variant="bodySmall" tone="muted">
          Show archived groups
        </Text>
        <Switch value={includeInactive} onValueChange={setIncludeInactive} />
      </View>

      {groups.length === 0 ? (
        <EmptyState
          title="No add-on groups"
          message={
            isAdmin
              ? 'Create add-on groups to offer clients optional extras at booking.'
              : 'No add-on groups have been created yet.'
          }
        />
      ) : (
        groups.map((group) => {
          const addons = addonsByGroup[group.id] ?? [];
          const usedBy = usedByForGroup(group.id);
          return (
            <Card key={group.id} padded={false} style={styles.serviceCard}>
              <View style={styles.addonGroupRow}>
                <View style={styles.serviceText}>
                  <View style={styles.addonGroupNameRow}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {group.name}
                    </Text>
                    {!group.is_active ? (
                      <Badge label="Archived" tone="warning" />
                    ) : null}
                    {group.hidden_from_online ? (
                      <Badge label="Hidden online" tone="neutral" />
                    ) : null}
                  </View>
                  <Text variant="caption" tone="muted">
                    {addonSelectionRuleLabel(group)} · {addons.length} option
                    {addons.length === 1 ? '' : 's'}
                  </Text>
                  {group.prompt_to_client ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      &quot;{group.prompt_to_client}&quot;
                    </Text>
                  ) : null}
                </View>
                {isAdmin ? (
                  <Button
                    label="Edit"
                    variant="secondary"
                    size="sm"
                    onPress={() =>
                      onEdit({
                        mode: 'edit',
                        group,
                        addons: addonsByGroup[group.id] ?? [],
                      })
                    }
                  />
                ) : null}
              </View>
              {addons.length > 0 ? (
                <View
                  style={[
                    styles.addonList,
                    { borderTopColor: colors.border },
                  ]}>
                  {addons.map((addon) => (
                    <Text key={addon.id} variant="bodySmall" tone="secondary">
                      • {addon.name}
                      {addon.additional_price_pence > 0
                        ? ` +${formatPence(addon.additional_price_pence)}`
                        : ''}
                      {addon.additional_duration_minutes > 0
                        ? ` +${addon.additional_duration_minutes}min`
                        : ''}
                      {!addon.is_active ? ' (inactive)' : ''}
                    </Text>
                  ))}
                </View>
              ) : null}
              <View style={[styles.usedByWrap, { borderTopColor: colors.border }]}>
                {usedBy.length > 0 ? (
                  <>
                    <Text variant="overline" tone="muted">
                      Used by ({usedBy.length})
                    </Text>
                    <View style={styles.usedByChips}>
                      {usedBy.map((svc) => (
                        <Pressable
                          key={svc.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Open service ${svc.name}`}
                          hitSlop={6}
                          onPress={() => onPressService(svc.id)}
                          style={({ pressed }) => [
                            styles.usedByChip,
                            {
                              borderColor: colors.border,
                              backgroundColor: colors.surface,
                              opacity: pressed ? 0.6 : 1,
                            },
                          ]}>
                          <Text variant="caption" tone="secondary" numberOfLines={1}>
                            {svc.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : (
                  <Text variant="caption" tone="muted">
                    Not linked to any services yet.
                  </Text>
                )}
              </View>
            </Card>
          );
        })
      )}
      <View style={styles.spacer} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ServicesScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';
  // Per-service compliance requirements editor is gated on the venue's
  // compliance feature flag (resolved server-side) and admin role.
  const complianceEnabled = venue?.feature_flags?.resolved?.compliance_records_enabled ?? false;

  // Staff identity for non-admin self-service (web parity: currentStaffId +
  // linkedPractitionerIds). A non-admin may create services on calendars they
  // manage, edit/delete only ones they created, toggle offer-on-my-calendar, and
  // set per-calendar field overrides.
  const staffMe = useStaffMe();
  const currentStaffId = staffMe.data?.staff?.id ?? null;
  const managedCalendarIds = useMemo(
    () => staffMe.data?.staff?.linked_calendar_ids ?? [],
    [staffMe.data?.staff?.linked_calendar_ids],
  );

  const query = useManagedServices();
  const update = useUpdateService();
  const create = useCreateService();
  const deleteService = useDeleteService();
  const reorderServices = useReorderServices();
  const toggleCalendarService = useToggleCalendarService();
  const createCalendar = useCreateHostCalendar();

  // Deep link: `?tab=services&service=<id>` opens straight to a pre-expanded
  // service (web parity with the add-ons "Used by" link). Read once on mount.
  const params = useLocalSearchParams<{ tab?: string; service?: string }>();
  const initialTab: ActiveTab = params.tab === 'addons' ? 'addons' : 'services';
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [includeInactiveAddons, setIncludeInactiveAddons] = useState(false);
  // FlatList ref so a "Used by" jump (or the deep link) can scroll to the row.
  const listRef = useRef<FlatList<ManagedService>>(null);

  // Always load addon groups (needed for both the link sheet and the add-ons tab).
  const addonGroupsQuery = useAddonGroups(true, includeInactiveAddons);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [addonGroupEditorTarget, setAddonGroupEditorTarget] =
    useState<AddonGroupEditorTarget | null>(null);
  // Which surface opened the add-on group editor — when 'form', new groups are
  // auto-linked into the service being edited (web parity); 'library' just refreshes.
  const [addonEditorContext, setAddonEditorContext] = useState<'form' | 'library'>('library');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Service pending deletion — drives a Sheet confirm (Alert.alert is a no-op on web).
  const [deleteTarget, setDeleteTarget] = useState<ManagedService | null>(null);
  // Non-admin per-calendar field overrides (StaffServiceOverrideSheet).
  const [overrideService, setOverrideService] = useState<ManagedService | null>(null);
  const [overrideCalendarId, setOverrideCalendarId] = useState<string | null>(null);
  // `${serviceId}:${calendarId}` currently saving an offer toggle, or null.
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  // Inline "Add calendar" from the form (admin only): name draft + open flag.
  const [addCalendarOpen, setAddCalendarOpen] = useState(false);
  const [newCalendarName, setNewCalendarName] = useState('');
  const [addCalendarError, setAddCalendarError] = useState<string | null>(null);

  // Sheet form state (shared between edit + create).
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('');
  const [buffer, setBuffer] = useState('0');
  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [paymentReq, setPaymentReq] = useState<ServicePaymentRequirement>('none');
  const [colour, setColour] = useState(COLOUR_OPTIONS[0]!);
  const [advanceDays, setAdvanceDays] = useState('90');
  const [noticeHours, setNoticeHours] = useState('1');
  const [cancelHours, setCancelHours] = useState('48');
  const [sameDay, setSameDay] = useState(true);
  // Booking interval + per-hour start marks (admin-only). `null` marks = unrestricted.
  const [bookingInterval, setBookingInterval] = useState(DEFAULT_BOOKING_INTERVAL_MINUTES);
  const [bookingMinuteMarks, setBookingMinuteMarks] = useState<number[] | null>(null);
  const [initialBookingStartKey, setInitialBookingStartKey] = useState(
    bookingStartFingerprint(DEFAULT_BOOKING_INTERVAL_MINUTES, null),
  );
  const [practitionerIds, setPractitionerIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  // Admin-only: staff override permissions
  const [staffMay, setStaffMay] = useState<StaffMayState>(DEFAULT_STAFF_MAY);
  // Location / online-meeting
  const [locationType, setLocationType] = useState<ServiceLocationType>('business_venue');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [meetingInfo, setMeetingInfo] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  // Processing-time blocks (admin-only). Seeded from the service; only sent when changed.
  const [processingDrafts, setProcessingDrafts] = useState<ProcessingBlockDraft[]>([]);
  const [initialProcessingKey, setInitialProcessingKey] = useState('[]');
  // Custom availability (stretch) — versioned schedule + enabled flag.
  const [customAvailEnabled, setCustomAvailEnabled] = useState(false);
  const [customSchedule, setCustomSchedule] = useState<ServiceCustomScheduleV2>({
    version: 2,
    rules: [],
  });
  const [initialCustomKey, setInitialCustomKey] = useState('disabled');
  // Service options (variants) + linked add-on groups — edited inline in the form
  // and sent with the create/update payload (admin only; replace semantics on the API).
  const [variantDrafts, setVariantDrafts] = useState<DraftVariant[]>([]);
  const [expandedVariantKey, setExpandedVariantKey] = useState<string | null>(null);
  const [addonLinks, setAddonLinks] = useState<AddonLink[]>([]);

  // Stripe-connected state for the deposit/full-payment warning (web parity).
  const setupStatus = useSetupStatus(isAdmin);
  const stripeConnected = setupStatus.data?.stripe_connected ?? true;

  // Card-hold payment option shown only when the venue flag is on (spec 6.2).
  const cardHoldEnabled = Boolean(useFeatureFlags().data?.resolved?.card_hold_deposits);
  const paymentOptions = cardHoldEnabled
    ? [...PAYMENT_OPTIONS, CARD_HOLD_PAYMENT_OPTION]
    : PAYMENT_OPTIONS;
  const isCardHoldSelected = paymentReq === 'card_hold';

  const practitionersQuery = usePractitioners();
  const practitioners = (practitionersQuery.data?.practitioners ?? [])
    .filter((p) => p.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  const services = useMemo(
    () =>
      [...(query.data?.services ?? [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
      ),
    [query.data?.services],
  );

  /** Expand a service and scroll its row into view (web parity with `?service=`). */
  const focusService = useCallback(
    (serviceId: string) => {
      setActiveTab('services');
      setExpandedId(serviceId);
      const index = services.findIndex((s) => s.id === serviceId);
      if (index >= 0) {
        // viewPosition 0.1 keeps the expanded row near the top with a little gap.
        requestAnimationFrame(() => {
          try {
            listRef.current?.scrollToIndex({ index, viewPosition: 0.1, animated: true });
          } catch {
            // scrollToIndex can throw before layout; the expand alone is enough.
          }
        });
      }
    },
    [services],
  );

  // Honour a `?service=` deep link once the list has loaded.
  const deepLinkServiceId = typeof params.service === 'string' ? params.service : null;
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || !deepLinkServiceId || services.length === 0) return;
    if (services.some((s) => s.id === deepLinkServiceId)) {
      deepLinkHandled.current = true;
      // Defer out of the synchronous effect so the focus/scroll runs after layout.
      requestAnimationFrame(() => focusService(deepLinkServiceId));
    }
  }, [deepLinkServiceId, services, focusService]);

  const practitionerServices = useMemo(
    () => query.data?.practitioner_services ?? [],
    [query.data?.practitioner_services],
  );

  const linkedCalendarIds = useCallback(
    (serviceId: string): string[] =>
      practitionerServices
        .filter((link) => link.service_id === serviceId)
        .map((link) => link.practitioner_id),
    [practitionerServices],
  );

  // --- Non-admin self-service gating (web parity: AppointmentServicesView) ----

  /**
   * Calendars eligible for the form's "Offered by" picker. Admins pick from the
   * full active roster; a non-admin may only link calendars they manage
   * (`calendarsForServiceForm`). `practitioners` is already active-only and
   * staff-assignable (resources excluded by the GET query).
   */
  const calendarsForServiceForm = useMemo(
    () =>
      isAdmin ? practitioners : practitioners.filter((p) => managedCalendarIds.includes(p.id)),
    [isAdmin, practitioners, managedCalendarIds],
  );

  /** Admins manage every service; a non-admin manages only ones they created. */
  const canManageService = useCallback(
    (service: ManagedService): boolean => {
      if (isAdmin) return true;
      return (
        managedCalendarIds.length > 0 &&
        Boolean(currentStaffId) &&
        service.created_by_staff_id === currentStaffId
      );
    },
    [isAdmin, managedCalendarIds.length, currentStaffId],
  );

  /** True when the staff member offers `serviceId` on at least one managed calendar. */
  const staffOffersService = useCallback(
    (serviceId: string): boolean =>
      managedCalendarIds.some((calId) =>
        practitionerServices.some(
          (link) => link.practitioner_id === calId && link.service_id === serviceId,
        ),
      ),
    [managedCalendarIds, practitionerServices],
  );

  /** The per-calendar override link for one calendar+service, if any. */
  const linkForServiceCalendar = useCallback(
    (serviceId: string, calendarId: string | null) => {
      if (!calendarId) return null;
      return (
        practitionerServices.find(
          (link) => link.practitioner_id === calendarId && link.service_id === serviceId,
        ) ?? null
      );
    },
    [practitionerServices],
  );

  /** Managed-calendar offer toggles for the row (non-admins only). */
  const offerCalendarsForService = useCallback(
    (serviceId: string): OfferCalendar[] => {
      if (isAdmin) return [];
      return managedCalendarIds
        .map((calId) => {
          const cal = practitioners.find((p) => p.id === calId);
          if (!cal) return null;
          return {
            id: calId,
            name: cal.name,
            enabled: practitionerServices.some(
              (link) => link.practitioner_id === calId && link.service_id === serviceId,
            ),
          };
        })
        .filter((c): c is OfferCalendar => c !== null);
    },
    [isAdmin, managedCalendarIds, practitioners, practitionerServices],
  );

  /** Calendar choices passed to the override sheet (managed calendars, named). */
  const overrideCalendarChoices = useMemo<OverrideCalendarChoice[]>(
    () =>
      managedCalendarIds
        .map((id) => {
          const cal = practitioners.find((p) => p.id === id);
          return cal ? { id, name: cal.name } : null;
        })
        .filter((c): c is OverrideCalendarChoice => c !== null),
    [managedCalendarIds, practitioners],
  );

  /** Non-admins may create when they manage at least one calendar (web parity). */
  const canCreate = isAdmin || (managedCalendarIds.length > 0 && calendarsForServiceForm.length > 0);

  const openEdit = useCallback((service: ManagedService) => {
    const linked = linkedCalendarIds(service.id);
    setName(service.name);
    setDescription(service.description ?? '');
    setDuration(String(service.duration_minutes));
    setBuffer(String(service.buffer_minutes ?? 0));
    setPrice(penceToPoundsInput(service.price_pence));
    setDeposit(penceToPoundsInput(service.deposit_pence));
    setPaymentReq(service.payment_requirement ?? 'none');
    setColour(service.colour ?? COLOUR_OPTIONS[0]!);
    setAdvanceDays(String(service.max_advance_booking_days ?? 90));
    setNoticeHours(String(service.min_booking_notice_hours ?? 1));
    setCancelHours(String(service.cancellation_notice_hours ?? 48));
    setSameDay(service.allow_same_day_booking !== false);
    const bs = service as ManagedService & BookingStartReadFields;
    const seededInterval = normalizeBookingIntervalMinutes(
      bs.booking_interval_minutes ?? DEFAULT_BOOKING_INTERVAL_MINUTES,
    );
    const seededMarks = bs.booking_minute_marks ?? null;
    setBookingInterval(seededInterval);
    setBookingMinuteMarks(seededMarks);
    setInitialBookingStartKey(bookingStartFingerprint(seededInterval, seededMarks));
    setPractitionerIds(linked);
    setIsActive(service.is_active !== false);
    setStaffMay({
      name: service.staff_may_customize_name ?? false,
      description: service.staff_may_customize_description ?? false,
      duration: service.staff_may_customize_duration ?? false,
      buffer: service.staff_may_customize_buffer ?? false,
      price: service.staff_may_customize_price ?? false,
      deposit: service.staff_may_customize_deposit ?? false,
      colour: service.staff_may_customize_colour ?? false,
    });
    setLocationType(service.location_type ?? 'business_venue');
    setMeetingUrl(service.online_meeting_url ?? '');
    setMeetingInfo(service.online_meeting_info ?? '');
    setUrlError(null);
    const seededProcessing = processingBlocksToDrafts(service.processing_time_blocks);
    setProcessingDrafts(seededProcessing);
    setInitialProcessingKey(processingFingerprint(seededProcessing));
    const seededSchedule = toScheduleV2(service.custom_working_hours);
    const seededEnabled = service.custom_availability_enabled === true;
    setCustomAvailEnabled(seededEnabled);
    setCustomSchedule(seededSchedule);
    setInitialCustomKey(seededEnabled ? JSON.stringify(seededSchedule.rules) : 'disabled');
    // Seed inline options + add-on links from the service (replace-on-save fidelity).
    setVariantDrafts(variantDraftsFromService(service.variants ?? []));
    setExpandedVariantKey(null);
    setAddonLinks(
      [...(service.addon_groups ?? [])]
        .sort((a, b) => (a.link_sort_order ?? 0) - (b.link_sort_order ?? 0))
        .map((entry) => ({ id: entry.group.id, name: entry.group.name })),
    );
    setError(null);
    setEditTarget({ id: service.id, practitionerIds: linked });
  }, [linkedCalendarIds]);

  const openCreate = () => {
    setName('');
    setDescription('');
    setDuration('30');
    setBuffer('0');
    setPrice('');
    setDeposit('');
    setPaymentReq('none');
    setColour(COLOUR_OPTIONS[0]!);
    setAdvanceDays('90');
    setNoticeHours('1');
    setCancelHours('48');
    setSameDay(true);
    setBookingInterval(DEFAULT_BOOKING_INTERVAL_MINUTES);
    setBookingMinuteMarks(null);
    setInitialBookingStartKey(bookingStartFingerprint(DEFAULT_BOOKING_INTERVAL_MINUTES, null));
    // Default to every calendar the user can offer this on — the full roster for
    // an admin, only the staff member's managed calendars otherwise (web parity).
    setPractitionerIds(calendarsForServiceForm.map((p) => p.id));
    setIsActive(true);
    setStaffMay(DEFAULT_STAFF_MAY);
    setLocationType('business_venue');
    setMeetingUrl('');
    setMeetingInfo('');
    setUrlError(null);
    setProcessingDrafts([]);
    setInitialProcessingKey('[]');
    setCustomAvailEnabled(false);
    setCustomSchedule({ version: 2, rules: [] });
    setInitialCustomKey('disabled');
    setVariantDrafts([]);
    setExpandedVariantKey(null);
    setAddonLinks([]);
    setError(null);
    setCreating(true);
  };

  const closeSheet = () => {
    setEditTarget(null);
    setCreating(false);
  };

  async function handleSave() {
    setError(null);
    // Options (variants) drive the parent service's duration/buffer/price when present.
    const usesVariants = isAdmin && variantDrafts.length > 0;

    // Validate + build the options first so the parent fields can derive from the
    // primary (first active, else first) option — web parity with
    // appointment-service-form-to-payload.ts. This also enforces the full-payment
    // "every active option needs a price > 0" rule with a named inline error.
    let builtVariants: VariantWriteInput[] = [];
    if (isAdmin) {
      const vr = buildVariantsPayload(variantDrafts, paymentReq);
      if (!vr.ok) {
        if (vr.key) setExpandedVariantKey(vr.key);
        setError(vr.error);
        return;
      }
      builtVariants = vr.variants;
    }
    const primaryVariant = usesVariants
      ? (builtVariants.find((v) => v.is_active) ?? builtVariants[0] ?? null)
      : null;

    const advance = Number(advanceDays);
    const notice = Number(noticeHours);
    const cancel = Number(cancelHours);

    if (!name.trim()) { setError('Name is required.'); return; }

    // Base duration/buffer apply (and are validated) only for a single fixed offering;
    // with options the parent inherits them from the primary option.
    const durationMinutes = primaryVariant ? primaryVariant.duration_minutes : Number(duration);
    const bufferMinutes = primaryVariant
      ? (primaryVariant.buffer_minutes ?? 0)
      : Number(buffer || '0');
    if (!usesVariants) {
      if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
        setError('Duration must be 5–480 minutes.'); return;
      }
      if (!Number.isInteger(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 120) {
        setError('Buffer must be 0–120 minutes.'); return;
      }
    }
    if (!Number.isInteger(advance) || advance < 1 || advance > 365) {
      setError('Max advance booking must be 1–365 days.'); return;
    }
    if (!Number.isInteger(notice) || notice < 0 || notice > 168) {
      setError('Min booking notice must be 0–168 hours.'); return;
    }
    if (!Number.isInteger(cancel) || cancel < 0 || cancel > 168) {
      setError('Cancellation notice must be 0–168 hours.'); return;
    }
    const basePricePence = parsePoundsToPence(price);
    const depositPence = parsePoundsToPence(deposit);
    if (basePricePence === undefined || depositPence === undefined) {
      setError('Price and deposit must be valid amounts.'); return;
    }
    // Parent price comes from the primary option when using options (web parity).
    const pricePence = usesVariants ? (primaryVariant?.price_pence ?? null) : basePricePence;
    if (paymentReq === 'deposit' && !(depositPence != null && depositPence > 0)) {
      setError('Enter a deposit amount greater than zero for the deposit option.'); return;
    }
    // Card hold (spec 6.2): every editor requires the fee to be at least £1 —
    // a zero-fee card hold must be impossible to configure.
    if (paymentReq === 'card_hold' && !(depositPence != null && depositPence >= 100)) {
      setError('Enter a no-show fee of at least £1'); return;
    }
    // Full online payment: a single offering needs a base price > 0; with options,
    // buildVariantsPayload already enforced a price > 0 on every active option.
    if (paymentReq === 'full_payment' && !usesVariants && !(pricePence != null && pricePence > 0)) {
      setError('Enter a price greater than zero to take full payment online.'); return;
    }
    if (practitionerIds.length === 0) {
      setError('Select at least one calendar to offer this service.'); return;
    }

    // Admin-only sections: location, processing time, custom availability, booking interval.
    let scheduleToSend: ServiceCustomScheduleV2 | null = null;
    let customChanged = false;
    let bookingStart: { booking_interval_minutes: number; booking_minute_marks: number[] | null } | null = null;
    let bookingStartChanged = false;
    // Parent processing blocks: cleared ([]) when options drive timing — each option
    // carries its own; otherwise sent only when the base editor changed them.
    let processingToSend: ReturnType<typeof validateProcessingBlocks>['blocks'] | undefined;
    if (isAdmin) {
      // Booking interval + per-hour start marks. An empty restriction collapses to
      // "unrestricted" (null) here, mirroring the web's non-blocking warning — the
      // in-editor hint guides the user but does not prevent saving.
      bookingStart = normalizeBookingStartForStorage(bookingInterval, bookingMinuteMarks);
      bookingStartChanged =
        bookingStartFingerprint(bookingInterval, bookingMinuteMarks) !== initialBookingStartKey;

      // Location / online-meeting link
      if (locationType === 'online' && !isValidMeetingUrl(meetingUrl)) {
        setUrlError('Enter a valid http(s) link for the online service.');
        setError('Fix the online meeting link before saving.');
        return;
      }
      setUrlError(null);

      // Processing-time blocks. With options the parent has none (clear to []);
      // otherwise validate against the core duration and send only when changed.
      if (usesVariants) {
        processingToSend = [];
      } else {
        const procResult = validateProcessingBlocks(processingDrafts, durationMinutes);
        if (!procResult.ok) {
          setError(procResult.error ?? 'Processing time is invalid.'); return;
        }
        if (processingFingerprint(processingDrafts) !== initialProcessingKey) {
          processingToSend = procResult.blocks ?? [];
        }
      }

      // Custom availability (stretch)
      const scheduleErr = validateSchedule(customSchedule);
      if (scheduleErr) { setError(scheduleErr); return; }
      if (customAvailEnabled && isScheduleEmpty(customSchedule)) {
        setError('Add at least one availability window, or turn off the custom schedule.'); return;
      }
      const currentCustomKey = customAvailEnabled ? JSON.stringify(customSchedule.rules) : 'disabled';
      customChanged = currentCustomKey !== initialCustomKey;
      scheduleToSend = customAvailEnabled ? customSchedule : null;
    }

    // Web parity (appointment-service-form-to-payload.ts): only persist a deposit
    // when "Custom deposit" or "Card hold" is the chosen payment mode (card holds
    // store the no-show fee in the same deposit_pence column). Any other choice
    // zeroes it so a value typed earlier can't linger on the service after
    // switching mode (which would otherwise show a phantom deposit and confuse
    // refund logic).
    const depositToSend =
      paymentReq === 'deposit' || paymentReq === 'card_hold' ? (depositPence ?? 0) : 0;

    const shared = {
      name: name.trim(),
      description: description.trim() || null,
      duration_minutes: durationMinutes,
      buffer_minutes: bufferMinutes,
      /**
       * OMITTED when there is no price, never null. `price_pence` is the one
       * field in this payload the API does not accept as null
       * (`z.number().int().min(0).optional()` — unlike `deposit_pence`, which is
       * `.nullable()`), so sending null failed the schema and came back as a
       * bare "Invalid request" for EVERY save of a service with a blank price,
       * whatever the user had actually edited. Web parity: the dashboard's
       * form-to-payload sends `?? undefined` here for the same reason.
       */
      price_pence: pricePence ?? undefined,
      deposit_pence: depositToSend,
      payment_requirement: paymentReq,
      colour,
      is_active: isActive,
      max_advance_booking_days: advance,
      min_booking_notice_hours: notice,
      cancellation_notice_hours: cancel,
      allow_same_day_booking: sameDay,
      // Admin-only: staff permission flags (always sent when admin to allow clearing them)
      ...(isAdmin ? {
        staff_may_customize_name: staffMay.name,
        staff_may_customize_description: staffMay.description,
        staff_may_customize_duration: staffMay.duration,
        staff_may_customize_buffer: staffMay.buffer,
        staff_may_customize_price: staffMay.price,
        staff_may_customize_deposit: staffMay.deposit,
        staff_may_customize_colour: staffMay.colour,
        // Location — always sent when admin so a switch back to venue/online clears
        // the right fields server-side. The API ignores the meeting fields unless online.
        location_type: locationType,
        online_meeting_url: locationType === 'online' ? normalizeMeetingUrl(meetingUrl) || null : null,
        online_meeting_info:
          locationType === 'online' ? (meetingInfo.trim() || null) : null,
      } : {}),
    };

    // Admin-only relations + replace-semantics sections. Variants + add-on links go
    // out with every admin save (web parity) so the inline edits actually persist —
    // the API replaces each array wholesale and the seeds carry existing ids.
    const adminExtras = isAdmin
      ? {
          variants: builtVariants,
          addon_group_links: addonLinks.map((g, index) => ({
            addon_group_id: g.id,
            sort_order: index,
          })),
          ...(processingToSend !== undefined ? { processing_time_blocks: processingToSend } : {}),
          ...(customChanged
            ? {
                custom_availability_enabled: customAvailEnabled,
                custom_working_hours: scheduleToSend,
              }
            : {}),
          // Booking interval + marks — sent only when the editor changed them from
          // the form default; the server normalizes + defaults to 15/unrestricted,
          // so an untouched form correctly omits them.
          ...(bookingStartChanged && bookingStart
            ? {
                booking_interval_minutes: bookingStart.booking_interval_minutes,
                booking_minute_marks: bookingStart.booking_minute_marks,
              }
            : {}),
        }
      : {};

    try {
      if (editTarget) {
        const linksChanged =
          JSON.stringify([...practitionerIds].sort()) !==
          JSON.stringify([...editTarget.practitionerIds].sort());
        await update.mutateAsync({
          id: editTarget.id,
          ...shared,
          ...adminExtras,
          ...(linksChanged ? { practitioner_ids: practitionerIds } : {}),
        });
      } else {
        await create.mutateAsync({
          ...shared,
          ...adminExtras,
          description: shared.description ?? undefined,
          deposit_pence: depositToSend,
          practitioner_ids: practitionerIds,
        });
      }
      hapticSuccess();
      closeSheet();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save the service.');
    }
  }

  const handleToggle = useCallback(
    (id: string) => setExpandedId((cur) => (cur === id ? null : id)),
    [],
  );

  const handleDeleteService = useCallback((service: ManagedService) => {
    // Open a Sheet confirm — Alert.alert's confirm never fires on web.
    setDeleteTarget(service);
  }, []);

  /**
   * Non-admin "Offer on your calendars" toggle. PUT replaces the full service
   * set for ONE calendar, so we send the calendar's existing set with the one
   * service added/removed (web parity: toggleStaffServiceCalendar). A 409 means
   * removing a service that still has upcoming bookings on that calendar.
   */
  const handleToggleCalendar = useCallback(
    (serviceId: string, calendarId: string, nextEnabled: boolean) => {
      const current = practitionerServices
        .filter((link) => link.practitioner_id === calendarId)
        .map((link) => link.service_id);
      const next = nextCalendarServiceIds(current, serviceId, nextEnabled);
      const key = `${serviceId}:${calendarId}`;
      setTogglingKey(key);
      toggleCalendarService.mutate(
        { practitioner_id: calendarId, service_ids: next },
        {
          onSuccess: () => {
            hapticSuccess();
            setTogglingKey(null);
          },
          onError: (e) => {
            hapticWarning();
            setTogglingKey(null);
            toast.error(
              e instanceof ApiError ? e.message : 'Could not update which calendars offer this.',
            );
          },
        },
      );
    },
    [practitionerServices, toggleCalendarService, toast],
  );

  const handleOpenOverride = useCallback(
    (service: ManagedService) => {
      setOverrideCalendarId(managedCalendarIds[0] ?? null);
      setOverrideService(service);
    },
    [managedCalendarIds],
  );

  /**
   * Inline "Add calendar" from the form's "Offered by" section (admin only):
   * POST a new practitioner column, then auto-select it so the service saves
   * linked to it (web parity: handleCreateCalendar). A plan-limit hit surfaces as
   * a 403 ApiError (upgrade_required).
   */
  async function handleCreateCalendar() {
    const trimmed = newCalendarName.trim();
    if (!trimmed) {
      setAddCalendarError('Enter a calendar name.');
      return;
    }
    setAddCalendarError(null);
    try {
      const created = await createCalendar.mutateAsync({ name: trimmed });
      hapticSuccess();
      setPractitionerIds((current) =>
        current.includes(created.id) ? current : [...current, created.id],
      );
      setNewCalendarName('');
      setAddCalendarOpen(false);
    } catch (e) {
      hapticWarning();
      setAddCalendarError(
        e instanceof ApiError ? e.message : 'Could not add the calendar. Please try again.',
      );
    }
  }

  function runDeleteService() {
    const service = deleteTarget;
    if (!service) return;
    deleteService.mutate(service.id, {
      onSuccess: () => {
        hapticSuccess();
        setDeleteTarget(null);
        setExpandedId(null);
        toast.success(`"${service.name}" deleted.`);
      },
      onError: (e) => {
        hapticWarning();
        setDeleteTarget(null);
        toast.error(
          e instanceof ApiError ? e.message : 'Could not delete the service. Please try again.',
        );
      },
    });
  }

  const sheetOpen = editTarget !== null || creating;
  const saving = update.isPending || create.isPending;
  // Admin "multiple options" mode — hides the base duration/price fields and the
  // parent processing-time editor, which the options below supersede (web parity).
  const usesVariants = isAdmin && variantDrafts.length > 0;

  // Admin display order (web 2026-07): move a service one place and persist the
  // FULL id order via PUT /reorder (`sort_order = index`); the saved order also
  // drives the public booking page and staff booking form lists.
  const handleMoveService = useCallback(
    (serviceId: string, direction: -1 | 1) => {
      const ids = services.map((s) => s.id);
      const from = ids.indexOf(serviceId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= ids.length) return;
      const next = [...ids];
      next.splice(from, 1);
      next.splice(to, 0, serviceId);
      reorderServices.mutate(next, {
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.message : 'Could not save the new order.'),
      });
    },
    [services, reorderServices, toast],
  );

  const renderServiceItem = useCallback<ListRenderItem<ManagedService>>(
    ({ item }) => {
      const isExpanded = expandedId === item.id;
      // Per-row self-service data is only needed for the expanded, non-admin row;
      // computing it lazily keeps collapsed rows cheap.
      const offerCalendars = !isAdmin && isExpanded ? offerCalendarsForService(item.id) : [];
      const canOverride =
        !isAdmin && isExpanded && staffMayCustomizeAny(item) && staffOffersService(item.id);
      const orderIndex = isAdmin && isExpanded ? services.findIndex((s) => s.id === item.id) : -1;
      return (
        <ServiceRow
          service={item}
          expanded={isExpanded}
          isAdmin={isAdmin}
          canManage={canManageService(item)}
          offerCalendars={offerCalendars}
          canOverride={canOverride}
          togglingKey={togglingKey}
          onToggle={handleToggle}
          onEdit={openEdit}
          onDelete={handleDeleteService}
          onToggleCalendar={handleToggleCalendar}
          onOverride={handleOpenOverride}
          onMoveUp={orderIndex > 0 ? () => handleMoveService(item.id, -1) : null}
          onMoveDown={
            orderIndex >= 0 && orderIndex < services.length - 1
              ? () => handleMoveService(item.id, 1)
              : null
          }
          reorderPending={reorderServices.isPending}
        />
      );
    },
    [
      expandedId,
      isAdmin,
      canManageService,
      offerCalendarsForService,
      staffOffersService,
      togglingKey,
      handleToggle,
      openEdit,
      handleDeleteService,
      handleToggleCalendar,
      handleOpenOverride,
      services,
      handleMoveService,
      reorderServices.isPending,
    ],
  );

  const keyExtractor = useCallback((item: ManagedService) => item.id, []);

  // One-line summaries for the collapsed advanced sections in the service sheet.
  // Pure presentation — derived from the live form state, never persisted.
  const bookingRulesSummary = `${advanceDays || '—'}d ahead · ${noticeHours || '0'}h notice${
    sameDay ? '' : ' · no same-day'
  }`;
  const staffMayCount = STAFF_MAY_FIELDS.reduce((n, { key }) => n + (staffMay[key] ? 1 : 0), 0);
  const staffMaySummary =
    staffMayCount === 0 ? 'None' : `${staffMayCount} of ${STAFF_MAY_FIELDS.length} allowed`;
  const locationSummary = LOCATION_TYPE_LABELS[locationType];
  const bookingIntervalSummary = `Every ${normalizeBookingIntervalMinutes(bookingInterval)} min${
    bookingMinuteMarks !== null ? ' · restricted' : ''
  }`;
  const processingSummary =
    processingDrafts.length === 0
      ? 'None'
      : `${processingDrafts.length} period${processingDrafts.length === 1 ? '' : 's'}`;
  const customAvailSummary = customAvailEnabled ? 'On' : 'Off';
  const optionsSummary =
    variantDrafts.length === 0
      ? 'One fixed offering'
      : `${variantDrafts.length} option${variantDrafts.length === 1 ? '' : 's'}`;
  const addonsSummary =
    addonLinks.length === 0
      ? 'None'
      : `${addonLinks.length} group${addonLinks.length === 1 ? '' : 's'}`;

  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen options={{ headerShown: true, title: 'Services' }} />

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {(['services', 'addons'] as ActiveTab[]).map((tab) => {
          const active = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={styles.tabItem}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}>
              <Text
                variant="label"
                color={active ? colors.brand : colors.textSecondary}>
                {tab === 'services' ? 'Services' : 'Add-ons'}
              </Text>
              {active ? (
                <View style={[styles.tabUnderline, { backgroundColor: colors.brand }]} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* ---- Services tab ---- */}
      {activeTab === 'services' ? (
        query.isLoading ? (
          <ListSkeleton />
        ) : query.isError ? (
          <View style={styles.stateWrap}>
            <ErrorState
              message={
                query.error instanceof ApiError ? query.error.message : 'Could not load services.'
              }
              onRetry={() => void query.refetch()}
            />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={services}
            keyExtractor={keyExtractor}
            renderItem={renderServiceItem}
            contentContainerStyle={styles.content}
            // Rows are variable-height, so a scrollToIndex before the row has
            // rendered can fail — fall back to an approximate offset, then retry.
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: true,
              });
              setTimeout(() => {
                try {
                  listRef.current?.scrollToIndex({
                    index: info.index,
                    viewPosition: 0.1,
                    animated: true,
                  });
                } catch {
                  // Best-effort; the row is already expanded.
                }
              }, 80);
            }}
            ListHeaderComponent={
              canCreate ? <Button label="New service" onPress={openCreate} fullWidth /> : null
            }
            ListEmptyComponent={
              <EmptyState
                title="No services yet"
                message={
                  canCreate
                    ? 'Create your first service to start taking appointments.'
                    : 'No services have been created yet.'
                }
              />
            }
            ListFooterComponent={<View style={styles.spacer} />}
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
                tintColor={colors.brand}
              />
            }
            // W8.4 virtualization tuning — rows are variable-height (expandable),
            // so no getItemLayout; these caps keep busy catalogues smooth.
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={11}
            removeClippedSubviews={Platform.OS === 'android'}
          />
        )
      ) : null}

      {/* ---- Add-ons tab ---- */}
      {activeTab === 'addons' ? (
        <AddonsTab
          isAdmin={isAdmin}
          addonGroupsQuery={addonGroupsQuery}
          includeInactive={includeInactiveAddons}
          setIncludeInactive={setIncludeInactiveAddons}
          serviceNameById={new Map(services.map((s) => [s.id, s.name] as const))}
          onPressService={focusService}
          onEdit={(target) => {
            setAddonEditorContext('library');
            setAddonGroupEditorTarget(target);
          }}
          onCreate={() => {
            setAddonEditorContext('library');
            setAddonGroupEditorTarget({ mode: 'create' });
          }}
        />
      ) : null}

      {/* Add-on group create/edit sheet — opened from the Add-ons tab (library) or
          inline from the service form (auto-links a newly created group). */}
      <AddonGroupEditorSheet
        target={addonGroupEditorTarget}
        onClose={() => setAddonGroupEditorTarget(null)}
        onSaved={(result, mode) => {
          if (addonEditorContext !== 'form') return;
          // Keep the service form's linked list in step with the edit.
          setAddonLinks((current) => {
            if (mode === 'create') {
              return current.some((l) => l.id === result.group.id)
                ? current
                : [...current, { id: result.group.id, name: result.group.name }];
            }
            return current.map((l) =>
              l.id === result.group.id ? { ...l, name: result.group.name } : l,
            );
          });
        }}
      />

      {/* Service edit / create sheet */}
      <Sheet visible={sheetOpen} onClose={closeSheet} maxHeight="92%" fill>
        <View style={styles.sheetBodyWrap}>
          <Text variant="overline" tone="muted">
            {editTarget ? 'Edit service' : 'New service'}
          </Text>

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetBody}
            keyboardShouldPersistTaps="handled">
            <Input label="Name" value={name} onChangeText={setName} maxLength={200} />
            <Input
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              multiline
              style={styles.multiline}
              maxLength={1000}
            />
            {!usesVariants ? (
              <View style={styles.moneyRow}>
                <View style={styles.moneyField}>
                  <Input
                    label="Duration (mins)"
                    value={duration}
                    onChangeText={setDuration}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.moneyField}>
                  <Input
                    label="Buffer (mins)"
                    value={buffer}
                    onChangeText={setBuffer}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            ) : (
              <Text variant="caption" tone="muted">
                Duration, buffer and price are set per option below.
              </Text>
            )}

            {/* Service options (variants) + Add-ons — admin only, web parity: both
                save with the service in a single create/update payload. */}
            {isAdmin ? (
              <>
                <CollapsibleCard
                  title="Service options"
                  summary={optionsSummary}
                  defaultExpanded={variantDrafts.length > 0}>
                  <View style={styles.sectionStack}>
                    <Text variant="caption" tone="muted">
                      Add options when guests must pick a version first (e.g. 30 vs 60 minutes) — each
                      has its own duration, price and deposit. Leave empty for one fixed offering.
                    </Text>
                    <VariantsEditor
                      drafts={variantDrafts}
                      onChange={setVariantDrafts}
                      paymentRequirement={paymentReq}
                      firstOptionSeed={{
                        duration,
                        buffer,
                        price,
                        deposit: paymentReq === 'deposit' || paymentReq === 'card_hold' ? deposit : '',
                      }}
                      expandedKey={expandedVariantKey}
                      onExpandedKeyChange={setExpandedVariantKey}
                    />
                  </View>
                </CollapsibleCard>

                <CollapsibleCard
                  title="Add-ons"
                  summary={addonsSummary}
                  defaultExpanded={addonLinks.length > 0}>
                  <AddonLinksEditor
                    links={addonLinks}
                    onChange={setAddonLinks}
                    groups={addonGroupsQuery.data?.groups ?? []}
                    addonsByGroup={addonGroupsQuery.data?.addons_by_group ?? {}}
                    isLoading={addonGroupsQuery.isLoading}
                    error={
                      addonGroupsQuery.isError
                        ? 'Could not load the add-on library. Pull to refresh and try again.'
                        : null
                    }
                    onCreateGroup={() => {
                      setAddonEditorContext('form');
                      setAddonGroupEditorTarget({ mode: 'create' });
                    }}
                    onEditGroup={(group, addons) => {
                      setAddonEditorContext('form');
                      setAddonGroupEditorTarget({ mode: 'edit', group, addons });
                    }}
                  />
                </CollapsibleCard>
              </>
            ) : null}

            {/* Online payment */}
            <Text variant="overline" tone="muted">Online payment</Text>
            {paymentOptions.map((option) => {
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
            {isCardHoldSelected && !cardHoldEnabled ? (
              <View style={[styles.stripeWarning, { backgroundColor: colors.warningSurface }]}>
                <Text variant="caption" color={colors.warning}>
                  {CARD_HOLD_DISABLED_NOTE}
                </Text>
              </View>
            ) : null}
            {!usesVariants || paymentReq === 'deposit' || isCardHoldSelected ? (
              <View style={styles.moneyRow}>
                {!usesVariants ? (
                  <View style={styles.moneyField}>
                    <Input label="Price (£)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
                  </View>
                ) : null}
                {paymentReq === 'deposit' || isCardHoldSelected ? (
                  <View style={styles.moneyField}>
                    <Input
                      label={
                        isCardHoldSelected
                          ? usesVariants
                            ? 'Default no-show fee (£)'
                            : 'No-show fee (£)'
                          : usesVariants
                            ? 'Default deposit (£)'
                            : 'Deposit (£)'
                      }
                      helper={
                        isCardHoldSelected
                          ? usesVariants
                            ? 'Used when an option leaves its fee blank. Must be at least £1.'
                            : 'The no-show fee must be at least £1.'
                          : usesVariants
                            ? 'Used when an option leaves its deposit blank.'
                            : undefined
                      }
                      value={deposit}
                      onChangeText={setDeposit}
                      keyboardType="decimal-pad"
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
            {usesVariants && paymentReq === 'full_payment' ? (
              <Text variant="caption" tone="muted">
                Each option offered to clients needs its own price — that&apos;s what they pay online.
              </Text>
            ) : null}

            {/* Stripe-not-connected warning when an online payment is required (web parity). */}
            {paymentReq !== 'none' && !stripeConnected ? (
              <View style={[styles.stripeWarning, { backgroundColor: colors.warningSurface }]}>
                <Text variant="caption" color={colors.warning}>
                  Stripe is not connected. Connect your Stripe account in Settings before guests can
                  pay online.
                </Text>
              </View>
            ) : null}

            {/* Guest booking rules — collapsed; touched rarely after first setup. */}
            <CollapsibleCard title="Guest booking rules" summary={bookingRulesSummary}>
              <View style={styles.sectionStack}>
                <View style={styles.moneyRow}>
                  <View style={styles.moneyField}>
                    <Input
                      label="Book ahead (days)"
                      value={advanceDays}
                      onChangeText={setAdvanceDays}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={styles.moneyField}>
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
              </View>
            </CollapsibleCard>

            {/* Colour */}
            <Text variant="overline" tone="muted">Calendar colour</Text>
            <View style={styles.swatchRow}>
              {COLOUR_OPTIONS.map((option) => {
                const selected = colour === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityLabel={`Colour ${option}`}
                    accessibilityState={{ selected }}
                    onPress={() => setColour(option)}
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

            {/* Offered by — admins pick from the full roster; a non-admin may
                only toggle calendars they manage. Links the service already has
                on other calendars stay in `practitionerIds` (seeded on open) and
                are preserved on save, so a non-admin edit never strips them. */}
            <Text variant="overline" tone="muted">Offered by</Text>
            {!isAdmin ? (
              <Text variant="caption" tone="muted">
                You can offer this on the calendars you manage.
              </Text>
            ) : null}
            <View style={styles.calendarWrap}>
              {calendarsForServiceForm.map((practitioner) => {
                const selected = practitionerIds.includes(practitioner.id);
                return (
                  <Pressable
                    key={practitioner.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() =>
                      setPractitionerIds((current) =>
                        selected
                          ? current.filter((id) => id !== practitioner.id)
                          : [...current, practitioner.id],
                      )
                    }
                    style={({ pressed }) => [
                      styles.calendarChip,
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
                      {practitioner.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {/* Inline "Add calendar" (admin only) — create a new calendar column
                without leaving the form; the new id is auto-selected on success. */}
            {isAdmin ? (
              <Button
                label="New calendar"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setNewCalendarName('');
                  setAddCalendarError(null);
                  setAddCalendarOpen(true);
                }}
              />
            ) : null}

            <View style={styles.switchRow}>
              <Text variant="bodyMedium">Active (visible to clients)</Text>
              <Switch value={isActive} onValueChange={setIsActive} />
            </View>

            {/* Admin-only advanced sections — each collapsed by default so the
                common fields above stay reachable without scrolling. The save
                payload, replace-array semantics and validation are unchanged;
                only the presentation is regrouped behind CollapsibleCards. */}
            {isAdmin ? (
              <>
                {/* Staff override permissions */}
                <CollapsibleCard title="Staff override permissions" summary={staffMaySummary}>
                  <View style={styles.sectionStack}>
                    <Text variant="caption" tone="muted">
                      Allow staff members with their own calendar to override these fields for their
                      calendar only.
                    </Text>
                    {STAFF_MAY_FIELDS.map(({ key, label }) => (
                      <View key={key} style={styles.switchRow}>
                        <Text variant="bodyMedium">{label}</Text>
                        <Switch
                          value={staffMay[key]}
                          onValueChange={(v) =>
                            setStaffMay((prev) => ({ ...prev, [key]: v }))
                          }
                        />
                      </View>
                    ))}
                  </View>
                </CollapsibleCard>

                {/* Location / online-meeting */}
                <CollapsibleCard title="Location" summary={locationSummary}>
                  <ServiceLocationSection
                    locationType={locationType}
                    onLocationTypeChange={setLocationType}
                    meetingUrl={meetingUrl}
                    onMeetingUrlChange={(v) => {
                      setMeetingUrl(v);
                      if (urlError) setUrlError(null);
                    }}
                    meetingInfo={meetingInfo}
                    onMeetingInfoChange={setMeetingInfo}
                    urlError={urlError}
                  />
                </CollapsibleCard>

                {/* Booking interval + per-hour start marks */}
                <CollapsibleCard
                  title="Booking interval &amp; start times"
                  summary={bookingIntervalSummary}>
                  <BookingIntervalEditor
                    intervalMinutes={bookingInterval}
                    minuteMarks={bookingMinuteMarks}
                    onChange={({ intervalMinutes, minuteMarks }) => {
                      setBookingInterval(intervalMinutes);
                      setBookingMinuteMarks(minuteMarks);
                    }}
                  />
                </CollapsibleCard>

                {/* Processing-time blocks (gaps inside the appointment). Hidden when
                    the service uses options — each option carries its own. */}
                {!usesVariants ? (
                  <CollapsibleCard title="Processing time" summary={processingSummary}>
                    <ProcessingTimeBlocksEditor
                      drafts={processingDrafts}
                      onChange={setProcessingDrafts}
                      durationMinutes={Number(duration) || 0}
                      bufferMinutes={Number(buffer) || 0}
                    />
                  </CollapsibleCard>
                ) : null}

                {/* Custom availability (per-weekday windows) */}
                <CollapsibleCard title="Custom availability" summary={customAvailSummary}>
                  <ServiceCustomAvailabilityEditor
                    enabled={customAvailEnabled}
                    onEnabledChange={setCustomAvailEnabled}
                    schedule={customSchedule}
                    onScheduleChange={setCustomSchedule}
                  />
                </CollapsibleCard>
              </>
            ) : (
              <Text variant="caption" tone="muted">
                Location, processing-time blocks, and custom availability are managed by venue
                admins on the web dashboard.
              </Text>
            )}

            {/* Per-service compliance requirements — admin only, edit-mode only
                (needs a saved service id), and gated on the venue's compliance
                feature flag. Hidden entirely otherwise. */}
            {isAdmin && complianceEnabled && editTarget ? (
              <ComplianceRequirementsEditor
                serviceId={editTarget.id}
                complianceEnabled={complianceEnabled}
              />
            ) : null}

            {error ? (
              <Text variant="bodySmall" tone="danger">
                {error}
              </Text>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={closeSheet} />
            <Button
              label={editTarget ? 'Save changes' : 'Create service'}
              style={styles.flex1}
              loading={saving}
              onPress={() => void handleSave()}
            />
          </View>
        </View>
      </Sheet>

      {/* Delete-service confirm — a Sheet, since Alert.alert's confirm is a no-op on web. */}
      <Sheet visible={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <View style={styles.deleteSheet}>
          <Text variant="subheading">Delete service</Text>
          <Text variant="bodySmall" tone="secondary">
            Delete &quot;{deleteTarget?.name}&quot;? This cannot be undone. The service will not be
            deleted if upcoming bookings exist.
          </Text>
          <View style={styles.actions}>
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
              loading={deleteService.isPending}
              onPress={runDeleteService}
            />
          </View>
        </View>
      </Sheet>

      {/* Non-admin per-calendar field overrides (web parity:
          StaffServiceOverrideModal). Renders only the fields the admin permitted
          and diffs each to the venue base on save. */}
      <StaffServiceOverrideSheet
        visible={overrideService !== null}
        onClose={() => {
          setOverrideService(null);
          setOverrideCalendarId(null);
        }}
        service={overrideService}
        calendarChoices={overrideCalendarChoices}
        selectedCalendarId={overrideCalendarId}
        onSelectCalendar={setOverrideCalendarId}
        link={
          overrideService
            ? linkForServiceCalendar(
                overrideService.id,
                overrideCalendarId ?? managedCalendarIds[0] ?? null,
              )
            : null
        }
      />

      {/* Inline "Add calendar" sheet (admin only) — minimal name input. */}
      <Sheet visible={addCalendarOpen} onClose={() => setAddCalendarOpen(false)}>
        <View style={styles.deleteSheet}>
          <Text variant="subheading">New calendar</Text>
          <Text variant="bodySmall" tone="secondary">
            Create a bookable calendar column. It will be selected for this service automatically.
          </Text>
          <Input
            label="Calendar name"
            value={newCalendarName}
            onChangeText={setNewCalendarName}
            maxLength={200}
            error={addCalendarError ?? undefined}
          />
          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              onPress={() => setAddCalendarOpen(false)}
            />
            <Button
              label="Add calendar"
              style={styles.flex1}
              loading={createCalendar.isPending}
              onPress={() => void handleCreateCalendar()}
            />
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    position: 'relative',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: 1,
  },
  content: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  serviceCard: {
    overflow: 'hidden',
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
  },
  colourDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  serviceText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  serviceBody: {
    padding: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  subList: {
    gap: spacing.xs,
  },
  editRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  editBtnFull: {
    flex: 1,
  },
  // Non-admin "Offer on your calendars" toggles in the expanded row.
  offerBox: {
    gap: spacing.xs,
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.base,
    minHeight: 48,
  },
  offerName: {
    flex: 1,
    minWidth: 0,
  },
  // Add-ons tab
  addonGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
  },
  addonGroupNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  addonList: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  usedByWrap: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  usedByChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  usedByChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: '100%',
  },
  spacer: {
    height: spacing.xl,
  },
  // Sheet — `fill` mode pins the sheet to a fixed height and gives the SafeArea
  // + content wrappers `flex: 1`. The body claims that height (flex: 1) so the
  // ScrollView between the header and the pinned actions can scroll internally;
  // without this the long form expands past the sheet and the Save button (a
  // sibling of the ScrollView) is pushed off-screen. `fill` strips the content
  // wrapper's horizontal padding, so the body restores it here.
  sheetBodyWrap: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  sheetScroll: {
    flex: 1,
  },
  sheetBody: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  // Vertical rhythm for inputs/rows inside a CollapsibleCard body (the card body
  // is a single View, so the sheet-level `gap` doesn't reach these children).
  sectionStack: {
    gap: spacing.md,
  },
  multiline: {
    minHeight: 72,
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
  calendarWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  calendarChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
  deleteSheet: {
    gap: spacing.md,
  },
  stripeWarning: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  // Booking interval editor
  intervalCard: {
    gap: spacing.sm,
  },
  intervalInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  intervalInputField: {
    width: 110,
  },
  intervalPresets: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  intervalPreset: {
    minWidth: 44,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intervalSwitchText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
    paddingRight: spacing.md,
  },
  markGridWrap: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  markGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  markChip: {
    minWidth: 48,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
