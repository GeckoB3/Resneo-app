import { useFeatureFlags } from '@/lib/queries/useVenueSettings';
import {
  collectiveSettingsParams,
  type CollectiveSettingsParams,
  type FeatureFlagsCollective,
} from '@/lib/linked/collective-settings-copy';

/**
 * The live collective this venue books under, for the settings screens' notes (web collective
 * booking settings plan §7.5 to §7.7), from the collective block on GET /api/venue/feature-flags.
 * Null outside one, and on servers before that block existed.
 */
export function useLiveCollectiveSettings(): { collective: FeatureFlagsCollective; params: CollectiveSettingsParams } | null {
  const featureFlags = useFeatureFlags();
  const collective = featureFlags.data?.collective ?? null;
  return collective ? { collective, params: collectiveSettingsParams(collective) } : null;
}
