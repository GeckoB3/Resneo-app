/**
 * GET /api/venue/addon-groups — venue add-on catalogue for service linking.
 * @see _reference/reserve-ni/src/app/api/venue/addon-groups/route.ts
 */
export interface VenueAddonGroup {
  id: string;
  name: string;
  prompt_to_client: string | null;
  description: string | null;
  selection_type: 'single' | 'multi';
  min_select: number;
  max_select: number | null;
  hidden_from_online: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface VenueAddon {
  id: string;
  addon_group_id: string;
  name: string;
  additional_price_pence: number;
  additional_duration_minutes: number;
  is_active: boolean;
  sort_order: number;
}

export interface AddonGroupsResponse {
  groups: VenueAddonGroup[];
  addons_by_group: Record<string, VenueAddon[]>;
  service_links: {
    service_item_id: string | null;
    appointment_service_id: string | null;
    addon_group_id: string;
    sort_order: number;
  }[];
}
