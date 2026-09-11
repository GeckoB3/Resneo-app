import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HoursMismatchAdvice } from '@/components/availability/HoursMismatchAdvice';
import { AvailabilityBlocksSection } from '@/components/manage/AvailabilityBlocksSection';
import { OpeningHoursEditor } from '@/components/manage/OpeningHoursEditor';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError, isRequiresConfirmationBody } from '@/lib/api/client';
import { describeVenueWeeklyMismatch } from '@/lib/calendar/hours-mismatch';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useUpdateOpeningHours } from '@/lib/queries/useVenueSettings';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { OpeningHours, OpeningHoursDay } from '@/types/venue';

/**
 * Normalize a stored day to the canonical `{closed}` / `{periods}` shape. The
 * backend (and `validate`) only accept those two; older venue rows may still
 * hold a legacy day-level `{ open, close }`. The web canonicalizes on load
 * (getDayConfig) — do the same here so an UNTOUCHED legacy day can't 400 the
 * whole save and drop the admin's other edits.
 */
function canonicalDay(day: OpeningHoursDay | undefined): OpeningHoursDay | undefined {
  if (!day) return day;
  if ('closed' in day && day.closed === true) return { closed: true };
  if ('periods' in day && Array.isArray(day.periods)) return day;
  const legacy = day as unknown as { open?: string; close?: string };
  if (legacy.open && legacy.close) return { periods: [{ open: legacy.open, close: legacy.close }] };
  return day;
}

const WEEKDAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'] as const;

/**
 * All seven days, every time — the web seeds each day through `getDayConfig`
 * (a missing day reads as closed) and `toOpeningHours` writes all seven on
 * save. A PARTIAL map is read two ways downstream: the booking engine treats a
 * missing weekday as closed, while the calendar-hours editor reads it as "no
 * business hours set" and shows no context or warning for that day. Writing the
 * full week keeps the two in step.
 */
function canonicalizeOpeningHours(raw: OpeningHours | null | undefined): OpeningHours {
  const out: OpeningHours = {};
  for (const key of WEEKDAY_KEYS) {
    out[key] = canonicalDay(raw?.[key]) ?? { closed: true };
  }
  return out;
}

/**
 * Client-side check, matching what the server actually rejects.
 *
 * The ONLY rule is `open < close` per period — that is all
 * `openingHoursPeriodSchema` enforces, and the resolver unions a day's periods
 * in whatever order they arrive. This also used to refuse "the second period
 * must start after the first one ends", a rule web has at no layer, which meant
 * the app could block a save the server would have accepted. Web keeps periods
 * ordered by construction instead (`nextPeriodAfter`), which
 * `OpeningHoursEditor` now does too.
 *
 * Days are no longer capped at two periods, so this checks every one of them.
 */
function validate(hours: OpeningHours): string | null {
  for (const day of Object.values(hours)) {
    if (!day || ('closed' in day && day.closed === true)) continue;
    if ('periods' in day) {
      for (const period of day.periods) {
        if (period.open >= period.close) {
          return `Close time must be after open time (${period.open}–${period.close}).`;
        }
      }
    }
  }
  return null;
}

/** Business hours — weekly opening-hours editor (admin) / read-only view (staff). */
export default function BusinessHoursScreen() {
  const { venue, isLoading, refetch } = useVenueContext();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const update = useUpdateOpeningHours();
  const isAdmin = venue?.current_user_role === 'admin';
  /** `?date=` from the diary's clock button: the closures card opens with that day picked. */
  const params = useLocalSearchParams<{ date?: string | string[] }>();
  const seededDate = Array.isArray(params.date) ? params.date[0] : params.date;
  // The roster, for the advice after a save: which calendars the new weekly
  // hours leave outside (web `venueWeeklyAdvice`, 2026-09-10).
  const rosterQuery = usePractitioners({ enabled: isAdmin });
  /** After a save: which calendars the new hours leave outside (guests cannot book those hours). */
  const [advice, setAdvice] = useState<string | null>(null);
  /**
   * Sent here by the diary's clock button: scroll to the closures card, since
   * the web's dialog opens on its "Closures & amended hours" tab and landing on
   * the weekly editor would hide what was asked for. Once per arrival.
   */
  const scrollRef = useRef<ScrollView>(null);
  const [closuresY, setClosuresY] = useState<number | null>(null);
  const scrolledToClosures = useRef(false);
  useEffect(() => {
    if (!seededDate || closuresY == null || scrolledToClosures.current) return;
    scrolledToClosures.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, closuresY - spacing.base), animated: true });
  }, [seededDate, closuresY]);

  // Seed draft via useEffect to avoid setState-during-render in React 18 strict mode.
  const [draft, setDraft] = useState<OpeningHours | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Save anyway?" — when narrowing hours orphans upcoming bookings the route
  // replies 409 `{ requires_confirmation, message }`. We surface the message in
  // a ConfirmSheet and re-save with `acknowledge: true`. (Alert.alert's confirm
  // is a no-op on web, so this uses the Sheet — web parity with window.confirm.)
  const [ackConfirm, setAckConfirm] = useState<{ message: string } | null>(null);

  useEffect(() => {
    if (venue && draft === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(canonicalizeOpeningHours(venue.opening_hours));
    }
  }, [venue, draft]);

  // Compare canonical-to-canonical so a legacy-shape venue isn't flagged dirty on load.
  const original = JSON.stringify(canonicalizeOpeningHours(venue?.opening_hours));
  const hasChanges = draft !== null && JSON.stringify(draft) !== original;

  function markSaved() {
    hapticSuccess();
    setSaved(true);
    if (draft) {
      setAdvice(describeVenueWeeklyMismatch(rosterQuery.data?.practitioners ?? [], draft));
    }
    // Auto-clear the success message after 2500 ms so it doesn't linger indefinitely.
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2500);
  }

  async function handleSave() {
    if (!draft) return;
    setError(null);
    setSaved(false);
    const validation = validate(draft);
    if (validation) {
      setError(validation);
      hapticWarning();
      return;
    }
    try {
      await update.mutateAsync(draft);
      markSaved();
    } catch (e) {
      // 409 with requires_confirmation → ask, then re-save acknowledged.
      if (e instanceof ApiError && e.status === 409 && isRequiresConfirmationBody(e.body)) {
        hapticWarning();
        setAckConfirm({
          message:
            e.body.message ??
            'Some upcoming bookings fall outside the new hours. Save these hours anyway?',
        });
        return;
      }
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save opening hours.');
    }
  }

  /** User confirmed the orphan-bookings warning — re-save with the acknowledge flag. */
  async function handleConfirmAck() {
    if (!draft) return;
    try {
      await update.mutateAsync({ ...draft, acknowledge: true });
      setAckConfirm(null);
      markSaved();
    } catch (e) {
      setAckConfirm(null);
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save opening hours.');
    }
  }

  const header = <Stack.Screen options={{ headerShown: true, title: 'Business hours' }} />;

  if (isLoading || draft === null) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  return (
    /* `bottomInset={false}`: the sticky save bar below already pads past the
       home indicator. Letting `Screen` reserve it too left a dead strip under
       the Save button and shortened the scroll viewport by the same amount. */
    <Screen scroll={false} padded={false} bottomInset={false}>
      {header}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
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

        {/* ---- Weekly hours card ---- */}
        <View style={styles.sectionHeader}>
          <Text variant="heading">Weekly opening hours</Text>
          <Text variant="bodySmall" tone="secondary">
            Set the hours you are normally open each day. This is used for availability and guest
            messaging — review carefully before publishing.
          </Text>
        </View>

        <Card style={hasChanges ? [styles.cardUnsaved, { borderColor: colors.warning }] : undefined}>
          {hasChanges ? (
            <Text variant="caption" tone="muted" style={styles.unsavedHint}>
              Unsaved changes
            </Text>
          ) : null}
          <OpeningHoursEditor
            value={draft}
            editable={isAdmin && !update.isPending}
            onChange={(next) => {
              setDraft(next);
              setSaved(false);
            }}
          />
        </Card>

        {error ? (
          <Text variant="bodySmall" tone="danger">
            {error}
          </Text>
        ) : null}
        {saved && !hasChanges ? (
          <Text variant="bodySmall" tone="success">
            Hours saved.
          </Text>
        ) : null}
        <HoursMismatchAdvice
          message={advice}
          actionLabel="Open calendar hours"
          actionHref={{ pathname: '/availability', params: { tab: 'hours' } }}
          onDismiss={() => setAdvice(null)}
        />

        {/* ---- Closures & amended hours card ---- */}
        <View onLayout={(e) => setClosuresY(e.nativeEvent.layout.y)}>
          <AvailabilityBlocksSection isAdmin={isAdmin} initialDate={seededDate ?? null} />
        </View>

        <View style={styles.spacer} />
      </ScrollView>

      {/* Sticky save bar — keeps the explicit save action in reach while the
          admin reviews the full week. Disabled until the draft is dirty. */}
      {isAdmin ? (
        <View
          style={[
            styles.stickyBar,
            {
              backgroundColor: colors.surfaceRaised,
              borderTopColor: colors.border,
              paddingBottom: spacing.md + insets.bottom,
            },
          ]}>
          <Button
            label="Save opening hours"
            fullWidth
            loading={update.isPending}
            disabled={!hasChanges}
            onPress={() => void handleSave()}
          />
        </View>
      ) : null}

      {/* "Save anyway?" — orphan-bookings confirmation (409 requires_confirmation). */}
      <ConfirmSheet
        visible={ackConfirm != null}
        title="Save these hours anyway?"
        message={ackConfirm?.message}
        confirmLabel="Save anyway"
        destructive={false}
        loading={update.isPending}
        onConfirm={() => void handleConfirmAck()}
        onClose={() => {
          if (!update.isPending) setAckConfirm(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  sectionHeader: {
    gap: spacing.xs,
  },
  cardUnsaved: {
    borderWidth: 2,
  },
  unsavedHint: {
    marginBottom: spacing.sm,
  },
  spacer: {
    height: spacing.xl,
  },
  stickyBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
});
