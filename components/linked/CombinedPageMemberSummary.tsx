import { isSharedServices, memberSummaryIntro } from '@/lib/linked/collective-membership-copy';
import { CollectiveBookingSettingsSummary } from '@/components/linked/CollectiveBookingSettingsSummary';
import { collectiveSettingsCopy } from '@/lib/linked/collective-settings-copy';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CombinedPageAboutSection } from '@/components/linked/CombinedPageAboutSection';
import { CombinedPageAddressRow } from '@/components/linked/CombinedPageAddressRow';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { areaCopy } from '@/lib/collective-area/copy';
import { getWebUrl } from '@/lib/env';
import { useAnswerAddressAdoption, useCollectiveCatalogue } from '@/lib/queries/useCollectives';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CollectiveView } from '@/types/collectives';

/**
 * The host's request to use this venue's page address, waiting for this member's admin (web
 * `AddressAdoptionAsk`, N38, CQ-10.10). Nothing changes unless they agree. The answer stays on the
 * screen after the refreshed collective stops asking.
 */
export function AddressAdoptionAsk({ collective, host }: { collective: CollectiveView; host: string }) {
  const { colors } = useTheme();
  const [answer, setAnswer] = useState<'adopted' | 'declined' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const asked = Boolean(collective.pendingAdoptedVenueId) && collective.pendingAdoptedVenueId === collective.myVenueId;
  if (answer) {
    return (
      <Text variant="bodySmall" accessibilityLiveRegion="polite">
        {answer === 'adopted' ? areaCopy('bp.address.adopt.done', { collective: collective.name }) : areaCopy('bp.address.adopt.declined')}
      </Text>
    );
  }
  if (!asked) return null;
  const ownSlug = collective.members.find((m) => m.venueId === collective.myVenueId)?.venueSlug ?? null;
  const origin = getWebUrl() || 'https://app.resneo.com';
  return (
    <View testID="address-adoption-ask" style={[styles.ask, { backgroundColor: colors.warningSurface }]}>
      <Text variant="bodySmall">
        {areaCopy('bp.address.adopt.ask', {
          host,
          collective: collective.name,
          ownAddress: ownSlug ? `${origin}/book/${ownSlug}` : 'your page address',
        })}
      </Text>
      {error ? (
        <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <AddressAdoptionButtons collectiveId={collective.id} onAnswered={setAnswer} onError={setError} />
    </View>
  );
}

function AddressAdoptionButtons({
  collectiveId,
  onAnswered,
  onError,
}: {
  collectiveId: string;
  onAnswered: (answer: 'adopted' | 'declined') => void;
  onError: (message: string | null) => void;
}) {
  const answer = useAnswerAddressAdoption();
  const send = (accept: boolean) => {
    onError(null);
    answer.mutate(
      { collectiveId, accept },
      {
        onSuccess: () => onAnswered(accept ? 'adopted' : 'declined'),
        onError: (err) => onError(err instanceof ApiError ? err.message : areaCopy('bp.address.adopt.failed')),
      },
    );
  };
  return (
    <View style={styles.askButtons}>
      <Button label={areaCopy('bp.address.adopt.confirm')} size="sm" disabled={answer.isPending} onPress={() => send(true)} />
      <Button label={areaCopy('bp.address.adopt.decline')} size="sm" variant="secondary" disabled={answer.isPending} onPress={() => send(false)} />
    </View>
  );
}

/**
 * A member's (non-host's) view of the combined page (web
 * `CombinedPageMemberSummary`, owner's decision 2026-09-09: a read-only summary,
 * with an explanation that the host manages the page): who hosts it, the
 * address with Copy and Open, the host's contact details and hours the page
 * shows, this venue's calendars on the page with the offerings each provides,
 * and where to go to leave. Members are never shown host controls; the API
 * refuses them anyway.
 *
 * On shared services (CQ-10.6) the venue and the host each choose the venue's calendars, and the
 * venue leaves at the foot of Manage Collective, so the card says that and opens Manage Collective.
 * An older collective keeps its words and Linked venues.
 */
export function CombinedPageMemberSummary({
  collective,
  onOpenManageCollective,
  onOpenLinkedVenues,
}: {
  collective: CollectiveView;
  /** Shared services: Manage Collective, where the calendars are chosen and Leave is. */
  onOpenManageCollective?: () => void;
  /** An older collective: Linked venues, as before. */
  onOpenLinkedVenues?: () => void;
}) {
  const shared = isSharedServices(collective);
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
          {memberSummaryIntro(collective, host)}
        </Text>
        <CombinedPageAddressRow collective={collective} />
        <AddressAdoptionAsk collective={collective} host={host} />
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
            {shared
              ? areaCopy('bp.member.calendarsNone', { collective: collective.name, host })
              : `None of your calendars is offered on the combined page yet. ${host} chooses which calendars take part.`}
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
        {shared ? (
          <>
            {calendars.length > 0 ? (
              <Text variant="caption" tone="muted">
                {areaCopy('bp.member.calendars', { host })}
              </Text>
            ) : null}
            <Text variant="caption" tone="muted">
              {areaCopy('bp.member.leaving', { collective: collective.name })}
            </Text>
            {onOpenManageCollective ? (
              <Button
                label={areaCopy('bp.manage.elsewhere.cta')}
                size="sm"
                variant="ghost"
                onPress={onOpenManageCollective}
              />
            ) : null}
          </>
        ) : (
          <>
            <Text variant="caption" tone="muted">
              {`${host} chooses which calendars are offered. To stop taking part, leave the collective under Linked venues.`}
            </Text>
            {onOpenLinkedVenues ? (
              <Button label="Open Linked venues" size="sm" variant="ghost" onPress={onOpenLinkedVenues} />
            ) : null}
          </>
        )}
      </Card>

      {/* Web collective booking settings plan §7.6: where the member's people on the page come from. */}
      <Card style={styles.card} testID="collective-your-people">
        <Text variant="label">{collectiveSettingsCopy.yourPeopleTitle}</Text>
        <Text variant="bodySmall" tone="secondary">
          {collectiveSettingsCopy.yourPeopleBody(collective.name)}
        </Text>
        <Text variant="caption" tone="muted">
          Switch to This venue&rsquo;s own page above, then open Meet the team.
        </Text>
      </Card>

      <CollectiveBookingSettingsSummary collective={collective} />
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
  ask: {
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  askButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
