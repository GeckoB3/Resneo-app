import type { VenueAddon, VenueAddonGroup } from '@/types/addon-groups';

/**
 * What the Add-ons tab lists, from a library that always holds every group and
 * option (web `AddonsLibraryView`, QA FC-6). With the switch off, archived groups
 * and inactive options are hidden from the LIST only: the editor is always given
 * a group's full option set, because a save removes any option it was not sent.
 */
export function visibleAddonLibrary(
  groups: VenueAddonGroup[],
  addonsByGroup: Record<string, VenueAddon[]>,
  includeInactive: boolean,
): { groups: VenueAddonGroup[]; addonsByGroup: Record<string, VenueAddon[]> } {
  if (includeInactive) return { groups, addonsByGroup };
  return {
    groups: groups.filter((g) => g.is_active),
    addonsByGroup: Object.fromEntries(
      Object.entries(addonsByGroup).map(([groupId, options]) => [groupId, options.filter((a) => a.is_active)]),
    ),
  };
}
