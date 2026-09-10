import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { CombinedPageAboutSection } from '@/components/linked/CombinedPageAboutSection';
import { CombinedPageAddressRow } from '@/components/linked/CombinedPageAddressRow';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useCollectiveCatalogue } from '@/lib/queries/useCollectives';
import { spacing } from '@/theme/index';
import type { CollectiveView } from '@/types/collectives';

/**
 * A member's (non-host's) view of the combined page (web
 * `CombinedPageMemberSummary`, owner's decision 2026-09-09: a read-only summary,
 * with an explanation that the host manages the page): who hosts it, the
 * address with Copy and Open, the host's contact details and hours the page
 * shows, this venue's calendars on the page with the offerings each provides,
 * and where to go to leave. Members are never shown host controls; the API
 * refuses them anyway.
 */
export function CombinedPageMemberSummary({
  collective,
  onOpenLinkedVenues,
}: {
  collective: CollectiveView;
  onOpenLinkedVenues?: () => void;
}) {
  const host =
    collective.members.find((m) => m.venueId === collective.hostVenueId)?.venueName ?? 'The host venue';
  const catalogueQuery = useCollectiveCatalogue(collective.id);

  // This venue's calendars on the page, each with the services it provides there.
  const calendars = useMemo(() => {
    const byCalendar = new Map<string, { name: string; services: string[] }>();
    const catalogue = catalogueQuery.data?.catalogue;
    if (!catalogue) return [];
    for (const item of catalogue.items) {
      if (item.status !== 'active') continue;
      for (const p of item.providers) {
        if (p.venueId !== collective.myVenueId || p.status === 'removed' || !p.practitionerId) continue;
        const entry = byCalendar.get(p.practitionerId) ?? { name: p.practitionerName ?? 'Calendar', services: [] };
        if (!entry.services.includes(item.name)) entry.services.push(item.name);
        byCalendar.set(p.practitionerId, entry);
      }
    }
    return [...byCalendar.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogueQuery.data?.catalogue, collective.myVenueId]);

  return (
    <View style={styles.root}>
      <Card style={styles.card}>
        <Text variant="bodySmall" tone="secondary">
          {`${host} hosts ${collective.name} and manages its combined booking page: the services on it, which calendars are offered, its headings, photos and branding. Your services appear there with the price, length and availability set under your own Services settings.`}
        </Text>
        <CombinedPageAddressRow collective={collective} />
      </Card>

      <CombinedPageAboutSection collective={collective} />

      <Card style={styles.card}>
        <Text variant="label">Your calendars on the combined page</Text>
        {catalogueQuery.isError ? (
          <Text variant="bodySmall" tone="danger">
            {catalogueQuery.error instanceof ApiError
              ? catalogueQuery.error.message
              : 'Failed to load the combined page.'}
          </Text>
        ) : catalogueQuery.isLoading ? (
          <Text variant="bodySmall" tone="muted">
            Loading…
          </Text>
        ) : calendars.length === 0 ? (
          <Text variant="bodySmall" tone="secondary">
            {`None of your calendars is offered on the combined page yet. ${host} chooses which calendars take part.`}
          </Text>
        ) : (
          <View style={styles.list}>
            {calendars.map((c) => (
              <View key={c.name} style={styles.row}>
                <Text variant="bodyMedium">{c.name}</Text>
                <Text variant="caption" tone="muted">
                  {c.services.join(', ')}
                </Text>
              </View>
            ))}
          </View>
        )}
        <Text variant="caption" tone="muted">
          {`${host} chooses which calendars are offered. To stop taking part, leave the collective under Linked venues.`}
        </Text>
        {onOpenLinkedVenues ? (
          <Button label="Open Linked venues" size="sm" variant="ghost" onPress={onOpenLinkedVenues} />
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    gap: 2,
  },
});
