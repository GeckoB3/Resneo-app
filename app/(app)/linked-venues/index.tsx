import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AcceptInviteSheet } from '@/components/linked/AcceptInviteSheet';
import { LinkedNotificationPrefsCard } from '@/components/linked/LinkedNotificationPrefsCard';
import { InviteLinkSheet } from '@/components/linked/InviteLinkSheet';
import { LinkSetupSheet } from '@/components/linked/setup/LinkSetupSheet';
import { ReviewLinkRequestSheet } from '@/components/linked/setup/ReviewLinkRequestSheet';
import { LinkStatusBadge } from '@/components/linked/LinkStatusBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Dot } from '@/components/ui/Dot';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { summariseGrant } from '@/lib/linked/grants';
import { setupCopy } from '@/lib/linked/setup-copy';
import { terminationReasonLabel } from '@/lib/linked/linkStatus';
import { useLinkedVenues, useMyCalendars, useRespondLink } from '@/lib/queries/useLinkedVenues';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useToast } from '@/providers/ToastProvider';
import { spacing, radius } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import {
  LINK_COUNT_SOFT_WARNING,
  PAST_LINK_STATUSES,
  type AccountLinkView,
  type LinkGrant,
} from '@/types/linked-venues';

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function LinkRow({
  title,
  subtitle,
  status,
  isFirst,
  onPress,
}: {
  title: string;
  subtitle?: string;
  status?: AccountLinkView['status'];
  isFirst: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      <View
        style={[
          styles.row,
          !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
        ]}>
        <View style={styles.rowBody}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.rowTrailing}>
          {status ? <LinkStatusBadge status={status} /> : null}
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            tintColor={colors.textMuted}
            size={14}
          />
        </View>
      </View>
    </PressableScale>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="overline" tone="muted" style={styles.sectionTitle}>
        {title}
      </Text>
      <Card padded={false}>{children}</Card>
    </View>
  );
}

/**
 * First-run explainer for the zero-links empty state (web §19.6 parity). Replaces
 * the plain EmptyState with the web card's three data-sharing bullets so a new
 * admin understands the model before sending a request. Copy is ported verbatim
 * from the web card. No dismiss-persistence — it only shows while there are zero
 * links (so it self-hides as soon as the first link exists).
 */
function OnboardingExplainer() {
  const { colors } = useTheme();
  const bullets = [
    'You stay the sole owner of your bookings and clients: linking shares access, never data.',
    'You choose, per direction, what each venue can see and do, down to specific calendars.',
    'Either venue can reduce access or unlink at any time; nothing is shared after that.',
  ];
  return (
    <Card style={styles.explainer}>
      <View style={styles.explainerHead}>
        <View style={[styles.explainerIcon, { backgroundColor: colors.brandSubtle }]}>
          <SymbolView
            name={{ ios: 'link', android: 'link', web: 'link' }}
            tintColor={colors.brand}
            size={22}
          />
        </View>
        <Text variant="subheading" style={styles.flex1}>
          Work alongside another venue
        </Text>
      </View>
      <Text variant="bodySmall" tone="secondary">
        Linking lets two venues see each other’s calendars and (if you choose) manage each other’s
        bookings. Ideal for chair-rental, co-located practitioners or a shared brand.
      </Text>
      <View style={styles.bullets}>
        {bullets.map((b) => (
          <View key={b} style={styles.bulletRow}>
            <Dot color={colors.brand} size={6} style={styles.bulletDot} />
            <Text variant="bodySmall" tone="secondary" style={styles.flex1}>
              {b}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function LinkedVenuesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';

  const query = useLinkedVenues();
  const respond = useRespondLink();
  const calendarsQuery = useMyCalendars();
  const myCalendars = calendarsQuery.data?.calendars ?? [];

  const [reviewLink, setReviewLink] = useState<AccountLinkView | null>(null);
  const [cancelLink, setCancelLink] = useState<AccountLinkView | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  // Token to seed the verify sheet with: the deep-link token on auto-open, null
  // for a manual paste. Captured into state so a lingering `?invite=` param can't
  // re-seed a later manual open.
  const [acceptToken, setAcceptToken] = useState<string | null>(null);
  const [invitePrefill, setInvitePrefill] = useState<{ slug: string; name: string } | null>(null);

  // Receiving end of an invite: a deep link (`/linked-venues?invite=<token>`)
  // opens the verify sheet once; manual paste opens it from the entry prompt.
  const params = useLocalSearchParams<{ invite?: string; review?: string }>();
  const inviteParam = typeof params.invite === 'string' ? params.invite : null;
  const inviteHandledRef = useRef(false);
  useEffect(() => {
    if (inviteParam && !inviteHandledRef.current) {
      inviteHandledRef.current = true;
      setInvitePrefill(null);
      setAcceptToken(inviteParam);
      setAcceptOpen(true);
    }
  }, [inviteParam]);
  // The banner's "Review request" (`/linked-venues?review=<linkId>`, web plan §4) opens the
  // review sheet once the list has that request. Captured once, so a later refresh of the
  // list does not reopen a request that has been answered.
  const reviewParam = typeof params.review === 'string' ? params.review : null;
  const reviewHandledRef = useRef(false);

  // A verified invite resolves to a venue → open the request editor pre-filled.
  const handleInviteVerified = (venue: { slug: string; name: string }) => {
    setAcceptOpen(false);
    setInvitePrefill(venue);
    setSendOpen(true);
  };

  const links = useMemo<AccountLinkView[]>(() => query.data?.links ?? [], [query.data?.links]);
  const maxOutgoing = query.data?.maxOutgoingPending ?? 10;
  /** The collective invitation riding on a pending request, by link id (web plan L11). */
  const proposedCollectives = query.data?.proposedCollectives ?? {};
  const myVenue = query.data?.venue ?? null;

  useEffect(() => {
    if (!reviewParam || reviewHandledRef.current) return;
    const match = links.find((l) => l.id === reviewParam && l.status === 'pending' && !l.initiatedByMe);
    if (!match) return;
    reviewHandledRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewLink(match);
  }, [reviewParam, links]);

  const { incoming, sent, active, past } = useMemo(() => {
    return {
      incoming: links.filter((l) => l.status === 'pending' && !l.initiatedByMe),
      sent: links.filter((l) => l.status === 'pending' && l.initiatedByMe),
      active: links.filter((l) => l.status === 'accepted' || l.status === 'suspended'),
      past: links.filter((l) => PAST_LINK_STATUSES.includes(l.status)),
    };
  }, [links]);

  const liveCount = incoming.length + sent.length + active.length;
  const respondingTo = respond.isPending ? respond.variables?.linkId : undefined;

  const handleCancel = () => {
    if (!cancelLink) return;
    respond.mutate(
      { linkId: cancelLink.id, action: 'cancel' },
      {
        onSuccess: () => {
          toast.success('Request cancelled.');
          setCancelLink(null);
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Could not cancel the request.'),
      },
    );
  };

  // --- gates -----------------------------------------------------------------

  if (!staffQuery.isLoading && !isAdmin) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Linked venues' }} />
        <EmptyState
          title="Admins only"
          message="Linked venues are managed by venue admins. Ask an admin at your venue to set up links."
        />
      </Screen>
    );
  }

  if (query.isLoading || staffQuery.isLoading) {
    return (
      <Screen padded={false}>
        <Stack.Screen options={{ title: 'Linked venues' }} />
        <ListSkeleton rows={5} />
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Linked venues' }} />
        <ErrorState
          message={
            query.error instanceof ApiError ? query.error.message : 'Could not load linked venues.'
          }
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  const eligibility = query.data?.eligibility;
  if (eligibility && !eligibility.feature) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Linked venues' }} />
        <EmptyState
          title="Not available on this plan"
          message={eligibility.reason ?? 'Linked venues is available to appointments-family venues only.'}
        />
      </Screen>
    );
  }

  const canCreate = eligibility?.canCreate ?? false;
  const eligibilityHint = !canCreate ? eligibility?.reason ?? null : null;

  // Shared across the empty + populated layouts so the invite flow behaves
  // identically in both. `prefill` is set when arriving from a verified invite.
  const invitePrompt = canCreate ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Have an invite link?"
      hitSlop={8}
      onPress={() => {
        setInvitePrefill(null);
        setAcceptToken(null);
        setAcceptOpen(true);
      }}
      style={({ pressed }) => [styles.invitePrompt, pressed ? styles.pressed : null]}>
      <Text variant="label" tone="brand">
        Have an invite link?
      </Text>
    </Pressable>
  ) : null;

  const sendSheet = (
    <LinkSetupSheet
      visible={sendOpen}
      prefill={invitePrefill}
      venueName={myVenue?.name ?? 'Your venue'}
      venueSlug={myVenue?.slug ?? null}
      onClose={() => {
        setSendOpen(false);
        setInvitePrefill(null);
      }}
    />
  );
  const getInviteSheet = (
    <InviteLinkSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} />
  );
  const acceptInviteSheet = (
    <AcceptInviteSheet
      visible={acceptOpen}
      initialToken={acceptToken}
      onClose={() => setAcceptOpen(false)}
      onVerified={handleInviteVerified}
    />
  );

  if (links.length === 0) {
    return (
      <Screen scroll padded={false} contentContainerStyle={styles.emptyContent}>
        <Stack.Screen options={{ title: 'Linked venues' }} />
        <OnboardingExplainer />
        <View style={styles.emptyActions}>
          {eligibilityHint ? (
            <View
              style={[styles.notice, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
              <Text variant="caption" color={colors.warning}>
                {eligibilityHint}
              </Text>
            </View>
          ) : null}
          <Button
            label={setupCopy('setup.title')}
            fullWidth
            disabled={!canCreate}
            onPress={() => setSendOpen(true)}
          />
          <Button
            label="Get invite link"
            variant="secondary"
            fullWidth
            disabled={!canCreate}
            onPress={() => setInviteOpen(true)}
          />
          {invitePrompt}
        </View>

        {sendSheet}
        {getInviteSheet}
        {acceptInviteSheet}
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      padded={false}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.brand}
        />
      }>
      <Stack.Screen options={{ title: 'Linked venues' }} />

      <View style={styles.entryActions}>
        <Button
          label={setupCopy('setup.title')}
          style={styles.flex1}
          disabled={!canCreate}
          onPress={() => setSendOpen(true)}
        />
        <Button
          label="Get invite link"
          variant="secondary"
          style={styles.flex1}
          disabled={!canCreate}
          onPress={() => setInviteOpen(true)}
        />
      </View>

      {invitePrompt}

      {eligibilityHint ? (
        <View style={[styles.notice, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
          <Text variant="caption" color={colors.warning}>
            {eligibilityHint}
          </Text>
        </View>
      ) : null}

      {liveCount >= LINK_COUNT_SOFT_WARNING ? (
        <View style={[styles.notice, { backgroundColor: colors.infoSurface, borderColor: colors.info }]}>
          <Text variant="caption" color={colors.info}>
            {`You have ${liveCount} active or pending links. We suggest keeping fewer than ${LINK_COUNT_SOFT_WARNING} for easier management.`}
          </Text>
        </View>
      ) : null}

      {incoming.length > 0 ? (
        <Section title="Incoming requests">
          {incoming.map((link, i) => (
            <LinkRow
              key={link.id}
              isFirst={i === 0}
              title={link.otherVenue.name}
              subtitle={
                proposedCollectives[link.id]
                  ? `Wants to link with your venue and start ${proposedCollectives[link.id]!.name}, a shared booking page`
                  : 'Wants to link with your venue'
              }
              status={link.status}
              onPress={() => setReviewLink(link)}
            />
          ))}
        </Section>
      ) : null}

      {active.length > 0 ? (
        <Section title="Active">
          {active.map((link, i) => (
            <LinkRow
              key={link.id}
              isFirst={i === 0}
              title={link.otherVenue.name}
              subtitle={summariseGrant(link.iCan)}
              status={link.status}
              onPress={() => router.push(`/linked-venues/${link.id}` as Href)}
            />
          ))}
        </Section>
      ) : null}

      {sent.length > 0 ? (
        <Section title={`Sent by you (${sent.length}/${maxOutgoing})`}>
          {sent.map((link, i) => (
            <LinkRow
              key={link.id}
              isFirst={i === 0}
              title={link.otherVenue.name}
              subtitle={
                proposedCollectives[link.id]
                  ? `${setupCopy('la.sent.collective', { venue: link.otherVenue.name, collective: proposedCollectives[link.id]!.name })} Tap to cancel.`
                  : 'Sent, awaiting their response. Tap to cancel.'
              }
              status={link.status}
              onPress={() => setCancelLink(link)}
            />
          ))}
        </Section>
      ) : null}

      {past.length > 0 ? (
        <Section title="Past">
          {past.map((link, i) => (
            <LinkRow
              key={link.id}
              isFirst={i === 0}
              title={link.otherVenue.name}
              subtitle={terminationReasonLabel(link.terminationReason) ?? undefined}
              status={link.status}
              onPress={() => router.push(`/linked-venues/${link.id}` as Href)}
            />
          ))}
        </Section>
      ) : null}

      <LinkedNotificationPrefsCard />

      <ReviewLinkRequestSheet
        link={reviewLink}
        visible={reviewLink !== null}
        venueName={myVenue?.name ?? 'Your venue'}
        myCalendars={myCalendars}
        collective={reviewLink ? (proposedCollectives[reviewLink.id] ?? null) : null}
        onClose={() => setReviewLink(null)}
      />

      <ConfirmSheet
        visible={cancelLink !== null}
        title={cancelLink ? `Cancel request to ${cancelLink.otherVenue.name}?` : 'Cancel request?'}
        message="The pending link request will be withdrawn. You can send a new one later."
        confirmLabel="Cancel request"
        cancelLabel="Keep request"
        destructive
        loading={respondingTo === cancelLink?.id}
        onConfirm={handleCancel}
        onClose={() => setCancelLink(null)}
      />

      {sendSheet}
      {getInviteSheet}
      {acceptInviteSheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    marginLeft: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    minHeight: 56,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  notice: {
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.base,
  },
  entryActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  emptyContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  emptyActions: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  explainer: {
    gap: spacing.md,
  },
  explainerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  explainerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bullets: {
    gap: spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  bulletDot: {
    marginTop: 6,
  },
  flex1: {
    flex: 1,
  },
  invitePrompt: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
  },
  pressed: {
    opacity: 0.6,
  },
});
