import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { JoinFormsStep, JoinMeansStep, JoinServicesStep, JoinSummaryList } from '@/components/linked/setup/JoinSteps';
import { StepShell } from '@/components/linked/setup/StepShell';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { defaultJoinDraft, joinChoicesFrom, joinStepsFor, type JoinDraft, type JoinStep } from '@/lib/linked/join-choices';
import { setupCopy } from '@/lib/linked/setup-copy';
import { useCollectiveMemberAction, useJoinPreview } from '@/lib/queries/useCollectives';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Joining a shared-services collective from an invitation on its own (web
 * `JoinCollectiveDialog.tsx`; contract 6). What joining means, the venue's services, forms it
 * already uses, then check and join. Until 2026-09-19 the app sent people to the web for this.
 */
export function JoinCollectiveSheet({
  visible,
  collectiveId,
  collectiveName,
  venueName,
  onClose,
  onJoined,
}: {
  visible: boolean;
  collectiveId: string | null;
  collectiveName: string;
  venueName: string;
  onClose: () => void;
  onJoined?: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const previewQuery = useJoinPreview(collectiveId, { enabled: visible && Boolean(collectiveId) });
  const preview = previewQuery.data ?? null;
  const join = useCollectiveMemberAction();
  const [step, setStep] = useState<JoinStep>('means');
  const [draft, setDraft] = useState<JoinDraft>({ sameName: {}, optionMap: {}, own: {}, forms: {} });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep('means');
    setAgreed(false);
    setError(null);
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

  const doJoin = () => {
    if (!collectiveId || !preview) return;
    setError(null);
    join.mutate(
      { collectiveId, payload: { action: 'accept', consent_version: preview.consent_version, ...joinChoicesFrom(preview, draft) } },
      {
        onSuccess: () => {
          toast.success(`Joined ${name}.`);
          onJoined?.();
          onClose();
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

  const footer = (
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
      title={setupCopy('join.title', { collective: name })}
      step={index + 1}
      total={steps.length}
      error={error ?? loadError}
      footer={footer}>
      {!preview && !loadError ? (
        <Text variant="bodySmall" tone="muted">
          {setupCopy('join.loading')}
        </Text>
      ) : null}
      {blocked ? (
        <Text variant="bodySmall" color={colors.warning}>
          {blocked}
        </Text>
      ) : null}
      {preview && step === 'means' ? <JoinMeansStep preview={preview} host={host} collective={name} /> : null}
      {preview && step === 'services' ? <JoinServicesStep preview={preview} draft={draft} onChange={setDraft} host={host} collective={name} /> : null}
      {preview && step === 'forms' ? <JoinFormsStep preview={preview} draft={draft} onChange={setDraft} host={host} /> : null}
      {preview && step === 'check' ? (
        <View style={styles.section}>
          <Text variant="bodyMedium">{setupCopy('join.step.check')}</Text>
          <JoinSummaryList preview={preview} draft={draft} host={host} collective={name} />
          <ChoiceRow
            kind="checkbox"
            selected={agreed}
            title={setupCopy('join.consent', { venue: venueName, collective: name, host })}
            onPress={() => setAgreed((v) => !v)}
          />
        </View>
      ) : null}
    </StepShell>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
});
