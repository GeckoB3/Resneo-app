/**
 * Shared client lists on a client's screen (web `SharedClientLine` / `AcrossTheCollective`; plan
 * §1A.2 step 5, mockup board 5): one quiet line under the name, "Also a client of Light 16", and a
 * collapsed Across the collective card with each sharing venue's visits, last visit, no-shows and
 * services had, read live. A copy kept after sharing ended reads "Shared while in X until date".
 * Owners and admins can say "Not the same person" on their own record.
 */
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { clientSharingCopy } from '@/lib/collective-area/client-sharing-copy';
import { formatVenueList } from '@/lib/collective-area/copy';
import { useSeparateSharedGuest, useSharedGuest } from '@/lib/queries/useClientSharing';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import type { SharedGuestResponse } from '@/types/client-sharing';

/** "12 Nov 2025": always with the year, as the web reads it (a last visit can be years ago). */
function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

/**
 * The line under the name, or null: "Also a client of …" while other venues share this client,
 * else "Shared while in … until …" for a copy kept after sharing ended.
 */
export function sharedClientLine(shared: SharedGuestResponse | undefined): string | null {
  if (!shared) return null;
  if (shared.alsoAt.length > 0) {
    return clientSharingCopy('cs.contact.alsoAt', { venues: formatVenueList(shared.alsoAt.map((v) => v.name)) });
  }
  if (shared.sharedUntil) {
    return clientSharingCopy('cs.contact.sharedUntil', {
      collective: shared.sharedUntil.collectiveName,
      date: shortDate(shared.sharedUntil.date),
    });
  }
  return null;
}

export function SharedClientLine({ guestId }: { guestId: string }) {
  const shared = useSharedGuest(guestId);
  const line = sharedClientLine(shared.data);
  if (!line) return null;
  return (
    <Text variant="caption" tone="muted" numberOfLines={2}>
      {line}
    </Text>
  );
}

export function AcrossTheCollectiveCard({ guestId }: { guestId: string }) {
  const toast = useToast();
  const shared = useSharedGuest(guestId);
  const separate = useSeparateSharedGuest(guestId);
  const [asking, setAsking] = useState(false);
  const data = shared.data;
  if (!data || data.across.length === 0) return null;

  return (
    <CollapsibleCard title={clientSharingCopy('cs.contact.across')}>
      <View style={styles.list}>
        {data.across.map((v) => {
          const parts = [
            v.visits === 1
              ? clientSharingCopy('cs.contact.acrossVisitOne')
              : v.visits > 0
                ? clientSharingCopy('cs.contact.acrossVisits', { count: v.visits })
                : clientSharingCopy('cs.contact.acrossNever'),
            v.lastVisit ? clientSharingCopy('cs.contact.acrossLast', { date: shortDate(v.lastVisit) }) : null,
            v.noShows === 1
              ? clientSharingCopy('cs.contact.acrossNoShowOne')
              : v.noShows > 1
                ? clientSharingCopy('cs.contact.acrossNoShows', { count: v.noShows })
                : null,
          ].filter(Boolean);
          return (
            <View key={v.venueId} style={styles.venue}>
              <Text variant="label">{v.name}</Text>
              <Text variant="bodySmall">{parts.join(' · ')}</Text>
              {v.services.length > 0 ? (
                <Text variant="caption" tone="secondary">
                  {clientSharingCopy('cs.contact.acrossServices', { services: v.services.join(', ') })}
                </Text>
              ) : null}
            </View>
          );
        })}
        {data.canSeparate ? (
          <Button
            label={clientSharingCopy('cs.contact.different')}
            variant="secondary"
            size="sm"
            style={styles.separate}
            onPress={() => setAsking(true)}
          />
        ) : null}
      </View>
      <ConfirmSheet
        visible={asking}
        title={clientSharingCopy('cs.contact.different')}
        message={clientSharingCopy('cs.contact.differentHelp', {
          venues: formatVenueList(data.alsoAt.map((v) => v.name)),
        })}
        confirmLabel={clientSharingCopy('cs.contact.different')}
        destructive={false}
        loading={separate.isPending}
        onClose={() => setAsking(false)}
        onConfirm={() =>
          separate.mutate(undefined, {
            onSuccess: () => {
              setAsking(false);
              toast.success(clientSharingCopy('cs.contact.separated'));
            },
            onError: (err) =>
              toast.error(err instanceof ApiError ? err.message : clientSharingCopy('cs.error.generic')),
          })
        }
      />
    </CollapsibleCard>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  venue: { gap: spacing.xxs },
  separate: { alignSelf: 'flex-start' },
});
