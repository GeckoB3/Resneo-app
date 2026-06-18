import type { Href } from 'expo-router';

import type { SetupStatus } from '@/lib/queries/useSetupStatus';

/**
 * Onboarding-aware setup-step derivation, ported from the web
 * `dashboard/SetupChecklist.tsx` (`getSteps` / `getSecondaryCatalogSteps`).
 *
 * The web is model-aware: the availability/booking-page steps relabel by primary
 * `booking_model`, per-model catalog steps are appended for each enabled add-on
 * model, and copy/labels switch on `onboarding_completed`. The hrefs are remapped
 * onto the app's in-app manage routes.
 *
 * Kept as a pure function (no React) so it can be unit-tested directly.
 */

/** The boolean SetupStatus fields that gate a step's completion. */
export type SetupStepKey =
  | 'profile_complete'
  | 'availability_set'
  | 'guest_booking_ready'
  | 'stripe_connected'
  | 'first_booking_made'
  | 'secondary_event_catalog_ready'
  | 'secondary_class_catalog_ready'
  | 'secondary_resource_catalog_ready';

export interface SetupStep {
  key: SetupStepKey;
  label: string;
  description: string;
  route: Href;
}

/** Normalise the loosely-typed `enabled_models` field into a string list. */
export function readEnabledModels(status: Pick<SetupStatus, 'enabled_models'>): string[] {
  const raw = status.enabled_models;
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is string => typeof m === 'string');
}

function isUnifiedScheduling(model: string | undefined): boolean {
  return model === 'practitioner_appointment' || model === 'unified_scheduling';
}

function getAvailabilityStep(model: string | undefined, onboardingDone: boolean): SetupStep {
  switch (model) {
    case 'practitioner_appointment':
    case 'unified_scheduling':
      return {
        key: 'availability_set',
        label: onboardingDone ? 'Services & calendars' : 'Team & services',
        description: onboardingDone
          ? 'Adjust which services are offered on each calendar, or add more services.'
          : 'Add team calendars, link services, and set when guests can book.',
        route: '/manage/services',
      };
    case 'event_ticket':
      return {
        key: 'availability_set',
        label: 'Events',
        description: 'Review your events and ticket types, or create new ones.',
        route: '/events',
      };
    case 'class_session':
      return {
        key: 'availability_set',
        label: 'Classes & timetable',
        description: 'Review your class schedule, or add new classes.',
        route: '/classes',
      };
    case 'resource_booking':
      return {
        key: 'availability_set',
        label: 'Resources',
        description: 'Review your bookable resources, or add new ones.',
        route: '/resources',
      };
    default:
      return {
        key: 'availability_set',
        label: 'Services & availability',
        description: 'Add staff calendars and set when guests can book.',
        route: '/manage/hours',
      };
  }
}

function getGuestBookingStep(model: string | undefined, onboardingDone: boolean): SetupStep {
  if (isUnifiedScheduling(model)) {
    return {
      key: 'guest_booking_ready',
      label: 'Public booking page',
      description: onboardingDone
        ? 'Your booking page needs at least one active service linked to a calendar.'
        : 'Guests need at least one calendar with an active service linked before they can book online.',
      route: '/manage/booking-page',
    };
  }
  return {
    key: 'guest_booking_ready',
    label: 'Public booking page',
    description:
      'Add at least one active service and complete availability so online guests can see times and book.',
    route: '/manage/booking-page',
  };
}

function getSecondaryCatalogSteps(enabledModels: string[], onboardingDone: boolean): SetupStep[] {
  const steps: SetupStep[] = [];
  if (enabledModels.includes('event_ticket')) {
    steps.push({
      key: 'secondary_event_catalog_ready',
      label: 'Events',
      description: onboardingDone
        ? 'Optional: add another ticketed event or edit existing ones.'
        : 'Add a ticketed event so guests can book from your Events tab.',
      route: '/events',
    });
  }
  if (enabledModels.includes('class_session')) {
    steps.push({
      key: 'secondary_class_catalog_ready',
      label: 'Classes',
      description: onboardingDone
        ? 'Optional: add a timetable rule or more class types.'
        : 'Add a class type and schedule so guests can book classes.',
      route: '/classes',
    });
  }
  if (enabledModels.includes('resource_booking')) {
    steps.push({
      key: 'secondary_resource_catalog_ready',
      label: 'Resources',
      description: onboardingDone
        ? 'Optional: add another bookable resource or edit slots.'
        : 'Add a bookable resource so guests can book it from the Resources tab.',
      route: '/resources',
    });
  }
  return steps;
}

/**
 * Build the ordered step list for a venue, mirroring the web `getSteps`.
 * Order: profile → availability (model-aware) → [booking page for table/USE] →
 * secondary catalog steps (per enabled add-on model) → Stripe → first booking.
 */
export function getSetupSteps(status: SetupStatus): SetupStep[] {
  const model = status.booking_model;
  const onboardingDone = status.onboarding_completed;
  const enabledModels = readEnabledModels(status);

  const steps: SetupStep[] = [
    {
      key: 'profile_complete',
      label: 'Business profile',
      description: onboardingDone
        ? 'Review logo, contact details, and venue settings.'
        : 'Add your business name, address, phone number, and cover photo.',
      route: '/manage/venue-profile',
    },
    getAvailabilityStep(model, onboardingDone),
  ];

  if (model === 'table_reservation' || isUnifiedScheduling(model)) {
    steps.push(getGuestBookingStep(model, onboardingDone));
  }

  steps.push(...getSecondaryCatalogSteps(enabledModels, onboardingDone));

  steps.push(
    {
      key: 'stripe_connected',
      label: 'Stripe payments',
      description: 'Connect Stripe so you can take deposits and card payments.',
      route: '/manage/plan',
    },
    {
      key: 'first_booking_made',
      label: 'First test booking',
      description: 'Try the guest flow once to confirm booking and emails look right.',
      route: '/booking/new',
    },
  );

  return steps;
}

/** Whether the boolean field for a step is satisfied on the status payload. */
export function isStepDone(status: SetupStatus, key: SetupStepKey): boolean {
  return status[key] === true;
}

export interface SetupProgress {
  steps: SetupStep[];
  incompleteSteps: SetupStep[];
  completedCount: number;
  totalCount: number;
  progressPct: number;
  /** True once every derived step is complete (card should hide). */
  allComplete: boolean;
}

/** Derive steps + completion counts in one pass (mirrors the web card's memo). */
export function deriveSetupProgress(status: SetupStatus): SetupProgress {
  const steps = getSetupSteps(status);
  const incompleteSteps = steps.filter((s) => !isStepDone(status, s.key));
  const completedCount = steps.length - incompleteSteps.length;
  const totalCount = steps.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  return {
    steps,
    incompleteSteps,
    completedCount,
    totalCount,
    progressPct,
    allComplete: totalCount > 0 && completedCount === totalCount,
  };
}
