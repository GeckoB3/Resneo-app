/**
 * Types for the multi-step guest merge flow.
 * POST /api/venue/guests/merge
 */

export interface MergeFieldMap {
  first_name?: 'target' | 'source';
  last_name?: 'target' | 'source';
  email?: 'target' | 'source';
  phone?: 'target' | 'source';
  customer_profile_notes?: 'target' | 'source';
  marketing_consent?: 'target' | 'source';
  tags?: 'union' | 'target' | 'source';
  /**
   * 'target' keeps only the surviving record's custom-field values;
   * 'source_overlay' starts from the target's keys then overlays the source's
   * values for any matching keys (source wins conflicts, source-only keys are
   * preserved). Mirrors MergeContactsModal on web.
   */
  custom_fields?: 'target' | 'source_overlay';
}

export interface MergedProfile {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  customer_profile_notes?: string | null;
  marketing_consent?: boolean;
  marketing_opt_out?: boolean;
  tags?: string[];
  /** Resolved custom-field values for the surviving record. */
  custom_fields?: Record<string, unknown>;
}

export interface MergeGuestsInput {
  target_guest_id: string;
  source_guest_ids: string[];
  merged_profile?: MergedProfile;
  field_map?: MergeFieldMap;
}
