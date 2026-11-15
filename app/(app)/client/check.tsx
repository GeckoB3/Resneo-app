/**
 * Clients to check (web `/dashboard/contacts/check`; plan §1A.2 step 6, mockup board 6).
 *
 * One card at a time: "Is this the same person?" (Same person / Different people / Not sure, skip),
 * a change another venue made (Use new / Keep mine), or two of this venue's own records to merge
 * first. Join all likely matches answers the likely ones in one go, with Undo for 24 hours. The first
 * decision anywhere in the collective wins: a card someone else answered is said so and leaves.
 *
 * Route param: collective=<id>. Owners and admins only, as on the web.
 */
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError, apiErrorCode } from '@/lib/api/client';
import { clientSharingCopy, formatClientCount, type ClientSharingCopyId } from '@/lib/collective-area/client-sharing-copy';
import {
  useClientSharingCheck,
  useDecideClientCard,
  useJoinAllLikely,
  useUndoJoinAll,
} from '@/lib/queries/useClientSharing';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ClientSharingCard, ClientSharingDecision, ClientSharingPerson } from '@/types/client-sharing';

const FIELD_IDS: Record<string, ClientSharingCopyId> = {
  first_name: 'cs.check.field.first_name',
  last_name: 'cs.check.field.last_name',
  email: 'cs.check.field.email',
  phone: 'cs.check.field.phone',
  address_line1: 'cs.check.field.address_line1',
  customer_profile_notes: 'cs.check.field.customer_profile_notes',
  dietary_preferences: 'cs.check.field.dietary_preferences',
};

/** The sentence a change card reads (also used by tests). */
export function changeSentence(card: Extract<ClientSharingCard, { kind: 'change' }>): string {
  if (card.reason === 'email_taken') {
    return clientSharingCopy('cs.check.emailTaken', {
      venue: card.fromVenueName,
      name: card.guest.name,
      value: card.newValue ?? clientSharingCopy('cs.check.blank'),
    });
  }
  return clientSharingCopy('cs.check.change', {
    venue: card.fromVenueName,
    name: card.guest.name,
    field: FIELD_IDS[card.field] ? clientSharingCopy(FIELD_IDS[card.field]!) : card.field,
    value: card.newValue ?? clientSharingCopy('cs.check.blank'),
    current: card.currentValue ?? clientSharingCopy('cs.check.blank'),
  });
}

function PersonBox({ p }: { p: ClientSharingPerson }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.person, { borderColor: colors.border }]}>
      <Text variant="bodyMedium">
        {p.name} <Text variant="bodySmall" tone="secondary">{`· ${p.venueName}`}</Text>
      </Text>
      {p.email || p.phone ? (
        <Text variant="bodySmall" tone="secondary">
          {[p.email, p.phone].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}

export default function ClientsToCheckScreen() {
  const { collective } = useLocalSearchParams<{ collective?: string }>();
  const collectiveId = typeof collective === 'string' && collective.length > 0 ? collective : null;
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  const query = useClientSharingCheck(isAdmin ? collectiveId : null);
  const decide = useDecideClientCard(collectiveId);
  const joinAll = useJoinAllLikely(collectiveId);
  const undo = useUndoJoinAll(collectiveId);
  // "Not sure, skip" moves on and the card stays in the list, as on the web ("2 of 38").
  const [index, setIndex] = useState(0);
  const [askJoinAll, setAskJoinAll] = useState(false);

  const header = <Stack.Screen options={{ headerShown: true, title: clientSharingCopy('cs.check.title') }} />;
  const cards = useMemo(
    () => query.data?.cards ?? [],
    [query.data],
  );

  if (!staffQuery.isLoading && !isAdmin) {
    return (
      <Screen>
        {header}
        <EmptyState title="Admins only" message="Only venue admins can check shared clients." />
      </Screen>
    );
  }
  if (!collectiveId) {
    return (
      <Screen>
        {header}
        <EmptyState title={clientSharingCopy('cs.check.title')} message={clientSharingCopy('cs.check.empty')} />
      </Screen>
    );
  }
  if (query.isLoading || staffQuery.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <ListSkeleton rows={3} />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : clientSharingCopy('cs.error.generic')}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  const total = cards.length;
  const at = total > 0 ? Math.min(index, total - 1) : 0;
  const card = cards[at] ?? null;
  const likelyCount = query.data?.likelyCount ?? 0;
  const undoBatch = query.data?.undo ?? null;

  const answer = (id: string, decision: ClientSharingDecision) => {
    if (decision === 'skip') {
      setIndex(total > 0 ? (at + 1) % total : 0);
      return;
    }
    decide.mutate(
      { cardId: id, decision },
      {
        onError: (err) => {
          const code = apiErrorCode(err);
          if (code === 'COLLECTIVE_CLIENT_CARD_DECIDED' || code === 'COLLECTIVE_CLIENT_CARD_NOT_FOUND') {
            toast.info(clientSharingCopy('cs.check.decided'));
            void query.refetch();
            return;
          }
          toast.error(err instanceof ApiError ? err.message : clientSharingCopy('cs.error.generic'));
        },
      },
    );
  };

  const runUndo = (batchId: string) =>
    undo.mutate(batchId, {
      onSuccess: () => toast.success(clientSharingCopy('cs.check.undone')),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : clientSharingCopy('cs.error.generic')),
    });

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        {likelyCount > 0 ? (
          <Button
            label={clientSharingCopy('cs.check.joinAll', { count: likelyCount })}
            variant="secondary"
            onPress={() => setAskJoinAll(true)}
          />
        ) : null}
        {undoBatch ? (
          <View style={[styles.card, styles.row, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
            <Text variant="bodySmall" style={styles.flex1}>
              {clientSharingCopy('cs.check.joinAll.done', { count: undoBatch.count })}
            </Text>
            <Button
              label={clientSharingCopy('cs.check.undo')}
              size="sm"
              variant="secondary"
              loading={undo.isPending}
              onPress={() => runUndo(undoBatch.batchId)}
            />
          </View>
        ) : null}

        {!card ? (
          <EmptyState title={clientSharingCopy('cs.check.title')} message={clientSharingCopy('cs.check.empty')} />
        ) : card.kind === 'match' ? (
          <View
            testID="check-card-match"
            style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
          >
            <View style={styles.row}>
              <Text variant="bodyMedium" style={styles.flex1}>
                {clientSharingCopy('cs.check.question')}
              </Text>
              <Text variant="caption" tone="secondary">
                {clientSharingCopy('cs.check.position', { n: at + 1, total })}
              </Text>
            </View>
            <PersonBox p={card.mine} />
            <PersonBox p={card.theirs} />
            <Text variant="bodySmall" tone="secondary">
              {clientSharingCopy(`cs.check.reason.${card.reason}` as ClientSharingCopyId)}
            </Text>
            <Button
              label={clientSharingCopy('cs.check.same')}
              fullWidth
              loading={decide.isPending && decide.variables?.decision === 'same_person'}
              disabled={decide.isPending}
              onPress={() => answer(card.id, 'same_person')}
            />
            <Button
              label={clientSharingCopy('cs.check.different')}
              variant="secondary"
              fullWidth
              disabled={decide.isPending}
              onPress={() => answer(card.id, 'different_people')}
            />
            <Button
              label={clientSharingCopy('cs.check.skip')}
              variant="ghost"
              fullWidth
              disabled={decide.isPending}
              onPress={() => answer(card.id, 'skip')}
            />
          </View>
        ) : card.kind === 'change' ? (
          <View
            testID="check-card-change"
            style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
          >
            <Text variant="caption" tone="secondary" style={styles.positionEnd}>
              {clientSharingCopy('cs.check.position', { n: at + 1, total })}
            </Text>
            <Text variant="bodySmall">{changeSentence(card)}</Text>
            <View style={styles.row}>
              {card.reason === 'email_taken' ? (
                <Button
                  label={clientSharingCopy('cs.check.mergeThem')}
                  style={styles.flex1}
                  onPress={() => router.push(`/client/${card.guest.guestId}` as Href)}
                />
              ) : (
                <Button
                  label={clientSharingCopy('cs.check.useNew')}
                  style={styles.flex1}
                  disabled={decide.isPending}
                  onPress={() => answer(card.id, 'use_new')}
                />
              )}
              <Button
                label={clientSharingCopy('cs.check.keepMine')}
                variant="secondary"
                style={styles.flex1}
                disabled={decide.isPending}
                onPress={() => answer(card.id, 'keep_mine')}
              />
            </View>
          </View>
        ) : (
          <View
            testID="check-card-merge"
            style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
          >
            <Text variant="caption" tone="secondary" style={styles.positionEnd}>
              {clientSharingCopy('cs.check.position', { n: at + 1, total })}
            </Text>
            <Text variant="bodySmall">
              {clientSharingCopy('cs.check.twoHere', {
                name: card.theirs?.name ?? card.mine[0].name,
                venue: card.theirs?.venueName ?? card.mine[0].venueName,
              })}
            </Text>
            <PersonBox p={card.mine[0]} />
            <PersonBox p={card.mine[1]} />
            <Button
              label={clientSharingCopy('cs.check.mergeFirst')}
              onPress={() => router.push(`/client/${card.mine[0].guestId}` as Href)}
            />
            <Button
              label={clientSharingCopy('cs.check.skip')}
              variant="ghost"
              onPress={() => answer(card.id, 'skip')}
            />
          </View>
        )}
      </ScrollView>

      <ConfirmSheet
        visible={askJoinAll}
        title={clientSharingCopy('cs.check.joinAll.title', { count: likelyCount })}
        message={clientSharingCopy('cs.check.joinAll.body')}
        confirmLabel={clientSharingCopy('cs.check.joinAll.confirm')}
        destructive={false}
        loading={joinAll.isPending}
        onClose={() => setAskJoinAll(false)}
        onConfirm={() =>
          joinAll.mutate(undefined, {
            onSuccess: (res) => {
              setAskJoinAll(false);
              const left = likelyCount - res.joined;
              const message =
                left > 0
                  ? clientSharingCopy('cs.check.joinAll.partial', {
                      count: formatClientCount(res.joined),
                      left: formatClientCount(left),
                    })
                  : clientSharingCopy('cs.check.joinAll.done', { count: formatClientCount(res.joined) });
              toast.success(message, {
                actionLabel: clientSharingCopy('cs.check.undo'),
                onAction: () => runUndo(res.batch_id),
              });
            },
            onError: (err) =>
              toast.error(err instanceof ApiError ? err.message : clientSharingCopy('cs.error.generic')),
          })
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  positionEnd: { alignSelf: 'flex-end' },
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  person: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing.sm, gap: spacing.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex1: { flex: 1 },
});
