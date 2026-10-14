import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SheetStep } from '@/components/commission-splits/FlowSheet';
import { FieldBlock, OptionList } from '@/components/pos/settings-more/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { isLiveSplit } from '@/lib/commission/describe';
import { splitsT } from '@/lib/commission/splits-copy';
import { personKeyOf } from '@/lib/commission/team-share';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CommissionSettingsPerson, CommissionSettingsResponse, SplitsListResponse } from '@/types/commission-splits';

/**
 * "Set up a split", step one (web `SetUpSplitDialog`): whose takings are shared, and who earns a
 * share of them. Your own calendar can share with the person who works it (your team) or with a
 * business that can see it; a calendar at a business you work with shares with your business; a
 * login without a calendar shares with that person. Step two is the person's share or the proposal,
 * in the same sheet. Calendars are `c:<calendar>`, `s:<login>` or `t:<business>:<calendar>`.
 */

export type SetUpChoice =
  | { kind: 'team'; person: CommissionSettingsPerson }
  | { kind: 'business'; partnerId: string; calendar: string };

interface Earner {
  value: string;
  label: string;
  /** "A business you work with", so a business never reads as a person. */
  tag?: string;
  help: string;
  /** Already set up: shown, but not chosen again. */
  exists: boolean;
}

export function SetUpSplitSheet({
  settings,
  list,
  showLogins,
  initialCalendar,
  businessOnly,
  onChoose,
  onClose,
}: {
  settings: CommissionSettingsResponse;
  list: SplitsListResponse;
  showLogins: boolean;
  initialCalendar?: string;
  /** "Share with a business" on a calendar: only the businesses. */
  businessOnly?: boolean;
  /** Next, with the choice and the calendar it was made on (for Back). */
  onChoose: (choice: SetUpChoice, calendar: string) => void;
  onClose: () => void;
}) {
  const [calendar, setCalendar] = useState(initialCalendar ?? '');
  const [earner, setEarner] = useState('');

  const yours = settings.people.filter((p) => p.calendar_id);
  const logins = showLogins ? settings.people.filter((p) => !p.calendar_id) : [];
  const live = list.splits.filter((s) => isLiveSplit(s, list.today));
  const hasLive = (calendarId: string, partnerId: string) => live.some((s) => s.calendar.id === calendarId && s.partner.venue_id === partnerId);

  let earners: Earner[] = [];
  let person: CommissionSettingsPerson | null = null;
  if (calendar.startsWith('c:') || calendar.startsWith('s:')) {
    person = settings.people.find((p) => personKeyOf(p) === calendar) ?? null;
    if (person && !businessOnly) {
      earners.push({
        value: 'person',
        label: person.name,
        help: splitsT(person.calendar_id ? 'setup.earner.person.help' : 'setup.earner.login.help'),
        exists: false,
      });
    }
    if (person?.calendar_id) {
      const calendarId = person.calendar_id;
      for (const p of list.partners.filter((x) => x.your_calendars.some((c) => c.id === calendarId))) {
        earners.push({
          value: `p:${p.venue_id}`,
          label: p.name,
          tag: splitsT('setup.earner.business'),
          help: splitsT('setup.earner.partner.help'),
          exists: hasLive(calendarId, p.venue_id),
        });
      }
    }
  } else if (calendar.startsWith('t:')) {
    const [, partnerId, calendarId] = calendar.split(':') as [string, string, string];
    const partner = list.partners.find((p) => p.venue_id === partnerId);
    if (partner) {
      earners = [
        {
          value: 'you',
          label: splitsT('setup.earner.you', { venue: list.venue.name }),
          help: splitsT('setup.earner.you.help', { partner: partner.name }),
          exists: hasLive(calendarId, partnerId),
        },
      ];
    }
  }
  const choosable = earners.filter((e) => !e.exists);
  // One possible answer: choose it, so Next is one tap.
  const chosen = earner && choosable.some((e) => e.value === earner) ? earner : choosable.length === 1 ? choosable[0]!.value : '';

  const next = () => {
    if (!chosen) return;
    if (chosen === 'person' && person) {
      onChoose({ kind: 'team', person }, calendar);
      return;
    }
    if (chosen.startsWith('p:') && person?.calendar_id) {
      onChoose({ kind: 'business', partnerId: chosen.slice(2), calendar: `yours:${person.calendar_id}` }, calendar);
      return;
    }
    if (chosen === 'you') {
      const [, partnerId, calendarId] = calendar.split(':') as [string, string, string];
      onChoose({ kind: 'business', partnerId, calendar: `theirs:${calendarId}` }, calendar);
    }
  };

  const pick = (value: string) => {
    if (value === calendar) return;
    setCalendar(value);
    setEarner('');
  };
  const theirGroups = list.partners.filter((p) => p.their_calendars.length);

  return (
    <SheetStep
      title={splitsT('setup.title')}
      footer={
        <>
          <Button label={splitsT('setup.next')} onPress={next} disabled={!chosen} fullWidth />
          <Button label={splitsT('ui.close')} variant="secondary" onPress={onClose} fullWidth />
        </>
      }>
      <FieldBlock label={splitsT('setup.calendar')} help={splitsT('setup.calendar.help')}>
        {calendar ? null : (
          <Text variant="caption" tone="muted">
            {splitsT('setup.calendar.choose')}
          </Text>
        )}
        <View style={styles.groups}>
          {yours.length ? (
            <OptionList
              label={splitsT('setup.calendar.yours')}
              value={calendar || null}
              options={yours.map((p) => ({ value: personKeyOf(p), label: p.name }))}
              onChange={pick}
            />
          ) : null}
          {theirGroups.map((p) => (
            <OptionList
              key={p.venue_id}
              label={splitsT('setup.calendar.theirs', { partner: p.name })}
              value={calendar || null}
              options={p.their_calendars.map((c) => ({ value: `t:${p.venue_id}:${c.id}`, label: c.name }))}
              onChange={pick}
            />
          ))}
          {logins.length ? (
            <OptionList
              label={splitsT('setup.calendar.logins')}
              value={calendar || null}
              options={logins.map((p) => ({ value: personKeyOf(p), label: p.name }))}
              onChange={pick}
            />
          ) : null}
        </View>
      </FieldBlock>

      {calendar ? (
        <View style={styles.earners} accessibilityRole="radiogroup" accessibilityLabel={splitsT('setup.earner')}>
          <Text variant="label">{splitsT('setup.earner')}</Text>
          {earners.length === 0 ? (
            <Text variant="bodySmall" tone="secondary">
              {splitsT('biz.none')}
            </Text>
          ) : null}
          {earners.map((e) => (
            <EarnerRow key={e.value} earner={e} selected={chosen === e.value} onPress={() => setEarner(e.value)} />
          ))}
        </View>
      ) : null}
    </SheetStep>
  );
}

/** One answer to "Who earns a share?": a radio row, its tag, and its help (or why it is taken). */
function EarnerRow({ earner, selected, onPress }: { earner: Earner; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const disabled = earner.exists;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected, disabled }}
      accessibilityLabel={earner.label}
      style={({ pressed }) => [
        styles.option,
        {
          borderColor: selected ? colors.brand : colors.border,
          backgroundColor: disabled ? colors.surface : selected ? colors.brandSubtle : colors.surfaceRaised,
          opacity: disabled ? 0.6 : pressed ? 0.7 : 1,
        },
      ]}>
      <View style={[styles.radio, { borderColor: selected ? colors.brand : colors.borderStrong }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: colors.brand }]} /> : null}
      </View>
      <View style={styles.flex}>
        <View style={styles.labelRow}>
          <Text variant="bodyMedium">{earner.label}</Text>
          {earner.tag ? <Badge label={earner.tag} /> : null}
        </View>
        <Text variant="caption" tone="muted">
          {earner.exists ? splitsT('setup.earner.exists') : earner.help}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  groups: { gap: spacing.md },
  earners: { gap: spacing.xs },
  flex: { flex: 1, minWidth: 0 },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
