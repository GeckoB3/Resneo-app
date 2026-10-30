import { useMemo } from 'react';

import { MemberServiceSheet } from '@/components/services/collective/MemberServiceSheet';
import { appointmentCalendarsOf } from '@/lib/calendar/schedule-calendars';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useManagedServices } from '@/lib/queries/useServicesManage';
import { useVenueContext } from '@/providers/VenueProvider';

/**
 * "Choose calendars" for a page service, opened from Manage Collective (owner, 2026-10-29: choose
 * without leaving the screen; the web's Manage Collective opens the same editor). It is the
 * Services screen's member sheet, fed from the same reads, so the two cannot drift apart. Manage
 * Collective is for admins only, so each calendar offering it gets Edit values where the host
 * lets calendars have their own. Switched-off calendars are passed too, so one that still offers the
 * service is shown with Remove rather than dropped by the save (CQ-06).
 */
export function MemberCalendarsSheet({
  serviceId,
  currencySymbol,
  onClose,
}: {
  serviceId: string;
  currencySymbol: string;
  onClose: () => void;
}) {
  const { venue } = useVenueContext();
  const servicesQuery = useManagedServices();
  // Switched off ones too (CQ-06): the sheet lists one that still offers the service.
  const practitionersQuery = usePractitioners({ includeInactive: true });

  const service = useMemo(
    () => servicesQuery.data?.services.find((s) => s.id === serviceId) ?? null,
    [servicesQuery.data, serviceId],
  );
  const links = useMemo(
    () => (servicesQuery.data?.practitioner_services ?? []).filter((l) => l.service_id === serviceId),
    [servicesQuery.data, serviceId],
  );
  const calendars = useMemo(
    () =>
      appointmentCalendarsOf(
        [...(practitionersQuery.data?.practitioners ?? [])].sort((a, b) => a.sort_order - b.sort_order),
      ),
    [practitionersQuery.data],
  );

  if (!service?.collective || !practitionersQuery.data) return null;

  return (
    <MemberServiceSheet
      key={service.id}
      service={service}
      block={service.collective}
      calendars={calendars.map((p) => ({
        id: p.id,
        name: p.name,
        offers: links.some((l) => l.practitioner_id === p.id),
        is_active: p.is_active !== false,
      }))}
      currencySymbol={currencySymbol}
      complianceEnabled={venue?.feature_flags?.resolved?.compliance_records_enabled ?? false}
      canEditValues
      links={links}
      onClose={onClose}
      onSaved={onClose}
    />
  );
}
