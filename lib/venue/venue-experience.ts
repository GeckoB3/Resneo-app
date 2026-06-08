/**
 * Venue experience helpers — mirrors web dashboard phrasing for appointments vs dining.
 * @see _reference/reserve-ni/src/app/dashboard/DashboardHomeClient.tsx
 */

export function isAppointmentPlanTier(pricingTier: string | null | undefined): boolean {
  const tier = (pricingTier ?? '').toLowerCase().trim();
  return tier === 'appointments' || tier === 'light' || tier === 'plus';
}

export function isUnifiedSchedulingVenue(model: string | null | undefined): boolean {
  return model === 'practitioner_appointment' || model === 'unified_scheduling';
}

/**
 * True when the venue should use appointment wording (Today's appointments, guests, etc.).
 * Restaurant table-first venues with secondary models keep dining phrasing.
 */
export function isAppointmentExperience(
  pricingTier: string | null | undefined,
  bookingModel: string | null | undefined,
  enabledModels: readonly string[] | null | undefined,
  tableFocusSecondariesEnabled: boolean,
): boolean {
  if (tableFocusSecondariesEnabled) return false;
  if (isAppointmentPlanTier(pricingTier)) return true;
  if (isUnifiedSchedulingVenue(bookingModel)) return true;
  return Boolean(enabledModels?.includes('unified_scheduling'));
}

/** Infer appointment mode from venue bootstrap when dashboard payload is unavailable. */
export function isAppointmentFromVenue(
  pricingTier: string | null | undefined,
  bookingModel: string | null | undefined,
  enabledModels?: readonly string[] | null,
): boolean {
  return isAppointmentExperience(pricingTier, bookingModel, enabledModels ?? null, false);
}
