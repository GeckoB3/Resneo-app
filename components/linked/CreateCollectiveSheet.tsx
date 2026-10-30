import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { CollectiveChangesStep, CollectiveNameStep, collectiveNameStepReason, useCollectiveAddress } from '@/components/linked/setup/CreateSteps';
import { StepShell } from '@/components/linked/setup/StepShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { areaCopy } from '@/lib/collective-area/copy';
import { getWebUrl } from '@/lib/env';
import { hapticSuccess } from '@/lib/haptics';
import { formatVenueList, setupCopy } from '@/lib/linked/setup-copy';
import { useCollectiveCandidates } from '@/lib/queries/useCollectiveLinks';
import { useCreateCollective } from '@/lib/queries/useCollectives';
import { useToast } from '@/providers/ToastProvider';
import { motion, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Creating a collective (web `CreateCollectiveDialog`; UX spec J1, CQ-10.9). Four steps and a receipt:
 *   1. name it and choose its address, with what a collective is and who hosts it;
 *   2. choose the venues, listing every linked venue, including the ones that cannot join and why;
 *   3. what changes, venue by venue, with the one acknowledgement;
 *   4. check and create, where a refusal from the server is shown, with a way back to its step;
 *   5. done: the address, and what to do next.
 */

type Step = 'name' | 'venues' | 'changes' | 'check' | 'done';
type ErrorField = 'name' | 'slug' | 'venues' | 'collective' | 'plan';

const STEPS: readonly Step[] = ['name', 'venues', 'changes', 'check'];
const STEP_FOR_FIELD: Record<ErrorField, Step | null> = { name: 'name', slug: 'name', venues: 'venues', collective: null, plan: null };

export function CreateCollectiveSheet({
  visible,
  venueName,
  venueSlug,
  onClose,
  onCreated,
  onOpen,
}: {
  visible: boolean;
  venueName: string;
  /** This venue's own booking address, for the "what changes" list. */
  venueSlug: string | null;
  onClose: () => void;
  /** The collective exists; the sheet stays open on its receipt. */
  onCreated: () => void;
  /** Go to another screen; the parent closes the sheet first. */
  onOpen: (href: string) => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const create = useCreateCollective();
  const candidatesQuery = useCollectiveCandidates({ enabled: visible });
  const candidates = useMemo(() => candidatesQuery.data ?? [], [candidatesQuery.data]);

  const nameRef = useRef<TextInput>(null);
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const address = useCollectiveAddress(name, visible);
  const [invited, setInvited] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<{ message: string; field: ErrorField | null } | null>(null);
  const [copied, setCopied] = useState(false);

  // Opened afresh each time, set while rendering so nothing from last time flashes.
  const [openedFor, setOpenedFor] = useState(visible);
  if (visible !== openedFor) {
    setOpenedFor(visible);
    if (visible) {
      setStep('name');
      setName('');
      address.reset();
      setInvited([]);
      setAcknowledged(false);
      setError(null);
      setCopied(false);
    }
  }

  // The sheet keeps its content mounted and only toggles the Modal, so a raw `autoFocus` would not
  // fire on opening. Focus once it has slid in (focusing mid-animation is dropped on the new architecture).
  useEffect(() => {
    if (!visible || step !== 'name') return;
    const timer = setTimeout(() => nameRef.current?.focus(), motion.slow);
    return () => clearTimeout(timer);
  }, [visible, step]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const invitedVenues = useMemo(() => candidates.filter((c) => invited.includes(c.venue_id)), [candidates, invited]);
  const collective = name.trim() || 'your collective';
  const venueList = formatVenueList(invitedVenues.map((c) => c.venue_name), 3);
  const origin = getWebUrl() || 'https://app.resneo.com';
  const fullAddress = `${origin}/book/c/${address.slug}`;

  const nameReason = collectiveNameStepReason(name, address.state);
  const canContinue = step === 'name' ? nameReason === null : step === 'venues' ? invited.length > 0 : step === 'changes' ? acknowledged : true;
  const index = STEPS.indexOf(step);
  const busy = create.isPending;
  const errorStep = error?.field ? STEP_FOR_FIELD[error.field] : null;

  const handleCreate = () => {
    setError(null);
    create.mutate(
      { name: name.trim(), slug: address.slug, inviteVenueIds: invited },
      {
        onSuccess: () => {
          setStep('done');
          toast.success(setupCopy('create.toast.done', { collective, venueList }));
          onCreated();
        },
        onError: (err) => {
          const rawField = err instanceof ApiError ? (err.body as { field?: unknown } | null | undefined)?.field : null;
          const field = typeof rawField === 'string' && rawField in STEP_FOR_FIELD ? (rawField as ErrorField) : null;
          setError({
            message: err instanceof ApiError ? err.message : 'The collective was not created. Please check your connection and try again.',
            field,
          });
        },
      },
    );
  };

  const footer =
    step === 'done' ? (
      <>
        <Button label={setupCopy('create.done.later')} variant="ghost" onPress={onClose} />
        <Button label={setupCopy('create.done.cta')} onPress={() => onOpen('/collective-area')} />
      </>
    ) : (
      <>
        {index > 0 ? <Button label="Back" variant="secondary" disabled={busy} onPress={() => setStep(STEPS[index - 1])} /> : null}
        <Button label="Cancel" variant="ghost" disabled={busy} onPress={onClose} />
        {step === 'check' ? (
          <Button label={busy ? setupCopy('create.cta.creating') : setupCopy('create.cta.create')} disabled={busy} loading={busy} onPress={handleCreate} />
        ) : (
          <Button label="Continue" disabled={!canContinue} onPress={() => setStep(STEPS[index + 1])} />
        )}
      </>
    );

  return (
    <StepShell
      visible={visible}
      onClose={() => (busy ? undefined : onClose())}
      title={step === 'done' ? setupCopy('create.done.title', { collective }) : setupCopy('create.title')}
      step={step === 'done' ? undefined : index + 1}
      total={step === 'done' ? undefined : STEPS.length}
      error={error && (step === 'check' || errorStep === step) ? error.message : null}
      footer={footer}>
      {error && step === 'check' && errorStep ? (
        <Pressable accessibilityRole="button" onPress={() => setStep(errorStep)}>
          <Text variant="label" tone="brand">
            {errorStep === 'venues' ? 'Change the venues' : 'Change the name or address'}
          </Text>
        </Pressable>
      ) : null}

      {step === 'name' ? (
        <CollectiveNameStep
          venueName={venueName}
          name={name}
          onChangeName={(v) => {
            setName(v);
            setError(null);
          }}
          slug={address.slug}
          addressState={address.state}
          onChangeAddress={(v) => {
            address.change(v);
            setError(null);
          }}
          disabledReason={nameReason}
          showWhat
          nameRef={nameRef}
        />
      ) : null}

      {step === 'venues' ? (
        candidatesQuery.isError ? (
          <View style={styles.section}>
            <Text variant="bodySmall" tone="danger">
              {areaCopy('ov.venues.invite.loadFailed')}
            </Text>
            <Button label="Try again" variant="secondary" onPress={() => void candidatesQuery.refetch()} />
          </View>
        ) : candidatesQuery.isLoading ? (
          <Text variant="bodySmall" tone="muted">
            Loading...
          </Text>
        ) : candidates.length === 0 ? (
          <View style={styles.section}>
            <Text variant="bodyMedium">{setupCopy('create.venues.empty.title')}</Text>
            <Text variant="bodySmall" tone="secondary">
              {setupCopy('create.venues.empty.body')}
            </Text>
            <Button label="Open Linked venues" variant="secondary" onPress={() => onOpen('/linked-venues')} />
          </View>
        ) : (
          <View style={styles.section}>
            {candidates.map((c) => {
              const selectable = c.standing === 'ok' || c.standing === 'no_payments';
              return (
                <View key={c.venue_id} style={styles.candidate}>
                  <ChoiceRow
                    kind="checkbox"
                    selected={invited.includes(c.venue_id)}
                    disabled={!selectable}
                    title={c.venue_name}
                    // Two venues can share a name, so the address says which is which.
                    summary={c.venue_slug ? `/book/${c.venue_slug}` : null}
                    onPress={() => {
                      setError(null);
                      setInvited((prev) => (prev.includes(c.venue_id) ? prev.filter((v) => v !== c.venue_id) : [...prev, c.venue_id]));
                    }}>
                    {c.standing === 'no_payments' ? (
                      <View style={styles.pill}>
                        <Badge label={setupCopy('create.venues.pill.noPayments')} tone="warning" />
                      </View>
                    ) : c.standing === 'blocked' || c.standing === 'permissions' ? (
                      <View style={styles.pill}>
                        <Badge label={setupCopy('create.venues.pill.cannotJoin')} />
                      </View>
                    ) : null}
                    <Text variant="caption" color={c.standing === 'no_payments' ? colors.warning : colors.textSecondary}>
                      {c.standing === 'ok' ? setupCopy('create.venues.ok') : (c.reason ?? '')}
                    </Text>
                    {c.detail ? (
                      <Text variant="caption" tone="muted">
                        {c.detail}
                      </Text>
                    ) : null}
                  </ChoiceRow>
                  {c.standing === 'permissions' ? (
                    <Pressable accessibilityRole="button" onPress={() => onOpen(`/linked-venues/${c.link_id}`)} hitSlop={8}>
                      <Text variant="label" tone="brand">
                        {setupCopy('create.venues.fixPermissions')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            <Text variant="caption" tone="muted">
              {invited.length === 1 ? setupCopy('create.venues.selectedOne') : setupCopy('create.venues.selected', { count: invited.length })}
            </Text>
          </View>
        )
      ) : null}

      {step === 'changes' ? (
        <View style={styles.section}>
          <CollectiveChangesStep
            collective={collective}
            slug={address.slug}
            venues={[{ name: venueName, slug: venueSlug }, ...invitedVenues.map((c) => ({ name: c.venue_name, slug: c.venue_slug }))]}
            clientsBody={setupCopy('create.changes.clients.body', { collective })}
            venueName={venueName}
            acknowledged={acknowledged}
            onToggleAcknowledged={() => setAcknowledged((v) => !v)}
          />
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              const url = `${origin}/help`;
              void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined));
            }}>
            <Text variant="label" tone="brand">
              {setupCopy('create.changes.help')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'check' ? (
        <View style={styles.section}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(
              [
                { term: setupCopy('create.name.label'), value: collective, to: 'name' },
                { term: 'Page address', value: `/book/c/${address.slug}`, to: 'name' },
                { term: 'Venues invited', value: venueList, to: 'venues' },
                { term: 'Your role', value: setupCopy('create.check.role'), to: null },
              ] as { term: string; value: string; to: Step | null }[]
            ).map((row) => (
              <View key={row.term} style={styles.checkRow}>
                <View style={styles.flex1}>
                  <Text variant="caption" tone="muted">
                    {row.term}
                  </Text>
                  <Text variant="bodySmall">{row.value}</Text>
                </View>
                {row.to ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${row.term}`} disabled={busy} onPress={() => setStep(row.to as Step)} hitSlop={8}>
                    <Text variant="label" tone="brand">
                      Edit
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="bodySmall">{setupCopy('create.check.notLive', { collective })}</Text>
          </View>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="label">{setupCopy('create.check.emailPreview', { venueList })}</Text>
            <Text variant="caption" tone="secondary">
              {setupCopy('notify.invite.subject', { host: venueName, collective })}
            </Text>
          </View>
        </View>
      ) : null}

      {step === 'done' ? (
        <View style={styles.section}>
          <Text variant="bodySmall" tone="secondary">
            {setupCopy('create.done.body', { venueList })}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="bodySmall" selectable>
              {fullAddress}
            </Text>
            <Button
              label={copied ? 'Copied' : setupCopy('create.done.copy')}
              size="sm"
              variant="secondary"
              onPress={() => {
                void Clipboard.setStringAsync(fullAddress).then(() => {
                  hapticSuccess();
                  setCopied(true);
                });
              }}
            />
          </View>
          {[
            {
              label: invited.length === 1 ? setupCopy('create.next.inviteesOne') : setupCopy('create.next.invitees', { count: invited.length }),
              body: setupCopy('create.next.invitees.body'),
              href: '/collective-area?tab=venues',
            },
            {
              label: setupCopy('create.next.services'),
              body: setupCopy('create.next.services.body', { collective }),
              href: '/collective-area?view=venues',
            },
            {
              label: setupCopy('create.next.design'),
              body: setupCopy('create.next.design.body', { collective }),
              href: '/manage/booking-page',
            },
          ].map((next, i) => (
            <Pressable
              key={next.href}
              accessibilityRole="button"
              accessibilityLabel={next.label}
              onPress={() => onOpen(next.href)}
              style={[styles.numbered, { borderColor: colors.border }]}>
              <Text variant="label" tone="brand">
                {String(i + 1)}
              </Text>
              <View style={styles.flex1}>
                <Text variant="label" tone="brand">
                  {next.label}
                </Text>
                <Text variant="caption" tone="secondary">
                  {next.body}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </StepShell>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  candidate: {
    gap: spacing.xs,
  },
  pill: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
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
