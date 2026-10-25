import * as WebBrowser from 'expo-web-browser';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { InviteStaffSheet } from '@/components/manage/InviteStaffSheet';
import { MyAccountSheet } from '@/components/manage/MyAccountSheet';
import { SessionSettingsSheet } from '@/components/manage/SessionSettingsSheet';
import { StaffMemberSheet } from '@/components/manage/StaffMemberSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { getWebUrl } from '@/lib/env';
import { hapticSelect } from '@/lib/haptics';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useSessionSettings } from '@/lib/queries/useSessionSettings';
import { useStaffList } from '@/lib/queries/useStaffList';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { roleBadgeTone, roleKeyOf, roleLabelOf, teamViewerOf } from '@/lib/roles/roles';
import {
  displayNameOf,
  formatSignOutAfter,
  memberCalendarNames,
  memberSettingsSummary,
  memberStatus,
  ROLE_GUIDE_ORDER,
  ROLE_INFO,
  roleInfo,
  rolesHelpUrl,
  teamT,
  TILL_NOTE,
} from '@/lib/roles/team-copy';
import { useVenueContext } from '@/providers/VenueProvider';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AssignablePractitioner, RoleKey, TeamMember } from '@/types/staff';

/** The web's default when a business has never chosen (web `SESSION_TIMEOUT_DEFAULT_MINUTES`). */
const SIGN_OUT_DEFAULT_MINUTES = 7 * 24 * 60;

/**
 * The Team screen (web roles plan §5.1 to §5.5, §5.11; the web's Settings, Staff). For admins: what
 * team logins are, an "Invite someone" button, a guide to what each role can do (open while the
 * team is just you), everyone on the team with their role, whether they have signed in and a
 * one-line summary of their settings, and the sign-out timer. Tapping someone opens their sheet.
 * Everyone gets their own login details at the bottom.
 *
 * The screen keeps one tree: the header and the sheets stay mounted while the body moves between
 * loading, an error and the team.
 */
export default function TeamScreen() {
  const { colors } = useTheme();
  const { venue, featureFlags } = useVenueContext();
  // No till to talk about at a business without Checkout (web `roleInfo`); unknown flags keep the lines.
  const checkoutOn = featureFlags ? featureFlags.resolved?.pos_enabled === true : true;
  const businessName = venue?.name?.trim() || 'your business';

  // Use staff/me for a reliable role check (avoids VenueProvider dual-source-of-truth bug).
  const { data: staffMeData, isLoading: staffMeLoading } = useStaffMe();
  const staffMe = staffMeData?.staff ?? null;
  const isAdmin = staffMe?.role === 'admin';
  const viewer = teamViewerOf(staffMe);

  const query = useStaffList(isAdmin);
  const practitionersQuery = usePractitioners({ enabled: isAdmin });
  const sessionQuery = useSessionSettings(isAdmin);

  const [showInvite, setShowInvite] = useState(false);
  // The open member by id, read from the list, so a saved change (a role, a switch) shows in the
  // open sheet as soon as the list has it.
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [showMyAccount, setShowMyAccount] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);

  const members: TeamMember[] = query.data?.staff ?? [];
  const selectedMember = members.find((m) => m.id === selectedMemberId) ?? null;

  const assignablePractitioners: AssignablePractitioner[] = (practitionersQuery.data?.practitioners ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    is_active: p.is_active,
    calendar_type: p.calendar_type,
  }));
  const calendars = assignablePractitioners
    .filter((p) => p.is_active && (p.calendar_type ?? 'practitioner') !== 'resource')
    .map((p) => ({ id: p.id, name: p.name }));

  const savedMinutes = sessionQuery.data?.session_timeout_minutes;
  const sessionMinutes = savedMinutes != null && savedMinutes > 0 ? savedMinutes : SIGN_OUT_DEFAULT_MINUTES;

  const loading = staffMeLoading || (isAdmin && query.isLoading);
  const guideRoles: RoleKey[] = viewer.rolesKnown ? [...ROLE_GUIDE_ORDER] : ['admin', 'staff'];

  const openHelp = () => {
    const url = rolesHelpUrl(getWebUrl());
    void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined));
  };

  const accountCard = (
    <View style={styles.block}>
      <Text variant="overline" tone="muted" style={styles.overline}>
        {teamT('screen.account.title')}
      </Text>
      <Card padded={false}>
        <Pressable
          onPress={() => {
            hapticSelect();
            setShowMyAccount(true);
          }}
          style={({ pressed }) => [styles.myAccountRow, pressed && { backgroundColor: colors.surface }]}
          accessibilityRole="button"
          accessibilityLabel="My account"
          accessibilityHint={teamT('screen.account.label')}>
          <Avatar name={staffMe?.name ?? staffMe?.email ?? 'Me'} size={44} />
          <View style={styles.flexText}>
            <Text variant="bodyMedium" numberOfLines={1}>
              {staffMe?.name ?? staffMe?.email ?? 'My account'}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {teamT('screen.account.label')}
            </Text>
          </View>
          <Badge label={roleLabelOf(staffMe)} tone={roleBadgeTone(staffMe)} />
          <Text variant="caption" tone="muted" style={styles.chevron}>
            ›
          </Text>
        </Pressable>
      </Card>
    </View>
  );

  let body;
  if (loading) {
    body = <ListSkeleton />;
  } else if (isAdmin && query.isError) {
    body = (
      <View style={styles.stateWrap}>
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : teamT('screen.loadError')}
          onRetry={() => void query.refetch()}
        />
      </View>
    );
  } else {
    body = (
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          isAdmin ? (
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.brand} />
          ) : undefined
        }>
        {isAdmin ? (
          <>
            {/* What team logins are, and the way to add someone. */}
            <Card style={styles.intro}>
              <Text variant="body" tone="secondary">
                {teamT('screen.intro')}
              </Text>
              <Button
                label={teamT('screen.invite')}
                onPress={() => setShowInvite(true)}
                fullWidth
                accessibilityHint={teamT('invite.title')}
              />
            </Card>

            {/* What can each role do? Open while the team is just you. */}
            <CollapsibleCard title={teamT('guide.title')} defaultExpanded={members.length <= 1}>
              <View style={styles.guide}>
                {guideRoles.map((key) => (
                  <RoleGuideEntry key={key} role={key} checkoutOn={checkoutOn} />
                ))}
                <Text variant="bodySmall" tone="secondary">
                  {teamT('guide.notSure.lead')}
                  <Text variant="bodySmall" style={styles.strong}>
                    {teamT('guide.notSure.role')}
                  </Text>
                  {teamT('guide.notSure.rest')}
                </Text>
                {viewer.rolesKnown && checkoutOn ? (
                  <Text variant="bodySmall" tone="secondary">
                    {TILL_NOTE}
                  </Text>
                ) : null}
                <Pressable onPress={openHelp} accessibilityRole="link" hitSlop={8} style={styles.link}>
                  <Text variant="label" tone="brand">
                    {teamT('guide.readMore')}
                  </Text>
                </Pressable>
              </View>
            </CollapsibleCard>

            {/* Everyone on the team. */}
            <View style={styles.block}>
              <View style={styles.sectionHeader}>
                <Text variant="overline" tone="muted">
                  {teamT('screen.list.title')}
                </Text>
                <Text variant="caption" tone="muted">
                  {members.length} {members.length === 1 ? 'person' : 'people'}
                </Text>
              </View>
              {members.length === 0 ? (
                <Card>
                  <Text variant="bodySmall" tone="muted" style={styles.empty}>
                    {teamT('screen.list.empty')}
                  </Text>
                </Card>
              ) : (
                <Card padded={false}>
                  {members.map((member, index) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      isSelf={member.id === staffMe?.id}
                      isLast={index === members.length - 1}
                      calendars={calendars}
                      onPress={() => {
                        hapticSelect();
                        setSelectedMemberId(member.id);
                      }}
                    />
                  ))}
                </Card>
              )}
              {members.length > 1 ? (
                <Text variant="caption" tone="muted" style={styles.hint}>
                  {teamT('screen.list.tapHint')}
                </Text>
              ) : null}
              {practitionersQuery.isSuccess && calendars.length === 0 ? (
                <Text variant="caption" tone="muted" style={styles.hint}>
                  {teamT('screen.noCalendars')}
                </Text>
              ) : null}
            </View>

            {/* Signing out after a break (the web dashboard's idle timer). */}
            <Card padded={false}>
              <Pressable
                onPress={() => {
                  hapticSelect();
                  setShowSecurity(true);
                }}
                style={({ pressed }) => [styles.securityRow, pressed && { backgroundColor: colors.surface }]}
                accessibilityRole="button"
                accessibilityLabel={teamT('timeout.title')}>
                <View style={styles.flexText}>
                  <Text variant="bodyMedium">{teamT('timeout.title')}</Text>
                  <Text variant="caption" tone="muted">
                    {teamT('timeout.row', { time: formatSignOutAfter(sessionMinutes) })}
                  </Text>
                </View>
                <Text variant="caption" tone="muted" style={styles.chevron}>
                  ›
                </Text>
              </Pressable>
            </Card>
          </>
        ) : (
          <Card>
            <Text variant="body" tone="secondary">
              {teamT('screen.intro.notAdmin')}
            </Text>
          </Card>
        )}

        {accountCard}
        <View style={styles.spacer} />
      </ScrollView>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen options={{ headerShown: true, title: teamT('screen.title') }} />
      {body}

      <InviteStaffSheet
        visible={showInvite}
        onClose={() => setShowInvite(false)}
        practitioners={assignablePractitioners}
        viewer={viewer}
        businessName={businessName}
        checkoutOn={checkoutOn}
      />

      <StaffMemberSheet
        visible={selectedMember !== null}
        member={selectedMember}
        isSelf={selectedMember?.id === staffMe?.id}
        viewer={viewer}
        practitioners={assignablePractitioners}
        businessName={businessName}
        checkoutOn={checkoutOn}
        onClose={() => setSelectedMemberId(null)}
        onDeleted={() => setSelectedMemberId(null)}
      />

      <MyAccountSheet visible={showMyAccount} staff={staffMe} onClose={() => setShowMyAccount(false)} />

      <SessionSettingsSheet visible={showSecurity} currentMinutes={sessionMinutes} onClose={() => setShowSecurity(false)} />
    </Screen>
  );
}

/** One role in the guide: what it is, who it suits, and what it can and can't do (web `RoleGuide`). */
function RoleGuideEntry({ role, checkoutOn }: { role: RoleKey; checkoutOn: boolean }) {
  const { colors } = useTheme();
  const info = roleInfo(role, checkoutOn);
  return (
    <View
      accessibilityLabel={info.label}
      style={[styles.guideEntry, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text variant="bodyMedium" style={styles.strong}>
        {info.label}
      </Text>
      <Text variant="bodySmall">{info.summary}</Text>
      <Text variant="caption" tone="muted">
        {info.goodFor}
      </Text>
      <View style={styles.guideLines}>
        {info.can.map((line) => (
          <View key={line} style={styles.guideLine}>
            <Text variant="bodySmall" color={colors.success} accessibilityElementsHidden importantForAccessibility="no">
              ✓
            </Text>
            <Text variant="bodySmall" style={styles.flexText}>
              {line}
            </Text>
          </View>
        ))}
        {info.cannot.map((line) => (
          <View key={line} style={styles.guideLine} accessibilityLabel={`${teamT('guide.cannot')}${line}`}>
            <Text variant="bodySmall" tone="muted" accessibilityElementsHidden importantForAccessibility="no">
              ✕
            </Text>
            <Text variant="bodySmall" tone="muted" style={styles.flexText}>
              {line}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** A person on the team: name, role, whether they have signed in, and a summary of their settings. */
function MemberRow({
  member,
  isSelf,
  isLast,
  calendars,
  onPress,
}: {
  member: TeamMember;
  isSelf: boolean;
  isLast: boolean;
  calendars: readonly { id: string; name: string }[];
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const name = displayNameOf(member);
  const role = ROLE_INFO[roleKeyOf(member)].label;
  const status = memberStatus(member);
  const summary = memberSettingsSummary(member, memberCalendarNames(member, calendars));

  return (
    <View>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.memberRow, pressed && { backgroundColor: colors.surface }]}
        accessibilityRole="button"
        accessibilityLabel={[name, role, status?.label, isSelf ? teamT('row.you') : null].filter(Boolean).join(', ')}>
        <Avatar name={member.name ?? member.email ?? 'Staff'} size={40} />
        <View style={styles.flexText}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {name}
          </Text>
          {member.name && member.email ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {member.email}
            </Text>
          ) : null}
          <View style={styles.badges}>
            <Badge label={role} tone={roleBadgeTone(member)} />
            {status ? <Badge label={status.label} tone={status.tone} /> : null}
            {isSelf ? <Badge label={teamT('row.you')} tone="success" /> : null}
          </View>
          {summary.length > 0 ? (
            <Text variant="caption" tone="secondary" style={styles.summary}>
              {summary.join(' · ')}
            </Text>
          ) : null}
        </View>
        <Text variant="caption" tone="muted" style={styles.chevron}>
          ›
        </Text>
      </Pressable>
      {!isLast ? <View style={[styles.rowDivider, { backgroundColor: colors.border }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.lg,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  intro: {
    gap: spacing.md,
  },
  guide: {
    gap: spacing.md,
  },
  guideEntry: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xxs,
  },
  guideLines: {
    marginTop: spacing.xs,
    gap: spacing.xxs,
  },
  guideLine: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  strong: {
    fontFamily: fonts.semibold,
  },
  link: {
    alignSelf: 'flex-start',
  },
  block: {
    gap: spacing.sm,
  },
  overline: {
    paddingHorizontal: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  hint: {
    paddingHorizontal: spacing.xs,
  },
  myAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.card,
  },
  flexText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  summary: {
    marginTop: spacing.xs,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.base + 40 + spacing.md,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderRadius: radius.card,
  },
  chevron: {
    fontSize: 20,
    lineHeight: 22,
  },
  spacer: {
    height: spacing['3xl'],
  },
});
