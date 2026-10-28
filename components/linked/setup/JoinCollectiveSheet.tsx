import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { JoinNextSteps } from '@/components/linked/setup/JoinNextSteps';
import {
  JoinFormsStep,
  JoinFormsSwitch,
  JoinLinksChecklist,
  JoinMeansStep,
  JoinServicesStep,
  JoinSummaryList,
} from '@/components/linked/setup/JoinSteps';
import { StepShell } from '@/components/linked/setup/StepShell';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  defaultJoinDraft,
  EMPTY_JOIN_DRAFT,
  joinChoicesFrom,
  joinNextSteps,
  joinStepsFor,
  type JoinDraft,
  type JoinStep,
} from '@/lib/linked/join-choices';
import { joinLinkNames } from '@/lib/linked/join-links';
import { setupCopy } from '@/lib/linked/setup-copy';
import { useCollectiveMemberAction, useJoinPreview } from '@/lib/queries/useCollectives';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { JoinPreview } from '@/types/collectives';

/**
 * Joining a shared-services collective from an invitation on its own (web
 * `JoinCollectiveDialog.tsx`; contract 6). What joining means, the venue's services, forms it
 * already uses, then check and join. Until 2026-09-19 the app sent people to the web for this.
 *
 * Joined with something still in the way of guests (no Stripe for paid services, forms off and
 * needed), the sheet stays open on "You have joined" with those steps, as the web does (2026-10-28).
 *
 * Joining links the venue with every venue in the collective, with full access both ways, in the
 * same request as the join (web 2026-10-28, `collective-join-links.ts`): the sheet accepts no link
 * itself, and the check step names the venues it links with. Only a link already in force with
 * less than full access stops it: the preview is blocked, with a checklist saying which link and
 * "Change it in Linked Accounts".
 */
export function JoinCollectiveSheet({
  visible,
  collectiveId,
  collectiveName,
  venueName,
  onClose,
  onJoined,
  onOpenLinked,
}: {
  visible: boolean;
  collectiveId: string | null;
  collectiveName: string;
  venueName: string;
  onClose: () => void;
  onJoined?: () => void;
  /** Linked venues, for a link that needs changing there; the caller closes this sheet first. */
  onOpenLinked?: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const previewQuery = useJoinPreview(collectiveId, { enabled: visible && Boolean(collectiveId) });
  const preview = previewQuery.data ?? null;
  const join = useCollectiveMemberAction();
  const [step, setStep] = useState<JoinStep>('means');
  const [draft, setDraft] = useState<JoinDraft>(EMPTY_JOIN_DRAFT);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Joined, with something still to do before guests can book every service here. The preview and
   * choices are kept as they were sent: the preview is read again once the venue is in.
   */
  const [joined, setJoined] = useState<{ preview: JoinPreview; draft: JoinDraft } | null>(null);

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep('means');
    setAgreed(false);
    setError(null);
    setJoined(null);
  }, [visible]);

  useEffect(() => {
    if (preview) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(defaultJoinDraft(preview));
    }
  }, [preview]);

  const steps = useMemo(() => (preview ? joinStepsFor(preview) : (['means', 'services', 'check'] as JoinStep[])), [preview]);
  const index = Math.max(0, steps.indexOf(step));
  const host = preview?.host_name ?? 'the host';
  const name = preview?.collective_name ?? collectiveName;
  const busy = join.isPending;
  const blocked = preview?.blocked ?? null;
  const linksOnJoin = joinLinkNames(preview?.links);

  const doJoin = () => {
    if (!collectiveId || !preview) return;
    setError(null);
    // One request: the server links the venue with every venue in the collective and joins it, or
    // refuses with nothing done, naming the venue (web 2026-10-28).
    join.mutate(
      { collectiveId, payload: { action: 'accept', consent_version: preview.consent_version, ...joinChoicesFrom(preview, draft) } },
      {
        onSuccess: () => {
          toast.success(`Joined ${name}.`);
          onJoined?.();
          // Something still stands between guests and this venue: say what, with the buttons,
          // before closing. Otherwise the sheet closes as it always has.
          const next = joinNextSteps(preview, draft);
          if (next.stripe || next.forms) setJoined({ preview, draft });
          else onClose();
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not join. Please check your connection.'),
      },
    );
  };

  const loadError = previewQuery.isError
    ? previewQuery.error instanceof ApiError
      ? previewQuery.error.message
      : 'Could not load the invitation. Please check your connection.'
    : null;

  const footer = joined ? (
    <Button label={setupCopy('join.next.done')} onPress={onClose} />
  ) : (
    <>
      {index > 0 ? <Button label={setupCopy('join.back')} variant="secondary" disabled={busy} onPress={() => setStep(steps[index - 1]!)} /> : null}
      <Button label="Cancel" variant="ghost" disabled={busy} onPress={onClose} />
      {step === 'check' ? (
        <Button label={setupCopy('join.confirm', { collective: name })} disabled={busy || !agreed || !preview || Boolean(blocked)} loading={busy} onPress={doJoin} />
      ) : (
        <Button label={setupCopy('join.next')} disabled={!preview || Boolean(blocked)} onPress={() => setStep(steps[index + 1]!)} />
      )}
    </>
  );

  return (
    <StepShell
      visible={visible}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={
        joined
          ? setupCopy('join.next.title', { collective: joined.preview.collective_name })
          : setupCopy('join.title', { collective: name })
      }
      step={joined ? undefined : index + 1}
      total={joined ? undefined : steps.length}
      error={joined ? null : (error ?? loadError)}
      footer={footer}>
      {joined ? (
        <View style={styles.section}>
          <Text variant="bodySmall">
            {setupCopy('join.next.intro', { collective: joined.preview.collective_name, host: joined.preview.host_name })}
          </Text>
          <JoinNextSteps preview={joined.preview} draft={joined.draft} />
        </View>
      ) : (
        <>
          {!preview && !loadError ? (
            <Text variant="bodySmall" tone="muted">
              {setupCopy('join.loading')}
            </Text>
          ) : null}
          {blocked ? (
            <>
              <Text variant="bodySmall" color={colors.warning}>
                {blocked}
              </Text>
              <JoinLinksChecklist links={preview?.links} collective={name} onOpenLinked={onOpenLinked} />
            </>
          ) : null}
          {/* Blocked: the reason and the checklist are the whole sheet, as on the web. */}
          {preview && !blocked && step === 'means' ? <JoinMeansStep preview={preview} host={host} collective={name} /> : null}
          {preview && step === 'services' ? <JoinServicesStep preview={preview} draft={draft} onChange={setDraft} host={host} collective={name} /> : null}
          {preview && step === 'forms' ? <JoinFormsStep preview={preview} draft={draft} onChange={setDraft} host={host} /> : null}
          {preview && step === 'check' ? (
            <View style={styles.section}>
              <Text variant="bodyMedium">{setupCopy('join.step.check')}</Text>
              <JoinSummaryList preview={preview} draft={draft} host={host} collective={name} />
              {linksOnJoin ? (
                <Text variant="bodySmall" tone="secondary">
                  {setupCopy('join.links.linksOnJoin', { venues: linksOnJoin })}
                </Text>
              ) : null}
              <JoinFormsSwitch preview={preview} draft={draft} onChange={setDraft} />
              <ChoiceRow
                kind="checkbox"
                selected={agreed}
                title={setupCopy('join.consent', { venue: venueName, collective: name, host })}
                onPress={() => setAgreed((v) => !v)}
              />
            </View>
          ) : null}
        </>
      )}
    </StepShell>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
});
