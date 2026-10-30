import { useMemo, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { SyncBadge } from '@/components/collective-area/AreaPieces';
import { StepShell } from '@/components/linked/setup/StepShell';
import { CalendarValuesFields, useCalendarValuesEditor } from '@/components/services/collective/CalendarValuesStep';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ApiError, isApiErrorBody, isRequiresConfirmationBody } from '@/lib/api/client';
import { areaCopy } from '@/lib/collective-area/copy';
import { isVenueWideRequirement, useComplianceRequirements } from '@/lib/queries/useComplianceRequirements';
import { useSaveMemberServiceSettings, type MemberServiceSettingsBody } from '@/lib/queries/useCollectiveServiceTools';
import { calendarValueDefaults, calendarValueFlags, ownCalendarValuesTarget } from '@/lib/services/calendar-values';
import { staffMayCustomizeFlags } from '@/lib/services/service-override';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ManagedService, PractitionerServiceLink, ServiceCollectiveBlock } from '@/types/services-manage';

/**
 * A service from the host, as its member reads it (web `MemberServiceView`; UX spec §2 item 3, W6).
 * Not a disabled form: three zones instead.
 *
 *   1. At a glance: what it is, how its copy is doing, and the numbers a member needs most days.
 *   2. Your settings: everything the member may change (its calendars, its own meeting link and
 *      "Before the appointment"), in one place.
 *   3. What the host has set: plain values, written out, so nothing reads as missing data.
 *
 * The save sends only those fields, and of the calendars only what changes (web CQ-06): the ones to
 * start and stop offering it, so a calendar this list does not show is never taken off. A
 * switched-off calendar that offers it is listed as "(switched off)" with Remove. Unticking a
 * calendar with upcoming bookings is answered with them listed (409); the next save keeps them and
 * goes ahead, and the button says so.
 */
export interface MemberServiceCalendar {
  id: string;
  name: string;
  /** True when this calendar already offers the service. */
  offers: boolean;
  /** False for a switched-off calendar (CQ-06). Absent means switched on. */
  is_active?: boolean;
}

export interface MemberServiceSheetProps {
  service: ManagedService;
  block: ServiceCollectiveBlock;
  /** Every calendar of this venue, switched off ones too with `is_active: false`. */
  calendars: MemberServiceCalendar[];
  currencySymbol: string;
  /** The venue's forms feature: the "Forms" fact reads the service's own requirements. */
  complianceEnabled: boolean;
  /**
   * An admin may set each calendar's own price and times where the host lets calendars have them
   * (web `MemberServiceView` Edit values, 2026-10-28). Its own calendars' rows for this service.
   */
  canEditValues?: boolean;
  links?: PractitionerServiceLink[];
  onClose: () => void;
  onSaved: () => void;
}

type WithInstructions = { pre_appointment_instructions?: string | null };

const money = (pence: number | null | undefined, symbol: string, whenEmpty = 'Free'): string =>
  pence == null || pence <= 0 ? whenEmpty : `${symbol}${(pence / 100).toFixed(2)}`;

const minutes = (value: number | null | undefined): string => (value == null ? 'Not set' : `${value} min`);

function paymentWords(requirement: string | null | undefined): string {
  if (requirement === 'deposit') return 'A deposit when booking';
  if (requirement === 'full_payment') return 'Paid in full when booking';
  if (requirement === 'card_hold') return 'A card held for no-shows';
  return 'Nothing to pay online';
}

export function MemberServiceSheet({
  service,
  block,
  calendars,
  currencySymbol,
  complianceEnabled,
  canEditValues = false,
  links = [],
  onClose,
  onSaved,
}: MemberServiceSheetProps) {
  const { colors } = useTheme();
  const save = useSaveMemberServiceSettings();
  /** One calendar's own values, edited as a step of this sheet, never a second sheet over it. */
  const [valuesCalendarId, setValuesCalendarId] = useState<string | null>(null);
  const flags = staffMayCustomizeFlags(service);
  const valuesAllowed = canEditValues && (flags.price || flags.duration || flags.buffer || flags.deposit);
  const saving = save.isPending;
  const savedInstructions = (service as WithInstructions).pre_appointment_instructions ?? '';

  // Ticks for the calendars that are switched on; a switched-off one that still offers the service
  // gets a row with Remove; one that does not offer it has nothing to show (web MemberServiceView).
  const activeCalendars = useMemo(() => calendars.filter((c) => c.is_active !== false), [calendars]);
  const switchedOffCalendars = useMemo(() => calendars.filter((c) => c.is_active === false && c.offers), [calendars]);
  const savedCalendarIds = useMemo(() => activeCalendars.filter((c) => c.offers).map((c) => c.id), [activeCalendars]);
  const [chosen, setChosen] = useState<string[]>(savedCalendarIds);
  /** Switched-off calendars staged to stop offering it when the member saves. */
  const [removing, setRemoving] = useState<string[]>([]);
  const [meetingUrl, setMeetingUrl] = useState(service.online_meeting_url ?? '');
  const [meetingInfo, setMeetingInfo] = useState(service.online_meeting_info ?? '');
  const [instructions, setInstructions] = useState(savedInstructions);
  const [error, setError] = useState<string | null>(null);
  /** The last save listed bookings on a calendar being unticked: the next one keeps them. */
  const [needsAck, setNeedsAck] = useState(false);

  const requirements = useComplianceRequirements(service.id, complianceEnabled);
  const formNames = useMemo(
    () =>
      (requirements.data?.requirements ?? [])
        .filter((row) => !isVenueWideRequirement(row))
        .map((row) => row.compliance_type_name),
    [requirements.data],
  );

  const added = chosen.filter((id) => !savedCalendarIds.includes(id));
  const removed = [...savedCalendarIds.filter((id) => !chosen.includes(id)), ...removing];
  const calendarsChanged = added.length > 0 || removed.length > 0;
  const changed =
    calendarsChanged ||
    meetingUrl !== (service.online_meeting_url ?? '') ||
    meetingInfo !== (service.online_meeting_info ?? '') ||
    instructions !== savedInstructions;

  const isOnline = service.location_type === 'online';
  const retired = block.role === 'retired';
  const host = block.host_venue_name;

  const submit = () => {
    const acknowledge = needsAck;
    const body: MemberServiceSettingsBody = {
      id: service.id,
      // Only what changes, and only when something does (CQ-06).
      ...(calendarsChanged ? { calendars: { add: added, remove: removed } } : {}),
      ...(isOnline ? { online_meeting_url: meetingUrl, online_meeting_info: meetingInfo } : {}),
      // Only when changed: a calendar-only save sends nothing else.
      ...(instructions !== savedInstructions ? { pre_appointment_instructions: instructions } : {}),
    };
    setError(null);
    save.mutate(
      { acknowledge, body },
      {
        onSuccess: () => {
          setNeedsAck(false);
          onSaved();
        },
        onError: (err) => {
          if (err instanceof ApiError && (err.status === 0 || err.status === 408)) {
            setError('Could not save your settings. Please check your connection.');
            return;
          }
          if (err instanceof ApiError && err.status === 409 && isRequiresConfirmationBody(err.body)) {
            const data = err.body as { message?: string; error?: string };
            setNeedsAck(true);
            setError(
              data.message ??
                data.error ??
                'Some upcoming bookings are already booked for this service on this calendar. They are kept.',
            );
            return;
          }
          setNeedsAck(false);
          setError(
            err instanceof ApiError && isApiErrorBody(err.body)
              ? err.message
              : 'Could not save your settings. Please try again.',
          );
        },
      },
    );
  };

  const activeOptions = (service.variants ?? [])
    .filter((v) => (v as { is_active?: boolean }).is_active !== false)
    .map((v) => v.name)
    .join(', ');
  const addOns = (service.addon_groups ?? []).map((g) => g.group.name).join(', ');

  const valuesCalendar = valuesCalendarId ? calendars.find((c) => c.id === valuesCalendarId) ?? null : null;
  if (valuesCalendar) {
    return (
      <CalendarValuesStep
        service={service}
        calendarId={valuesCalendar.id}
        calendarName={valuesCalendar.name}
        link={links.find((l) => l.practitioner_id === valuesCalendar.id && l.service_id === service.id) ?? null}
        currencySymbol={currencySymbol}
        onBack={() => setValuesCalendarId(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <StepShell
      visible
      onClose={() => {
        if (!saving) onClose();
      }}
      title={service.name}
      footer={
        <>
          <Button label="Close" variant="ghost" disabled={saving} onPress={onClose} />
          <Button
            label={needsAck ? 'Remove and keep bookings' : 'Save your settings'}
            disabled={!changed || saving}
            loading={saving}
            onPress={submit}
          />
        </>
      }>
      <Text variant="bodySmall" tone="secondary">
        {areaCopy('reach.member.replica', { host, collective: block.collective_name })}
      </Text>
      {error ? (
        <View
          accessibilityRole="alert"
          style={[styles.alert, { backgroundColor: needsAck ? colors.warningSurface : colors.dangerSurface }]}>
          <Text variant="caption" color={needsAck ? colors.warning : undefined} tone={needsAck ? 'default' : 'danger'}>
            {error}
          </Text>
        </View>
      ) : null}

      {/* 1. At a glance. */}
      <View style={styles.section}>
        <View style={styles.badges}>
          {retired ? (
            <Badge label={areaCopy('common.pill.retired')} tone="neutral" />
          ) : (
            <Badge label={areaCopy('common.pill.fromHost', { host })} tone="brand" />
          )}
          <SyncBadge status={block.status} />
        </View>
        {block.status_reason ? (
          <Text variant="bodySmall" tone="secondary">
            {block.status_reason}
          </Text>
        ) : null}
        {retired ? (
          <Text variant="bodySmall" color={colors.warning}>
            {areaCopy('svc.member.view.retiredNote', { host, collective: block.collective_name })}
          </Text>
        ) : null}
        <View style={styles.facts}>
          <Fact label="Price" value={money(service.price_pence, currencySymbol)} />
          <Fact label="Length" value={minutes(service.duration_minutes)} />
          <Fact label="Deposit" value={money(service.deposit_pence, currencySymbol, 'No deposit')} />
          <Fact label="Forms" value={formNames.length > 0 ? formNames.join(', ') : 'No forms'} />
        </View>
      </View>

      {/* 2. Your settings. */}
      <View style={[styles.settings, { borderColor: colors.brand, backgroundColor: colors.infoSurface }]}>
        <Text variant="label" tone="brand" accessibilityRole="header">
          Your settings
        </Text>
        <View style={styles.section}>
          <Text variant="bodyMedium">{areaCopy('svc.member.view.calendarsHeading')}</Text>
          <Text variant="caption" tone="muted">
            {areaCopy('svc.member.view.calendarsHelp', { service: service.name, collective: block.collective_name })}
          </Text>
          {activeCalendars.length + switchedOffCalendars.length === 0 ? (
            <Text variant="bodySmall" tone="secondary">
              {areaCopy('svc.member.card.noCalendars')}
            </Text>
          ) : (
            activeCalendars.map((calendar) => (
              <View key={calendar.id} style={[styles.calendarRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text variant="bodySmall" numberOfLines={1} style={styles.flex1}>
                  {calendar.name}
                </Text>
                {calendar.offers && valuesAllowed && !retired ? (
                  <Button
                    label={areaCopy('svc.cal.editValues')}
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    accessibilityLabel={areaCopy('svc.member.view.editValuesFor', { calendar: calendar.name })}
                    onPress={() => setValuesCalendarId(calendar.id)}
                  />
                ) : null}
                <Switch
                  value={chosen.includes(calendar.id)}
                  disabled={retired || saving}
                  onValueChange={(next) =>
                    setChosen((prev) => (next ? [...prev, calendar.id] : prev.filter((id) => id !== calendar.id)))
                  }
                  accessibilityLabel={`${calendar.name} offers ${service.name}`}
                />
              </View>
            ))
          )}
          {switchedOffCalendars.map((calendar) => {
            const staged = removing.includes(calendar.id);
            return (
              <View key={calendar.id} style={[styles.calendarRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={styles.flex1}>
                  <Text variant="bodySmall" numberOfLines={1}>
                    {`${calendar.name} `}
                    <Text variant="bodySmall" tone="muted">
                      {areaCopy('svc.member.view.switchedOff')}
                    </Text>
                  </Text>
                  {staged ? (
                    <Text variant="caption" color={colors.warning}>
                      {areaCopy('svc.cal.notSaved.remove')}
                    </Text>
                  ) : null}
                </View>
                {staged ? (
                  <Button
                    label={areaCopy('svc.member.view.keep')}
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    accessibilityLabel={areaCopy('svc.member.view.keepFor', { calendar: calendar.name })}
                    onPress={() => setRemoving((prev) => prev.filter((id) => id !== calendar.id))}
                  />
                ) : (
                  <Button
                    label={areaCopy('svc.member.view.remove')}
                    variant="ghost"
                    size="sm"
                    disabled={retired || saving}
                    accessibilityLabel={areaCopy('svc.member.view.removeFor', { calendar: calendar.name })}
                    onPress={() => setRemoving((prev) => [...prev, calendar.id])}
                  />
                )}
              </View>
            );
          })}
          {switchedOffCalendars.length > 0 ? (
            <Text variant="caption" tone="muted">
              {areaCopy('svc.member.view.switchedOffHelp', { service: service.name })}
            </Text>
          ) : null}
        </View>

        {isOnline ? (
          <View style={styles.section}>
            <Input
              label={areaCopy('svc.member.view.linkLabel')}
              accessibilityLabel={areaCopy('svc.member.view.linkLabel')}
              value={meetingUrl}
              onChangeText={setMeetingUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!saving}
            />
            <Input
              label={areaCopy('svc.form.location.infoLabel')}
              accessibilityLabel={areaCopy('svc.form.location.infoLabel')}
              value={meetingInfo}
              onChangeText={setMeetingInfo}
              multiline
              editable={!saving}
            />
            <Text variant="caption" tone="muted">
              {areaCopy('svc.form.location.linkHelp')}
            </Text>
          </View>
        ) : null}

        <Input
          label={areaCopy('svc.member.view.instructionsLabel')}
          accessibilityLabel={areaCopy('svc.member.view.instructionsLabel')}
          value={instructions}
          onChangeText={setInstructions}
          multiline
          maxLength={2000}
          editable={!saving}
          helper={areaCopy('svc.member.view.instructionsHelp', { host })}
        />
      </View>

      {/* 3. What the host has set. */}
      <View style={styles.section}>
        <Text variant="label" accessibilityRole="header">
          {areaCopy('svc.member.view.hostHeading', { host })}
        </Text>
        <Row label="Description" value={service.description || 'No description'} />
        <Row label="Online payment" value={paymentWords(service.payment_requirement)} />
        <Row label="Buffer" value={service.buffer_minutes ? minutes(service.buffer_minutes) : 'No buffer'} />
        <Row
          label="Cancellation notice"
          value={service.cancellation_notice_hours ? `${service.cancellation_notice_hours} hours` : 'No notice needed'}
        />
        <Row label="Options" value={activeOptions || 'No options'} />
        <Row label="Add-ons" value={addOns || 'No add-ons'} />
        <Row label="Staff bookings only" value={retired ? 'Not bookable' : undefined} />
      </View>
    </StepShell>
  );
}

/**
 * One calendar's own price, length, buffer and deposit for a page service (web
 * `CollectiveCalendarValuesDialog`, mode own): only the fields the host lets calendars set, saved
 * through the venue's own per-calendar route. The shared step's fields, in this sheet's frame.
 */
function CalendarValuesStep({
  service,
  calendarId,
  calendarName,
  link,
  currencySymbol,
  onBack,
  onClose,
}: {
  service: ManagedService;
  calendarId: string;
  calendarName: string;
  link: PractitionerServiceLink | null;
  currencySymbol: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const target = useMemo(
    () => ownCalendarValuesTarget({ id: calendarId, name: calendarName }, service.id, link),
    [calendarId, calendarName, service.id, link],
  );
  const editor = useCalendarValuesEditor({
    mode: 'own',
    collectiveId: null,
    serviceName: service.name,
    target,
    flags: calendarValueFlags(service),
    defaults: calendarValueDefaults(service),
    currencySymbol,
    hasOptions: (service.variants ?? []).some((v) => (v as { is_active?: boolean }).is_active !== false),
    onSaved: onBack,
    onUnchanged: onBack,
  });

  return (
    <StepShell
      visible
      onClose={() => {
        if (!editor.saving) onClose();
      }}
      title={areaCopy('values.title', { service: service.name, calendar: calendarName })}
      error={editor.error}
      footer={
        <>
          <Button label="Back" variant="ghost" disabled={editor.saving} onPress={onBack} />
          <Button
            label={areaCopy('values.save')}
            loading={editor.saving}
            disabled={editor.saving || editor.shown.length === 0}
            onPress={editor.submit}
          />
        </>
      }>
      <CalendarValuesFields editor={editor} />
    </StepShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text variant="overline" tone="muted">
        {label}
      </Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text variant="bodySmall" tone="muted">{`${label}:`}</Text>
      <Text variant="bodySmall" style={styles.flex1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
    rowGap: spacing.xs,
  },
  fact: {
    gap: spacing.xxs,
  },
  settings: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  calendarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  alert: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
