import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AccessSettingsFields,
  CalendarChecklist,
  RoleChoiceList,
  SettingSwitch,
  STANDARD_ACCESS,
  StepHeading,
  type AccessValue,
} from '@/components/manage/TeamSettingsControls';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticError, hapticSuccess } from '@/lib/haptics';
import { useInviteStaff } from '@/lib/queries/useTeamMutations';
import { roleChoiceBody, roleOptionsFor, teamErrorMessage, type TeamViewer } from '@/lib/roles/roles';
import { invitedNotice, SETTING_COPY, teamT, type InviteOutcome } from '@/lib/roles/team-copy';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AssignablePractitioner, InviteStaffBody, RoleChoice } from '@/types/staff';

type InviteStaffSheetProps = {
  visible: boolean;
  onClose: () => void;
  practitioners: AssignablePractitioner[];
  /**
   * Who is inviting (web roles plan §5.3): Front desk is offered on a server that knows it, and
   * Admin only to the owner or an admin with "Billing, payouts and admins". Left out, the inviter
   * reads as an admin from before roles (Staff and Admin).
   */
  viewer?: TeamViewer;
  /** The business's name, for the confirmation to someone who already has a ResNeo login. */
  businessName?: string;
  /** Checkout on: the role lines mention the till. */
  checkoutOn?: boolean;
};

const LEGACY_ADMIN_VIEWER: TeamViewer = { staffId: null, isOwner: false, billingPayoutsAdmins: true, rolesKnown: false };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Inviting someone (web roles plan §5.1, §5.3, §5.5; the web's `team/InviteForm`), in numbered
 * steps an owner who has never used ResNeo can follow: who they are, what they will do, and for
 * Front desk or Staff their calendars and what they can see. The owner inviting an admin chooses
 * what else that admin can manage. Everything goes in one request, and the server writes the
 * standard settings for anything not sent. When it is sent, the sheet says what happened, in the
 * web's words for each case (invited, an existing login, added without an email).
 */
export function InviteStaffSheet({
  visible,
  onClose,
  practitioners,
  viewer = LEGACY_ADMIN_VIEWER,
  businessName = 'your business',
  checkoutOn = true,
}: InviteStaffSheetProps) {
  const { colors } = useTheme();
  const invite = useInviteStaff();
  const roleOptions = roleOptionsFor(viewer).map((o) => o.value);
  const scrollRef = useRef<ScrollView>(null);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<RoleChoice>('staff');
  const [calendarIds, setCalendarIds] = useState<string[]>([]);
  const [access, setAccess] = useState<AccessValue>(STANDARD_ACCESS);
  const [billing, setBilling] = useState(false);
  const [adminExport, setAdminExport] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<InviteOutcome | null>(null);

  const calendars = practitioners
    .filter((p) => p.is_active && (p.calendar_type ?? 'practitioner') !== 'resource')
    .map((p) => ({ id: p.id, name: p.name }));
  const personName = name.trim().split(/\s+/)[0] || 'This person';
  const busy = invite.isPending;

  function resetForm() {
    setEmail('');
    setName('');
    setRole('staff');
    setCalendarIds([]);
    setAccess(STANDARD_ACCESS);
    setBilling(false);
    setAdminExport(false);
    setEmailError(undefined);
    setFormError(null);
    setDone(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function inviteAnother() {
    resetForm();
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }

  function chooseRole(next: RoleChoice) {
    setRole(next);
    if (next === 'admin') setCalendarIds([]);
  }

  /**
   * The settings to send: Front desk and Staff send all three; the owner inviting an admin sends
   * the two switches; anyone else inviting an admin sends none (the server writes them off). A
   * server from before the four roles gets none, as it knows none of them.
   */
  function permissionsToSend(): InviteStaffBody['permissions'] {
    if (!viewer.rolesKnown) return undefined;
    if (role !== 'admin') return { ...access };
    return viewer.isOwner ? { billing_payouts_admins: billing, export_clients: adminExport } : undefined;
  }

  async function handleSubmit() {
    const address = email.trim().toLowerCase();
    const problem = !address ? teamT('invite.email.missing') : EMAIL_PATTERN.test(address) ? undefined : teamT('invite.email.invalid');
    setEmailError(problem);
    setFormError(null);
    if (problem) {
      hapticError();
      scrollRef.current?.scrollTo?.({ y: 0, animated: true });
      return;
    }
    const permissions = permissionsToSend();
    try {
      const result = await invite.mutateAsync({
        email: address,
        name: name.trim() || undefined,
        // `role_key` names the role on a server with the four roles; `role` keeps an older one working.
        ...roleChoiceBody(role),
        ...(permissions ? { permissions } : {}),
        ...(role !== 'admin' && calendarIds.length > 0 ? { calendar_ids: calendarIds } : {}),
      });
      hapticSuccess();
      // The list is read again (useInviteStaff invalidates it): the server writes the standard
      // settings, so the rows show what it stored rather than a guess.
      setDone({
        email: address,
        name: name.trim() || null,
        role,
        inviteEmailSent: result.invite_email_sent === true,
        joinsExistingLogin: result.joins_existing_login === true,
      });
      scrollRef.current?.scrollTo?.({ y: 0, animated: false });
    } catch (err) {
      hapticError();
      // The server's own words for the roles refusals and the daily invite limit (429).
      setFormError(teamErrorMessage(err, teamT('invite.error')));
    }
  }

  const outcome = done ? invitedNotice(done, businessName) : null;

  return (
    <Sheet visible={visible} onClose={handleClose} maxHeight="90%" fill>
      <View style={styles.header}>
        <Text variant="subheading">{outcome ? outcome.title : teamT('invite.title')}</Text>
        {outcome ? null : (
          <Text variant="bodySmall" tone="secondary">
            {teamT('invite.intro')}
          </Text>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {outcome ? (
          <View style={styles.section}>
            <View
              accessibilityRole="alert"
              style={[styles.doneBox, { backgroundColor: colors.successSurface, borderColor: colors.success }]}>
              <Text variant="body" color={colors.text}>
                {outcome.text}
              </Text>
            </View>
            <View style={styles.actions}>
              <Button label={teamT('invite.done.close')} onPress={handleClose} fullWidth />
              <Button label={teamT('invite.done.another')} variant="secondary" onPress={inviteAnother} fullWidth />
            </View>
          </View>
        ) : (
          <>
            {/* 1. Who are you inviting? */}
            <View style={styles.section}>
              <StepHeading title={teamT('invite.step.who')} />
              <Input
                label={teamT('invite.name')}
                value={name}
                onChangeText={setName}
                placeholder={teamT('invite.name.placeholder')}
                autoComplete="off"
                editable={!busy}
              />
              <Input
                label={teamT('invite.email')}
                required
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (emailError) setEmailError(undefined);
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                placeholder="name@example.com"
                helper={teamT('invite.email.help')}
                error={emailError}
                editable={!busy}
              />
            </View>

            {/* 2. What will they do? */}
            <View style={styles.section}>
              <StepHeading title={teamT('invite.step.role')} />
              <RoleChoiceList options={roleOptions} value={role} onChange={chooseRole} disabled={busy} checkoutOn={checkoutOn} />
              <Text variant="bodySmall" tone="secondary">
                {teamT('invite.role.notSure')}
              </Text>
              {!viewer.billingPayoutsAdmins ? (
                <Text variant="bodySmall" tone="muted">
                  {teamT('invite.role.noAdmin')}
                </Text>
              ) : null}
            </View>

            {role !== 'admin' ? (
              <>
                {/* 3. Which calendars are theirs? */}
                <View style={styles.section}>
                  <StepHeading
                    title={teamT('invite.step.calendars')}
                    help={role === 'front_desk' ? teamT('invite.calendars.frontDesk') : null}
                  />
                  {calendars.length > 0 ? (
                    <Text variant="bodySmall" tone="secondary">
                      {SETTING_COPY.calendarsHelp}
                    </Text>
                  ) : null}
                  <CalendarChecklist
                    calendars={calendars}
                    selected={calendarIds}
                    disabled={busy}
                    onToggle={(id, checked) =>
                      setCalendarIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)))
                    }
                    onSetAll={(all) => setCalendarIds(all ? calendars.map((c) => c.id) : [])}
                  />
                </View>

                {/* 4. What can they see? (a server that knows the four roles) */}
                {viewer.rolesKnown ? (
                  <View style={styles.section}>
                    <StepHeading title={teamT('invite.step.see')} help={teamT('invite.see.standard')} />
                    <AccessSettingsFields
                      value={access}
                      disabled={busy}
                      onChange={(patch) => setAccess((prev) => ({ ...prev, ...patch }))}
                      personName={personName}
                      hasCalendar={calendarIds.length > 0}
                    />
                  </View>
                ) : null}
              </>
            ) : viewer.isOwner ? (
              /* 3. What else can they manage? (the owner inviting an admin) */
              <View style={styles.section}>
                <StepHeading title={teamT('invite.step.manage')} />
                <SettingSwitch
                  label={SETTING_COPY.billingLabel}
                  help={SETTING_COPY.billingHelp}
                  value={billing}
                  disabled={busy}
                  onChange={setBilling}
                />
                <SettingSwitch
                  label={SETTING_COPY.exportLabel}
                  help={SETTING_COPY.exportHelp}
                  value={adminExport}
                  disabled={busy}
                  onChange={setAdminExport}
                />
              </View>
            ) : viewer.rolesKnown ? (
              <Text variant="bodySmall" tone="secondary">
                {teamT('invite.admin.notOwner')}
              </Text>
            ) : null}

            {formError ? (
              <View
                accessibilityRole="alert"
                style={[styles.errorBox, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}>
                <Text variant="bodySmall" color={colors.danger}>
                  {formError}
                </Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Button
                label={busy ? teamT('invite.sending') : teamT('invite.send')}
                loading={busy}
                onPress={() => void handleSubmit()}
                fullWidth
              />
              <Button label={teamT('invite.cancel')} variant="secondary" onPress={handleClose} fullWidth disabled={busy} />
            </View>
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
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
  doneBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
  },
  errorBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
  },
});
