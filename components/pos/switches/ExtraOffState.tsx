import { type Href, useRouter } from 'expo-router';

import { EmptyState } from '@/components/ui/EmptyState';
import { smT } from '@/lib/pos/settings-more/copy';
import { swT } from '@/lib/pos/switches/copy';
import { extraOffSentence, extraOffState } from '@/lib/pos/switches/model';
import { useFeatureSwitches } from '@/lib/queries/useFeatureSwitches';
import type { PosSwitchExtraKey } from '@/types/pos-switches';

/** Where an admin switches an extra on: the Extras in "Checkout is on", at the top of Checkout settings. */
export const CHECKOUT_SETTINGS_HREF = '/checkout-settings';

/**
 * What an extra's own settings screen (gift vouchers, loyalty card, online shop) says while that
 * extra is off (POS Part 5: admins switch the extras on themselves, SW1). An admin is pointed at the
 * Extras in Checkout settings, with a button to open it, while ResNeo offers the extra; told it is
 * paused by ResNeo (with its public reason), or that it isn't available yet, otherwise, never
 * promising that support will turn it on. A team member is told an admin can switch it on in
 * Checkout settings.
 */
export function ExtraOffState({
  extra,
  feature,
  isAdmin,
  venueName,
}: {
  extra: PosSwitchExtraKey;
  /** The screen's name for the extra ("Gift vouchers", "Loyalty", "Online shop"). */
  feature: string;
  isAdmin: boolean;
  venueName: string;
}) {
  const router = useRouter();
  const query = useFeatureSwitches({ enabled: isAdmin });
  const title = smT('gate.featureOff.title', { feature });

  if (!isAdmin) return <EmptyState title={title} message={extraOffSentence('staff', venueName)} />;

  const state = extraOffState(query.data, extra);
  if (state.kind === 'paused') {
    return <EmptyState title={swT('sw.panel.extra.paused')} message={extraOffSentence(state, venueName)} />;
  }
  // While the switches are read, the title alone: the sentence depends on them.
  const reading = !query.data && query.isLoading;
  return (
    <EmptyState
      title={title}
      message={reading ? '' : extraOffSentence(state, venueName)}
      actionLabel={!reading && state.kind === 'switch_on' ? swT('app.sw.gate.open') : undefined}
      onAction={!reading && state.kind === 'switch_on' ? () => router.push(CHECKOUT_SETTINGS_HREF as Href) : undefined}
    />
  );
}
