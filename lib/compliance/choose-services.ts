/**
 * "Choose services" for one form (owner, 2026-11-07): a checklist of All bookings and every service,
 * ticked where the form is asked for today. Saving adds a requirement for each newly ticked row
 * (with one set of terms) and removes the requirement of each unticked one; rows left as they were
 * keep their own terms. Pure, so the app sheet and the web dialog plan the same writes.
 *
 * Port of the web `src/lib/compliance/choose-services.ts`; keep the two in step.
 */

/** A requirement row as `GET /api/venue/compliance/requirements` (no filter) lists it. */
export interface RequirementListRow {
  id: string;
  scope?: string | null;
  compliance_type_id: string;
  appointment_service_id: string | null;
  service_item_id: string | null;
}

export interface ServiceChoice {
  allBookings: boolean;
  serviceIds: ReadonlySet<string>;
}

export interface CurrentChoice extends ServiceChoice {
  /** The requirement behind each ticked service, so unticking can remove it. */
  requirementIdByService: ReadonlyMap<string, string>;
  /** The All bookings requirement, when there is one. */
  venueRequirementId: string | null;
}

function isVenueWide(r: RequirementListRow): boolean {
  return r.scope === 'venue' || (!r.appointment_service_id && !r.service_item_id);
}

/** Where this form is asked for now. */
export function currentChoice(rows: readonly RequirementListRow[], typeId: string): CurrentChoice {
  const requirementIdByService = new Map<string, string>();
  let venueRequirementId: string | null = null;
  for (const r of rows) {
    if (r.compliance_type_id !== typeId) continue;
    if (isVenueWide(r)) {
      venueRequirementId = r.id;
      continue;
    }
    const serviceId = r.service_item_id ?? r.appointment_service_id;
    if (serviceId) requirementIdByService.set(serviceId, r.id);
  }
  return {
    allBookings: venueRequirementId !== null,
    serviceIds: new Set(requirementIdByService.keys()),
    requirementIdByService,
    venueRequirementId,
  };
}

export type PlannedAdd = { scope: 'venue' } | { scope: 'service'; serviceId: string };

export interface PlannedChanges {
  add: PlannedAdd[];
  /** Requirement ids to remove. */
  remove: string[];
}

/** The writes that turn `current` into `next`: nothing for a row left as it was. */
export function planServiceChanges(
  current: CurrentChoice,
  next: ServiceChoice,
  /**
   * The services the checklist shows. A requirement on a service it does not show (made inactive
   * or deleted) is never removed, since nobody could see it to untick it (web parity).
   */
  listed?: ReadonlySet<string>,
): PlannedChanges {
  const add: PlannedAdd[] = [];
  const remove: string[] = [];
  if (next.allBookings && !current.allBookings) add.push({ scope: 'venue' });
  if (!next.allBookings && current.venueRequirementId) remove.push(current.venueRequirementId);
  for (const id of next.serviceIds) if (!current.serviceIds.has(id)) add.push({ scope: 'service', serviceId: id });
  for (const [serviceId, requirementId] of current.requirementIdByService) {
    if (listed && !listed.has(serviceId)) continue;
    if (!next.serviceIds.has(serviceId)) remove.push(requirementId);
  }
  return { add, remove };
}
