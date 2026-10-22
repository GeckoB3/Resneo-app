/**
 * The caller's own till rights from `GET /api/venue/pos/settings` (web roles plan §5.13). Till
 * rights are one map per role: Staff have the Staff map (`staff_capability_map`), Front desk have
 * the Front desk map, and admins hold everything. So the Staff map no longer stands for "my rights";
 * the server answers those as `my_capabilities` and `can.manage_readers`. A server before roles
 * leaves both out, and there every team member had the Staff map, so it is the fallback.
 */

type CapabilityMap = Record<string, boolean | undefined>;

export interface MyCapabilitiesSource {
  can: { is_admin: boolean; manage_readers?: boolean };
  staff_capability_map?: CapabilityMap | null;
  my_capabilities?: CapabilityMap | null;
}

/** This login's own capability map: `my_capabilities`, else (an older server) the Staff map. */
export function myCapabilitiesFrom(data: MyCapabilitiesSource | null | undefined): CapabilityMap {
  if (!data) return {};
  return data.my_capabilities ?? data.staff_capability_map ?? {};
}

/** Whether this login may manage card readers (web `showReaders`): admins, or their own right. */
export function canManageReadersFrom(data: MyCapabilitiesSource | null | undefined): boolean {
  if (!data) return false;
  if (data.can.is_admin) return true;
  if (typeof data.can.manage_readers === 'boolean') return data.can.manage_readers;
  return myCapabilitiesFrom(data).manage_readers === true;
}
