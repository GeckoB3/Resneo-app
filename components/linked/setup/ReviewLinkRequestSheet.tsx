import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GrantBullets } from '@/components/linked/GrantBullets';
import { GrantPairEditor } from '@/components/linked/GrantPairEditor';
import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { JoinFormsStep, JoinMeansStep, JoinServicesStep, JoinSummaryList } from '@/components/linked/setup/JoinSteps';
import { StepShell } from '@/components/linked/setup/StepShell';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { describeGrant, isLinkConfigurationValid, normaliseGrant } from '@/lib/linked/grants';
import { defaultJoinDraft, joinChoicesFrom, joinStepsFor, type JoinDraft, type JoinStep } from '@/lib/linked/join-choices';
import { isFullAccessBothWays } from '@/lib/linked/link-levels';
import { setupCopy } from '@/lib/linked/setup-copy';
import { useJoinPreview } from '@/lib/queries/useCollectives';
import { useRespondLink } from '@/lib/queries/useLinkedVenues';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AccountLinkView, LinkGrant, ProposedCollectiveSummary } from '@/types/linked-venues';

/**
 * Reviewing a link request, and the collective invitation that rides on it (web
 * `ReviewLinkRequestDialog.tsx`; plan L4 to L6).
 *
 * One sheet covers both consents. First what the other venue is asking, with the permissions
 * editor behind "Adjust". Then, when a collective is proposed and the link will grant full access
 * both ways, the join steps in their own words. The last step has one consent line and three ways
 * out: decline, accept the link only, accept and join. It ends on a receipt rather than closing.
 */

export interface ReviewOutcome {
  declined: boolean;
  joined: boolean;
  collectiveName: string | null;
  joinError?: string;
}

type Step = 'request' | JoinStep | 'done';

export function ReviewLinkRequestSheet({
  link,
  visible,
  venueName,
  myCalendars = [],
  collective,
  onClose,
  onDone,
}: {
  link: AccountLinkView | null;
  visible: boolean;
  venueName: string;
  myCalendars?: { id: string; name: string }[];
  /** The invitation riding on this request, or null for a plain link request. */
  collective: ProposedCollectiveSummary | null;
  onClose: () => void;
  onDone?: (outcome: ReviewOutcome) => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const respond = useRespondLink();
  const [step, setStep] = useState<Step>('request');
  const [editing, setEditing] = useState(false);
  const [mine, setMine] = useState<LinkGrant>({ calendar: 'none', pii: false, act: 'none' });
  const [theirs, setTheirs] = useState<LinkGrant>({ calendar: 'none', pii: false, act: 'none' });
  const [draft, setDraft] = useState<JoinDraft>({ sameName: {}, optionMap: {}, own: {}, forms: {} });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [done, setDone] = useState<ReviewOutcome | null>(null);
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null);

  const proposesJoin = Boolean(collective && collective.serviceModel === 'replicas');
  const previewQuery = useJoinPreview(proposesJoin ? collective?.id : null, {
    withPendingLink: true,
    enabled: visible && proposesJoin,
  });
  const preview = previewQuery.data ?? null;
  const previewError = previewQuery.isError
    ? previewQuery.error instanceof ApiError
      ? previewQuery.error.message
      : 'Could not load the invitation. Please check your connection.'
    : null;

  useEffect(() => {
    if (!visible || !link) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep('request');
    setEditing(false);
    setMine(link.theyCan);
    setTheirs(link.iCan);
    setAgreed(false);
    setError(null);
    setDone(null);
    setPending(null);
  }, [visible, link]);

  useEffect(() => {
    if (preview) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(defaultJoinDraft(preview));
    }
  }, [preview]);

  const other = link?.otherVenue.name ?? 'The other venue';
  const myFinal = link ? (editing ? normaliseGrant(mine) : normaliseGrant(link.theyCan)) : normaliseGrant(mine);
  const grantsValid = !editing || isLinkConfigurationValid(normaliseGrant(mine), normaliseGrant(theirs));
  const fullAccessAfter = link ? isFullAccessBothWays(myFinal, normaliseGrant(link.iCan)) : false;
  const joinable = proposesJoin && Boolean(preview) && !preview?.blocked && fullAccessAfter;
  const steps: Step[] = joinable && preview ? ['request', ...joinStepsFor(preview)] : ['request', 'check'];
  const index = Math.max(0, steps.indexOf(step));
  const host = preview?.host_name ?? other;
  const collectiveName = collective?.name ?? preview?.collective_name ?? 'the collective';

  if (!link) return null;
  const busy = pending !== null;

  const doRespond = (join: boolean) => {
    setPending('accept');
    setError(null);
    respond.mutate(
      {
        linkId: link.id,
        action: editing ? 'accept_with_changes' : 'accept',
        ...(editing ? { grants: { mine, theirs } } : {}),
        ...(join && collective && preview
          ? { collective: { collective_id: collective.id, consent_version: preview.consent_version, ...joinChoicesFrom(preview, draft) } }
          : {}),
      },
      {
        onSuccess: (data) => {
          const outcome: ReviewOutcome = {
            declined: false,
            joined: Boolean(data.collective?.joined),
            collectiveName: data.collective?.name ?? null,
            joinError: data.collective && !data.collective.joined ? data.collective.error : undefined,
          };
          toast.success(
            outcome.joined
              ? setupCopy('respond.done.joined', { venue: other, collective: outcome.collectiveName ?? collectiveName })
              : setupCopy('respond.done.linked', { venue: other }),
          );
          setDone(outcome);
          setStep('done');
          onDone?.(outcome);
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not respond. Please check your connection.'),
        onSettled: () => setPending(null),
      },
    );
  };

  const doDecline = () => {
    setConfirmDecline(false);
    setPending('decline');
    setError(null);
    respond.mutate(
      { linkId: link.id, action: 'reject' },
      {
        onSuccess: () => {
          toast.success(`Declined ${other}'s request.`);
          onDone?.({ declined: true, joined: false, collectiveName: collective?.name ?? null });
          onClose();
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not decline. Please check your connection.'),
        onSettled: () => setPending(null),
      },
    );
  };

  const next = steps[index + 1];
  const prev = steps[index - 1];
  const onCheck = step === 'check';

  const footer = done ? (
    <Button label={setupCopy('respond.done.close')} onPress={onClose} />
  ) : (
    <>
      {prev ? <Button label={setupCopy('respond.cta.back')} variant="secondary" disabled={busy} onPress={() => setStep(prev)} /> : null}
      <Button label={setupCopy('respond.cta.decline')} variant="ghost" disabled={busy} loading={pending === 'decline'} onPress={() => setConfirmDecline(true)} />
      {onCheck && joinable ? (
        <Button label={setupCopy('respond.collective.linkOnly')} variant="secondary" disabled={busy || !grantsValid} onPress={() => doRespond(false)} />
      ) : null}
      {onCheck ? (
        <Button
          label={busy && pending === 'accept' ? setupCopy('respond.cta.accepting') : joinable ? setupCopy('respond.cta.acceptJoin', { collective: collectiveName }) : setupCopy('respond.cta.accept')}
          disabled={busy || !grantsValid || (joinable && !agreed)}
          loading={pending === 'accept'}
          onPress={() => doRespond(joinable)}
        />
      ) : (
        <Button
          label={setupCopy('respond.cta.next')}
          disabled={busy || !grantsValid || (proposesJoin && !preview && !previewError)}
          onPress={() => next && setStep(next)}
        />
      )}
    </>
  );

  return (
    <>
      <StepShell
        visible={visible}
        onClose={() => {
          if (!busy) onClose();
        }}
        title={
          done
            ? done.joined
              ? setupCopy('respond.done.joined.title', { venue: other, collective: done.collectiveName ?? collectiveName })
              : setupCopy('respond.done.linked.title', { venue: other })
            : proposesJoin && collective
              ? setupCopy('respond.titleWithCollective', { venue: other, collective: collective.name })
              : setupCopy('respond.title', { venue: other })
        }
        step={done ? undefined : index + 1}
        total={done ? undefined : steps.length}
        error={error}
        footer={footer}>
        {step === 'request' ? (
          <View style={styles.section}>
            <Text variant="bodyMedium">{setupCopy('respond.request.heading', { venue: other })}</Text>
            {link.requestMessage ? (
              <Text variant="bodySmall" tone="muted">
                {`“${link.requestMessage}”`}
              </Text>
            ) : null}
            {editing ? (
              <>
                <GrantPairEditor
                  otherVenueName={other}
                  mine={mine}
                  theirs={theirs}
                  onChangeMine={setMine}
                  onChangeTheirs={setTheirs}
                  myCalendars={myCalendars}
                  disabled={busy}
                />
                <Text variant="caption" tone="muted">
                  {setupCopy('respond.request.adjust.note', { venue: other })}
                </Text>
              </>
            ) : (
              <>
                <GrantBullets heading={setupCopy('respond.request.theyCan', { venue: other })} grant={link.theyCan} />
                <GrantBullets heading={setupCopy('respond.request.youCan')} grant={link.iCan} />
                <Pressable accessibilityRole="button" onPress={() => setEditing(true)}>
                  <Text variant="label" tone="brand">
                    {setupCopy('respond.request.adjust')}
                  </Text>
                </Pressable>
              </>
            )}
            <View style={[styles.notice, { backgroundColor: colors.surface }]}>
              <Text variant="caption" tone="muted">
                {setupCopy('respond.request.dpa')}
              </Text>
            </View>
            {proposesJoin && collective ? (
              <View style={[styles.notice, { backgroundColor: colors.brandSubtle }]}>
                <Text variant="label">{setupCopy('respond.collective.heading')}</Text>
                <Text variant="caption" tone="secondary">
                  {setupCopy('respond.collective.intro', { venue: other, collective: collective.name, me: venueName })}
                </Text>
                {previewError ? (
                  <Text variant="caption" tone="danger">
                    {previewError}
                  </Text>
                ) : preview?.blocked ? (
                  <Text variant="caption" color={colors.warning}>
                    {preview.blocked}
                  </Text>
                ) : !fullAccessAfter ? (
                  <Text variant="caption" color={colors.warning}>
                    {setupCopy('respond.collective.needsFull', { collective: collective.name })}
                  </Text>
                ) : !preview ? (
                  <Text variant="caption" tone="muted">
                    {setupCopy('join.loading')}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {step === 'means' && preview ? <JoinMeansStep preview={preview} host={host} collective={collectiveName} /> : null}
        {step === 'services' && preview ? (
          <JoinServicesStep preview={preview} draft={draft} onChange={setDraft} host={host} collective={collectiveName} />
        ) : null}
        {step === 'forms' && preview ? <JoinFormsStep preview={preview} draft={draft} onChange={setDraft} host={host} /> : null}

        {step === 'check' ? (
          <View style={styles.section}>
            <Text variant="bodyMedium">{setupCopy('respond.check.heading')}</Text>
            <Text variant="bodySmall" tone="secondary">
              {setupCopy('respond.check.link', { venue: other })}
            </Text>
            <Text variant="bodySmall" tone="secondary">
              {`${setupCopy('respond.request.theyCan', { venue: other })} ${describeGrant(myFinal).join(', ')}.`}
            </Text>
            {joinable && preview ? (
              <>
                <JoinSummaryList preview={preview} draft={draft} host={host} collective={collectiveName} />
                <ChoiceRow
                  kind="checkbox"
                  selected={agreed}
                  title={setupCopy('respond.consent', { venue: other, collective: collectiveName, me: venueName })}
                  onPress={() => setAgreed((v) => !v)}
                />
                <Text variant="caption" tone="muted">
                  {setupCopy('respond.collective.linkOnly.note', { collective: collectiveName })}
                </Text>
              </>
            ) : (
              <View style={[styles.notice, { backgroundColor: colors.surface }]}>
                <Text variant="caption" tone="muted">
                  {setupCopy('respond.request.dpa')}
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {step === 'done' && done ? (
          <View style={styles.section}>
            {done.joinError && done.collectiveName ? (
              <View style={[styles.notice, { backgroundColor: colors.warningSurface }]}>
                <Text variant="caption" color={colors.warning}>
                  {setupCopy('respond.done.joinFailed', { venue: other, collective: done.collectiveName, error: done.joinError })}
                </Text>
              </View>
            ) : null}
            {(done.joined
              ? [
                  setupCopy('respond.done.joined.next.host', { venue: other, collective: done.collectiveName ?? collectiveName }),
                  setupCopy('respond.done.joined.next.own', { collective: done.collectiveName ?? collectiveName }),
                  setupCopy('respond.done.joined.next.calendars', { venue: other }),
                ]
              : [setupCopy('respond.done.linked.next', { venue: other })]
            ).map((line, i) => (
              <View key={line} style={[styles.numbered, { borderColor: colors.border }]}>
                <Text variant="label" tone="brand">
                  {String(i + 1)}
                </Text>
                <Text variant="bodySmall" style={styles.flex1}>
                  {line}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </StepShell>
      <ConfirmSheet
        visible={confirmDecline}
        title={setupCopy('respond.decline.title', { venue: other })}
        message={
          collective
            ? setupCopy('respond.decline.bodyWithCollective', { venue: other, collective: collective.name })
            : setupCopy('respond.decline.body', { venue: other })
        }
        confirmLabel={setupCopy('respond.decline.confirm')}
        onConfirm={doDecline}
        onClose={() => setConfirmDecline(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  notice: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  numbered: {
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
