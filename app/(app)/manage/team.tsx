import { Stack, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { planDisplayName, planStaffLimit } from '@/components/plan/planConstants';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Fab } from '@/components/ui/Fab';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { InviteStaffSheet } from '@/components/manage/InviteStaffSheet';
import { MyAccountSheet } from '@/components/manage/MyAccountSheet';
import { SessionSettingsSheet } from '@/components/manage/SessionSettingsSheet';
import { StaffMemberSheet } from '@/components/manage/StaffMemberSheet';
import { ApiError } from '@/lib/api/client';
import { hapticSelect } from '@/lib/haptics';
import { useSessionSettings } from '@/lib/queries/useSessionSettings';
import { useStaffList } from '@/lib/queries/useStaffList';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useVenueContext } from '@/providers/VenueProvider';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AssignablePractitioner, TeamMember } from '@/types/staff';

/** Team logins & roles — full in-app management for admins, My Account for all staff. */
export default function TeamScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  // Use staff/me for a reliable role check (avoids VenueProvider dual-source-of-truth bug).
  const { data: staffMeData, isLoading: staffMeLoading } = useStaffMe();
  const staffMe = staffMeData?.staff ?? null;
  const isAdmin = staffMe?.role === 'admin';

  // Plan seat cap — read the tier from the venue bootstrap (web parity).
  const { venue } = useVenueContext();
  const pricingTier = venue?.pricing_tier ?? null;

  const query = useStaffList(isAdmin);
  const practitionersQuery = usePractitioners({ enabled: isAdmin });
  const sessionQuery = useSessionSettings(isAdmin);

  // Sheet state
  const [showInvite, setShowInvite] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showMyAccount, setShowMyAccount] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);

  const members = query.data?.staff ?? [];

  // Seat-cap enforcement — Light=1, Plus=5, Pro/restaurant=∞ (web parity).
  // When the cap is reached we hide the invite FAB and show an upgrade nudge so
  // an admin can't fill in an invite the server would reject.
  const staffCap = planStaffLimit(pricingTier);
  const staffPlanLimitReached = staffCap !== Infinity && members.length >= staffCap;

  // Map practitioners to AssignablePractitioner for components
  const assignablePractitioners: AssignablePractitioner[] = (
    practitionersQuery.data?.practitioners ?? []
  ).map((p) => ({
    id: p.id,
    name: p.name,
    is_active: p.is_active,
    calendar_type: p.calendar_type,
  }));

  const sessionMinutes = sessionQuery.data?.session_timeout_minutes ?? 480;

  const header = <Stack.Screen options={{ headerShown: true, title: 'Team' }} />;

  if (staffMeLoading) {
    return (
      <Screen scroll={false} padded={false}>
        {header}
        <ListSkeleton />
      </Screen>
    );
  }

  if (query.isLoading && isAdmin) {
    return (
      <Screen scroll={false} padded={false}>
        {header}
        <ListSkeleton />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      {header}

      {query.isError && isAdmin ? (
        <View style={styles.stateWrap}>
          <ErrorState
            message={
              query.error instanceof ApiError
                ? query.error.message
                : 'Could not load the team.'
            }
            onRetry={() => void query.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              tintColor={colors.brand}
            />
          }>
          {/* My Account shortcut — visible to all staff */}
          <Card padded={false}>
            <Pressable
              onPress={() => {
                hapticSelect();
                setShowMyAccount(true);
              }}
              style={({ pressed }) => [
                styles.myAccountRow,
                pressed && { backgroundColor: colors.surface },
              ]}
              accessibilityRole="button"
              accessibilityLabel="My account">
              <Avatar name={staffMe?.name ?? staffMe?.email ?? 'Me'} size={44} />
              <View style={styles.myAccountText}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {staffMe?.name ?? staffMe?.email ?? 'My account'}
                </Text>
                {staffMe?.name ? (
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {staffMe.email}
                  </Text>
                ) : null}
              </View>
              <Badge
                label={isAdmin ? 'Admin' : 'Staff'}
                tone={isAdmin ? 'brand' : 'neutral'}
              />
              <Text variant="caption" tone="muted" style={styles.chevron}>
                ›
              </Text>
            </Pressable>
          </Card>

          {/* Staff list (admin only) */}
          {isAdmin && (
            <>
              <View style={styles.sectionHeader}>
                <Text variant="overline" tone="muted">
                  Team members
                </Text>
                <Text variant="caption" tone="muted">
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </Text>
              </View>

              {members.length === 0 && !query.isLoading ? (
                <EmptyState
                  title="No team members yet"
                  message="Invite staff members using the + button."
                />
              ) : (
                <Card padded={false}>
                  {members.map((member, index) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      isSelf={member.id === staffMe?.id}
                      isLast={index === members.length - 1}
                      onPress={() => {
                        hapticSelect();
                        setSelectedMember(member);
                      }}
                    />
                  ))}
                </Card>
              )}

              {/* Plan seat-cap nudge (web parity amber banner) */}
              {staffPlanLimitReached && (
                <View
                  style={[
                    styles.capBox,
                    { backgroundColor: colors.warningSurface, borderColor: colors.warning },
                  ]}>
                  <Text variant="bodySmall" color={colors.warning} style={styles.capText}>
                    {planDisplayName(pricingTier)} allows up to {staffCap} team login
                    {staffCap === 1 ? '' : 's'}. To invite more people, upgrade to Appointments Pro.
                  </Text>
                  <Button
                    label="Upgrade plan"
                    variant="secondary"
                    size="sm"
                    onPress={() => router.push('/manage/plan' as Href)}
                  />
                </View>
              )}

              {/* Role permissions info box */}
              <View
                style={[
                  styles.infoBox,
                  { backgroundColor: colors.infoSurface, borderColor: colors.brandBorder },
                ]}>
                <Text variant="label" color={colors.brand} style={styles.infoTitle}>
                  Role permissions
                </Text>
                <Text variant="caption" tone="secondary" style={styles.infoText}>
                  <Text variant="caption" style={{ fontFamily: fonts.semibold }}>
                    Admin
                  </Text>
                  {' — full access to all settings, staff management, reports and bookings.\n'}
                  <Text variant="caption" style={{ fontFamily: fonts.semibold }}>
                    Staff
                  </Text>
                  {' — day-to-day access to assigned calendars, bookings and guest details.\n'}
                  Tap a member to manage their role, calendars, password or invitation.
                </Text>
              </View>

              {/* Security settings (admin only) */}
              <Card padded={false}>
                <Pressable
                  onPress={() => {
                    hapticSelect();
                    setShowSecurity(true);
                  }}
                  style={({ pressed }) => [
                    styles.securityRow,
                    pressed && { backgroundColor: colors.surface },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Session timeout security settings">
                  <View style={styles.securityText}>
                    <Text variant="bodyMedium">Session timeout</Text>
                    <Text variant="caption" tone="muted">
                      Auto-logout after {formatTimeout(sessionMinutes)} of inactivity
                    </Text>
                  </View>
                  <Text variant="caption" tone="muted" style={styles.chevron}>
                    ›
                  </Text>
                </Pressable>
              </Card>
            </>
          )}

          <View style={styles.spacer} />
        </ScrollView>
      )}

      {/* FAB — admin invite (hidden once the plan seat cap is reached) */}
      {isAdmin && !staffPlanLimitReached && (
        <Fab
          onPress={() => setShowInvite(true)}
          accessibilityLabel="Invite staff member"
        />
      )}

      {/* Invite sheet */}
      <InviteStaffSheet
        visible={showInvite}
        onClose={() => setShowInvite(false)}
        practitioners={assignablePractitioners}
        onUpgrade={() => router.push('/manage/plan' as Href)}
      />

      {/* Member management sheet */}
      <StaffMemberSheet
        visible={selectedMember !== null}
        member={selectedMember}
        isSelf={selectedMember?.id === staffMe?.id}
        practitioners={assignablePractitioners}
        onClose={() => setSelectedMember(null)}
        onDeleted={() => setSelectedMember(null)}
      />

      {/* My Account sheet */}
      <MyAccountSheet
        visible={showMyAccount}
        staff={staffMe}
        onClose={() => setShowMyAccount(false)}
      />

      {/* Session security sheet */}
      <SessionSettingsSheet
        visible={showSecurity}
        currentMinutes={sessionMinutes}
        onClose={() => setShowSecurity(false)}
      />
    </Screen>
  );
}

/** A single member row in the team list. */
function MemberRow({
  member,
  isSelf,
  isLast,
  onPress,
}: {
  member: TeamMember;
  isSelf: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  const calendarSummary = member.linked_practitioner_name ?? null;
  const joinedDate = member.created_at
    ? new Date(member.created_at).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <View>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.memberRow,
          pressed && { backgroundColor: colors.surface },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${member.name ?? member.email ?? 'Staff member'}, ${member.role}`}>
        <View style={styles.avatarWrap}>
          <Avatar name={member.name ?? member.email ?? 'Staff'} size={40} />
          {isSelf && (
            <View style={[styles.selfDot, { backgroundColor: colors.success, borderColor: colors.surfaceRaised }]} />
          )}
        </View>
        <View style={styles.memberText}>
          <View style={styles.memberNameRow}>
            <Text variant="bodyMedium" numberOfLines={1} style={styles.memberName}>
              {member.name ?? member.email ?? 'Staff member'}
            </Text>
            {isSelf && (
              <Text variant="caption" color={colors.success} style={styles.youLabel}>
                You
              </Text>
            )}
          </View>
          {member.name && member.email ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {member.email}
            </Text>
          ) : null}
          {calendarSummary ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              Manages: {calendarSummary}
            </Text>
          ) : null}
          {joinedDate ? (
            <Text variant="caption" tone="muted">
              Joined {joinedDate}
            </Text>
          ) : null}
        </View>
        <View style={styles.memberRight}>
          <Badge
            label={member.role === 'admin' ? 'Admin' : 'Staff'}
            tone={member.role === 'admin' ? 'brand' : 'neutral'}
          />
          <Text variant="caption" tone="muted" style={styles.chevron}>
            ›
          </Text>
        </View>
      </Pressable>
      {!isLast && (
        <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
      )}
    </View>
  );
}

function formatTimeout(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const d = minutes / 1440;
    return `${d} day${d === 1 ? '' : 's'}`;
  }
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  return `${minutes} minutes`;
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.md,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  myAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.card,
  },
  myAccountText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
  },
  avatarWrap: {
    position: 'relative',
  },
  selfDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  memberText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  memberName: {
    flexShrink: 1,
  },
  youLabel: {
    flexShrink: 0,
  },
  memberRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.base + 40 + spacing.md,
  },
  capBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  capText: {
    lineHeight: 18,
  },
  infoBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
    gap: spacing.xs,
  },
  infoTitle: {
    marginBottom: 2,
  },
  infoText: {
    lineHeight: 18,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderRadius: radius.card,
  },
  securityText: {
    flex: 1,
    gap: 1,
  },
  chevron: {
    fontSize: 20,
    lineHeight: 22,
  },
  spacer: {
    height: spacing['3xl'],
  },
});
