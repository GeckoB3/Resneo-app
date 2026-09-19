import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GrantPairEditor } from '@/components/linked/GrantPairEditor';
import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { StepShell } from '@/components/linked/setup/StepShell';
import { VenuePicker, type PickedVenue } from '@/components/linked/VenuePicker';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { getWebUrl } from '@/lib/env';
import { describeGrant, isLinkConfigurationValid, normaliseGrant } from '@/lib/linked/grants';
import {
  DEFAULT_LINK_LEVEL,
  LINK_LEVELS,
  grantForLevel,
  isFullAccessBothWays,
  levelForGrants,
  type LinkLevelId,
} from '@/lib/linked/link-levels';
import { setupCopy } from '@/lib/linked/setup-copy';
import { useSlugAvailable } from '@/lib/queries/useCollectives';
import { useLinkSetup, useMyCalendars, useVenueLookup } from '@/lib/queries/useLinkedVenues';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CollectiveStandingResult, LinkGrant, LinkSetupErrorField } from '@/types/linked-venues';

/**
 * Link with a venue (web `LinkSetupWizard.tsx`; plan L1 to L4).
 *
 * One wizard for a new link and, at full access both ways, the collective with it. Steps: the
 * venue; how closely the two will work together (three plain levels, or the full editor); whether
 * to share one booking page; the collective's name and address and what changes; check and send;
 * sent. One call makes the link request and the collective, and one notice reaches the other venue.
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

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

export interface LinkSetupResult {
  venueName: string;
  collective: { id: string; name: string; slug: string } | null;
}

interface VenueChoice extends PickedVenue {
  alreadyLinked: boolean;
  collective: CollectiveStandingResult | null;
}

export function LinkSetupSheet({
  visible,
  onClose,
  onSent,
  venueName,
  venueSlug,
  prefill,
}: {
  visible: boolean;
  onClose: () => void;
  onSent?: (result: LinkSetupResult) => void;
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
  const [levelId, setLevelId] = useState<LinkLevelId>(DEFAULT_LINK_LEVEL);
  const [customising, setCustomising] = useState(false);
  const [mine, setMine] = useState<LinkGrant>(grantForLevel(DEFAULT_LINK_LEVEL));
  const [theirs, setTheirs] = useState<LinkGrant>(grantForLevel(DEFAULT_LINK_LEVEL));
  const [wantCollective, setWantCollective] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<{ message: string; field: LinkSetupErrorField | null } | null>(null);
  const [sent, setSent] = useState<LinkSetupResult | null>(null);

  // Reset on each open (bounded key-based reset on the visible transition, as the app's other sheets).
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep('venue');
    setMode('form');
    setPicked(prefill ? { name: prefill.name, slug: prefill.slug, eligible: true, reason: null } : null);
    setLevelId(DEFAULT_LINK_LEVEL);
    setCustomising(false);
    setMine(grantForLevel(DEFAULT_LINK_LEVEL));
    setTheirs(grantForLevel(DEFAULT_LINK_LEVEL));
    setWantCollective(null);
    setName('');
    setSlug('');
    setSlugTouched(false);
    setAcknowledged(false);
    setMessage('');
    setError(null);
    setSent(null);
  }, [visible, prefill]);

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
      };
    }
    return { ...picked, alreadyLinked: false, collective: null };
  }, [picked, lookup.data]);

  const otherName = venue?.name ?? 'the other venue';
  const effectiveSlug = slugTouched ? slug : slugify(name);
  const slugQuery = useSlugAvailable(wantCollective ? effectiveSlug : '');
  const addressState: 'idle' | 'checking' | 'free' | 'taken' | 'format' = !effectiveSlug
    ? 'idle'
    : slugQuery.isFetching || !slugQuery.data
      ? 'checking'
      : slugQuery.data.available
        ? 'free'
        : slugQuery.data.format
          ? 'format'
          : 'taken';

  const grants = useMemo(
    () =>
      customising
        ? { mine: normaliseGrant(mine), theirs: normaliseGrant(theirs) }
        : { mine: grantForLevel(levelId), theirs: grantForLevel(levelId) },
    [customising, mine, theirs, levelId],
  );
  const fullAccess = isFullAccessBothWays(grants.mine, grants.theirs);
  const grantsValid = isLinkConfigurationValid(grants.mine, grants.theirs);
  const collectiveStanding = venue?.collective ?? null;
  const collectiveBlocked = collectiveStanding?.standing === 'blocked';
  const collectivePossible = fullAccess && Boolean(venue) && !collectiveBlocked;

  const steps = useMemo<Step[]>(() => {
    const out: Step[] = ['venue', 'level'];
    if (collectivePossible) out.push('collective');
    if (collectivePossible && wantCollective) out.push('name', 'changes');
    out.push('check');
    return out;
  }, [collectivePossible, wantCollective]);
  const index = Math.max(0, steps.indexOf(step));

  const disabledReason: string | null = (() => {
    switch (step) {
      case 'venue':
        return venue?.eligible && !lookup.isFetching ? null : setupCopy('setup.disabled.venue');
      case 'level':
        return grantsValid ? null : setupCopy('setup.disabled.level');
      case 'collective':
        return wantCollective === null ? setupCopy('setup.disabled.collective') : null;
      case 'name':
        return name.trim().length < 2
          ? setupCopy('create.name.help')
          : addressState !== 'free'
            ? setupCopy('create.disabled.address')
            : null;
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
      },
      {
        onSuccess: (data) => {
          const result: LinkSetupResult = { venueName: venue.name, collective: data.collective ?? null };
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
                ) : !venue.eligible ? (
                  <Text variant="caption" tone="danger">
                    {venue.alreadyLinked
                      ? setupCopy('setup.venue.alreadyLinked', { venue: venue.name })
                      : (venue.reason ?? 'This venue is not available to link right now.')}
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
                  note={level.unlocksCollective ? 'Collective ready' : null}
                  onPress={() => {
                    setLevelId(level.id);
                    setError(null);
                  }}
                />
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMine(grantForLevel(levelId));
                  setTheirs(grantForLevel(levelId));
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
          {collectiveStanding?.standing === 'no_payments' && collectiveStanding.reason ? (
            <Text variant="caption" color={colors.warning}>
              {collectiveStanding.reason}
            </Text>
          ) : null}
          <ChoiceRow
            selected={wantCollective === false}
            title={setupCopy('setup.collective.no')}
            summary={setupCopy('setup.collective.no.body')}
            onPress={() => {
              setWantCollective(false);
              setError(null);
            }}
          />
          <ChoiceRow
            selected={wantCollective === true}
            title={setupCopy('setup.collective.yes')}
            summary={setupCopy('setup.collective.yes.body', { venue: otherName })}
            onPress={() => {
              setWantCollective(true);
              setError(null);
            }}
          />
          {disabledReason ? (
            <Text variant="caption" tone="muted">
              {disabledReason}
            </Text>
          ) : null}
        </View>
      ) : null}

      {step === 'name' ? (
        <View style={styles.section}>
          <Text variant="bodyMedium">{setupCopy('create.what.host', { venue: venueName })}</Text>
          <Input
            label={setupCopy('create.name.label')}
            helper={setupCopy('create.name.help')}
            value={name}
            maxLength={120}
            autoFocus
            onChangeText={(v) => {
              setName(v);
              setError(null);
            }}
          />
          <Input
            label="Page address"
            value={effectiveSlug}
            maxLength={60}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(v) => {
              setSlugTouched(true);
              setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''));
              setError(null);
            }}
            helper={
              effectiveSlug
                ? addressState === 'free'
                  ? setupCopy('create.address.free')
                  : addressState === 'checking'
                    ? setupCopy('create.address.checking')
                    : undefined
                : undefined
            }
            error={addressState === 'taken' ? setupCopy('create.address.taken') : addressState === 'format' ? setupCopy('create.address.format') : undefined}
          />
          {effectiveSlug ? (
            <Text variant="caption" tone="muted">
              {setupCopy('create.address.preview', { origin: getWebUrl(), slug: effectiveSlug })}
            </Text>
          ) : null}
          {disabledReason ? (
            <Text variant="caption" tone="muted">
              {disabledReason}
            </Text>
          ) : null}
        </View>
      ) : null}

      {step === 'changes' ? (
        <View style={styles.section}>
          <Text variant="bodyMedium">{setupCopy('create.changes.title', { collective: name.trim() || 'your collective' })}</Text>
          <Text variant="bodySmall" tone="secondary">
            {setupCopy('create.changes.intro')}
          </Text>
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {[
              { name: venueName, slug: venueSlug },
              { name: otherName, slug: venue?.slug ?? null },
            ].map((row) => (
              <Text key={row.name} variant="caption" tone="secondary">
                {`${row.name}${row.slug ? ` (/book/${row.slug})` : ''} leads to /book/c/${effectiveSlug}`}
              </Text>
            ))}
            <Text variant="caption" tone="secondary">
              {`${setupCopy('create.changes.address.note', { collective: name.trim() })} ${setupCopy('create.changes.address.when')}`}
            </Text>
          </View>
          {(['services', 'owns', 'clients'] as const).map((key) => (
            <View key={key} style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text variant="label">{setupCopy(`create.changes.${key}.title` as 'create.changes.services.title')}</Text>
              <Text variant="caption" tone="secondary">
                {key === 'clients'
                  ? setupCopy('setup.changes.clients.body', { collective: name.trim() })
                  : setupCopy(`create.changes.${key}.body` as 'create.changes.services.body', { collective: name.trim() })}
              </Text>
            </View>
          ))}
          <Text variant="caption" tone="secondary">
            {setupCopy('create.changes.ending', { collective: name.trim() })}
          </Text>
          <ChoiceRow
            kind="checkbox"
            selected={acknowledged}
            title={setupCopy('create.changes.ack', { venue: venueName })}
            onPress={() => setAcknowledged((v) => !v)}
          />
        </View>
      ) : null}

      {step === 'check' ? (
        <View style={styles.section}>
          <Text variant="bodyMedium">{setupCopy('setup.check.heading')}</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {[
              { term: setupCopy('setup.check.venue'), value: otherName, to: 'venue' as Step },
              { term: setupCopy('setup.check.level'), value: levelLabel, to: 'level' as Step },
              ...(collectivePossible
                ? [
                    {
                      term: setupCopy('setup.check.collective'),
                      value: wantCollective
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
            {collectivePossible && wantCollective ? (
              <Text variant="caption" tone="secondary">
                {`${venueName} invited you to join ${name.trim()}`}
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
            sent.collective
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
