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
import { useVenueContext } from '@/providers/VenueProvider';
import type { BookingModel } from '@/types/venue';

const APPOINTMENT_PLAN_TIERS = new Set(['appointments', 'light', 'plus']);
const APPOINTMENT_MODELS: BookingModel[] = ['practitioner_appointment', 'unified_scheduling'];

/** Tier- or model-based appointment exposure (matches the old screen's gate). */
function isAppointmentVenue(
  pricingTier: string | null | undefined,
  bookingModel: BookingModel | null | undefined,
): boolean {
  const tier = (pricingTier ?? '').toLowerCase().trim();
  if (APPOINTMENT_PLAN_TIERS.has(tier)) return true;
  if (bookingModel && APPOINTMENT_MODELS.includes(bookingModel)) return true;
  return false;
}

function modelToTab(model: BookingModel | null | undefined): BookingFlowType {
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
 * New-booking screen. Shows a tab per enabled booking model (Appointments,
 * Classes, Events, Resources) and renders the matching flow — mirroring the web
 * staff booking surface. The tab bar is hidden when only one model is enabled.
 */
export default function NewBookingScreen() {
  const router = useRouter();
  const { venue, isLoading: venueLoading } = useVenueContext();
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

  // The tabs to show, derived from the venue's enabled booking models.
  const tabs = useMemo<BookingFlowType[]>(() => {
    if (!venue) return [];
    const enabled = new Set<BookingModel>([
      ...(venue.active_booking_models ?? []),
      ...(venue.enabled_models ?? []),
      ...(venue.booking_model ? [venue.booking_model] : []),
    ]);
    // Order mirrors the web staff booking surface (Appointments → Class → Event → Resource).
    const out: BookingFlowType[] = [];
    if (
      isAppointmentVenue(venue.pricing_tier, venue.booking_model) ||
      enabled.has('unified_scheduling') ||
      enabled.has('practitioner_appointment')
    ) {
      out.push('service');
    }
    if (enabled.has('class_session')) out.push('class');
    if (enabled.has('event_ticket')) out.push('event');
    if (enabled.has('resource_booking')) out.push('resource');
    return out;
  }, [venue]);

  // The user's explicit tab choice (null until they tap a tab).
  const [activeTab, setActiveTab] = useState<BookingFlowType | null>(null);

  // The tab to render: the user's choice when still valid, else a sensible
  // default — an explicit ?type=, an appointment deep-link (calendar tap /
  // walk-in intent) → Appointments, else the venue's primary model. Derived (no
  // setState-in-effect), so it stays correct as the venue/tabs load in.
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

    const primaryTab = modelToTab(venue?.booking_model);
    return tabs.includes(primaryTab) ? primaryTab : tabs[0]!;
  }, [tabs, activeTab, typeParam, practitionerIdParam, timeParam, intentParam, venue?.booking_model]);

  const handleCreated = (bookingId: string) => {
    router.replace(`/booking/${bookingId}` as Href);
  };

  if (venueLoading) {
    return (
      <Screen>
        <LoadingState message="Loading venue…" />
      </Screen>
    );
  }

  if (!venue?.id) {
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
