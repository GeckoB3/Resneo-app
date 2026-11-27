import { useRouter } from 'expo-router';
import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { StyleSheet, View } from 'react-native';

import { type BlockTarget } from '@/components/calendar/BlockEditSheet';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { newBookingParams } from '@/lib/booking/new-booking-params';
import { newBookingActionLabel } from '@/lib/booking/terminology';
import { collectiveBookingParams, collectiveBookingTargetFor } from '@/lib/linked/collective-booking-target';
import { ROLES_COPY, type DiaryScope } from '@/lib/roles/roles';
import { spacing } from '@/theme/index';
import type { StaffCollectiveSummary } from '@/types/linked-venues';
import type { Practitioner } from '@/types/practitioner';
import type { Resource } from '@/types/resources-manage';
import type { VenueBootstrap, VenueTerminology } from '@/types/venue';

/** What the add-action sheet was opened for. */
export type AddSheetTarget =
  | { kind: 'fab' }
  | { kind: 'slot'; time: string; practitionerId: string };

export interface DiaryAddSheetProps {
  addSheetTarget: AddSheetTarget | null;
  closeAddSheet: () => void;
  nowMinutes: number | null;
  diary: DiaryScope;
  blockableCalendars: Practitioner[];
  linkedContextActive: boolean;
  staffCollective: StaffCollectiveSummary | null;
  venue: VenueBootstrap | null;
  activeResources: Resource[];
  anchor: string;
  terminology: VenueTerminology;
  isAppointmentVenue: boolean;
  collectiveParamsFor: (calendarId: string | null) => ReturnType<typeof collectiveBookingParams>;
  setBlockTarget: Dispatch<SetStateAction<BlockTarget | null>>;
  effectiveId: string | null;
}

/**
 * The diary's add-action sheet (FAB and empty-slot tap): New booking, Walk-in,
 * Block time and the column's resources. Moved out of the diary screen
 * unchanged (codebase standards P5.2).
 */
export function DiaryAddSheet({
  addSheetTarget,
  closeAddSheet,
  nowMinutes,
  diary,
  blockableCalendars,
  linkedContextActive,
  staffCollective,
  venue,
  activeResources,
  anchor,
  terminology,
  isAppointmentVenue,
  collectiveParamsFor,
  setBlockTarget,
  effectiveId,
}: DiaryAddSheetProps) {
  const router = useRouter();

  const nowTime =
    nowMinutes != null
      ? `${String(Math.floor(nowMinutes / 60)).padStart(2, '0')}:${String(nowMinutes % 60).padStart(2, '0')}`
      : '12:00';

  const addSheetSlot = addSheetTarget?.kind === 'slot' ? addSheetTarget : null;
  /**
   * A slot on someone else's column, for a View only or Hidden person (§5.11). It opens only when
   * the column hosts a resource (see `refusedOnOthersColumn`), and then offers just those.
   */
  const addSheetLookOnly = addSheetSlot != null && !diary.allows(addSheetSlot.practitionerId || null);
  const addSheetCanBlock = addSheetSlot
    ? blockableCalendars.some((c) => c.id === addSheetSlot.practitionerId)
    : !linkedContextActive && blockableCalendars.length > 0;
  // The collective this sheet's New and Walk-in book for, when one takes the
  // booking (the same rule `collectiveParamsFor` applies), so the sheet can say
  // so: from a partner's linked view the FAB is the only way to it.
  const addSheetCollective = collectiveBookingTargetFor(
    staffCollective,
    venue?.id,
    addSheetSlot?.practitionerId ?? null,
  );

  // Resources hosted on the tapped slot's calendar column → "Book <resource>"
  // entries in the empty-slot menu (web parity: `resourcesHere`). Empty when the
  // FAB opened the sheet, or when no resource is displayed on that column.
  const slotResources = useMemo(
    () =>
      addSheetSlot
        ? activeResources.filter((r) => r.display_on_calendar_id === addSheetSlot.practitionerId)
        : [],
    [addSheetSlot, activeResources],
  );

  // Route to the resource booking flow with the resource pre-selected and the
  // tapped day prefilled (web parity: book a resource straight from the slot).
  // The resource flow reads `?resourceId`/`?tab=resource`; the date primes the
  // wizard's anchor day. (Exact slot time isn't a resource-flow param yet — the
  // user picks the length+time on the resource's own availability grid.)
  const bookResourceAtSlot = useCallback(
    (resourceId: string) => {
      closeAddSheet();
      router.push({
        pathname: '/booking/new',
        params: { tab: 'resource', resourceId, date: anchor },
      });
    },
    [closeAddSheet, router, anchor],
  );

  return (
    <Sheet visible={addSheetTarget !== null} onClose={closeAddSheet}>
      <Text variant="subheading">
        {addSheetSlot ? `Add at ${addSheetSlot.time}` : 'Add to calendar'}
      </Text>
      {/* Where the booking lands when a live collective takes it (web parity
          with the linked slot sheet: the destination is said out loud). */}
      {addSheetCollective ? (
        <Text variant="caption" tone="muted" style={styles.addSheetSectionLabel}>
          {`For ${addSheetCollective.name}: every member business's calendars and the combined services`}
        </Text>
      ) : null}
      <View style={styles.addSheetActions}>
        {addSheetLookOnly ? (
          // View only and Hidden (§5.11): a slot on someone else's column books only its
          // resources here, so say why New booking, Walk-in and Block time are missing.
          <Text variant="bodySmall" tone="secondary">
            {ROLES_COPY['diary.new']}
          </Text>
        ) : (
          <>
            <Button
              label={newBookingActionLabel(terminology, isAppointmentVenue)}
              variant="primary"
              fullWidth
              onPress={() => {
                const slot = addSheetSlot;
                closeAddSheet();
                router.push({
                  pathname: '/booking/new',
                  params: {
                    // A live collective takes the booking (web 2026-09-04): New
                    // and Walk-in open the form over the whole collective, a slot
                    // on one of its calendars with that calendar preselected.
                    ...collectiveParamsFor(slot?.practitionerId || null),
                    ...newBookingParams({ date: anchor, slot }),
                  },
                });
              }}
            />
            {/* Walk-in — slot-aware: starts at the TAPPED slot time when a slot
                opened the sheet, else "now" (FAB). Web parity: the slot menu offers
                a Walk-in at that exact time, not the current time. */}
            <Button
              label="Walk-in"
              variant="secondary"
              fullWidth
              onPress={() => {
                const slot = addSheetSlot;
                closeAddSheet();
                router.push({
                  pathname: '/booking/new',
                  params: {
                    ...collectiveParamsFor(slot?.practitionerId || null),
                    ...newBookingParams({
                      date: anchor,
                      slot,
                      fallbackTime: nowTime,
                      intent: 'walk-in',
                    }),
                  },
                });
              }}
            />
            {/* Block time — on a slot, fills in its column and time; from the FAB,
                the sheet asks. Only where this person may block (the route refuses
                a calendar they do not manage), never on another venue's diary. */}
            {addSheetCanBlock ? (
              <Button
                label="Block time"
                variant="secondary"
                fullWidth
                onPress={() => {
                  const slot = addSheetSlot;
                  closeAddSheet();
                  setBlockTarget({
                    mode: 'create',
                    practitionerId: slot?.practitionerId ?? effectiveId,
                    date: anchor,
                    startTime: slot?.time ?? null,
                  });
                }}
              />
            ) : null}
          </>
        )}

        {/* "Book <resource>" — one button per resource hosted on the tapped
            column (web parity: `resourcesHere`). Routes to the resource flow
            with the resource pre-selected and the day prefilled. */}
        {slotResources.length > 0 ? (
          <>
            <Text variant="caption" tone="muted" style={styles.addSheetSectionLabel}>
              Book a resource
            </Text>
            {slotResources.map((r) => (
              <Button
                key={r.id}
                label={`Book ${r.name}`}
                variant="secondary"
                fullWidth
                onPress={() => bookResourceAtSlot(r.id)}
              />
            ))}
          </>
        ) : null}

        <Button label="Cancel" variant="ghost" fullWidth onPress={closeAddSheet} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  addSheetActions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  addSheetSectionLabel: {
    marginTop: spacing.xs,
  },
});
