import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { InviteVenueSheet } from '@/components/collective-area/InviteVenueSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { areaCopy } from '@/lib/collective-area/copy';
import { useCollectiveMemberAction, useDissolveCollective } from '@/lib/queries/useCollectives';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CollectiveView } from '@/types/collectives';
import type { AccountLinkView } from '@/types/linked-venues';

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  run: () => void;
};

/**
 * Members tab (Flow 12, host only). Lists members (Make host / Remove with
 * confirms), invites a venue, and dissolves the collective.
 * Copy ported verbatim from the web MembersSection.
 *
 * Inviting opens the Collective area's invite sheet (2026-10-28): any venue on ResNeo, with what
 * joining takes shown before anything is sent, so the two screens never offer different venues.
 */
export function CollectiveMembersPanel({
  collective,
  onDissolved,
}: {
  collective: CollectiveView;
  /**
   * No longer read: any venue can be invited now, not only one linked with full access both ways
   * (web 2026-10-28). Kept so the callers need not change.
   */
  eligibleLinks?: AccountLinkView[];
  /** Called after the collective is dissolved (so the parent can navigate away). */
  onDissolved: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const memberAction = useCollectiveMemberAction();
  const dissolve = useDissolveCollective();

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const busy = memberAction.isPending || dissolve.isPending;

  const runMember = (
    payload: Parameters<typeof memberAction.mutate>[0]['payload'],
    successMsg: string,
  ) => {
    memberAction.mutate(
      { collectiveId: collective.id, payload },
      {
        onSuccess: () => toast.success(successMsg),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Action failed.'),
      },
    );
  };

  const handleDissolve = () => {
    dissolve.mutate(collective.id, {
      onSuccess: () => {
        toast.success('Collective dissolved.');
        onDissolved();
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Failed to dissolve the collective.'),
    });
  };

  return (
    <View style={styles.root}>
      <Card style={styles.card}>
        <Text variant="label">Members</Text>
        {collective.members.map((m, i) => {
          const isHostMember = m.venueId === collective.hostVenueId;
          return (
            <View
              key={m.venueId}
              style={[
                styles.memberRow,
                i > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                },
              ]}>
              <View style={styles.flex1}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {/* Your own venue reads "(you)" beside a member of the same name (CQ-07). */}
                  {m.venueId === collective.myVenueId ? areaCopy('svc.cal.venueYou', { venue: m.venueName }) : m.venueName}
                </Text>
                {isHostMember ? (
                  <Text variant="caption" color={colors.brand}>
                    Host
                  </Text>
                ) : m.status === 'invited' ? (
                  <Text variant="caption" color={colors.warning}>
                    Invited
                  </Text>
                ) : null}
              </View>
              <View style={styles.memberActions}>
                {m.status === 'active' && !isHostMember ? (
                  <Button
                    label="Make host"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onPress={() =>
                      setConfirm({
                        title: 'Transfer host?',
                        message: `Make ${m.venueName} the host? They will control this collective's settings and members; your venue becomes a regular member. Only the new host can transfer it back.`,
                        confirmLabel: 'Transfer host',
                        danger: false,
                        run: () =>
                          runMember(
                            { action: 'transfer_host', venueId: m.venueId },
                            `${m.venueName} is now the host.`,
                          ),
                      })
                    }
                  />
                ) : null}
                {!isHostMember ? (
                  <Button
                    label="Remove"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onPress={() =>
                      setConfirm({
                        title: 'Remove member?',
                        message: `Remove ${m.venueName} from "${collective.name}"? It will no longer appear on the combined page.`,
                        confirmLabel: 'Remove member',
                        danger: true,
                        run: () =>
                          runMember(
                            { action: 'remove', venueId: m.venueId },
                            `${m.venueName} removed.`,
                          ),
                      })
                    }
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </Card>

      {/* Any venue can be invited, with what joining takes shown first (web 2026-10-28): the same
          sheet as the Collective area's Venues tab. */}
      <Card style={styles.card}>
        <Text variant="label">{areaCopy('ov.venues.invite')}</Text>
        <Text variant="caption" tone="muted">
          {areaCopy('ov.venues.invite.body')}
        </Text>
        <Button
          label={areaCopy('ov.venues.invite')}
          variant="secondary"
          disabled={busy}
          onPress={() => setInviteOpen(true)}
        />
      </Card>

      <Button
        label="Dissolve collective"
        variant="danger"
        fullWidth
        disabled={busy}
        loading={dissolve.isPending}
        onPress={() =>
          setConfirm({
            title: 'Dissolve collective?',
            message: `Dissolve "${collective.name}"? The combined booking page goes offline immediately. Each venue keeps its own page and data.`,
            confirmLabel: 'Dissolve collective',
            danger: true,
            run: handleDissolve,
          })
        }
      />

      <InviteVenueSheet
        visible={inviteOpen}
        collectiveId={collective.id}
        collectiveName={collective.name}
        excludeVenueIds={collective.members
          .filter((m) => m.status === 'active' || m.status === 'invited')
          .map((m) => m.venueId)}
        onClose={() => setInviteOpen(false)}
        onOpenLinked={() => {
          setInviteOpen(false);
          router.push('/linked-venues' as Href);
        }}
      />

      <ConfirmSheet
        visible={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.danger ?? true}
        loading={busy}
        onConfirm={() => {
          const run = confirm?.run;
          setConfirm(null);
          run?.();
        }}
        onClose={() => setConfirm(null)}
      />
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
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
