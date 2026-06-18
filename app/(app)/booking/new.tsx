import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ClassBookingFlow } from '@/components/booking-wizard/ClassBookingFlow';
import { EventBookingFlow } from '@/components/booking-wizard/EventBookingFlow';
import { ResourceBookingFlow } from '@/components/booking-wizard/ResourceBookingFlow';
import { ServiceBookingFlow } from '@/components/booking-wizard/ServiceBookingFlow';
import { BookingTypeTabs, type BookingFlowType } from '@/components/booking-wizard/BookingTypeTabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { ANALYTICS_EVENTS, track } from '@/lib/analytics';
import { useBookingFormVenue } from '@/lib/queries/useBookingFormVenue';
import { LinkedVenueContext, useLinkedVenueContext } from '@/providers/LinkedVenueProvider';

const APPOINTMENT_PLAN_TIERS = new Set(['appointments', 'light', 'plus']);
const APPOINTMENT_MODELS = ['practitioner_appointment', 'unified_scheduling'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Tier- or model-based appointment exposure (matches the old screen's gate). */
function isAppointmentVenue(
  pricingTier: string | null | undefined,
  bookingModel: string | null | undefined,
): boolean {
  const tier = (pricingTier ?? '').toLowerCase().trim();
  if (APPOINTMENT_PLAN_TIERS.has(tier)) return true;
  if (bookingModel && APPOINTMENT_MODELS.includes(bookingModel)) return true;
  return false;
}

function modelToTab(model: string | null | undefined): BookingFlowType {
  switch (model) {
    case 'class_session':
      return 'class';
    case 'event_ticket':
      return 'event';
    case 'resource_booking':
      return 'resource';
    default:
      return 'service';
  }
}

const VALID_TYPE_PARAMS: BookingFlowType[] = ['service', 'class', 'event', 'resource'];

/**
 * New-booking screen. Renders the SAME multi-model wizard for the staff's own
 * venue and for a linked ("owner") venue — mirroring the web staff booking
 * surface (`StaffSurfaceBookingStack` + `linkedOwnerVenueId`).
 *
 * A linked venue is targeted via the `ownerVenueId` route param (e.g. the
 * "New booking" button on a linked calendar), which overrides the linked-venue
 * context for this screen's subtree only — so the catalog, availability, tabs
 * and create call all scope to that venue without disturbing the global
 * selection. Falls back to the active linked context when no param is given.
 */
export default function NewBookingScreen() {
  const linked = useLinkedVenueContext();
  const { ownerVenueId: ownerVenueIdParam, ownerVenueName: ownerVenueNameParam } =
    useLocalSearchParams<{ ownerVenueId?: string; ownerVenueName?: string }>();

  const paramOwnerId =
    typeof ownerVenueIdParam === 'string' && UUID_RE.test(ownerVenueIdParam)
      ? ownerVenueIdParam
      : null;
  const targetOwnerId = paramOwnerId ?? linked.ownerVenueId;
  const targetOwnerName = paramOwnerId
    ? typeof ownerVenueNameParam === 'string'
      ? ownerVenueNameParam
      : null
    : linked.ownerVenueName;

  // Scope the linked context to the targeted venue for this screen only. The
  // global provider higher up still owns persistence/sign-out; this just shadows
  // `ownerVenueId` for the form (and every hook it calls).
  const overridden = useMemo(
    () => ({ ...linked, ownerVenueId: targetOwnerId, ownerVenueName: targetOwnerName }),
    [linked, targetOwnerId, targetOwnerName],
  );

  return (
    <LinkedVenueContext.Provider value={overridden}>
      <NewBookingForm />
    </LinkedVenueContext.Provider>
  );
}

function NewBookingForm() {
  const router = useRouter();
  const form = useBookingFormVenue();
  const {
    type: typeParam,
    practitionerId: practitionerIdParam,
    time: timeParam,
    intent: intentParam,
  } = useLocalSearchParams<{
    type?: string;
    practitionerId?: string;
    time?: string;
    intent?: string;
  }>();

  // Funnel entry — fire once when the booking screen opens, regardless of tab.
  useEffect(() => {
    track(ANALYTICS_EVENTS.createBookingStarted);
  }, []);

  // The tabs to show, derived from the effective venue's enabled booking models
  // (own venue, or the linked venue's resolved mode).
  const tabs = useMemo<BookingFlowType[]>(() => {
    if (!form.venueId) return [];
    const enabled = new Set<string>([
      ...form.enabledModels,
      ...(form.bookingModel ? [form.bookingModel] : []),
    ]);
    // Order mirrors the web staff booking surface (Appointments → Class → Event → Resource).
    const out: BookingFlowType[] = [];
    if (
      isAppointmentVenue(form.pricingTier, form.bookingModel) ||
      enabled.has('unified_scheduling') ||
      enabled.has('practitioner_appointment')
    ) {
      out.push('service');
    }
    if (enabled.has('class_session')) out.push('class');
    if (enabled.has('event_ticket')) out.push('event');
    if (enabled.has('resource_booking')) out.push('resource');
    return out;
  }, [form.venueId, form.enabledModels, form.bookingModel, form.pricingTier]);

  // The user's explicit tab choice (null until they tap a tab).
  const [activeTab, setActiveTab] = useState<BookingFlowType | null>(null);

  // The tab to render: the user's choice when still valid, else a sensible
  // default — an explicit ?type=, an appointment deep-link (calendar tap /
  // walk-in intent) → Appointments, else the venue's primary model.
  const resolvedTab = useMemo<BookingFlowType | null>(() => {
    if (tabs.length === 0) return null;
    if (activeTab && tabs.includes(activeTab)) return activeTab;

    const fromParam =
      typeof typeParam === 'string' && VALID_TYPE_PARAMS.includes(typeParam as BookingFlowType)
        ? (typeParam as BookingFlowType)
        : null;
    if (fromParam && tabs.includes(fromParam)) return fromParam;

    const appointmentDeepLink = Boolean(practitionerIdParam || timeParam || intentParam);
    if (appointmentDeepLink && tabs.includes('service')) return 'service';

    const primaryTab = modelToTab(form.bookingModel);
    return tabs.includes(primaryTab) ? primaryTab : tabs[0]!;
  }, [tabs, activeTab, typeParam, practitionerIdParam, timeParam, intentParam, form.bookingModel]);

  const handleCreated = (bookingId: string) => {
    router.replace(`/booking/${bookingId}` as Href);
  };

  // Own venue still loading, or the linked venue's profile still fetching.
  if (form.isLoading) {
    return (
      <Screen>
        <LoadingState message="Loading venue…" />
      </Screen>
    );
  }

  // The link does not grant create permission (server returns 403 from the
  // linked venue-profile). Mirrors the web copy.
  if (form.isForbidden) {
    return (
      <Screen>
        <ErrorState
          message={`This link does not allow creating bookings${
            form.venueName ? ` in ${form.venueName}` : ''
          }.`}
        />
      </Screen>
    );
  }

  if (form.error) {
    return (
      <Screen>
        <ErrorState message={form.error} />
      </Screen>
    );
  }

  if (!form.venueId) {
    return (
      <Screen>
        <ErrorState message="Venue details are not available yet." />
      </Screen>
    );
  }

  // No bookable models enabled — guide the user to turn one on in Settings.
  if (tabs.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="No booking types enabled"
          message="Enable Appointments, Classes, Events or Resources for this venue to start taking bookings."
        />
      </Screen>
    );
  }

  // tabs is non-empty here, so resolvedTab is always set; fall back defensively.
  const tab: BookingFlowType = resolvedTab ?? tabs[0]!;

  return (
    <Screen>
      <View style={styles.container}>
        {tabs.length > 1 ? (
          <BookingTypeTabs tabs={tabs} active={tab} onChange={setActiveTab} />
        ) : null}
        <View style={styles.flow}>
          {tab === 'service' ? <ServiceBookingFlow onCreated={handleCreated} /> : null}
          {tab === 'class' ? <ClassBookingFlow onCreated={handleCreated} /> : null}
          {tab === 'event' ? <EventBookingFlow onCreated={handleCreated} /> : null}
          {tab === 'resource' ? <ResourceBookingFlow onCreated={handleCreated} /> : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flow: {
    flex: 1,
  },
});
