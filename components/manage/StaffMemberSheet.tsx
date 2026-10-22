import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AccessSettingsFields,
  CalendarChecklist,
  RoleChoiceList,
  SettingSwitch,
  StepHeading,
} from '@/components/manage/TeamSettingsControls';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmPanel } from '@/components/ui/ConfirmPanel';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticError, hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useDeleteStaffMember,
  usePatchStaffCalendar,
  usePatchStaffMember,
  useResendInvite,
  useResetStaffPassword,
} from '@/lib/queries/useTeamMutations';
import {
  billingSwitchOn,
  contactSwitchOn,
  diaryChoiceOf,
  exportSwitchOn,
  isOwnerPerson,
  memberAccess,
  roleBadgeTone,
  roleChoiceBody,
  roleChoiceOf,
  roleKeyOf,
  roleOptionsFor,
  showsAdminExportSwitch,
  showsBillingSwitch,
  showsPersonSwitches,
  teamErrorMessage,
  type MemberAccess,
  type TeamViewer,
} from '@/lib/roles/roles';
import {
  displayNameOf,
  firstNameOf,
  memberCalendarIds,
  memberCalendarNames,
  memberSettingsSummary,
  memberStatus,
  ROLE_INFO,
  roleChangeQuestion,
  SETTING_COPY,
  teamT,
} from '@/lib/roles/team-copy';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AssignablePractitioner, PatchStaffBody, RoleChoice, TeamMember } from '@/types/staff';

type StaffMemberSheetProps = {
  visible: boolean;
  member: TeamMember | null;
  isSelf: boolean;
  /**
   * Who is looking (web roles plan §5.3 to §5.5). Left out, the viewer reads as an admin from before
   * roles: every action, Staff and Admin to choose from.
   */
  viewer?: TeamViewer;
  practitioners: AssignablePractitioner[];
  /** The business's name, for what removing someone means. */
  businessName?: string;
  onClose: () => void;
  onDeleted: () => void;
};

const LEGACY_ADMIN_VIEWER: TeamViewer = { staffId: null, isOwner: false, billingPayoutsAdmins: true, rolesKnown: false };

/** How long "Saved" stays after a change. */
const SAVED_MS = 2500;

type Notice = { tone: 'success' | 'error'; text: string };

/**
 * One person on the team (web roles plan §5.1 to §5.5, §5.11; the web's `team/MemberCard`), in
 * sections an owner can read top to bottom: whether they have signed in, their role (changing it
 * asks first), their calendars, what they can see, what else an admin can manage, signing in, and
 * removing them. Each change saves at once and says "Saved", or what went wrong, inside the sheet.
 *
 * Nobody manages the owner's row or their own: those, and another admin opened by an admin without
 * "Billing, payouts and admins", show who can change them instead. Questions are asked inline
 * (`ConfirmPanel`), never as a second sheet over this one, which iOS would drop.
 */
export function StaffMemberSheet({
  visible,
  member,
  isSelf,
  viewer = LEGACY_ADMIN_VIEWER,
  practitioners,
  businessName = 'your business',
  onClose,
  onDeleted,
}: StaffMemberSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();

  // The person stays on screen while the sheet slides away after the screen lets go of them.
  const [shown, setShown] = useState<TeamMember | null>(member);
  if (member && member !== shown) setShown(member);
  const person = member ?? shown;

  // The role waiting for "Change role" or "Keep it as it is".
  const [pendingRole, setPendingRole] = useState<RoleChoice | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Where "Signing in" sits in the scroll, so the password form can be brought above the keyboard.
  const signInY = useRef(0);

  const patchRole = usePatchStaffMember();
  // The switches: each saves as soon as it changes.
  const patchSwitch = usePatchStaffMember();
  const patchCalendar = usePatchStaffCalendar();
  const resendInvite = useResendInvite();
  const resetPassword = useResetStaffPassword();
  const deleteStaff = useDeleteStaffMember();

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  // A fresh start each time the sheet opens.
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setPendingRole(null);
      setNotice(null);
      setPasswordOpen(false);
      setNewPassword('');
      setPasswordError(undefined);
      setConfirmingRemove(false);
    }
  }

  function showNotice(next: Notice) {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = null;
    setNotice(next);
  }

  function showSaved() {
    hapticSuccess();
    showNotice({ tone: 'success', text: teamT('member.saved') });
    savedTimer.current = setTimeout(() => setNotice(null), SAVED_MS);
  }

  function showError(err: unknown, fallback: string) {
    hapticError();
    showNotice({ tone: 'error', text: teamErrorMessage(err, fallback) });
  }

  const calendars = practitioners
    .filter((p) => p.is_active && (p.calendar_type ?? 'practitioner') !== 'resource')
    .map((p) => ({ id: p.id, name: p.name }));

  if (!person) {
    return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  }

  const name = displayNameOf(person);
  const firstName = firstNameOf(person);
  const email = person.email ?? '';
  const roleKey = roleKeyOf(person);
  const currentRole = roleChoiceOf(person);
  const isAdminRow = person.role === 'admin';
  const status = memberStatus(person);
  const access: MemberAccess = isSelf ? 'self' : memberAccess(viewer, person);
  const assigned = memberCalendarIds(person);
  const activeIds = calendars.map((c) => c.id);
  const switchedOff = calendars.length > 0 ? assigned.filter((id) => !activeIds.includes(id)).length : 0;
  const saving = patchRole.isPending || patchSwitch.isPending || patchCalendar.isPending;
  const personSwitches = showsPersonSwitches(viewer, person);
  const billingSwitch = showsBillingSwitch(viewer, person) && isAdminRow;
  const adminExportSwitch = showsAdminExportSwitch(viewer, person) && isAdminRow;

  function handleClose() {
    onClose();
  }

  async function confirmRole() {
    if (!person || !pendingRole) return;
    try {
      // `role_key` names the role on a server with the four roles; `role` keeps an older one working.
      await patchRole.mutateAsync({ id: person.id, body: roleChoiceBody(pendingRole) });
      setPendingRole(null);
      showSaved();
    } catch (err) {
      setPendingRole(null);
      showError(err, teamT('member.role.error'));
    }
  }

  /** A switch on this person, saved as soon as it changes (the list shows it at once, and puts it back on a refusal). */
  async function saveSwitch(permissions: NonNullable<PatchStaffBody['permissions']>) {
    if (!person) return;
    try {
      await patchSwitch.mutateAsync({ id: person.id, body: { permissions } });
      showSaved();
    } catch (err) {
      showError(err, teamT('member.switch.error'));
    }
  }

  async function saveCalendars(ids: string[]) {
    if (!person) return;
    try {
      await patchCalendar.mutateAsync({ id: person.id, body: { calendar_ids: ids } });
      showSaved();
    } catch (err) {
      showError(err, teamT('member.calendars.error'));
    }
  }

  async function sendLink() {
    if (!person) return;
    try {
      const res = await resendInvite.mutateAsync(person.id);
      hapticSuccess();
      showNotice({
        tone: 'success',
        text: teamT('member.link.sent', { said: res.message?.trim() || teamT('member.link.sentDefault'), email }),
      });
    } catch (err) {
      showError(err, teamT('member.link.error'));
    }
  }

  async function savePassword() {
    if (!person) return;
    if (newPassword.length < 8) {
      setPasswordError(teamT('member.password.short'));
      return;
    }
    setPasswordError(undefined);
    try {
      await resetPassword.mutateAsync({ id: person.id, body: { new_password: newPassword } });
      hapticSuccess();
      setNewPassword('');
      setPasswordOpen(false);
      showNotice({ tone: 'success', text: teamT('member.password.done', { name }) });
    } catch (err) {
      hapticError();
      setPasswordError(teamErrorMessage(err, teamT('member.password.error')));
    }
  }

  async function remove() {
    if (!person) return;
    try {
      await deleteStaff.mutateAsync(person.id);
      hapticSuccess();
      setConfirmingRemove(false);
      toast.success(teamT('member.remove.done', { name }));
      onDeleted();
      onClose();
    } catch (err) {
      setConfirmingRemove(false);
      showError(err, teamT('member.remove.error'));
    }
  }

  const summary = memberSettingsSummary(person, memberCalendarNames(person, calendars));
  const question = pendingRole ? roleChangeQuestion(person, pendingRole, viewer.isOwner) : null;

  return (
    <Sheet visible={visible && member !== null} onClose={handleClose} maxHeight="90%" fill>
      <View style={styles.header}>
        <Text variant="subheading" numberOfLines={1}>
          {name}
        </Text>
        {person.name && person.email ? (
          <Text variant="bodySmall" tone="muted" numberOfLines={1}>
            {person.email}
          </Text>
        ) : null}
        <View style={styles.badges}>
          <Badge label={ROLE_INFO[roleKey].label} tone={roleBadgeTone(person)} />
          {status ? <Badge label={status.label} tone={status.tone} /> : null}
          {isSelf ? <Badge label={teamT('row.you')} tone="success" /> : null}
        </View>
      </View>

      {notice ? (
        <View
          accessibilityRole={notice.tone === 'error' ? 'alert' : 'text'}
          accessibilityLiveRegion="polite"
          style={[
            styles.notice,
            notice.tone === 'error'
              ? { backgroundColor: colors.dangerSurface, borderColor: colors.danger }
              : { backgroundColor: colors.successSurface, borderColor: colors.success },
          ]}>
          <Text variant="bodySmall" color={notice.tone === 'error' ? colors.danger : colors.text}>
            {notice.text}
          </Text>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {access !== 'manage' ? (
          /* Nothing to manage here: what their role is, and who can change it. */
          <View style={styles.section}>
            <Text variant="body" tone="secondary">
              {ROLE_INFO[roleKey].summary}
            </Text>
            {summary.length > 0 ? (
              <View style={styles.summaryList}>
                {summary.map((line) => (
                  <Text key={line} variant="bodySmall" tone="secondary">
                    {`• ${line}`}
                  </Text>
                ))}
              </View>
            ) : null}
            <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {access === 'self' && isOwnerPerson(person) ? (
                <>
                  <Text variant="bodySmall">{teamT('member.self.owner')}</Text>
                  <Text variant="bodySmall">{teamT('member.transfer')}</Text>
                </>
              ) : (
                <Text variant="bodySmall">{lockedLine(access, name)}</Text>
              )}
            </View>
            <Button label={teamT('member.close')} variant="secondary" onPress={handleClose} fullWidth />
          </View>
        ) : (
          <>
            {status ? (
              <View style={[styles.infoBox, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
                <Text variant="bodySmall" color={colors.text}>
                  {status.text}
                </Text>
              </View>
            ) : null}

            {/* Role */}
            <View style={styles.section}>
              <StepHeading title={teamT('member.role')} />
              <RoleChoiceList
                options={roleOptionsFor(viewer).map((o) => o.value)}
                value={pendingRole ?? currentRole}
                disabled={saving || pendingRole !== null}
                showGoodFor={false}
                onChange={(next) => {
                  if (next === currentRole) return;
                  setNotice(null);
                  setPendingRole(next);
                }}
              />
              {question ? (
                <ConfirmPanel
                  title={question.title}
                  message={question.message}
                  confirmLabel={teamT('member.role.confirm')}
                  cancelLabel={teamT('member.role.keep')}
                  loading={patchRole.isPending}
                  onConfirm={() => void confirmRole()}
                  onCancel={() => setPendingRole(null)}
                />
              ) : (
                <Text variant="bodySmall" tone="muted">
                  {ROLE_INFO[currentRole].goodFor}
                </Text>
              )}
            </View>

            {/* Their calendars: Front desk and Staff (admins see every calendar) */}
            {!isAdminRow ? (
              <View style={styles.section}>
                <StepHeading title={SETTING_COPY.calendarsLabel} help={calendars.length > 0 ? SETTING_COPY.calendarsHelp : null} />
                <CalendarChecklist
                  calendars={calendars}
                  selected={assigned}
                  disabled={saving}
                  onToggle={(id, checked) => {
                    const next = new Set(assigned);
                    if (checked) next.add(id);
                    else next.delete(id);
                    void saveCalendars([...next]);
                  }}
                  onSetAll={(all) =>
                    void saveCalendars(all ? [...new Set([...assigned, ...activeIds])] : [])
                  }
                />
                {switchedOff > 0 ? (
                  <Text variant="bodySmall" color={colors.warning}>
                    {teamT(switchedOff === 1 ? 'member.calendars.switchedOff.one' : 'member.calendars.switchedOff.many', {
                      name: firstName,
                      count: switchedOff,
                    })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* What they can see: Front desk and Staff */}
            {personSwitches && !isAdminRow ? (
              <View style={styles.section}>
                <StepHeading title={teamT('member.see')} />
                <AccessSettingsFields
                  value={{
                    client_contact: contactSwitchOn(person),
                    other_diaries: diaryChoiceOf(person),
                    export_clients: exportSwitchOn(person),
                  }}
                  disabled={saving}
                  onChange={(patch) => void saveSwitch(patch)}
                  personName={firstName}
                  hasCalendar={assigned.length > 0}
                />
              </View>
            ) : null}

            {/* What else they can manage: the owner, on another admin */}
            {billingSwitch || adminExportSwitch ? (
              <View style={styles.section}>
                <StepHeading title={teamT('member.manage')} />
                {billingSwitch ? (
                  <SettingSwitch
                    label={SETTING_COPY.billingLabel}
                    help={SETTING_COPY.billingHelp}
                    value={billingSwitchOn(person)}
                    disabled={saving}
                    onChange={(on) => void saveSwitch({ billing_payouts_admins: on })}
                  />
                ) : null}
                {adminExportSwitch ? (
                  <SettingSwitch
                    label={SETTING_COPY.exportLabel}
                    help={SETTING_COPY.exportHelp}
                    value={exportSwitchOn(person)}
                    disabled={saving}
                    onChange={(on) => void saveSwitch({ export_clients: on })}
                  />
                ) : null}
              </View>
            ) : null}

            {/* Signing in */}
            <View style={styles.section} onLayout={(e) => (signInY.current = e.nativeEvent.layout.y)}>
              <StepHeading
                title={teamT('member.signIn')}
                help={
                  person.invite_pending
                    ? teamT('member.signIn.pending', { name: firstName, email })
                    : teamT('member.signIn.active', { name: firstName })
                }
              />
              {person.invite_pending ? (
                <View style={styles.action}>
                  <Button
                    label={resendInvite.isPending ? teamT('member.sending') : teamT('member.resend')}
                    variant="secondary"
                    loading={resendInvite.isPending}
                    onPress={() => void sendLink()}
                    fullWidth
                  />
                  <Text variant="caption" tone="muted">
                    {teamT('member.resend.help', { email })}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.action}>
                    <Button
                      label={resendInvite.isPending ? teamT('member.sending') : teamT('member.link')}
                      variant="secondary"
                      loading={resendInvite.isPending}
                      onPress={() => void sendLink()}
                      fullWidth
                    />
                    <Text variant="caption" tone="muted">
                      {teamT('member.link.help', { email })}
                    </Text>
                  </View>
                  {passwordOpen ? (
                    <View
                      style={[styles.passwordBox, { borderColor: colors.border, backgroundColor: colors.surface }]}
                      onLayout={(e) =>
                        scrollRef.current?.scrollTo?.({ y: Math.max(0, signInY.current + e.nativeEvent.layout.y - spacing.sm), animated: true })
                      }>
                      <Text variant="bodyMedium">{teamT('member.password.title', { name })}</Text>
                      <Text variant="bodySmall" tone="secondary">
                        {teamT('member.password.intro')}
                      </Text>
                      <PasswordInput
                        label={teamT('member.password.field')}
                        accessibilityLabel={teamT('member.password.field')}
                        value={newPassword}
                        onChangeText={(text) => {
                          setNewPassword(text);
                          if (passwordError) setPasswordError(undefined);
                        }}
                        placeholder={teamT('member.password.placeholder')}
                        autoComplete="new-password"
                        error={passwordError}
                        editable={!resetPassword.isPending}
                      />
                      <View style={styles.row}>
                        <Button
                          label={teamT('member.password.cancel')}
                          variant="secondary"
                          style={styles.flex1}
                          disabled={resetPassword.isPending}
                          onPress={() => {
                            setPasswordOpen(false);
                            setNewPassword('');
                            setPasswordError(undefined);
                          }}
                        />
                        <Button
                          label={resetPassword.isPending ? teamT('member.password.saving') : teamT('member.password.save')}
                          style={styles.flex1}
                          loading={resetPassword.isPending}
                          onPress={() => void savePassword()}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.action}>
                      <Button
                        label={teamT('member.password')}
                        variant="secondary"
                        onPress={() => {
                          setNotice(null);
                          setPasswordOpen(true);
                        }}
                        fullWidth
                      />
                      <Text variant="caption" tone="muted">
                        {teamT('member.password.help')}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Remove from your team */}
            <View style={[styles.section, styles.removeSection, { borderTopColor: colors.border }]}>
              <StepHeading
                title={teamT('member.remove')}
                help={teamT('member.remove.help', { name: firstName, business: businessName })}
              />
              {confirmingRemove ? (
                // The question opens at the foot of a long sheet: bring it into view on a phone.
                <View onLayout={() => scrollRef.current?.scrollToEnd?.({ animated: true })}>
                  <ConfirmPanel
                    title={teamT('member.remove.title', { name })}
                    message={teamT('member.remove.body', { business: businessName })}
                    confirmLabel={deleteStaff.isPending ? teamT('member.remove.removing') : teamT('member.remove.confirm')}
                    cancelLabel={teamT('member.remove.cancel')}
                    destructive
                    loading={deleteStaff.isPending}
                    onConfirm={() => void remove()}
                    onCancel={() => setConfirmingRemove(false)}
                  />
                </View>
              ) : (
                <Button
                  label={teamT('member.remove.button', { name: firstName })}
                  variant="danger"
                  onPress={() => {
                    hapticWarning();
                    setConfirmingRemove(true);
                  }}
                  fullWidth
                />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

/** Who can change a row this viewer cannot (Appendix C; web `MemberCard`). */
function lockedLine(access: MemberAccess, ownerName: string): string {
  if (access === 'owner_protected') return teamT('member.ownerProtected', { owner: ownerName });
  if (access === 'billing_locked') return teamT('member.adminLocked');
  return teamT('member.self');
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: 2,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  notice: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  summaryList: {
    gap: spacing.xxs,
  },
  infoBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  action: {
    gap: spacing.xs,
  },
  passwordBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  removeSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.lg,
  },
});
