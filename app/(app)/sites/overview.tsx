import { Stack, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { planDisplayName } from '@/components/plan/planConstants';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useMeSites, useSitesOverview } from '@/lib/queries/useMeSites';
import { formatMoney } from '@/lib/reports/pos-report-format';
import { getActingVenueId } from '@/lib/sites/active-site';
import { SITES_COPY, groupTotalNotes, planStatusLabel, sitesCountedIn } from '@/lib/sites/sites';
import { useSwitchSite } from '@/lib/sites/useSwitchSite';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { OverviewGroup, OverviewSite, OverviewTotals } from '@/types/sites';

/**
 * All sites (web roles plan §6.7, UR24, UR27; copy from Appendix C "The overview"). The same
 * figures, groups and totals as the top of the web's Sites page: each site the person owns or runs
 * as an admin, grouped by owner, with that site's own today and week. A group of two or more gets a
 * total, money per currency and never converted.
 *
 * Reached from the site picker (and offered after sign-in through it). Switch changes the whole app
 * to that site and opens its Today; Plan, for the owner or an admin with billing on, switches and
 * opens its Plan page. Pull down to refresh. Each site loads and fails on its own: the server sends
 * a site it could not read as its own error, and the rest still show.
 */
export default function AllSitesScreen() {
  const overview = useSitesOverview();
  const me = useMeSites();
  const currentId = me.data?.active_venue_id ?? getActingVenueId();
  const header = <Stack.Screen options={{ headerShown: true, title: SITES_COPY.allSites }} />;

  let body: ReactNode;
  if (overview.isLoading) {
    body = <ListSkeleton rows={4} />;
  } else if (overview.isError || !overview.data) {
    body = (
      <ErrorState
        message={overview.error instanceof ApiError ? overview.error.message : SITES_COPY.overviewFailed}
        onRetry={() => void overview.refetch()}
      />
    );
  } else if (!overview.data.eligible || overview.data.groups.length === 0) {
    body = (
      <EmptyState
        title={SITES_COPY.allSites}
        message="You'll see your businesses here side by side once you run two or more as an owner or admin."
      />
    );
  } else {
    body = overview.data.groups.map((group, index) => (
      <GroupSection key={`${index}-${group.label}`} group={group} currentId={currentId} />
    ));
  }

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={overview.isRefetching} onRefresh={() => void overview.refetch()} />}>
        {body}
      </ScrollView>
    </Screen>
  );
}

function GroupSection({ group, currentId }: { group: OverviewGroup; currentId: string | null }) {
  return (
    <View style={styles.group}>
      <Text variant="overline" tone="muted">
        {group.label}
      </Text>
      {group.sites.map((site) => (
        <SiteCard key={site.venue_id} site={site} current={site.venue_id === currentId} />
      ))}
      {group.totals ? <GroupTotals group={group} totals={group.totals} /> : null}
    </View>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.figure, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text variant="caption" tone="muted" style={styles.figureLabel}>
        {label}
      </Text>
      <Text variant="subheading">{value}</Text>
      {sub ? (
        <Text variant="caption" tone="secondary">
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function SiteFigures({ site }: { site: OverviewSite }) {
  const { colors } = useTheme();
  if (site.state === 'ended') {
    return <Text variant="bodySmall">{SITES_COPY.subscriptionEnded}</Text>;
  }
  if (site.state === 'error') {
    return (
      <Text variant="bodySmall" color={colors.danger} accessibilityRole="alert">
        {SITES_COPY.siteFailed}
      </Text>
    );
  }
  if (site.state === 'not_loaded' || !site.today || !site.week) {
    return (
      <Text variant="bodySmall" tone="muted">
        {SITES_COPY.firstSites}
      </Text>
    );
  }
  const { today, week } = site;
  return (
    <View style={styles.figures}>
      <Figure label={SITES_COPY.bookingsToday} value={String(today.bookings)} />
      <Figure label={SITES_COPY.nextBooking} value={today.next_booking_time ?? SITES_COPY.nextBookingNone} />
      <Figure label={SITES_COPY.bookedThisWeek} value={formatMoney(week.booked_pence, site.currency)} />
      <Figure
        label={SITES_COPY.newBookingsThisWeek}
        value={String(week.new_bookings)}
        sub={week.new_bookings_cancelled > 0 ? SITES_COPY.sinceCancelled(week.new_bookings_cancelled) : null}
      />
      <Figure label={SITES_COPY.noShowsThisWeek} value={String(week.no_shows)} />
      {week.net_takings_pence !== null ? (
        <Figure label={SITES_COPY.netTakingsThisWeek} value={formatMoney(week.net_takings_pence, site.currency)} />
      ) : null}
    </View>
  );
}

function SiteCard({ site, current }: { site: OverviewSite; current: boolean }) {
  const switchSite = useSwitchSite();
  const [busy, setBusy] = useState<'switch' | 'plan' | null>(null);
  const [failed, setFailed] = useState(false);
  const { colors } = useTheme();

  const go = async (kind: 'switch' | 'plan') => {
    setBusy(kind);
    setFailed(false);
    try {
      await switchSite(site.venue_id, (kind === 'plan' ? '/manage/plan' : '/today') as Href);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  // A site whose subscription has ended shows its status only (§6.7).
  const statusLabel = site.state === 'ended' ? null : planStatusLabel(site.plan.status);

  return (
    <Card style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardTitle}>
          <Text variant="subheading">{site.name}</Text>
          <View style={styles.pills}>
            {site.plan.tier ? <Badge label={planDisplayName(site.plan.tier)} tone="brand" /> : null}
            {statusLabel ? (
              <Badge
                label={statusLabel}
                tone={
                  site.plan.status === 'active' || site.plan.status === 'trialing'
                    ? 'success'
                    : site.plan.status === 'past_due'
                      ? 'danger'
                      : site.plan.status === 'cancelling'
                        ? 'warning'
                        : 'neutral'
                }
              />
            ) : null}
            {current ? <Badge label={SITES_COPY.currentSite} /> : null}
          </View>
        </View>
      </View>
      <SiteFigures site={site} />
      <View style={styles.actions}>
        <Button
          label={SITES_COPY.switchAction}
          size="sm"
          loading={busy === 'switch'}
          disabled={busy !== null}
          onPress={() => void go('switch')}
          accessibilityLabel={`Switch to ${site.name}`}
        />
        {site.can_open_plan ? (
          <Button
            label={SITES_COPY.planAction}
            variant="secondary"
            size="sm"
            loading={busy === 'plan'}
            disabled={busy !== null}
            onPress={() => void go('plan')}
            accessibilityLabel={`Plan for ${site.name}`}
          />
        ) : null}
      </View>
      {failed ? (
        <Text variant="bodySmall" color={colors.danger} accessibilityRole="alert">
          {SITES_COPY.switchFailed}
        </Text>
      ) : null}
    </Card>
  );
}

function GroupTotals({ group, totals }: { group: OverviewGroup; totals: OverviewTotals }) {
  const { colors } = useTheme();
  const notes = groupTotalNotes(group);
  const takings = totals.money.filter((m) => m.net_takings_pence !== null && m.takings_sites > 0);

  return (
    <View
      accessibilityLabel={`Total for ${group.label}`}
      style={[styles.totals, { backgroundColor: colors.brandSubtle, borderColor: colors.border }]}>
      <Text variant="label" tone="brand">
        {SITES_COPY.total}
      </Text>
      {totals.sites_counted > 0 ? (
        <View style={styles.figures}>
          <Figure label={SITES_COPY.bookingsToday} value={String(totals.bookings_today)} />
          {totals.money.map((m) => (
            <Figure
              key={`booked-${m.currency}`}
              label={SITES_COPY.bookedThisWeek}
              value={formatMoney(m.booked_pence, m.currency)}
            />
          ))}
          <Figure
            label={SITES_COPY.newBookingsThisWeek}
            value={String(totals.new_bookings)}
            sub={totals.new_bookings_cancelled > 0 ? SITES_COPY.sinceCancelled(totals.new_bookings_cancelled) : null}
          />
          <Figure label={SITES_COPY.noShowsThisWeek} value={String(totals.no_shows)} />
          {takings.map((m) => {
            const of = sitesCountedIn(group.sites, m.currency);
            return (
              <Figure
                key={`takings-${m.currency}`}
                label={SITES_COPY.netTakingsThisWeek}
                value={formatMoney(m.net_takings_pence ?? 0, m.currency)}
                sub={m.takings_sites < of ? SITES_COPY.takingsCovers(m.takings_sites, of) : null}
              />
            );
          })}
        </View>
      ) : null}
      {notes.map((note) => (
        <Text key={note} variant="caption" tone="secondary">
          {note}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.xl, paddingBottom: spacing['3xl'] },
  group: { gap: spacing.md },
  card: { gap: spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { flex: 1, minWidth: 0, gap: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm },
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  figure: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  figureLabel: { textTransform: 'uppercase', letterSpacing: 0.4 },
  totals: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.base,
    gap: spacing.sm,
  },
});
