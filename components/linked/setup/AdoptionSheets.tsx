import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { StepShell } from '@/components/linked/setup/StepShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { setupCopy } from '@/lib/linked/setup-copy';
import { useAdoptionReview, useAdoptions, useAnswerAdoption } from '@/lib/queries/useCollectives';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * A member's side of the same-name rule (web `Adoptions.tsx`; plan L13, contract 10): the host
 * put a service on the page that the member already has under the same name, so the member is
 * asked whether to use its own for it, or keep its own separate (and parked while the collective
 * is live). Until it answers, its calendars cannot offer the service.
 */

export function AdoptionRequestsCard({ collectiveId }: { collectiveId: string | null }) {
  const query = useAdoptions(collectiveId, { enabled: Boolean(collectiveId) });
  const [open, setOpen] = useState<string | null>(null);
  const adoptions = query.data?.adoptions ?? [];
  if (!collectiveId || adoptions.length === 0) return null;
  const host = query.data?.host_name ?? 'The host';
  return (
    <>
      <Card style={styles.card}>
        {adoptions.map((a) => (
          <View key={a.item_id} style={styles.row}>
            <Text variant="bodySmall" style={styles.flex1}>
              {setupCopy('svc.member.adopt.title', { host, service: a.service_name })}
            </Text>
            <Button label={setupCopy('svc.member.adopt.open')} size="sm" onPress={() => setOpen(a.item_id)} />
          </View>
        ))}
      </Card>
      <AdoptionReviewSheet collectiveId={collectiveId} itemId={open} onClose={() => setOpen(null)} />
    </>
  );
}

export function AdoptionReviewSheet({
  collectiveId,
  itemId,
  onClose,
}: {
  collectiveId: string;
  itemId: string | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const review = useAdoptionReview(collectiveId, itemId);
  const answer = useAnswerAdoption();
  const [choice, setChoice] = useState<'use_mine' | 'keep_separate'>('use_mine');
  const [map, setMap] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!itemId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice('use_mine');
    setError(null);
  }, [itemId]);

  useEffect(() => {
    if (review.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMap(Object.fromEntries(review.data.suggested_map.map((m) => [m.my_variant_id, m.host_variant_id])));
    }
  }, [review.data]);

  const data = review.data ?? null;
  const params = data ? { host: data.host_name, service: data.service.name, collective: data.collective_name } : null;
  const loadError = review.isError ? (review.error instanceof ApiError ? review.error.message : 'Could not load this question.') : null;

  const submit = () => {
    if (!itemId || !data) return;
    setError(null);
    answer.mutate(
      {
        collectiveId,
        itemId,
        choice,
        optionMap: choice === 'use_mine' ? data.service.options.map((o) => ({ my_variant_id: o.id, host_variant_id: map[o.id] ?? null })) : [],
      },
      {
        onSuccess: () => {
          toast.success(choice === 'use_mine' ? `Using your ${data.service.name}.` : `Kept your ${data.service.name} separate.`);
          onClose();
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not send your answer.'),
      },
    );
  };

  return (
    <StepShell
      visible={itemId !== null}
      onClose={() => {
        if (!answer.isPending) onClose();
      }}
      title={params ? setupCopy('svc.member.adopt.title', params) : 'Loading...'}
      error={error ?? loadError}
      footer={
        <>
          <Button label="Cancel" variant="ghost" disabled={answer.isPending} onPress={onClose} />
          <Button label="Save" disabled={!data || answer.isPending} loading={answer.isPending} onPress={submit} />
        </>
      }>
      {data && params ? (
        <View style={styles.section}>
          <Text variant="bodySmall" tone="secondary">
            {setupCopy('svc.member.adopt.message', params)}
          </Text>
          <ChoiceRow selected={choice === 'use_mine'} title={setupCopy('svc.member.adopt.useMine', params)} onPress={() => setChoice('use_mine')} />
          <ChoiceRow selected={choice === 'keep_separate'} title={setupCopy('svc.member.adopt.keepSeparate')} onPress={() => setChoice('keep_separate')} />
          {choice === 'use_mine' && data.service.options.length > 0 ? (
            <View style={[styles.mapCard, { borderColor: colors.border }]}>
              <Text variant="label">{setupCopy('join.map.heading')}</Text>
              {data.service.options.map((mine) => (
                <View key={mine.id} style={styles.section}>
                  <Text variant="caption" tone="secondary">
                    {`${setupCopy('join.map.yours')}: ${mine.name}. ${setupCopy('join.map.theirs', { host: data.host_name })}:`}
                  </Text>
                  <View style={styles.chips}>
                    <Chip label={setupCopy('join.map.keepOld')} selected={(map[mine.id] ?? null) === null} onPress={() => setMap((m) => ({ ...m, [mine.id]: null }))} />
                    {data.host_options.map((h) => (
                      <Chip key={h.id} label={h.name} selected={map[mine.id] === h.id} onPress={() => setMap((m) => ({ ...m, [mine.id]: h.id }))} />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : !loadError ? (
        <Text variant="bodySmall" tone="muted">
          Loading...
        </Text>
      ) : null}
    </StepShell>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  mapCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
