import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GrantPairEditor } from '@/components/linked/GrantPairEditor';
import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { CollectiveChangesStep, CollectiveNameStep, collectiveNameStepReason, useCollectiveAddress } from '@/components/linked/setup/CreateSteps';
import { StepShell } from '@/components/linked/setup/StepShell';
import { VenuePicker, type PickedVenue } from '@/components/linked/VenuePicker';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { describeGrant, isLinkConfigurationValid, normaliseGrant } from '@/lib/linked/grants';
import {
  LINK_LEVELS,
  grantForLevel,
  isFullAccessBothWays,
  levelForGrants,
  type LinkLevelId,
} from '@/lib/linked/link-levels';
import { setupCopy } from '@/lib/linked/setup-copy';
import { useLinkSetup, useMyCalendars, useVenueLookup } from '@/lib/queries/useLinkedVenues';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  CollectiveStandingResult,
  LinkGrant,
  LinkSetupErrorField,
  RequesterCollective,
  VenueLookupLink,
} from '@/types/linked-venues';

/**
 * Link with a venue (web `LinkSetupWizard.tsx`; plan L1 to L4).
 *
 * One wizard for a new link and, at full access both ways, the collective with it. Steps: the
 * venue; how closely the two will work together (three plain levels, or the full editor); whether
 * to share one booking page; the collective's name and address and what changes; check and send;
 * sent. One call makes the link request and the collective, and one notice reaches the other venue.
 * A venue that already hosts a collective cannot start another, so that step offers to invite the
 * other venue to the one it has instead (CQ-17.7).
 */

type Step = 'venue' | 'level' | 'collective' | 'name' | 'changes' | 'check' | 'done';

const STEP_FOR_FIELD: Record<LinkSetupErrorField, Step | null> = {
  venue: 'venue',
  level: 'level',
  collective: 'collective',
  venues: 'collective',
  name: 'name',
  slug: 'name',
  plan: null,
};

export interface LinkSetupResult {
  venueName: string;
  collective: { id: string; name: string; slug: string } | null;
  /** The name of the collective this venue hosts, when the request also invites the other venue to it. */
  invitedTo: string | null;
}

interface VenueChoice extends PickedVenue {
  alreadyLinked: boolean;
  collective: CollectiveStandingResult | null;
  /** The next three come from the lookup (CQ-17). An older server sends none, and today's messages stand. */
  link: VenueLookupLink | null;
  requesterCollective: RequesterCollective | null;
  sameCollective: boolean;
}

/** Why this venue cannot be picked, and what to do about it (CQ-17.2, CQ-17.6). */
function venueNotice(venue: VenueChoice): { text: string; plain: boolean; review: boolean; edit: boolean } {
  const params = { venue: venue.name, collective: venue.requesterCollective?.name };
  const line = (text: string, more: { plain?: boolean; review?: boolean; edit?: boolean } = {}) => ({
    text,
    plain: more.plain ?? false,
    review: more.review ?? false,
    edit: more.edit ?? false,
  });
  if (venue.link?.state === 'their_request') return line(setupCopy('setup.venue.theyAsked', params), { plain: true, review: true });
  if (venue.link?.state === 'my_request') return line(setupCopy('setup.venue.youAsked', params), { plain: true });
  if (!venue.alreadyLinked) return line(venue.reason ?? 'This venue is not available to link right now.');
  if (venue.sameCollective && venue.requesterCollective) return line(setupCopy('setup.venue.alreadyLinked.sameCollective', params));
  if (venue.requesterCollective?.role === 'host') return line(setupCopy('setup.venue.alreadyLinked.hosts', params));
  // A member or an invited venue cannot start a shared page, so it is pointed at no way to start one (as the web).
  if (venue.requesterCollective) return line(venue.reason ?? 'You are already linked with this venue.');
  if (venue.link?.state === 'not_full') return line(setupCopy('setup.venue.alreadyLinked.notFull', params), { edit: true });
  return line(setupCopy('setup.venue.alreadyLinked', params));
}

export function LinkSetupSheet({
  visible,
  onClose,
  onSent,
  onReviewRequest,
  onEditPermissions,
  venueName,
  venueSlug,
  prefill,
}: {
  visible: boolean;
  onClose: () => void;
  onSent?: (result: LinkSetupResult) => void;
  /** The other venue has already asked: close this and open the review of their request. */
  onReviewRequest: (linkId: string) => void;
  /** A link at less than full access: close this and open the link, where Edit permissions is. */
  onEditPermissions: (linkId: string) => void;
  /** This venue's name and booking address, for the "what changes" list. */
  venueName: string;
  venueSlug: string | null;
  /** Pre-select this venue, from a shareable invite link. */
  prefill?: { slug: string; name: string } | null;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const calendarsQuery = useMyCalendars();
  const myCalendars = calendarsQuery.data?.calendars ?? [];
  const send = useLinkSetup();

  const [step, setStep] = useState<Step>('venue');
  const [mode, setMode] = useState<'form' | 'picker'>('form');
  const [picked, setPicked] = useState<PickedVenue | null>(null);
  // No level until the owner picks one (CQ-17.5). The grants below stand in for nothing until then.
  const [levelId, setLevelId] = useState<LinkLevelId | null>(null);
  const [customising, setCustomising] = useState(false);
  const [mine, setMine] = useState<LinkGrant>(grantForLevel('view'));
  const [theirs, setTheirs] = useState<LinkGrant>(grantForLevel('view'));
  const [wantCollective, setWantCollective] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<{ message: string; field: LinkSetupErrorField | null } | null>(null);
  const [sent, setSent] = useState<LinkSetupResult | null>(null);
  const address = useCollectiveAddress(name, wantCollective === true);
  const effectiveSlug = address.slug;
  const addressState = address.state;
  const resetAddress = address.reset;

  // Reset on each open (bounded key-based reset on the visible transition, as the app's other sheets).
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep('venue');
    setMode('form');
    setPicked(prefill ? { name: prefill.name, slug: prefill.slug, eligible: true, reason: null } : null);
    setLevelId(null);
    setCustomising(false);
    setMine(grantForLevel('view'));
    setTheirs(grantForLevel('view'));
    setWantCollective(null);
    setName('');
    resetAddress();
    setAcknowledged(false);
    setMessage('');
    setError(null);
    setSent(null);
  }, [visible, prefill, resetAddress]);

  // One lookup with the collective standing for the venue chosen or pasted (web `lookupVenue`).
  const lookup = useVenueLookup(picked?.slug ?? null, { collective: true });
  const venue = useMemo<VenueChoice | null>(() => {
    if (!picked) return null;
    const data = lookup.data;
    if (data && data.found) {
      return {
        name: data.name,
        slug: data.slug,
        eligible: data.eligible,
        reason: data.reason,
        alreadyLinked: Boolean(data.alreadyLinked),
        collective: data.collective ?? null,
        link: data.link ?? null,
        requesterCollective: data.requester_collective ?? null,
        sameCollective: Boolean(data.same_collective),
      };
    }
    return { ...picked, alreadyLinked: false, collective: null, link: null, requesterCollective: null, sameCollective: false };
  }, [picked, lookup.data]);

  const otherName = venue?.name ?? 'the other venue';
  const grants = useMemo(
    () =>
      customising
        ? { mine: normaliseGrant(mine), theirs: normaliseGrant(theirs) }
        : { mine: grantForLevel(levelId ?? 'view'), theirs: grantForLevel(levelId ?? 'view') },
    [customising, mine, theirs, levelId],
  );
  const fullAccess = isFullAccessBothWays(grants.mine, grants.theirs);
  const grantsValid = isLinkConfigurationValid(grants.mine, grants.theirs);
  const collectiveStanding = venue?.collective ?? null;
  const collectiveBlocked = collectiveStanding?.standing === 'blocked';
  // A venue already in a collective cannot start another (CQ-17.7). A host can invite to the one it has.
  const requesterCollective = venue?.requesterCollective ?? null;
  const collectiveOpen = fullAccess && Boolean(venue) && !collectiveBlocked;
  const collectivePossible = collectiveOpen && !requesterCollective;
  const invitePossible = collectiveOpen && requesterCollective?.role === 'host';
  const inviteTarget = invitePossible && wantCollective === true ? requesterCollective : null;
  const collectiveWords = { venue: otherName, collective: requesterCollective?.name };

  // What the full card says about a shared page (CQ-17.4). The step itself is left out when there is none.
  const levelNote: { note: string; reason: string | null } = (() => {
    if (requesterCollective?.role === 'member') return { note: setupCopy('setup.collective.member', collectiveWords), reason: null };
    // Not part of it yet, so the sentence for a member would not be true.
    if (requesterCollective?.role === 'invited') return { note: setupCopy('create.refused.invited', collectiveWords), reason: null };
    if (collectiveBlocked) return { note: setupCopy('setup.level.collectiveNotPossible', { venue: otherName }), reason: collectiveStanding?.reason ?? null };
    if (requesterCollective?.role === 'host') return { note: setupCopy('setup.collective.hosts', collectiveWords), reason: null };
    return { note: setupCopy('setup.level.collectiveReady'), reason: null };
  })();

  const steps = useMemo<Step[]>(() => {
    const out: Step[] = ['venue', 'level'];
    if (collectivePossible || invitePossible) out.push('collective');
    if (collectivePossible && wantCollective) out.push('name', 'changes');
    out.push('check');
    return out;
  }, [collectivePossible, invitePossible, wantCollective]);
  const index = Math.max(0, steps.indexOf(step));

  const disabledReason: string | null = (() => {
    switch (step) {
      case 'venue':
        return venue?.eligible && !lookup.isFetching ? null : setupCopy('setup.disabled.venue');
      case 'level':
        if (!customising && levelId === null) return setupCopy('setup.level.choose');
        return grantsValid ? null : setupCopy('setup.disabled.level');
      case 'collective':
        return wantCollective === null ? setupCopy('setup.disabled.collective') : null;
      case 'name':
        return collectiveNameStepReason(name, addressState);
      case 'changes':
        return acknowledged ? null : setupCopy('create.changes.ack', { venue: venueName });
      default:
        return null;
    }
  })();

  const goNext = () => {
    setError(null);
    const next = steps[index + 1];
    if (next) setStep(next);
  };
  const goBack = () => {
    setError(null);
    const prev = steps[index - 1];
    if (prev) setStep(prev);
  };

  const handleSend = () => {
    if (!venue) return;
    setError(null);
    const withCollective = collectivePossible && wantCollective === true;
    send.mutate(
      {
        targetSlug: venue.slug,
        requestMessage: message.trim() || undefined,
        grants,
        ...(withCollective ? { collective: { name: name.trim(), slug: effectiveSlug } } : {}),
        ...(inviteTarget ? { inviteTo: inviteTarget.id } : {}),
      },
      {
        onSuccess: (data) => {
          const result: LinkSetupResult = {
            venueName: venue.name,
            collective: data.collective ?? null,
            invitedTo: inviteTarget?.name ?? null,
          };
          setSent(result);
          setStep('done');
          toast.success(`Link request sent to ${venue.name}.`);
          onSent?.(result);
        },
        onError: (err) => {
          const rawField = err instanceof ApiError ? (err.body as { field?: unknown } | null | undefined)?.field : null;
          const field = typeof rawField === 'string' && rawField in STEP_FOR_FIELD ? (rawField as LinkSetupErrorField) : null;
          setError({
            message: err instanceof ApiError ? err.message : 'The request was not sent. Please check your connection and try again.',
            field,
          });
        },
      },
    );
  };

  const busy = send.isPending;
  const errorStep = error?.field ? STEP_FOR_FIELD[error.field] : null;
  const notice = venue && !venue.eligible && !lookup.isFetching ? venueNotice(venue) : null;
  const levelLabel =
    customising && levelForGrants(grants.mine, grants.theirs) === 'custom'
      ? setupCopy('setup.level.custom')
      : (LINK_LEVELS.find((l) => l.id === (customising ? levelForGrants(grants.mine, grants.theirs) : levelId))?.title ??
        setupCopy('setup.level.custom'));

  const handleSheetClose = () => {
    if (mode === 'picker') {
      setMode('form');
      return;
    }
    if (!busy) onClose();
  };

  if (mode === 'picker') {
    // The picker is its own screen inside the same sheet, as the old request sheet did it.
    return (
      <Sheet visible={visible} onClose={handleSheetClose} maxHeight="92%" fill>
        <VenuePicker
          onBack={() => setMode('form')}
          onPick={(v) => {
            setPicked(v);
            setWantCollective(null);
            setError(null);
            setMode('form');
          }}
        />
      </Sheet>
    );
  }

  const footer =
    step === 'done' ? (
      <Button label={setupCopy('setup.done.close')} onPress={onClose} />
    ) : (
      <>
        {index > 0 ? <Button label="Back" variant="secondary" disabled={busy} onPress={goBack} /> : null}
        <Button label="Cancel" variant="ghost" disabled={busy} onPress={onClose} />
        {step === 'check' ? (
          <Button label={busy ? setupCopy('setup.cta.sending') : setupCopy('setup.cta.send')} disabled={busy} loading={busy} onPress={handleSend} />
        ) : (
          <Button label="Continue" disabled={Boolean(disabledReason)} onPress={goNext} />
        )}
      </>
    );

  return (
    <StepShell
      visible={visible}
      onClose={handleSheetClose}
      title={step === 'done' && sent ? setupCopy('setup.done.title', { venue: sent.venueName }) : setupCopy('setup.title')}
      step={step === 'done' ? undefined : index + 1}
      total={step === 'done' ? undefined : steps.length}
      error={error && (step === 'check' || errorStep === step) ? error.message : null}
      footer={footer}>
      {error && step === 'check' && errorStep && errorStep !== 'check' ? (
        <Pressable onPress={() => setStep(errorStep)} accessibilityRole="button">
          <Text variant="label" tone="brand">
            Go back and change it
          </Text>
        </Pressable>
      ) : null}

      {step === 'venue' ? (
        <View style={styles.section}>
          <Text variant="bodyMedium">{setupCopy('setup.venue.heading')}</Text>
          <Text variant="caption" tone="secondary">
            {setupCopy('setup.venue.help')}
          </Text>
          {venue ? (
            <View style={[styles.selected, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.flex1}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {venue.name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {`/book/${venue.slug}`}
                </Text>
                {lookup.isFetching ? (
                  <Text variant="caption" tone="muted">
                    Checking the venue...
                  </Text>
                ) : notice ? (
                  <Text variant="caption" tone={notice.plain ? 'secondary' : 'danger'}>
                    {notice.text}
                  </Text>
                ) : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Change venue" disabled={busy} onPress={() => setMode('picker')} hitSlop={8}>
                <Text variant="label" tone="brand">
                  Change
                </Text>
              </Pressable>
            </View>
          ) : (
            <Button label="Find a venue" variant="secondary" onPress={() => setMode('picker')} />
          )}
          {notice?.review && venue?.link ? (
            <Button label={setupCopy('setup.venue.theyAsked.cta')} variant="secondary" onPress={() => onReviewRequest(venue.link!.id)} />
          ) : null}
          {notice?.edit && venue?.link ? (
            <Button label="Edit permissions" variant="secondary" onPress={() => onEditPermissions(venue.link!.id)} />
          ) : null}
        </View>
      ) : null}

      {step === 'level' ? (
        <View style={styles.section}>
          <Text variant="bodyMedium">{setupCopy('setup.level.heading')}</Text>
          <Text variant="caption" tone="secondary">
            {setupCopy('setup.level.help', { venue: otherName })}
          </Text>
          {!customising ? (
            <>
              {LINK_LEVELS.map((level) => (
                <ChoiceRow
                  key={level.id}
                  selected={level.id === levelId}
                  title={level.title}
                  summary={`${level.summary} ${setupCopy('setup.level.mutual')}.`}
                  bullets={level.bullets}
                  note={level.unlocksCollective ? levelNote.note : null}
                  onPress={() => {
                    setLevelId(level.id);
                    setError(null);
                  }}>
                  {level.unlocksCollective && levelNote.reason ? (
                    <Text variant="caption" tone="secondary">
                      {levelNote.reason}
                    </Text>
                  ) : null}
                </ChoiceRow>
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  // With nothing picked yet, the editor starts from the least (CQ-17.5).
                  setMine(grantForLevel(levelId ?? 'view'));
                  setTheirs(grantForLevel(levelId ?? 'view'));
                  setCustomising(true);
                }}>
                <Text variant="label" tone="brand">
                  {setupCopy('setup.level.customise')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <GrantPairEditor
                otherVenueName={otherName}
                mine={mine}
                theirs={theirs}
                onChangeMine={setMine}
                onChangeTheirs={setTheirs}
                myCalendars={myCalendars}
                disabled={busy}
              />
              {!fullAccess ? (
                <Text variant="caption" color={colors.warning}>
                  {setupCopy('setup.level.customNote')}
                </Text>
              ) : null}
              <Pressable accessibilityRole="button" onPress={() => setCustomising(false)}>
                <Text variant="label" tone="brand">
                  Back to the three levels
                </Text>
              </Pressable>
            </>
          )}
          {disabledReason ? (
            <Text variant="caption" tone="muted">
              {disabledReason}
            </Text>
          ) : null}
        </View>
      ) : null}

      {step === 'collective' ? (
        <View style={styles.section}>
          {invitePossible ? (
            <Text variant="bodyMedium">{setupCopy('setup.collective.invite.heading', collectiveWords)}</Text>
          ) : (
            <>
              <Text variant="bodyMedium">{setupCopy('setup.collective.heading')}</Text>
              <Text variant="bodySmall" tone="secondary">
                {setupCopy('setup.collective.intro')}
              </Text>
              <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text variant="label">{setupCopy('create.what.title')}</Text>
                {(['1', '2', '3'] as const).map((n) => (
                  <Text key={n} variant="caption" tone="secondary">
                    {`• ${setupCopy(`create.what.${n}` as 'create.what.1')}`}
                  </Text>
                ))}
              </View>
            </>
          )}
          {collectiveStanding?.standing === 'no_payments' && collectiveStanding.reason ? (
            <Text variant="caption" color={colors.warning}>
              {collectiveStanding.reason}
            </Text>
          ) : null}
          <ChoiceRow
            selected={wantCollective === false}
            title={setupCopy('setup.collective.no')}
            summary={invitePossible ? null : setupCopy('setup.collective.no.body')}
            onPress={() => {
              setWantCollective(false);
              setError(null);
            }}
          />
          <ChoiceRow
            selected={wantCollective === true}
            title={invitePossible ? setupCopy('setup.collective.invite', collectiveWords) : setupCopy('setup.collective.yes')}
            summary={invitePossible ? setupCopy('setup.collective.invite.body', collectiveWords) : setupCopy('setup.collective.yes.body', { venue: otherName })}
            onPress={() => {
              setWantCollective(true);
              setError(null);
            }}
          />
          {/* "Choose whether to start a collective" is not the question for a host. */}
          {disabledReason && !invitePossible ? (
            <Text variant="caption" tone="muted">
              {disabledReason}
            </Text>
          ) : null}
        </View>
      ) : null}

      {step === 'name' ? (
        <CollectiveNameStep
          venueName={venueName}
          name={name}
          onChangeName={(v) => {
            setName(v);
            setError(null);
          }}
          slug={effectiveSlug}
          addressState={addressState}
          onChangeAddress={(v) => {
            address.change(v);
            setError(null);
          }}
          disabledReason={disabledReason}
          autoFocus
        />
      ) : null}

      {step === 'changes' ? (
        <CollectiveChangesStep
          collective={name.trim() || 'your collective'}
          slug={effectiveSlug}
          venues={[
            { name: venueName, slug: venueSlug },
            { name: otherName, slug: venue?.slug ?? null },
          ]}
          clientsBody={setupCopy('setup.changes.clients.body', { collective: name.trim() })}
          venueName={venueName}
          acknowledged={acknowledged}
          onToggleAcknowledged={() => setAcknowledged((v) => !v)}
        />
      ) : null}

      {step === 'check' ? (
        <View style={styles.section}>
          <Text variant="bodyMedium">{setupCopy('setup.check.heading')}</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {[
              { term: setupCopy('setup.check.venue'), value: otherName, to: 'venue' as Step },
              { term: setupCopy('setup.check.level'), value: levelLabel, to: 'level' as Step },
              ...(collectivePossible || invitePossible
                ? [
                    {
                      term: setupCopy('setup.check.collective'),
                      value: inviteTarget
                        ? setupCopy('setup.check.collective.invite', { collective: inviteTarget.name })
                        : collectivePossible && wantCollective
                          ? setupCopy('setup.check.collective.value', { collective: name.trim(), slug: effectiveSlug })
                          : setupCopy('setup.check.collective.none'),
                      to: 'collective' as Step,
                    },
                  ]
                : []),
            ].map((row) => (
              <View key={row.term} style={styles.checkRow}>
                <View style={styles.flex1}>
                  <Text variant="caption" tone="muted">
                    {row.term}
                  </Text>
                  <Text variant="bodySmall">{row.value}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${row.term}`} onPress={() => setStep(row.to)} hitSlop={8}>
                  <Text variant="label" tone="brand">
                    Edit
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
          <Input
            label={setupCopy('setup.note.label', { venue: otherName }).replace(/\s*\(optional\)$/, '')}
            optional
            value={message}
            onChangeText={setMessage}
            maxLength={1000}
            multiline
            numberOfLines={2}
            placeholder={setupCopy('setup.note.placeholder')}
          />
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="label">{setupCopy('setup.check.whatTheyRead', { venue: otherName })}</Text>
            <Text variant="caption" tone="secondary">
              {`${setupCopy('setup.check.theyCan', { venue: venueName })} ${describeGrant(grants.theirs).join(', ')}.`}
            </Text>
            <Text variant="caption" tone="secondary">
              {`${setupCopy('setup.check.youCan')} ${describeGrant(grants.mine).join(', ')}.`}
            </Text>
            {inviteTarget || (collectivePossible && wantCollective) ? (
              <Text variant="caption" tone="secondary">
                {`${venueName} invited you to join ${inviteTarget?.name ?? name.trim()}`}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {step === 'done' && sent ? (
        <View style={styles.section}>
          <Text variant="bodySmall" tone="secondary">
            {setupCopy('setup.done.body')}
          </Text>
          {[
            sent.invitedTo
              ? setupCopy('setup.done.next.invite', { venue: sent.venueName, collective: sent.invitedTo })
              : sent.collective
                ? setupCopy('setup.done.next.collective', { venue: sent.venueName, collective: sent.collective.name })
                : setupCopy('setup.done.next.link', { venue: sent.venueName }),
            setupCopy('setup.done.next.watch', { venue: sent.venueName }),
            setupCopy('setup.done.next.where'),
          ].map((line, i) => (
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
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
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
