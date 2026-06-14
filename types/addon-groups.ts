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
  description?: string | null;
  additional_price_pence: number;
  additional_duration_minutes: number;
  /** Internal cost to the business (reporting only; never shown to clients). */
  cost_to_business_pence?: number | null;
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

/** One add-on item sent in the group create/update payload. */
export interface AddonItemInput {
  id?: string;
  name: string;
  description?: string | null;
  additional_price_pence: number;
  additional_duration_minutes: number;
  /** Internal cost to the business (reporting only). Omitted/null leaves it unset. */
  cost_to_business_pence?: number | null;
  is_active: boolean;
  sort_order?: number;
}

/** Payload shape for POST /api/venue/addon-groups (group field). */
export interface AddonGroupInput {
  name: string;
  prompt_to_client?: string | null;
  description?: string | null;
  selection_type: 'single' | 'multi';
  min_select: number;
  max_select?: number | null;
  hidden_from_online: boolean;
  is_active: boolean;
  addons: AddonItemInput[];
}

export interface CreateAddonGroupPayload {
  group: AddonGroupInput;
}

/** Response from POST or PATCH /api/venue/addon-groups/[id]. */
export interface AddonGroupUpsertResponse {
  group: VenueAddonGroup;
  addons: VenueAddon[];
}
