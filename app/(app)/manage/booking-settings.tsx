import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticTap, hapticWarning } from '@/lib/haptics';
import {
  useFeatureFlags,
  useUpdateFeatureFlags,
  useUpdateVenue,
  type FeatureFlagsCalendar,
} from '@/lib/queries/useVenueSettings';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  AppointmentsFeatureFlagKey,
  BookingModel,
  ResolvedAppointmentsFeatureFlags,
  VenueFeatureFlagsRaw,
} from '@/types/venue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tiers that get the Appointments-plan peer model UI. */
function isAppointmentsPlanTier(tier: string | null): boolean {
  return tier === 'light' || tier === 'plus' || tier === 'appointments';
}

/**
 * Seed a calendar priority order from the saved `calendar_order`, then append any
 * calendars not present in it (so newly-added calendars show at the end) and drop
 * ids no longer in `calendars`. Mirrors the web settings section.
 */
function buildCalendarOrder(
  calendars: FeatureFlagsCalendar[],
  savedOrder: string[],
): string[] {
  const ids = new Set(calendars.map((c) => c.id));
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of savedOrder) {
    if (ids.has(id) && !seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }
  for (const c of calendars) {
    if (!seen.has(c.id)) {
      ordered.push(c.id);
      seen.add(c.id);
    }
  }
  return ordered;
}

/** Stable empty array so the feature-flags loading state doesn't churn deps. */
const EMPTY_CALENDARS: FeatureFlagsCalendar[] = [];

// ---------------------------------------------------------------------------
// Booking-model lists
// ---------------------------------------------------------------------------

/** Four peer models shown on Appointments-plan venues (none pinned read-only). */
const APPOINTMENTS_PLAN_MODELS: {
  model: BookingModel;
  label: string;
  hint: string;
  /** In-app route for "Manage →"; null = external web link */
  appRoute: string | null;
  webPath: string;
}[] = [
  {
    model: 'unified_scheduling',
    label: 'Appointments & services',
    hint: 'Take bookings against calendars, people, or rooms with services and durations.',
    appRoute: '/(app)/(tabs)/calendar',
    webPath: '/dashboard/calendar',
  },
  {
    model: 'event_ticket',
    label: 'Ticketed events',
    hint: 'Sell tickets for dated events from your public page.',
    appRoute: null,
    webPath: '/dashboard/event-manager',
  },
  {
    model: 'class_session',
    label: 'Classes & sessions',
    hint: 'Recurring or one-off classes with timetables and rosters.',
    appRoute: null,
    webPath: '/dashboard/class-timetable',
  },
  {
    model: 'resource_booking',
    label: 'Resources & facilities',
    hint: 'Bookable rooms, courts, or equipment by time window.',
    appRoute: null,
    webPath: '/dashboard/resource-timeline',
  },
];

/** Secondary models for non-Appointments-plan venues. */
const SECONDARY_MODELS: {
  model: BookingModel;
  label: string;
  hint: string;
}[] = [
  { model: 'class_session', label: 'Classes', hint: 'Group sessions with attendee capacity' },
  { model: 'event_ticket', label: 'Events', hint: 'Ticketed one-off experiences' },
  { model: 'resource_booking', label: 'Resources', hint: 'Bookable rooms or equipment' },
  { model: 'table_reservation', label: 'Tables', hint: 'Restaurant-style table bookings' },
];

const MODEL_LABELS: Record<string, string> = {
  table_reservation: 'Tables',
  practitioner_appointment: 'Appointments',
  unified_scheduling: 'Appointments',
  event_ticket: 'Events',
  class_session: 'Classes',
  resource_booking: 'Resources',
};

// ---------------------------------------------------------------------------
// Feature flag metadata
// ---------------------------------------------------------------------------

type WaitlistMode = 'notify_in_order' | 'staff_choose' | 'notify_all';

/**
 * Mode metadata mirrored from the web `WAITLIST_MODE_LABELS`
 * (`C:\Resneo/src/lib/booking/waitlist-config.ts`) so the in-app selector reads
 * identically to Settings → Features on the web dashboard. Order matches the
 * web `APPOINTMENT_WAITLIST_MODES` (staff_choose first).
 */
const WAITLIST_MODES: { mode: WaitlistMode; title: string; description: string }[] = [
  {
    mode: 'staff_choose',
    title: 'Staff choose',
    description:
      'When a slot opens, staff see a banner and choose who to offer it to — or use Offer appointment for the first matching guest.',
  },
  {
    mode: 'notify_in_order',
    title: 'First in line — notify in order',
    description:
      'The first matching guest is notified by email and SMS. If they do not book within 30 minutes, the next guest is notified. The slot stays open on your booking page throughout.',
  },
  {
    mode: 'notify_all',
    title: 'Offer to all',
    description:
      'Every matching guest is notified at once. The slot stays open — whoever books first gets it.',
  },
];

const FLAG_META: {
  key: AppointmentsFeatureFlagKey;
  title: string;
  description: string;
  /** If true, show toggle but mark it as web-only (disabled). */
  webOnly?: boolean;
}[] = [
  {
    key: 'any_available_practitioner',
    title: 'Any available practitioner',
    description:
      'Guests can book the next available slot without choosing a specific person. Available times are shared across everyone who offers that service.',
  },
  {
    key: 'staff_first_booking_flow',
    title: 'Staff-first booking',
    description:
      "Guests choose a team member first, then that person's services. Applies to your booking pages and to bookings you take yourself.",
  },
  {
    key: 'guest_self_reschedule',
    title: 'Guest self-reschedule',
    description:
      'Guests can change their appointment date and time from the link in their confirmation email.',
  },
  {
    key: 'waitlist_v2',
    title: 'Appointment waitlist',
    description:
      'When fully booked, guests can join a waitlist for their preferred date, time, and service.',
  },
  {
    key: 'class_commerce_enabled',
    title: 'Class packs, courses & memberships',
    description:
      'Prepaid class packs, fixed-session courses, and recurring membership plans. Manage from the web dashboard.',
    webOnly: true,
  },
  {
    key: 'card_hold_deposits',
    title: 'Card hold deposits',
    description:
      'Card on file with a chargeable no-show fee. No payment taken at booking. Adds a Card hold option when you set up services, classes, events, and resources.',
  },
];

function waitlistModeFromRaw(raw: VenueFeatureFlagsRaw): WaitlistMode {
  const mode = (raw as { waitlist_config?: { mode?: string } }).waitlist_config?.mode;
  if (mode === 'staff_choose' || mode === 'notify_in_order' || mode === 'notify_all') {
    return mode;
  }
  return 'notify_in_order';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// SectionDivider was defined but is not currently used in the rendered tree.
// Keeping it prefixed to satisfy the no-unused-vars rule without deleting the component.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SectionDivider() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: spacing.xs,
      }}
    />
  );
}

interface SettingRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  isLast?: boolean;
}

function SettingRow({ label, hint, value, onValueChange, disabled, isLast }: SettingRowProps) {
  const { colors } = useTheme();
  return (
    <>
      <View style={styles.settingRow}>
        <View style={styles.settingText}>
          <Text variant="bodyMedium">{label}</Text>
          {hint ? (
            <Text variant="caption" tone="muted">
              {hint}
            </Text>
          ) : null}
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          accessibilityLabel={label}
          trackColor={{ true: colors.brand }}
        />
      </View>
      {!isLast ? (
        <View
          style={[styles.rowDivider, { backgroundColor: colors.border }]}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Feature Flags Card
// ---------------------------------------------------------------------------

interface FeatureFlagsCardProps {
  resolvedFlags: ResolvedAppointmentsFeatureFlags;
  rawFlags: VenueFeatureFlagsRaw;
  disabled?: boolean;
}

function FeatureFlagsCard({ resolvedFlags, rawFlags, disabled }: FeatureFlagsCardProps) {
  const { colors } = useTheme();
  const updateFlags = useUpdateFeatureFlags();
  // GET feature-flags carries the bookable `calendars` list AND the saved
  // any-available config (incl. calendar_order) — the venue bootstrap does not.
  const featureFlags = useFeatureFlags();
  const calendars = featureFlags.data?.calendars ?? EMPTY_CALENDARS;
  const savedConfig = featureFlags.data?.any_available_practitioner_config;
  const [localResolved, setLocalResolved] =
    useState<ResolvedAppointmentsFeatureFlags>(resolvedFlags);
  const [localRaw, setLocalRaw] = useState<VenueFeatureFlagsRaw>(rawFlags);
  const [waitlistMode, setWaitlistMode] = useState<WaitlistMode>(() =>
    waitlistModeFromRaw(rawFlags),
  );
  const [anyAvailableMode, setAnyAvailableMode] = useState<'priority' | 'random'>(
    () =>
      ((rawFlags as { any_available_practitioner_config?: { mode?: string } })
        .any_available_practitioner_config?.mode as 'priority' | 'random') ?? 'priority',
  );
  // Calendar priority order (array of calendar ids). Seeded from the saved order,
  // with new calendars appended and removed calendars dropped.
  const [order, setOrder] = useState<string[]>(() =>
    buildCalendarOrder(calendars, savedConfig?.calendar_order ?? []),
  );
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Resync if parent venue refreshes (e.g. after invalidate).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalResolved(resolvedFlags);

    setLocalRaw(rawFlags);

    setWaitlistMode(waitlistModeFromRaw(rawFlags));
    const savedMode = (
      rawFlags as { any_available_practitioner_config?: { mode?: string } }
    ).any_available_practitioner_config?.mode;
    if (savedMode === 'priority' || savedMode === 'random') {

      setAnyAvailableMode(savedMode);
    }
  }, [resolvedFlags, rawFlags]);

  // Re-seed the priority order whenever the calendars list or saved order
  // changes (e.g. after a refetch following a save, or calendars added on web).
  const orderSyncKey = `${calendars.map((c) => c.id).join(',')}\u0000${(
    savedConfig?.calendar_order ?? []
  ).join(',')}`;
  const [appliedOrderSyncKey, setAppliedOrderSyncKey] = useState(orderSyncKey);
  if (orderSyncKey !== appliedOrderSyncKey) {
    setAppliedOrderSyncKey(orderSyncKey);
    setOrder(buildCalendarOrder(calendars, savedConfig?.calendar_order ?? []));
  }

  // Calendars in current priority order (drops ids not in the list).
  const orderedCalendars = (() => {
    const byId = new Map(calendars.map((c) => [c.id, c]));
    return order
      .map((id) => byId.get(id))
      .filter((c): c is FeatureFlagsCalendar => Boolean(c));
  })();

  async function persist(patch: VenueFeatureFlagsRaw, successMsg?: string): Promise<boolean> {
    setError(null);
    setSavedMsg(null);
    // Optimistic local update
    const nextResolved = { ...localResolved };
    for (const k of Object.keys(patch)) {
      const v = (patch as Record<string, unknown>)[k];
      if (typeof v === 'boolean') {
        (nextResolved as Record<string, boolean>)[k] = v;
      }
    }
    setLocalResolved(nextResolved);
    setLocalRaw(patch);
    try {
      const res = await updateFlags.mutateAsync(patch);
      if (res.resolved) {
        setLocalResolved(res.resolved as ResolvedAppointmentsFeatureFlags);
      }
      if (res.raw) {
        setLocalRaw(res.raw);
        setWaitlistMode(waitlistModeFromRaw(res.raw));
      }
      hapticSuccess();
      setSavedMsg(successMsg ?? 'Setting saved.');
      return true;
    } catch (e) {
      hapticWarning();
      // Revert optimistic update on error
      setLocalResolved(resolvedFlags);
      setLocalRaw(rawFlags);
      if (e instanceof ApiError && e.message.includes('cannot be switched off')) {
        setError(
          'This feature is turned on for your account by Resneo and cannot be switched off. Contact support if you need it changed.',
        );
      } else {
        setError(e instanceof Error ? e.message : 'Could not save feature flag.');
      }
      return false;
    }
  }

  function toggleFlag(key: AppointmentsFeatureFlagKey) {
    hapticTap();
    const nextEnabled = !localResolved[key];
    const patch: VenueFeatureFlagsRaw = { ...localRaw };
    if (nextEnabled) {
      patch[key] = true;
      if (key === 'waitlist_v2') {
        (patch as Record<string, unknown>).waitlist_config = { mode: waitlistMode };
      }
      void persist(
        patch,
        key === 'waitlist_v2'
          ? 'Waitlist is on. Adjust email/SMS under Settings → Communications → Waitlist invites.'
          : 'Setting saved.',
      );
    } else {
      patch[key] = false;
      if (key === 'any_available_practitioner') {
        delete (patch as Record<string, unknown>).any_available_practitioner_config;
      }
      if (key === 'waitlist_v2') {
        delete (patch as Record<string, unknown>).waitlist_config;
      }
      void persist(patch);
    }
  }

  function persistAnyAvailable(
    mode: 'priority' | 'random',
    calendarOrder: string[],
    successMsg?: string,
  ): Promise<boolean> {
    const patch: VenueFeatureFlagsRaw = {
      ...localRaw,
      any_available_practitioner: true,
      // Send the REAL ordered list of calendar ids. In random mode the order is
      // unused, but we keep it so a later switch back to priority is preserved.
      any_available_practitioner_config: { mode, calendar_order: calendarOrder },
    } as VenueFeatureFlagsRaw;
    return persist(patch, successMsg);
  }

  function saveAnyAvailableMode(mode: 'priority' | 'random') {
    hapticTap();
    setAnyAvailableMode(mode);
    void persistAnyAvailable(mode, order);
  }

  /** Swap a calendar with its neighbour (-1 up / +1 down) and persist. */
  function moveCalendar(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= orderedCalendars.length) return;
    hapticTap();
    // orderedCalendars is the visible (filtered) order; rebuild `order` from it
    // so dropped ids stay dropped after the move.
    const prev = order;
    const ids = orderedCalendars.map((c) => c.id);
    const tmp = ids[index];
    ids[index] = ids[target];
    ids[target] = tmp;
    setOrder(ids);
    void persistAnyAvailable('priority', ids, 'Priority order saved.').then((ok) => {
      // Roll back the optimistic reorder if the save failed.
      if (!ok) setOrder(prev);
    });
  }

  function saveWaitlistMode(mode: WaitlistMode) {
    hapticTap();
    setWaitlistMode(mode);
    const patch: VenueFeatureFlagsRaw = {
      ...localRaw,
      waitlist_v2: true,
      waitlist_config: { mode },
    } as VenueFeatureFlagsRaw;
    void persist(patch);
  }

  const isSaving = updateFlags.isPending;

  return (
    <Card>
      <Text variant="label">Optional booking features</Text>
      <Text variant="caption" tone="muted" style={styles.cardCaption}>
        Optional tools that change how guests experience booking online.
      </Text>

      {error ? (
        <Text
          variant="bodySmall"
          tone="danger"
          accessibilityRole="alert"
          style={styles.statusMsg}
        >
          {error}
        </Text>
      ) : null}
      {savedMsg && !error ? (
        <Text variant="bodySmall" tone="success" style={styles.statusMsg}>
          {savedMsg}
        </Text>
      ) : null}

      <View style={[styles.flagList, { borderColor: colors.border }]}>
        {FLAG_META.map(({ key, title, description, webOnly }, idx) => {
          const enabled = Boolean(localResolved[key]);
          const isLast = idx === FLAG_META.length - 1;
          return (
            <View key={key}>
              <View
                style={[
                  styles.flagRow,
                  { borderColor: colors.border },
                  !isLast && styles.flagRowBorder,
                ]}
              >
                <View style={styles.settingText}>
                  <Text variant="bodyMedium">{title}</Text>
                  <Text variant="caption" tone="muted">
                    {description}
                  </Text>
                  {webOnly ? (
                    <Text variant="caption" tone="brand" style={styles.webOnlyBadge}>
                      Manage from web dashboard
                    </Text>
                  ) : null}
                </View>
                <Switch
                  value={enabled}
                  onValueChange={() => toggleFlag(key)}
                  disabled={disabled || isSaving || webOnly}
                  accessibilityLabel={title}
                  trackColor={{ true: colors.brand }}
                />
              </View>

              {/* any_available_practitioner sub-panel */}
              {key === 'any_available_practitioner' && enabled ? (
                <View style={[styles.subPanel, { borderColor: colors.border, backgroundColor: colors.surfaceSunken }]}>
                  <Text variant="label" style={styles.subPanelTitle}>
                    Who gets the booking?
                  </Text>
                  <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
                    When several calendars are free, choose how the slot is assigned.
                  </Text>
                  {(['priority', 'random'] as const).map((mode) => {
                    const modeLabels = {
                      priority: {
                        title: 'Priority order',
                        hint: 'First available calendar in your priority list gets the booking.',
                      },
                      random: {
                        title: 'Random',
                        hint: 'Assigned randomly across available calendars.',
                      },
                    };
                    return (
                      <RadioRow
                        key={mode}
                        label={modeLabels[mode].title}
                        hint={modeLabels[mode].hint}
                        selected={anyAvailableMode === mode}
                        onPress={() => saveAnyAvailableMode(mode)}
                        disabled={isSaving}
                      />
                    );
                  })}

                  {/* Priority reorder list — only when mode = priority */}
                  {anyAvailableMode === 'priority' ? (
                    <View style={styles.priorityBlock}>
                      <Text
                        variant="caption"
                        tone="muted"
                        style={styles.priorityHeading}
                      >
                        CALENDAR PRIORITY
                      </Text>
                      <Text variant="caption" tone="muted">
                        Top of the list is checked first when a guest picks a time.
                      </Text>

                      {featureFlags.isLoading ? (
                        <Text
                          variant="caption"
                          tone="muted"
                          style={styles.priorityNote}
                        >
                          Loading calendars…
                        </Text>
                      ) : orderedCalendars.length === 0 ? (
                        <Text
                          variant="caption"
                          tone="muted"
                          style={styles.priorityNote}
                        >
                          Add active calendars under Calendar availability before
                          setting a priority order.
                        </Text>
                      ) : (
                        <View style={styles.priorityList}>
                          {orderedCalendars.map((cal, index) => {
                            const isFirst = index === 0;
                            const isLastCal = index === orderedCalendars.length - 1;
                            return (
                              <View
                                key={cal.id}
                                style={[
                                  styles.priorityRow,
                                  {
                                    borderColor: colors.border,
                                    backgroundColor: colors.surfaceRaised,
                                  },
                                ]}
                              >
                                <Text
                                  variant="bodyMedium"
                                  numberOfLines={1}
                                  style={styles.priorityName}
                                >
                                  {index + 1}. {cal.name}
                                </Text>
                                <View style={styles.priorityControls}>
                                  <IconButton
                                    icon={{
                                      ios: 'chevron.up',
                                      android: 'keyboard_arrow_up',
                                      web: 'keyboard_arrow_up',
                                    }}
                                    variant="bordered"
                                    size={36}
                                    iconSize={18}
                                    disabled={isSaving || isFirst}
                                    onPress={() => moveCalendar(index, -1)}
                                    accessibilityLabel={`Move ${cal.name} up`}
                                  />
                                  <IconButton
                                    icon={{
                                      ios: 'chevron.down',
                                      android: 'keyboard_arrow_down',
                                      web: 'keyboard_arrow_down',
                                    }}
                                    variant="bordered"
                                    size={36}
                                    iconSize={18}
                                    disabled={isSaving || isLastCal}
                                    onPress={() => moveCalendar(index, 1)}
                                    accessibilityLabel={`Move ${cal.name} down`}
                                  />
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* waitlist_v2 sub-panel */}
              {key === 'waitlist_v2' && enabled ? (
                <View style={[styles.subPanel, { borderColor: colors.border, backgroundColor: colors.surfaceSunken }]}>
                  <Text variant="label" style={styles.subPanelTitle}>
                    When a slot opens…
                  </Text>
                  {WAITLIST_MODES.map(({ mode, title: modeTitle, description: modeDesc }) => (
                    <RadioRow
                      key={mode}
                      label={modeTitle}
                      hint={modeDesc}
                      selected={waitlistMode === mode}
                      onPress={() => saveWaitlistMode(mode)}
                      disabled={isSaving}
                    />
                  ))}
                  <Text variant="caption" tone="muted" style={styles.waitlistNote}>
                    Waitlist email/SMS templates are under Settings → Communications.
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Small radio row used inside sub-panels
// ---------------------------------------------------------------------------

function RadioRow({
  label,
  hint,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  // Pressable (not Button): the shared Button only renders its `label` prop and
  // ignores children, so the radio's title/hint must live in a plain Pressable.
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      style={({ pressed }) => [
        styles.radioRow,
        {
          borderColor: selected ? colors.brand : colors.border,
          backgroundColor: selected ? colors.brandSubtle : colors.surfaceRaised,
          opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.radioInner} pointerEvents="none">
        <View
          style={[
            styles.radioCircle,
            {
              borderColor: selected ? colors.brand : colors.borderStrong,
              backgroundColor: selected ? colors.brand : 'transparent',
            },
          ]}
        />
        <View style={styles.settingText}>
          <Text variant="bodyMedium" color={selected ? colors.brand : colors.text}>
            {label}
          </Text>
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function BookingSettingsScreen() {
  const { venue, isLoading, refetch } = useVenueContext();
  const router = useRouter();
  const toast = useToast();
  const update = useUpdateVenue();
  const isAdmin = venue?.current_user_role === 'admin';
  const appointmentsPlan = isAppointmentsPlanTier(venue?.pricing_tier ?? null);
  const { colors } = useTheme();

  // --- Booking models state (lazy initialiser, no render-phase side effects) ---
  const [models, setModels] = useState<BookingModel[]>(() => {
    if (!venue) return [];
    return venue.active_booking_models?.length
      ? [...venue.active_booking_models]
      : [venue.booking_model];
  });

  // Resync if venue.id changes (e.g. after auth refresh or navigation).
  useEffect(() => {
    if (!venue) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModels(
      venue.active_booking_models?.length
        ? [...venue.active_booking_models]
        : [venue.booking_model],
    );
  }, [venue?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [requireLogin, setRequireLogin] = useState<boolean>(
    () => Boolean(venue?.require_account_login_for_bookings),
  );

  useEffect(() => {
    if (!venue) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRequireLogin(Boolean(venue.require_account_login_for_bookings));
  }, [venue?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsSaved, setModelsSaved] = useState(false);
  const [loginSaving, setLoginSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const header = <Stack.Screen options={{ headerShown: true, title: 'Booking settings' }} />;

  if (isLoading || !venue) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  if (!isAdmin) {
    return (
      <Screen>
        {header}
        <ErrorState message="Booking settings can only be changed by venue admins." />
      </Screen>
    );
  }

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------
  const primaryModel = venue.active_booking_models?.[0] ?? venue.booking_model;
  const primaryLabel = MODEL_LABELS[primaryModel] ?? primaryModel;

  const originalModels = venue.active_booking_models?.length
    ? venue.active_booking_models
    : [venue.booking_model];

  const hasModelChanges =
    JSON.stringify([...models].sort()) !== JSON.stringify([...originalModels].sort());

  // ---------------------------------------------------------------------------
  // Booking-model toggle
  // ---------------------------------------------------------------------------

  function toggleModel(model: BookingModel, enabled: boolean) {
    setModelsSaved(false);
    setModels((current) => {
      if (appointmentsPlan) {
        // Never allow deselecting the last active model.
        if (!enabled && current.length === 1) return current;
        return enabled ? [...current.filter((m) => m !== model), model] : current.filter((m) => m !== model);
      }
      const without = current.filter((m) => m !== model);
      return enabled ? [...without, model] : without;
    });
  }

  async function handleSaveModels() {
    if (!venue) return;
    setModelsError(null);
    setModelsSaved(false);
    const ordered = appointmentsPlan
      ? models
      : [primaryModel, ...models.filter((m) => m !== primaryModel)];
    try {
      await update.mutateAsync({ active_booking_models: ordered });
      hapticSuccess();
      setModelsSaved(true);
    } catch (e) {
      hapticWarning();
      // The server's own words, deliberately. PATCH /api/venue answers a blocked
      // toggle with `{ error: <prose> }` — it keeps the
      // BOOKING_MODEL_HAS_FUTURE_BOOKINGS code on the thrown error server-side and
      // never puts it on the wire, so the substring check that used to sit here
      // never matched and this fallback was always the live path.
      //
      // That is now the better path: the guard tallies every match before
      // reporting, so the message names the model, the count and the next
      // booking ("Appointments cannot be turned off yet. You have 12 upcoming
      // bookings of that type, the next on Thu 13 Aug 2026 at 9:30am."). Do not
      // re-add a special case here — any local copy is vaguer than what arrives.
      setModelsError(e instanceof ApiError ? e.message : 'Could not save booking types.');
    }
  }

  // ---------------------------------------------------------------------------
  // Require login autosave (immediate, matching web behaviour)
  // ---------------------------------------------------------------------------

  async function handleRequireLoginChange(value: boolean) {
    hapticTap();
    setRequireLogin(value);
    setLoginSaving(true);
    try {
      await update.mutateAsync({ require_account_login_for_bookings: value });
      hapticSuccess();
    } catch (e) {
      hapticWarning();
      // Revert on error
      setRequireLogin(!value);
      toast.error(
        e instanceof ApiError ? e.message : 'Could not update guest sign-in requirement.',
      );
    } finally {
      setLoginSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // "Manage →" navigation per model
  // ---------------------------------------------------------------------------

  function handleManageModel(item: (typeof APPOINTMENTS_PLAN_MODELS)[number]) {
    hapticTap();
    if (item.appRoute) {
      router.push(item.appRoute as Parameters<typeof router.push>[0]);
    } else {
      // EXPO_PUBLIC_WEB_URL is the web dashboard origin (e.g. https://app.resneo.com).
      // Fall back to EXPO_PUBLIC_API_URL only if the web URL is not explicitly set,
      // but never blindly strip '/api' from the API origin as that breaks the hostname.
      const webUrl =
        process.env.EXPO_PUBLIC_WEB_URL ??
        process.env.EXPO_PUBLIC_API_URL ??
        '';
      void Linking.openURL(`${webUrl.replace(/\/$/, '')}${item.webPath}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Render booking model list
  // ---------------------------------------------------------------------------

  const renderBookingModels = () => {
    if (appointmentsPlan) {
      // All four models are peers — none is pinned read-only.
      return (
        <Card>
          <Text variant="label">Booking models</Text>
          <Text variant="caption" tone="muted" style={styles.cardCaption}>
            Your Appointments plan includes appointments, classes, events, and resources. Choose
            which models are active on your booking page.
          </Text>
          <View style={styles.section}>
            {APPOINTMENTS_PLAN_MODELS.map((row, idx) => {
              const active = models.includes(row.model);
              const isLast = idx === APPOINTMENTS_PLAN_MODELS.length - 1;
              return (
                <View key={row.model}>
                  <View style={styles.settingRow}>
                    <View style={styles.settingText}>
                      <Text variant="bodyMedium">{row.label}</Text>
                      <Text variant="caption" tone="muted">
                        {row.hint}
                      </Text>
                    </View>
                    <View style={styles.rowActions}>
                      {active ? (
                        <Button
                          label="Manage"
                          variant="ghost"
                          size="sm"
                          haptic={false}
                          onPress={() => handleManageModel(row)}
                          style={styles.manageBtn}
                        />
                      ) : null}
                      <Switch
                        value={active}
                        onValueChange={(v) => toggleModel(row.model, v)}
                        accessibilityLabel={`Enable ${row.label}`}
                        trackColor={{ true: colors.brand }}
                        // Must keep at least one model active
                        disabled={active && models.length === 1}
                      />
                    </View>
                  </View>
                  {!isLast ? (
                    <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
                  ) : null}
                </View>
              );
            })}
          </View>

          {modelsError ? (
            <Text
              variant="bodySmall"
              tone="danger"
              accessibilityRole="alert"
              style={{ marginTop: spacing.sm }}
            >
              {modelsError}
            </Text>
          ) : null}
          {modelsSaved && !hasModelChanges ? (
            <Text variant="bodySmall" tone="success" style={{ marginTop: spacing.sm }}>
              Saved.
            </Text>
          ) : null}

          <Button
            label="Save booking models"
            fullWidth
            loading={update.isPending}
            disabled={!hasModelChanges}
            onPress={() => void handleSaveModels()}
            style={{ marginTop: spacing.base }}
          />
        </Card>
      );
    }

    // Non-Appointments-plan: primary is read-only, secondaries are toggleable.
    return (
      <>
        <Card>
          <View style={styles.primaryRow}>
            <View style={styles.settingText}>
              <Text variant="label">Primary booking type</Text>
              <Text variant="caption" tone="muted">
                Set by your plan. To change it, contact support.
              </Text>
            </View>
            <Badge label={primaryLabel} tone="brand" />
          </View>
        </Card>

        <Card>
          <Text variant="label">Also offer on your booking page</Text>
          <Text variant="caption" tone="muted" style={styles.cardCaption}>
            Switching a type on adds it to your public booking page. Its catalogue is set up on the
            web dashboard.
          </Text>
          <View style={styles.section}>
            {SECONDARY_MODELS.filter((row) => row.model !== primaryModel).map((row, idx, arr) => (
              <SettingRow
                key={row.model}
                label={row.label}
                hint={row.hint}
                value={models.includes(row.model)}
                onValueChange={(v) => toggleModel(row.model, v)}
                isLast={idx === arr.length - 1}
              />
            ))}
          </View>

          {modelsError ? (
            <Text
              variant="bodySmall"
              tone="danger"
              accessibilityRole="alert"
              style={{ marginTop: spacing.sm }}
            >
              {modelsError}
            </Text>
          ) : null}
          {modelsSaved && !hasModelChanges ? (
            <Text variant="bodySmall" tone="success" style={{ marginTop: spacing.sm }}>
              Saved.
            </Text>
          ) : null}

          <Button
            label="Save changes"
            fullWidth
            loading={update.isPending}
            disabled={!hasModelChanges}
            onPress={() => void handleSaveModels()}
            style={{ marginTop: spacing.base }}
          />
        </Card>
      </>
    );
  };

  // ---------------------------------------------------------------------------
  // Feature flags: only on Appointments-plan venues
  // ---------------------------------------------------------------------------
  const resolvedFlags = venue.feature_flags?.resolved as ResolvedAppointmentsFeatureFlags | undefined;
  const rawFlags = venue.feature_flags?.raw as VenueFeatureFlagsRaw | undefined;

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              refetch();
              setRefreshing(false);
            }}
            tintColor={colors.brand}
          />
        }>
        {renderBookingModels()}

        <Card>
          <Text variant="label">Guest accounts</Text>
          <SettingRow
            label="Require sign-in to book"
            hint="Guests must verify their email before completing an online booking."
            value={requireLogin}
            onValueChange={(v) => void handleRequireLoginChange(v)}
            disabled={loginSaving}
            isLast
          />
        </Card>

        {appointmentsPlan && resolvedFlags && rawFlags ? (
          <FeatureFlagsCard
            resolvedFlags={resolvedFlags}
            rawFlags={rawFlags}
            disabled={false}
          />
        ) : null}

        <View style={styles.spacer} />
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  cardCaption: {
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  section: {
    gap: 0,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  settingText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  manageBtn: {
    paddingHorizontal: spacing.sm,
    minHeight: 36,
  },
  statusMsg: {
    marginTop: spacing.sm,
  },
  flagList: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
  },
  flagRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  webOnlyBadge: {
    marginTop: 2,
  },
  subPanel: {
    margin: spacing.sm,
    marginTop: 0,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  subPanelTitle: {
    marginBottom: spacing.xs,
  },
  waitlistNote: {
    marginTop: spacing.xs,
  },
  radioRow: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    borderRadius: radius.sm,
    minHeight: 44,
    justifyContent: 'flex-start',
  },
  radioInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flex: 1,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    marginTop: 2,
  },
  priorityBlock: {
    marginTop: spacing.sm,
    gap: 2,
  },
  priorityHeading: {
    letterSpacing: 0.5,
  },
  priorityNote: {
    marginTop: spacing.xs,
  },
  priorityList: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  priorityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  priorityName: {
    flex: 1,
    minWidth: 0,
  },
  priorityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  spacer: {
    height: spacing.xl,
  },
});
