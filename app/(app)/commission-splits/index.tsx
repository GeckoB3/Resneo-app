import { useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { CalendarCard, LineRow, PartnerGroups } from '@/components/commission-splits/CalendarCards';
import { FlowSheet } from '@/components/commission-splits/FlowSheet';
import { ProposeSplitSheet } from '@/components/commission-splits/ProposeSplitSheet';
import { SetUpSplitSheet, type SetUpChoice } from '@/components/commission-splits/SetUpSplitSheet';
import { CountingCard, StandardRatesCard } from '@/components/commission-splits/TeamRatesCards';
import { TeamShareSheet } from '@/components/commission-splits/TeamShareSheet';
import { MessageBox, SettingsCard } from '@/components/pos/settings-more/parts';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { commissionErrorMessage } from '@/lib/commission/api';
import {
  exceptionsSentence,
  isLiveSplit,
  nextChangeSentence,
  personShare,
  personShareSentence,
  shareWhat,
  splitSentence,
  splitTermsSentence,
  termsDetail,
} from '@/lib/commission/describe';
import { splitsT } from '@/lib/commission/splits-copy';
import { calendarAt, splitStatus } from '@/lib/commission/splits-format';
import { personKeyOf } from '@/lib/commission/team-share';
import { formatLongDay } from '@/lib/reports/pos-report-format';
import { queryKeys } from '@/lib/queries/keys';
import { useCommissionGate, useCommissionSettings, useRespondSplit, useSplitsList } from '@/lib/queries/useCommissionSplits';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CommissionSettingsPerson, SplitView } from '@/types/commission-splits';

/** Where Back in the second step returns to: step one, on the calendar that was chosen. */
type Back = { calendar?: string; businessOnly?: boolean };

/** What the one sheet shows: step one, a person's share, or a proposal to a business. */
type Opened =
  | { kind: 'setup'; calendar?: string; businessOnly?: boolean }
  | { kind: 'team'; person: CommissionSettingsPerson; fresh: boolean; back?: Back }
  | { kind: 'propose'; partnerId: string; calendar: string; back?: Back };

/**
 * Commission splits (web Settings, Commission splits; reports/Commission splits across linked
 * venues.md), for admins, whether or not Checkout is on. One page, built around calendars, that
 * answers "who earns a share of what this calendar takes?":
 *
 *   * Waiting for your answer: proposals from another business, with Accept and Decline.
 *   * Your calendars: what you pay the person who works each one (your standard rates or their own),
 *     and any share agreed with a business that can see it.
 *   * Calendars at businesses you work with ("Work as one team" links and your collective), grouped
 *     by business: the shares they pay you.
 *   * Logins without a calendar, when Checkout is set up: they earn only on what they sell there.
 *   * Standard rates, how team figures are worked out, and past splits.
 *
 * "Set up a split" asks whose takings, then who earns a share, then the share itself, with a sentence
 * saying exactly what will count, all in one sheet. Every split opens `/commission-splits/[id]`,
 * where its terms, statements and everything else you can do to it live. The old Checkout settings
 * route `/checkout-settings/commission` redirects here; a `?section=` from an older link is ignored.
 */
export default function CommissionSplitsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isAdmin, staffLoading } = useCommissionGate();
  const queryClient = useQueryClient();
  const settingsQuery = useCommissionSettings();
  const listQuery = useSplitsList();
  const respond = useRespondSplit();
  const scrollRef = useRef<ScrollView>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [pastOpen, setPastOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const header = <Stack.Screen options={{ headerShown: true, title: splitsT('page.title') }} />;

  if (staffLoading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }
  if (!isAdmin) {
    return (
      <Screen>
        {header}
        <EmptyState title={splitsT('app.adminOnly.title')} message={splitsT('app.adminOnly.body')} />
      </Screen>
    );
  }

  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.commissionSplits.all() });
    } finally {
      setRefreshing(false);
    }
  };

  const settings = settingsQuery.data && Array.isArray(settingsQuery.data.rates) ? settingsQuery.data : null;
  const list = listQuery.data && Array.isArray(listQuery.data.splits) ? listQuery.data : null;
  const intro = (
    <Text variant="bodySmall" tone="secondary">
      {splitsT('page.intro')}
    </Text>
  );

  if (!settings || !list) {
    const failed = settingsQuery.isError ? settingsQuery.error : listQuery.isError ? listQuery.error : null;
    return (
      <Screen scroll={false} padded={false}>
        {header}
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
          {intro}
          {failed ? (
            <ErrorState
              message={commissionErrorMessage(failed, splitsT('ui.loadError'))}
              onRetry={() => {
                if (settingsQuery.isError) void settingsQuery.refetch();
                if (listQuery.isError) void listQuery.refetch();
              }}
            />
          ) : (
            <DetailSkeleton />
          )}
        </ScrollView>
      </Screen>
    );
  }

  const today = list.today;
  const live = list.splits.filter((s) => isLiveSplit(s, today));
  const past = list.splits.filter((s) => !isLiveSplit(s, today));
  const waiting = live.filter((s) => s.can.respond && s.pending);
  const showLogins = settings.source.checkout_available || settings.rates.some((r) => r.staff_id !== null);
  const yours = settings.people.filter((p) => p.calendar_id);
  const logins = showLogins ? settings.people.filter((p) => !p.calendar_id) : [];
  const yourCalendarIds = new Set(yours.map((p) => p.calendar_id));
  // A live split on a calendar no longer in the list (made inactive) still shows, on its own card.
  const orphanPayer = live.filter((s) => s.role === 'payer' && !yourCalendarIds.has(s.calendar.id));

  /** The full sentence after a save, at the top of the screen, scrolled into view. */
  const say = (message: string) => {
    setNotice(message);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };
  const openSplit = (s: SplitView) => router.push(`/commission-splits/${encodeURIComponent(s.id)}` as Href);
  const close = () => setOpened(null);

  const act = async (split: SplitView, action: 'accept' | 'decline') => {
    const terms = split.pending;
    if (!terms || busy) return;
    setBusy(`${split.id}:${action}`);
    setActionError(null);
    setNotice(null);
    try {
      await respond.mutateAsync({ splitId: split.id, body: { terms_id: terms.id, action } });
      say(
        action === 'accept'
          ? splitsT('respond.accepted', { date: formatLongDay(terms.effective_from) })
          : splitsT('respond.declined', { partner: split.partner.name }),
      );
    } catch (e) {
      // The list is read again once the answer settles, so a split answered elsewhere shows as it is.
      setActionError({ id: split.id, message: commissionErrorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const choose = (choice: SetUpChoice, back: Back) => {
    if (choice.kind === 'team') setOpened({ kind: 'team', person: choice.person, fresh: true, back });
    else setOpened({ kind: 'propose', partnerId: choice.partnerId, calendar: choice.calendar, back });
  };

  const teamLine = (person: CommissionSettingsPerson) => {
    const view = personShare(settings.rates, person, settings.today);
    const extra = [exceptionsSentence(view), nextChangeSentence(view, formatLongDay)].filter(Boolean).join(' ');
    const paysNothing = shareWhat(view.service.bps, view.product.bps, view.voucher.bps) === null && !view.exceptions.length;
    const word = splitsT(paysNothing ? 'cal.setShare' : 'cal.change');
    return (
      <LineRow
        key="team"
        text={personShareSentence(person.name, view, person.label)}
        extra={extra || null}
        badge={paysNothing ? null : { label: splitsT(view.anyOwn ? 'cal.team.own' : 'cal.team.standard'), tone: view.anyOwn ? 'brand' : 'neutral' }}
        action={
          <Button
            label={word}
            size="sm"
            variant="secondary"
            accessibilityLabel={`${word}: ${splitsT('share.title', { name: person.name })}`}
            onPress={() => {
              setNotice(null);
              setOpened({ kind: 'team', person, fresh: paysNothing });
            }}
          />
        }
      />
    );
  };

  const splitLine = (s: SplitView) => {
    const status = splitStatus(s, today);
    return (
      <LineRow
        key={s.id}
        text={splitSentence(s)}
        badge={{ label: status.text, tone: status.tone }}
        action={
          <Button
            label={splitsT('cal.manage')}
            size="sm"
            variant={s.can.respond ? 'primary' : 'secondary'}
            accessibilityLabel={`${splitsT('cal.manage')}: ${calendarAt(s)}`}
            onPress={() => openSplit(s)}
          />
        }
      />
    );
  };

  const canShare = (calendarId: string) =>
    list.partners.some(
      (p) => p.your_calendars.some((c) => c.id === calendarId) && !live.some((s) => s.calendar.id === calendarId && s.partner.venue_id === p.venue_id),
    );

  const sheetBody = (() => {
    if (!opened) return null;
    if (opened.kind === 'setup') {
      return (
        <SetUpSplitSheet
          key={`setup:${opened.calendar ?? ''}`}
          settings={settings}
          list={list}
          showLogins={showLogins}
          initialCalendar={opened.calendar}
          businessOnly={opened.businessOnly}
          onChoose={(choice, calendar) => choose(choice, { calendar, businessOnly: opened.businessOnly })}
          onClose={close}
        />
      );
    }
    if (opened.kind === 'team') {
      const person = settings.people.find((p) => personKeyOf(p) === personKeyOf(opened.person)) ?? opened.person;
      const back = opened.back;
      return (
        <TeamShareSheet
          key={`team:${personKeyOf(person)}`}
          settings={settings}
          person={person}
          fresh={opened.fresh}
          onSaved={(message) => {
            close();
            say(message);
          }}
          onClose={close}
          onBack={back ? () => setOpened({ kind: 'setup', ...back }) : undefined}
        />
      );
    }
    const back = opened.back;
    return (
      <ProposeSplitSheet
        key={`propose:${opened.partnerId}:${opened.calendar}`}
        list={list}
        currency={list.currency}
        initial={{ partnerId: opened.partnerId, calendar: opened.calendar }}
        onClose={close}
        onBack={back ? () => setOpened({ kind: 'setup', ...back }) : undefined}
        onSent={(_split, partnerName) => {
          close();
          say(splitsT('form.sent', { partner: partnerName }));
        }}
      />
    );
  })();

  return (
    <Screen scroll={false} padded={false} keyboardAvoiding>
      {header}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
        {intro}
        <Button
          label={splitsT('page.setUp')}
          onPress={() => {
            setNotice(null);
            setOpened({ kind: 'setup' });
          }}
          fullWidth
        />

        {notice ? (
          <MessageBox tone="success" role="status">
            {notice}
          </MessageBox>
        ) : null}

        {waiting.length ? (
          <View
            testID="answer"
            style={[styles.answer, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}
            accessibilityLabel={splitsT('answer.title')}>
            <View style={styles.answerHead}>
              <Text variant="subheading" accessibilityRole="header">
                {splitsT('answer.title')}
              </Text>
              <Text variant="bodySmall" tone="secondary">
                {splitsT('answer.help')}
              </Text>
            </View>
            {waiting.map((s) => (
              <View key={s.id} style={[styles.answerCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <Text variant="bodyMedium">{calendarAt(s)}</Text>
                <Text variant="caption" tone="secondary">
                  {s.status === 'proposed'
                    ? splitsT('respond.title', { partner: s.partner.name })
                    : splitsT('respond.change.title', { partner: s.partner.name, date: formatLongDay(s.pending!.effective_from) })}
                </Text>
                <Text variant="bodySmall">{splitTermsSentence(s, s.pending!)}</Text>
                <Text variant="caption" tone="muted">
                  {termsDetail(s, s.pending!, formatLongDay)}
                </Text>
                {actionError?.id === s.id ? (
                  <Text variant="caption" tone="danger" accessibilityRole="alert">
                    {actionError.message}
                  </Text>
                ) : null}
                <View style={styles.actions}>
                  <Button
                    label={splitsT('respond.accept')}
                    size="sm"
                    loading={busy === `${s.id}:accept`}
                    disabled={busy !== null}
                    onPress={() => void act(s, 'accept')}
                  />
                  <Button
                    label={splitsT('respond.decline')}
                    size="sm"
                    variant="secondary"
                    loading={busy === `${s.id}:decline`}
                    disabled={busy !== null}
                    onPress={() => void act(s, 'decline')}
                  />
                  <Button label={splitsT('answer.details')} size="sm" variant="ghost" onPress={() => openSplit(s)} />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View testID="calendars">
          <SettingsCard title={splitsT('cal.yours.title')} description={splitsT('cal.yours.help')}>
            {yours.length === 0 && orphanPayer.length === 0 ? (
              <Text variant="bodySmall" tone="secondary">
                {splitsT('cal.yours.empty')}
              </Text>
            ) : null}
            {yours.map((p) => (
              <CalendarCard
                key={personKeyOf(p)}
                name={p.name}
                action={
                  canShare(p.calendar_id!) ? (
                    <Button
                      label={splitsT('cal.shareWithBusiness')}
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setNotice(null);
                        setOpened({ kind: 'setup', calendar: personKeyOf(p), businessOnly: true });
                      }}
                    />
                  ) : null
                }>
                {teamLine(p)}
                {live.filter((s) => s.role === 'payer' && s.calendar.id === p.calendar_id).map(splitLine)}
              </CalendarCard>
            ))}
            {orphanPayer.map((s) => (
              <CalendarCard key={s.id} name={s.calendar.name}>
                {splitLine(s)}
              </CalendarCard>
            ))}
          </SettingsCard>
        </View>

        <View testID="partners">
          <SettingsCard title={splitsT('cal.theirs.title')} description={splitsT('cal.theirs.help')}>
            <PartnerGroups
              partners={list.partners}
              live={live}
              splitLine={splitLine}
              onSetUp={(partnerId, calendarId) => {
                setNotice(null);
                setOpened({ kind: 'propose', partnerId, calendar: `theirs:${calendarId}` });
              }}
              onLinkedVenues={() => router.push('/linked-venues' as Href)}
            />
          </SettingsCard>
        </View>

        {logins.length ? (
          <View testID="logins">
            <SettingsCard title={splitsT('cal.logins.title')} description={splitsT('cal.logins.help')}>
              {logins.map((p) => (
                <CalendarCard key={personKeyOf(p)} name={p.name}>
                  {teamLine(p)}
                </CalendarCard>
              ))}
            </SettingsCard>
          </View>
        ) : null}

        <StandardRatesCard settings={settings} />
        <CountingCard settings={settings} />

        {past.length ? (
          <View testID="past">
            <SettingsCard title={splitsT('cal.past.title')} description={splitsT('cal.past.help')}>
              <View style={styles.start}>
                <Button
                  label={pastOpen ? splitsT('cal.past.hide') : splitsT('cal.past.show', { count: past.length })}
                  size="sm"
                  variant="ghost"
                  onPress={() => setPastOpen((o) => !o)}
                  accessibilityState={{ expanded: pastOpen }}
                />
              </View>
              {pastOpen
                ? past.map((s) => (
                    <CalendarCard key={s.id} name={calendarAt(s)}>
                      {splitLine(s)}
                    </CalendarCard>
                  ))
                : null}
            </SettingsCard>
          </View>
        ) : null}
      </ScrollView>

      {opened ? <FlowSheet onClose={close}>{sheetBody}</FlowSheet> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.base, paddingBottom: spacing['3xl'] },
  answer: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  answerHead: { gap: spacing.xxs },
  answerCard: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  start: { alignItems: 'flex-start' },
});
