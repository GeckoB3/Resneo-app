/**
 * Manage Collective, Clients (web `CollectiveClientsPanel`; plan §1A.2 step 3, mockup board 1).
 *
 * The venue's three choices (share or not, who with, ask before matching), the venues it shares
 * with in one word each, the counts and "Up to date", progress while lists are brought together,
 * and for the host the offer switch and Ask everyone to share. The server decides; this draws what
 * GET .../client-sharing says, in the web's words.
 */
import * as WebBrowser from 'expo-web-browser';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Switch, View } from 'react-native';

import { BringTogetherSheet } from '@/components/collective-area/BringTogetherSheet';
import { Button } from '@/components/ui/Button';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { clientSharingCopy, formatClientCount } from '@/lib/collective-area/client-sharing-copy';
import { getWebUrl } from '@/lib/env';
import {
  useAskEveryoneToShare,
  useClientSharingStatus,
  useDismissClientSharing,
  useSetClientSharing,
  useStopClientSharing,
} from '@/lib/queries/useClientSharing';
import { useToast } from '@/providers/ToastProvider';
import { accent, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ClientSharingStatusResponse, ClientSharingVenue } from '@/types/client-sharing';

export const SHARED_CLIENTS_HELP_PATH = '/help/getting-started/shared-client-lists';

/** The venue list's word for another venue (§1A.4). */
export function venueStatusWord(v: ClientSharingVenue): string {
  switch (v.status) {
    case 'sharing':
      return clientSharingCopy('cs.state.sharing');
    case 'waiting':
      return clientSharingCopy('cs.state.waiting', { venue: v.name });
    case 'waiting_start':
      return clientSharingCopy('cs.state.waitingStart', { venue: v.name });
    case 'waiting_you':
      return clientSharingCopy('cs.state.waitingYou');
    case 'paused':
      return clientSharingCopy('cs.state.paused');
    case 'left_out':
      return clientSharingCopy('cs.state.leftOut');
    default:
      return clientSharingCopy('cs.state.notSharing');
  }
}

/** "1,240 clients here, 310 from the other venues, 96 in both." */
export function countsLine(s: ClientSharingStatusResponse): string {
  return clientSharingCopy('cs.tab.counts', {
    here: formatClientCount(s.counts.here),
    fromOthers: formatClientCount(s.counts.fromOthers),
    inBoth: formatClientCount(s.counts.inBoth),
  });
}

/** The progress line: "almost done" in the last minute, else about how many minutes. */
export function progressLine(progress: { minutesLeft: number }): string {
  return progress.minutesLeft <= 1
    ? clientSharingCopy('cs.tab.progressSoon')
    : clientSharingCopy('cs.tab.progress', { minutes: progress.minutesLeft });
}

function openHelp() {
  const url = `${getWebUrl() || 'https://www.resneo.com'}${SHARED_CLIENTS_HELP_PATH}`;
  void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined));
}

type Ask =
  | { kind: 'stop' }
  | { kind: 'offerOff' }
  | { kind: 'askEveryone' }
  | { kind: 'exclude'; venue: ClientSharingVenue }
  | null;

export function ClientsPanel({
  collectiveId,
  isHost,
  openBringTogether = false,
  onBringTogetherOpened,
}: {
  collectiveId: string;
  isHost: boolean;
  /** Share now in "What needs you" said yes and the lists still need bringing together: open the sheet. */
  openBringTogether?: boolean;
  /** The sheet opened for `openBringTogether`; the screen clears its ask so it opens once. */
  onBringTogetherOpened?: () => void;
}) {
  const { colors, isDark } = useTheme();
  // Teal words on white need the dark teal for 4.5:1 contrast (the web's accent-700).
  const statusTeal = isDark ? colors.accent : accent[700];
  const router = useRouter();
  const toast = useToast();
  const statusQuery = useClientSharingStatus(collectiveId);
  const setSharing = useSetClientSharing(collectiveId);
  const stop = useStopClientSharing(collectiveId);
  const askEveryone = useAskEveryoneToShare(collectiveId);
  const dismiss = useDismissClientSharing(collectiveId);
  const [ask, setAsk] = useState<Ask>(null);
  const [bringTogether, setBringTogether] = useState(false);
  useEffect(() => {
    if (!openBringTogether) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBringTogether(true);
    onBringTogetherOpened?.();
  }, [openBringTogether, onBringTogetherOpened]);
  const status = statusQuery.data;
  const updatedAt = statusQuery.dataUpdatedAt;

  // "Done. Your list now has N clients." once lists finish coming together. Armed when this venue
  // presses Bring together (the web sets `wasRunning` on start) or when a read shows progress, and
  // fired by the first read after that with no progress. Reads older than the arming never count.
  const armedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!status) return;
    if (status.progress) {
      if (armedAt.current === null) armedAt.current = updatedAt - 1;
      return;
    }
    if (armedAt.current === null || updatedAt <= armedAt.current) return;
    armedAt.current = null;
    toast.success(
      clientSharingCopy('cs.progress.done', {
        count: formatClientCount(status.counts.here + status.counts.fromOthers),
      }),
    );
  }, [status, updatedAt, toast]);

  const fail = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : clientSharingCopy('cs.error.generic'));

  const turnOn = () =>
    setSharing.mutate(
      { share: true },
      {
        onSuccess: (data) => {
          if (data.needsBringTogether) setBringTogether(true);
        },
        onError: fail,
      },
    );

  if (statusQuery.isLoading) return <ListSkeleton rows={3} />;
  if (statusQuery.isError || !status) {
    return (
      <ErrorState
        message={
          statusQuery.error instanceof ApiError ? statusQuery.error.message : clientSharingCopy('cs.error.generic')
        }
        onRetry={() => void statusQuery.refetch()}
        retryLabel={clientSharingCopy('cs.error.retry')}
      />
    );
  }

  const me = status.me;
  const on = me.state === 'on';
  const anyPending = setSharing.isPending || stop.isPending || dismiss.isPending || askEveryone.isPending;
  const toCheck = status.todo.toCheck + status.todo.changes;
  const cardStyle = [styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }];

  return (
    <View style={styles.wrap}>
      {me.request && !on ? (
        <View style={[styles.card, { backgroundColor: colors.accentSubtle, borderColor: colors.accent }]}>
          <Text variant="bodySmall">{clientSharingCopy('cs.todo.asked', { venue: me.request.byVenueName })}</Text>
          <View style={styles.rowButtons}>
            <Button
              label={clientSharingCopy('cs.todo.share')}
              size="sm"
              loading={setSharing.isPending}
              disabled={anyPending}
              onPress={turnOn}
            />
            <Button
              label={clientSharingCopy('cs.todo.notNow')}
              size="sm"
              variant="secondary"
              loading={dismiss.isPending}
              disabled={anyPending}
              onPress={() => dismiss.mutate('request', { onError: fail })}
            />
          </View>
        </View>
      ) : null}

      {toCheck > 0 ? (
        <View style={[styles.card, styles.todo, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
          <Text variant="bodySmall">
            {toCheck === 1
              ? clientSharingCopy('cs.todo.checkOne')
              : clientSharingCopy('cs.todo.check', { count: formatClientCount(toCheck) })}
          </Text>
          <Button
            label={clientSharingCopy('cs.todo.open')}
            size="sm"
            variant="secondary"
            onPress={() => router.push(`/client/check?collective=${collectiveId}` as Href)}
          />
        </View>
      ) : null}

      {isHost ? (
        <View style={cardStyle}>
          <Text variant="caption" tone="secondary" accessibilityRole="header" style={styles.hostHeading}>
            {clientSharingCopy('cs.tab.hostHeading')}
          </Text>
          <View style={styles.switchRow}>
            <Text variant="bodyMedium" style={styles.flex1}>
              {clientSharingCopy('cs.tab.offer')}
            </Text>
            <Switch
              accessibilityLabel={clientSharingCopy('cs.tab.offer')}
              value={status.offered}
              disabled={setSharing.isPending}
              onValueChange={(next) =>
                next ? setSharing.mutate({ offered: true }, { onError: fail }) : setAsk({ kind: 'offerOff' })
              }
              trackColor={{ true: colors.brand, false: colors.border }}
              thumbColor={colors.surfaceRaised}
            />
          </View>
          <Text variant="bodySmall" tone="secondary">
            {clientSharingCopy('cs.tab.offerHelp')}
          </Text>
          {status.offered && status.undecidedCount > 0 ? (
            <Button
              label={clientSharingCopy('cs.tab.askEveryone')}
              variant="secondary"
              loading={askEveryone.isPending}
              disabled={anyPending}
              onPress={() => setAsk({ kind: 'askEveryone' })}
            />
          ) : null}
        </View>
      ) : null}

      {!status.offered ? (
        <View style={cardStyle}>
          <Text variant="bodySmall" tone="secondary">
            {isHost ? clientSharingCopy('cs.tab.notOfferedHost') : clientSharingCopy('cs.tab.notOffered')}
          </Text>
        </View>
      ) : (
        <View style={cardStyle}>
          <View style={styles.switchRow}>
            <View style={styles.flex1}>
              <Text variant="bodyMedium">{clientSharingCopy('cs.tab.switch')}</Text>
              <Text variant="bodySmall" tone="secondary">
                {clientSharingCopy('cs.tab.switchHelp')}
              </Text>
            </View>
            <Switch
              accessibilityLabel={clientSharingCopy('cs.tab.switch')}
              value={on}
              disabled={setSharing.isPending || stop.isPending}
              onValueChange={(next) => (next ? turnOn() : setAsk({ kind: 'stop' }))}
              trackColor={{ true: colors.brand, false: colors.border }}
              thumbColor={colors.surfaceRaised}
            />
          </View>

          {on && !me.started ? (
            <View style={[styles.bringRow, { backgroundColor: colors.surface }]}>
              <Text variant="bodySmall" style={styles.flex1}>
                {clientSharingCopy('cs.join.body1')}
              </Text>
              <Button
                label={clientSharingCopy('cs.tab.bringTogether')}
                size="sm"
                disabled={anyPending}
                onPress={() => setBringTogether(true)}
              />
            </View>
          ) : null}

          {status.progress ? (
            <View style={styles.progressWrap}>
              <Text variant="bodySmall" accessibilityLiveRegion="polite">
                {progressLine(status.progress)}
              </Text>
              <View
                accessibilityRole="progressbar"
                accessibilityLabel={clientSharingCopy('cs.tab.progressLabel', {
                  done: formatClientCount(status.progress.done),
                  total: formatClientCount(status.progress.total),
                })}
                accessibilityValue={{ min: 0, max: status.progress.total || 1, now: status.progress.done }}
                style={[styles.track, { backgroundColor: colors.border }]}
              >
                <View
                  style={[
                    styles.bar,
                    {
                      backgroundColor: colors.accent,
                      width: `${
                        status.progress.total > 0
                          ? Math.min(100, Math.round((status.progress.done / status.progress.total) * 100))
                          : 5
                      }%`,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {/* "Sharing with" only while this venue shares: otherwise it read as if it still did. */}
          {on && status.venues.length > 0 ? (
            <View style={styles.venues}>
              <Text variant="caption" tone="secondary">
                {clientSharingCopy('cs.tab.sharingWith')}
              </Text>
              {status.venues.map((v) => (
                <View key={v.venueId} style={styles.venueRow}>
                  <Text variant="bodySmall" style={styles.flex1}>
                    {v.name}
                  </Text>
                  <Text
                    variant="bodySmall"
                    tone={v.status === 'sharing' ? undefined : 'secondary'}
                    color={v.status === 'sharing' ? statusTeal : undefined}
                    style={styles.venueStatus}
                  >
                    {venueStatusWord(v)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {on && status.venues.length > 0 ? (
            <CollapsibleCard title={clientSharingCopy('cs.tab.changeWho')}>
              <View style={styles.venues}>
                <Text variant="bodySmall" tone="secondary">
                  {clientSharingCopy('cs.tab.changeWhoHelp')}
                </Text>
                {status.venues.map((v) => (
                  <View key={v.venueId} style={styles.switchRow}>
                    <Text variant="bodySmall" style={styles.flex1}>
                      {v.name}
                    </Text>
                    <Switch
                      accessibilityLabel={`${clientSharingCopy('cs.tab.changeWho')}: ${v.name}`}
                      value={!v.excluded}
                      disabled={setSharing.isPending || stop.isPending}
                      onValueChange={(next) =>
                        next
                          ? setSharing.mutate(
                              { excluded_venue_ids: me.excludedVenueIds.filter((id) => id !== v.venueId) },
                              { onError: fail },
                            )
                          : setAsk({ kind: 'exclude', venue: v })
                      }
                      trackColor={{ true: colors.brand, false: colors.border }}
                      thumbColor={colors.surfaceRaised}
                    />
                  </View>
                ))}
              </View>
            </CollapsibleCard>
          ) : null}

          {on ? (
            <View style={styles.switchRow}>
              <View style={styles.flex1}>
                <Text variant="bodySmall">{clientSharingCopy('cs.tab.askFirst')}</Text>
                <Text variant="caption" tone="secondary">
                  {clientSharingCopy('cs.tab.askFirstHelp')}
                </Text>
              </View>
              <Switch
                accessibilityLabel={clientSharingCopy('cs.tab.askFirst')}
                value={me.askFirst}
                disabled={setSharing.isPending}
                onValueChange={(next) => setSharing.mutate({ ask_first: next }, { onError: fail })}
                trackColor={{ true: colors.brand, false: colors.border }}
                thumbColor={colors.surfaceRaised}
              />
            </View>
          ) : null}

          {on && me.started ? (
            <View style={[styles.counts, { backgroundColor: colors.surface }]}>
              <Text variant="bodySmall">
                {countsLine(status)}{' '}
                <Text variant="bodySmall" color={status.arriving > 0 ? undefined : statusTeal}>
                  {status.arriving > 0
                    ? clientSharingCopy('cs.tab.arriving', { count: formatClientCount(status.arriving) })
                    : clientSharingCopy('cs.tab.upToDate')}
                </Text>
              </Text>
            </View>
          ) : null}

          {!on && me.state !== 'undecided' ? (
            <Text variant="bodySmall" tone="secondary">
              {clientSharingCopy('cs.tab.youAreOff')}
            </Text>
          ) : null}

          <Text variant="caption" tone="secondary">
            {clientSharingCopy('cs.whatShared')}
          </Text>
          <Text variant="caption" tone="secondary">
            {clientSharingCopy('cs.safe')}
          </Text>
          <Button label={clientSharingCopy('cs.tab.help')} variant="ghost" size="sm" style={styles.help} onPress={openHelp} />
        </View>
      )}

      <ConfirmSheet
        visible={ask?.kind === 'stop'}
        title={clientSharingCopy('cs.stop.title')}
        message={clientSharingCopy('cs.stop.body', { count: formatClientCount(status.counts.shared) })}
        confirmLabel={clientSharingCopy('cs.stop.confirm')}
        destructive={false}
        loading={stop.isPending}
        onClose={() => setAsk(null)}
        onConfirm={() =>
          stop.mutate(undefined, {
            onSuccess: () => {
              setAsk(null);
              toast.success(clientSharingCopy('cs.stop.done'));
            },
            onError: fail,
          })
        }
      />
      <ConfirmSheet
        visible={ask?.kind === 'exclude'}
        title={clientSharingCopy('cs.stop.excludeTitle', { venue: ask?.kind === 'exclude' ? ask.venue.name : '' })}
        message={clientSharingCopy('cs.stop.excludeBody')}
        confirmLabel={clientSharingCopy('cs.stop.confirm')}
        destructive={false}
        loading={stop.isPending}
        onClose={() => setAsk(null)}
        onConfirm={() => {
          if (ask?.kind !== 'exclude') return;
          stop.mutate(ask.venue.venueId, { onSuccess: () => setAsk(null), onError: fail });
        }}
      />
      <ConfirmSheet
        visible={ask?.kind === 'askEveryone'}
        title={clientSharingCopy('cs.tab.askConfirm.title')}
        message={clientSharingCopy('cs.tab.askConfirm.body')}
        confirmLabel={clientSharingCopy('cs.tab.askConfirm.confirm')}
        destructive={false}
        loading={askEveryone.isPending}
        onClose={() => setAsk(null)}
        onConfirm={() =>
          askEveryone.mutate(undefined, {
            onSuccess: (res) => {
              setAsk(null);
              toast.success(
                res.asked === 1
                  ? clientSharingCopy('cs.tab.askedOne')
                  : clientSharingCopy('cs.tab.asked', { count: formatClientCount(res.asked) }),
              );
            },
            onError: (err) => {
              setAsk(null);
              fail(err);
            },
          })
        }
      />
      <ConfirmSheet
        visible={ask?.kind === 'offerOff'}
        title={clientSharingCopy('cs.tab.offerOff.title')}
        message={clientSharingCopy('cs.tab.offerOff.body')}
        confirmLabel={clientSharingCopy('cs.tab.offerOff.confirm')}
        loading={setSharing.isPending}
        onClose={() => setAsk(null)}
        onConfirm={() => setSharing.mutate({ offered: false }, { onSuccess: () => setAsk(null), onError: fail })}
      />
      <BringTogetherSheet
        collectiveId={collectiveId}
        visible={bringTogether}
        onClose={() => setBringTogether(false)}
        onStarted={() => {
          // Arm the "Done" message now, as the web does on start: a read that never caught the
          // progress line (a small list finishes between polls) still ends with it.
          armedAt.current = Date.now() - 1;
          void statusQuery.refetch();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  todo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  rowButtons: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  flex1: { flex: 1 },
  venues: { gap: spacing.xs },
  venueRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, minHeight: 28 },
  venueStatus: { flexShrink: 1, textAlign: 'right', maxWidth: '60%' },
  counts: { borderRadius: radius.card, padding: spacing.sm },
  bringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    borderRadius: radius.card,
    padding: spacing.sm,
  },
  hostHeading: { textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
  progressWrap: { gap: spacing.xs },
  track: { height: 8, borderRadius: 8, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 8 },
  help: { alignSelf: 'flex-start' },
});
