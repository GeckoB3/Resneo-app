/**
 * Inviting a venue into the collective, from the Collective area's Venues tab (web
 * `CollectiveInvitePanel`, rebuilt 2026-10-28).
 *
 * Any venue on ResNeo can be invited: find it by name or booking address, or choose one already
 * linked. Before anything is sent the host sees what joining will take, venue by venue: a venue in
 * a collective works with every other, so it needs a link with full access both ways with each
 * one. One invitation covers it (web 2026-10-28): the host's own link request goes with the
 * invitation, and when the venue accepts it is linked with every venue in the collective and
 * joins, in one step. Only a link already in force with less than full access holds it up, and
 * the row says so. The members route checks everything again on send.
 *
 * One sheet: finding a venue and its checklist are steps of it, never a second sheet over it, and
 * an error shows inside it (a toast would sit behind it).
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SearchBar } from '@/components/ui/SearchBar';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { areaCopy } from '@/lib/collective-area/copy';
import { inviteBlocked, inviteLinkWords, inviteSentMessage } from '@/lib/collective-area/invite-links';
import { setupCopy } from '@/lib/linked/setup-copy';
import { venueNotFoundLine, venueWhereLine } from '@/lib/linked/venue-where';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useCollectiveMembersPatch } from '@/lib/queries/useCollectiveArea';
import { fetchInviteCheck, useCollectiveCandidates } from '@/lib/queries/useCollectiveLinks';
import { useVenueLookup, useVenueSearch } from '@/lib/queries/useLinkedVenues';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { InviteCheck } from '@/types/collectives';

const SEARCH_DEBOUNCE_MS = 300;

export function InviteVenueSheet({
  visible,
  collectiveId,
  collectiveName,
  excludeVenueIds,
  onClose,
  onOpenLinked,
}: {
  visible: boolean;
  collectiveId: string;
  collectiveName: string;
  /** Venues already in the collective or invited to it, which are not offered again. */
  excludeVenueIds: string[];
  onClose: () => void;
  /** Linked venues, where links are made, changed and ended; the sheet closes first. */
  onOpenLinked: () => void;
}) {
  const { colors } = useTheme();
  const accessToken = useAccessToken();
  const candidates = useCollectiveCandidates({ enabled: visible });
  const patch = useCollectiveMembersPatch(collectiveId);
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [check, setCheck] = useState<InviteCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  // Opened afresh each time, set while rendering so nothing from last time flashes.
  const [openedFor, setOpenedFor] = useState(visible);
  if (visible !== openedFor) {
    setOpenedFor(visible);
    if (visible) {
      setInput('');
      setDebounced('');
      setCheck(null);
      setError(null);
      setSent(null);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const search = useVenueSearch(visible && !check ? debounced : '');
  const results = search.data?.results ?? [];
  // A pasted booking address the name search does not find is looked up directly.
  const slugCandidate = debounced.length >= 2 && !/\s/.test(debounced) ? debounced.toLowerCase() : '';
  const noResults = search.isSuccess && results.length === 0;
  const lookup = useVenueLookup(noResults ? slugCandidate : '');
  const looked = lookup.data && lookup.data.found ? { name: lookup.data.name, slug: lookup.data.slug } : null;

  const busy = checking || patch.isPending;

  /** What inviting this venue will take, read fresh each time one is chosen. */
  const choose = async (query: { venueId: string } | { slug: string }) => {
    if (!accessToken) return;
    setChecking(true);
    setError(null);
    setSent(null);
    setCheck(null);
    try {
      setCheck(await fetchInviteCheck(accessToken, collectiveId, query));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : areaCopy('ov.venues.invite.checkFailed'));
    } finally {
      setChecking(false);
    }
  };

  const send = () => {
    if (!check) return;
    setError(null);
    patch.mutate(
      { action: 'invite', venueId: check.venue.id },
      {
        onSuccess: () => {
          setSent(inviteSentMessage(check));
          setCheck(null);
          setInput('');
          setDebounced('');
          void candidates.refetch();
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : 'That did not go through. Please try again.'),
      },
    );
  };

  const shownCandidates = (candidates.data ?? []).filter((c) => !excludeVenueIds.includes(c.venue_id));

  return (
    <Sheet visible={visible} onClose={() => (patch.isPending ? undefined : onClose())} maxHeight="92%" fill>
      <View style={styles.header}>
        <Text variant="subheading">{areaCopy('ov.venues.invite.title', { collective: collectiveName })}</Text>
        <Text variant="bodySmall" tone="secondary">
          {areaCopy('ov.venues.invite.body')}
        </Text>
      </View>
      <ScrollView style={styles.flex1} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {sent ? (
          <View
            accessibilityLiveRegion="polite"
            style={[styles.notice, { backgroundColor: colors.successSurface, borderColor: colors.success }]}
          >
            <Text variant="bodySmall">{sent}</Text>
          </View>
        ) : null}
        {error ? (
          <View
            accessibilityRole="alert"
            style={[styles.notice, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}
          >
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          </View>
        ) : null}

        {check ? (
          <View style={[styles.check, { borderColor: colors.border }]}>
            <View style={styles.checkHead}>
              <Text variant="bodyMedium" style={styles.flex1}>
                {check.venue.name}
              </Text>
              {check.standing.standing === 'no_payments' ? (
                <Badge label={areaCopy('create.venues.pill.noPayments')} tone="warning" />
              ) : null}
            </View>
            {check.already ? (
              <Text variant="bodySmall">
                {areaCopy(check.already === 'active' ? 'ov.venues.invite.alreadyIn' : 'ov.venues.invite.alreadyInvited', {
                  venue: check.venue.name,
                  collective: collectiveName,
                })}
              </Text>
            ) : check.standing.standing === 'blocked' ? (
              <Text variant="bodySmall" color={colors.warning}>
                {check.standing.reason ?? ''}
              </Text>
            ) : (
              <>
                {check.standing.standing === 'no_payments' && check.standing.reason ? (
                  <Text variant="caption" color={colors.warning}>
                    {check.standing.reason}
                  </Text>
                ) : null}
                <Text variant="caption" tone="secondary">
                  {areaCopy('ov.venues.invite.linksHelp', { venue: check.venue.name, collective: collectiveName })}
                </Text>
                {check.links.map((need) => (
                  <View key={need.venue_id} style={styles.linkRow}>
                    <Text variant="bodySmall" color={need.state === 'full' ? colors.success : colors.textMuted}>
                      {need.state === 'full' ? '✓' : '•'}
                    </Text>
                    <View style={styles.flex1}>
                      <Text variant="label">
                        {need.is_host ? areaCopy('svc.cal.venueYou', { venue: need.venue_name }) : need.venue_name}
                      </Text>
                      <Text variant="caption" tone="secondary">
                        {inviteLinkWords(need, check.venue.name)}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
            {!inviteBlocked(check) ? (
              <Button
                label={areaCopy('ov.venues.invite.sendTo', { venue: check.venue.name })}
                fullWidth
                loading={patch.isPending}
                disabled={patch.isPending}
                onPress={send}
              />
            ) : null}
            <Button
              label={areaCopy('ov.venues.invite.another')}
              variant="ghost"
              fullWidth
              disabled={patch.isPending}
              onPress={() => {
                setCheck(null);
                setError(null);
              }}
            />
          </View>
        ) : (
          <>
            <SearchBar
              value={input}
              onChangeText={setInput}
              onClear={() => setInput('')}
              placeholder="Venue name or booking-page address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />
            {debounced.length > 0 && debounced.length < 2 ? (
              <Text variant="caption" tone="muted">
                Keep typing to search.
              </Text>
            ) : null}
            {search.isFetching || lookup.isFetching ? (
              <View style={styles.statusRow}>
                <ActivityIndicator size="small" color={colors.brand} />
                <Text variant="caption" tone="muted">
                  Searching...
                </Text>
              </View>
            ) : search.isError ? (
              <Text variant="caption" tone="danger">
                {search.error instanceof ApiError ? search.error.message : 'Could not search venues.'}
              </Text>
            ) : null}
            {results.length > 0 || looked ? (
              <View style={[styles.list, { borderColor: colors.border }]}>
                {(results.length > 0 ? results : looked ? [looked] : []).map((r, i) => (
                  <Pressable
                    key={r.slug}
                    accessibilityRole="button"
                    accessibilityLabel={areaCopy('ov.venues.invite.chooseVenue', { venue: r.name })}
                    disabled={busy}
                    onPress={() => void choose({ slug: r.slug })}
                    style={({ pressed }) => [
                      styles.resultRow,
                      { opacity: pressed ? 0.6 : 1 },
                      i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null,
                    ]}
                  >
                    <View style={styles.flex1}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {r.name}
                      </Text>
                      {/* "Holywood · /book/aura-2", and the shared page it was found on (CQ-07, CQ-09). */}
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {venueWhereLine(r) ?? `/book/${r.slug}`}
                      </Text>
                      {(r as { collective_name?: string | null }).collective_name ? (
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {setupCopy('setup.venue.onPage', {
                            collective: (r as { collective_name?: string | null }).collective_name,
                          })}
                        </Text>
                      ) : null}
                    </View>
                    <Text variant="label" tone="brand">
                      {areaCopy('ov.venues.invite.choose')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : noResults && !lookup.isFetching && slugCandidate ? (
              <Text variant="bodySmall" tone="muted">
                {venueNotFoundLine(search.data?.query_kind)}
              </Text>
            ) : null}
            {checking ? (
              <View style={styles.statusRow} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color={colors.brand} />
                <Text variant="caption" tone="muted">
                  {areaCopy('ov.venues.invite.checking')}
                </Text>
              </View>
            ) : null}

            {candidates.isError ? (
              <Text variant="bodySmall" tone="danger">
                {areaCopy('ov.venues.invite.loadFailed')}
              </Text>
            ) : candidates.isLoading ? (
              <Text variant="caption" tone="muted">
                Loading...
              </Text>
            ) : shownCandidates.length > 0 ? (
              <View style={styles.group}>
                <Text variant="label">{areaCopy('ov.venues.invite.linkedHeading')}</Text>
                <View style={[styles.list, { borderColor: colors.border }]}>
                  {shownCandidates.map((c, i) => (
                    <View
                      key={c.venue_id}
                      style={[
                        styles.resultRow,
                        i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null,
                      ]}
                    >
                      <View style={styles.flex1}>
                        <Text variant="bodyMedium">{c.venue_name}</Text>
                        {c.standing === 'blocked' && c.reason ? (
                          <Text variant="caption" tone="secondary">
                            {c.reason}
                          </Text>
                        ) : null}
                      </View>
                      {/* A venue that cannot join says why and stops there; any other shows what joining takes. */}
                      {c.standing !== 'blocked' ? (
                        <Button
                          label={areaCopy('ov.venues.invite.choose')}
                          variant="secondary"
                          size="sm"
                          accessibilityLabel={areaCopy('ov.venues.invite.chooseVenue', { venue: c.venue_name })}
                          disabled={busy}
                          onPress={() => void choose({ venueId: c.venue_id })}
                        />
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            <Text variant="caption" tone="secondary">
              {areaCopy('ov.venues.invite.manageLinks')}
            </Text>
            <Button
              label={areaCopy('ov.venues.invite.linkCta')}
              variant="ghost"
              size="sm"
              style={styles.start}
              onPress={onOpenLinked}
            />
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Button label={areaCopy('ov.venues.invite.close')} variant="secondary" fullWidth disabled={patch.isPending} onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  header: { paddingHorizontal: spacing.lg, gap: spacing.xxs },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  notice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing.md },
  check: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  checkHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  linkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  group: { gap: spacing.xs },
  list: { borderWidth: 1, borderRadius: radius.card, overflow: 'hidden' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    minHeight: minTouchTarget,
  },
  start: { alignSelf: 'flex-start' },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
