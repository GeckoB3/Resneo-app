import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


import { ComplianceCaptureSheet } from '@/components/compliance/ComplianceCaptureSheet';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { calendarDateInTimeZone } from '@/lib/dates/venue-dates';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useScreenCaptureProtection } from '@/lib/security/useScreenCaptureProtection';
import {
  useComplianceDashboard,
  useResendFormLink,
  useRevokeFormLink,
} from '@/lib/queries/useCompliance';
import { useSendComplianceFormLink } from '@/lib/queries/useBookingCompliance';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useUpdateFeatureFlags } from '@/lib/queries/useVenueSettings';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ComplianceMissingRow } from '@/types/compliance';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** DD/MM/YYYY — consistent format matching the web. Handles bare date and timestamps. */
function formatComplianceDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const ENFORCEMENT_LABELS: Record<string, string> = {
  warn_staff: 'Warn staff',
  warn_client: 'Warn client',
  block_online: 'Block online booking',
  block_all: 'Block all bookings',
};

/** Group today's missing rows by booking (port of web's `groupTodaysCheckIns`). */
interface CheckInGroup {
  booking_id: string;
  guest_id: string | null;
  guest_name: string;
  booking_time: string | null;
  items: {
    compliance_type_id: string;
    compliance_type_name: string;
    enforcement: string;
    state: string;
  }[];
}

function groupTodaysCheckIns(missing: ComplianceMissingRow[], todayStr: string): CheckInGroup[] {
  const byBooking = new Map<string, CheckInGroup>();
  for (const row of missing) {
    if (row.booking_date !== todayStr) continue;
    let group = byBooking.get(row.booking_id);
    if (!group) {
      group = {
        booking_id: row.booking_id,
        guest_id: row.guest_id,
        guest_name: row.guest_name,
        booking_time: row.booking_time,
        items: [],
      };
      byBooking.set(row.booking_id, group);
    }
    const existing = group.items.find((i) => i.compliance_type_id === row.compliance_type_id);
    if (!existing) {
      group.items.push({
        compliance_type_id: row.compliance_type_id,
        compliance_type_name: row.compliance_type_name,
        enforcement: row.enforcement,
        state: row.state,
      });
    }
  }
  const groups = [...byBooking.values()];
  groups.sort((a, b) => {
    if (a.booking_time && b.booking_time) return a.booking_time.localeCompare(b.booking_time);
    if (a.booking_time) return -1;
    if (b.booking_time) return 1;
    return a.guest_name.localeCompare(b.guest_name);
  });
  return groups;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type CaptureTarget = {
  guestId: string;
  complianceTypeId: string;
  complianceTypeName: string;
  bookingId: string;
};

/**
 * In-app action sheet state. `Alert.alert`'s channel pickers and destructive
 * confirms are no-ops on react-native-web (the dev-preview path), so these flows
 * run through a real `Sheet` instead.
 */
type ComplianceAction =
  | { kind: 'resend'; id: string; guestName: string }
  | { kind: 'revoke'; id: string; guestName: string }
  | {
      kind: 'send';
      key: string;
      guestId: string;
      typeId: string;
      typeName: string;
      bookingId?: string | null;
    };

/** Compliance — today's check-ins, expiring records, missing-for-booking flags & outstanding forms. */
export default function ComplianceScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { venue } = useVenueContext();
  const dashboard = useComplianceDashboard();
  const resend = useResendFormLink();
  const revoke = useRevokeFormLink();
  const sendLink = useSendComplianceFormLink();
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget | null>(null);
  // Active Sheet-based action (channel picker / revoke confirm).
  const [action, setAction] = useState<ComplianceAction | null>(null);
  // Per-link pending tracking to avoid shared spinner
  const [pendingResendId, setPendingResendId] = useState<string | null>(null);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);
  const [pendingSendKey, setPendingSendKey] = useState<string | null>(null);

  // Enable-compliance flow — admins can switch the feature flag on in-app.
  // (Disabling lives with the other defaults in Compliance settings → General,
  // matching the web Settings → Compliance placement.)
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  const updateFlags = useUpdateFeatureFlags();
  const [enableError, setEnableError] = useState<string | null>(null);

  // Block screenshots / recording while compliance PII (guest names, captured
  // form responses in the sub-sheets) is on screen.
  useScreenCaptureProtection('compliance');

  const handleEnableCompliance = () => {
    setEnableError(null);
    updateFlags.mutate(
      { compliance_records_enabled: true },
      {
        onSuccess: () => {
          hapticSuccess();
          void dashboard.refetch();
        },
        onError: (error) => {
          hapticWarning();
          setEnableError(
            error instanceof ApiError
              ? error.message
              : 'Could not enable compliance. Check your plan on the web dashboard.',
          );
        },
      },
    );
  };

  const header = <Stack.Screen options={{ headerShown: true, title: 'Compliance' }} />;

  const planGated =
    dashboard.error instanceof ApiError &&
    (dashboard.error.status === 403 || dashboard.error.status === 402);

  if (dashboard.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  if (planGated) {
    return (
      <Screen>
        {header}
        <EmptyState
          title="Compliance isn't enabled"
          message={
            isAdmin
              ? 'Turn on compliance records to track consent forms, expiries and per-booking requirements.'
              : 'Compliance records are part of the appointments plan. Ask an admin to enable them.'
          }
        />
        {isAdmin ? (
          <View style={[styles.enableBlock, { paddingBottom: insets.bottom + spacing.xl }]}>
            <Button
              label="Enable compliance"
              fullWidth
              loading={updateFlags.isPending}
              onPress={handleEnableCompliance}
            />
            {enableError ? (
              <Text variant="bodySmall" tone="danger">
                {enableError}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Screen>
    );
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={
            dashboard.error instanceof ApiError
              ? dashboard.error.message
              : 'Could not load compliance.'
          }
          onRetry={() => void dashboard.refetch()}
        />
      </Screen>
    );
  }

  const { expiring_soon, missing_for_bookings, awaiting_submission } = dashboard.data;

  // Venue-local "today" — booking dates are venue-local, so grouping by a UTC
  // date split today's check-ins into the wrong bucket near the day boundary.
  // Prefer the server's `today` (its day-boundary source of truth); fall back to
  // a client computation for older payloads that don't carry it.
  const todayStr =
    dashboard.data.today ?? calendarDateInTimeZone(new Date(), venue?.timezone ?? 'Europe/London');
  const todayCheckIns = groupTodaysCheckIns(missing_for_bookings, todayStr);
  const upcomingMissing = missing_for_bookings.filter((m) => m.booking_date !== todayStr);

  // Use awaiting_submission from dashboard payload directly (no redundant fetch)
  const awaitingRows = awaiting_submission;

  const allClear =
    todayCheckIns.length === 0 &&
    upcomingMissing.length === 0 &&
    expiring_soon.length === 0 &&
    awaitingRows.length === 0;

  // --- Handlers ---

  // Open the Sheet-based pickers/confirms (Alert.alert is a no-op on web).
  const handleResend = (id: string, guestName: string) => {
    setAction({ kind: 'resend', id, guestName });
  };

  const handleRevoke = (id: string, guestName: string) => {
    setAction({ kind: 'revoke', id, guestName });
  };

  /**
   * Prompt to send a form link from a missing/expiring row.
   * guest_id may be null for walk-ins — caller must guard.
   */
  const handleSendLink = (opts: {
    guestId: string;
    typeId: string;
    typeName: string;
    bookingId?: string | null;
  }) => {
    setAction({
      kind: 'send',
      key: `${opts.guestId}:${opts.typeId}`,
      guestId: opts.guestId,
      typeId: opts.typeId,
      typeName: opts.typeName,
      bookingId: opts.bookingId,
    });
  };

  // --- Sheet action runners ---

  const runResend = (send_via: 'email' | 'sms') => {
    if (action?.kind !== 'resend') return;
    const { id } = action;
    setAction(null);
    setPendingResendId(id);
    resend.mutate(
      { id, send_via },
      {
        onSuccess: () => {
          hapticSuccess();
          setPendingResendId(null);
          toast.success(send_via === 'email' ? 'Form re-emailed.' : 'Form link re-sent by SMS.');
        },
        onError: (err) => {
          hapticWarning();
          setPendingResendId(null);
          toast.error(err instanceof ApiError ? err.message : 'Could not resend the form.');
        },
      },
    );
  };

  const runRevoke = () => {
    if (action?.kind !== 'revoke') return;
    const { id } = action;
    setAction(null);
    setPendingRevokeId(id);
    revoke.mutate(id, {
      onSuccess: () => {
        hapticSuccess();
        setPendingRevokeId(null);
        toast.success('Form link revoked.');
      },
      onError: (err) => {
        hapticWarning();
        setPendingRevokeId(null);
        toast.error(err instanceof ApiError ? err.message : 'Could not revoke the link.');
      },
    });
  };

  const runSend = (send_via: 'email' | 'sms' | 'manual_copy') => {
    if (action?.kind !== 'send') return;
    const { key, guestId, typeId, bookingId } = action;
    setAction(null);
    setPendingSendKey(key);
    sendLink.mutate(
      {
        guest_id: guestId,
        compliance_type_id: typeId,
        booking_id: bookingId ?? undefined,
        // 'manual_copy' is a UI action, not a wire value (the backend enum is
        // email|sms): omit send_via and copy the returned public_url in onSuccess.
        send_via: send_via === 'manual_copy' ? undefined : send_via,
      },
      {
        onSuccess: (result) => {
          hapticSuccess();
          setPendingSendKey(null);
          if (send_via === 'manual_copy') {
            void Clipboard.setStringAsync(result.public_url);
            toast.success('Form link copied to your clipboard.');
          } else if (result.no_destination) {
            // Nothing to send to — copy the link so staff can share it manually.
            void Clipboard.setStringAsync(result.public_url);
            toast.info('No email or phone on file. Link copied to your clipboard instead.');
          } else {
            const via = result.sent_via ?? send_via;
            toast.success(via === 'sms' ? 'Form link sent by SMS.' : 'Form link emailed.');
          }
        },
        onError: (err) => {
          hapticWarning();
          setPendingSendKey(null);
          toast.error(err instanceof ApiError ? err.message : 'Could not send the link.');
        },
      },
    );
  };

  return (
    <>
      <Screen scroll={false} padded={false}>
        {header}
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={dashboard.isRefetching}
              onRefresh={() => void dashboard.refetch()}
            />
          }>
          {/* SUMMARY — always shown, mirroring the web's counts / all-caught-up card. */}
          <Card>
            {allClear ? (
              <Text variant="bodySmall" tone="secondary">
                <Text variant="bodyMedium">You&apos;re all caught up.</Text> No outstanding forms,
                nothing expiring, and no client submissions to wait on right now.
              </Text>
            ) : (
              <Text variant="caption" tone="muted">
                {`${todayCheckIns.length} for today · ${upcomingMissing.length} upcoming · ${expiring_soon.length} expiring soon · ${awaitingRows.length} awaiting clients`}
              </Text>
            )}
          </Card>

          {/* TODAY'S CHECK-IN PANEL */}
          <Card
            style={
              todayCheckIns.length > 0
                ? [styles.todayCard, { backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder }]
                : undefined
            }>
            <View style={styles.sectionHeader}>
              <Text variant="label" color={todayCheckIns.length > 0 ? colors.brand : undefined}>
                Today&apos;s check-ins
              </Text>
              {todayCheckIns.length > 0 ? (
                <Badge label={String(todayCheckIns.reduce((n, g) => n + g.items.length, 0))} tone="danger" />
              ) : null}
            </View>
            <Text variant="caption" tone="muted" style={styles.sectionDesc}>
              Today&apos;s bookings with a required form still outstanding. Complete it on a venue
              device or send a link.
            </Text>
            {todayCheckIns.length === 0 ? (
              <Text variant="bodySmall" tone="muted" style={styles.sectionEmpty}>
                No outstanding forms for today&apos;s bookings.
              </Text>
            ) : (
              <View style={styles.list}>
                {todayCheckIns.map((group) => (
                  <View
                    key={group.booking_id}
                    style={[
                      styles.checkInGroup,
                      { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
                    ]}>
                    <View style={styles.checkInGroupHeader}>
                      <Text variant="bodyMedium" numberOfLines={1} style={styles.checkInName}>
                        {group.guest_name}
                      </Text>
                      {group.booking_time ? (
                        <Text variant="caption" tone="muted">
                          {group.booking_time.slice(0, 5)}
                        </Text>
                      ) : null}
                    </View>
                    {group.items.map((item) => (
                      <View key={item.compliance_type_id} style={styles.checkInItem}>
                        <View style={styles.checkInItemText}>
                          <Text variant="bodySmall" numberOfLines={1}>
                            {item.compliance_type_name}
                          </Text>
                          <Text variant="caption" tone="muted">
                            {ENFORCEMENT_LABELS[item.enforcement] ?? item.enforcement}
                          </Text>
                        </View>
                        <View style={styles.checkInItemActions}>
                          <Button
                            label="Complete now"
                            variant="primary"
                            size="sm"
                            disabled={!group.guest_id}
                            onPress={() => {
                              if (group.guest_id) {
                                setCaptureTarget({
                                  guestId: group.guest_id,
                                  complianceTypeId: item.compliance_type_id,
                                  complianceTypeName: item.compliance_type_name,
                                  bookingId: group.booking_id,
                                });
                              }
                            }}
                          />
                          <Button
                            label="Send link"
                            variant="secondary"
                            size="sm"
                            disabled={!group.guest_id}
                            loading={pendingSendKey === `${group.guest_id}:${item.compliance_type_id}`}
                            onPress={() => {
                              if (group.guest_id) {
                                handleSendLink({
                                  guestId: group.guest_id,
                                  typeId: item.compliance_type_id,
                                  typeName: item.compliance_type_name,
                                  bookingId: group.booking_id,
                                });
                              }
                            }}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* MISSING FOR UPCOMING BOOKINGS */}
          <Card>
            <View style={styles.sectionHeader}>
              <Text variant="label">Missing for upcoming bookings</Text>
              {upcomingMissing.length > 0 ? (
                <Badge label={String(upcomingMissing.length)} tone="danger" />
              ) : null}
            </View>
            <Text variant="caption" tone="muted" style={styles.sectionDesc}>
              Bookings in the next 14 days whose service needs a record that isn&apos;t on file.
            </Text>
            {upcomingMissing.length === 0 ? (
              <Text variant="bodySmall" tone="muted" style={styles.sectionEmpty}>
                Nothing missing for upcoming bookings.
              </Text>
            ) : (
              <View style={styles.list}>
                {upcomingMissing.map((row) => {
                  const sendKey = row.guest_id
                    ? `${row.guest_id}:${row.compliance_type_id}`
                    : null;
                  return (
                    <View key={`${row.booking_id}-${row.compliance_type_id}`} style={styles.row}>
                      <View style={styles.rowText}>
                        <Text variant="bodyMedium" numberOfLines={1}>
                          {row.guest_name}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={2}>
                          {row.compliance_type_name} · {formatComplianceDate(row.booking_date)}
                          {row.booking_time ? ` at ${row.booking_time.slice(0, 5)}` : ''} ·{' '}
                          {ENFORCEMENT_LABELS[row.enforcement] ?? row.enforcement}
                        </Text>
                      </View>
                      <View style={styles.rowActions}>
                        {row.guest_id ? (
                          <Button
                            label="Send link"
                            variant="ghost"
                            size="sm"
                            loading={sendKey !== null && pendingSendKey === sendKey}
                            onPress={() =>
                              row.guest_id &&
                              handleSendLink({
                                guestId: row.guest_id,
                                typeId: row.compliance_type_id,
                                typeName: row.compliance_type_name,
                                bookingId: row.booking_id,
                              })
                            }
                          />
                        ) : null}
                        <Button
                          label="Booking"
                          variant="ghost"
                          size="sm"
                          onPress={() => router.push(`/booking/${row.booking_id}` as Href)}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Card>

          {/* EXPIRING SOON */}
          <Card>
            <View style={styles.sectionHeader}>
              <Text variant="label">Expiring soon</Text>
              {expiring_soon.length > 0 ? (
                <Badge label={String(expiring_soon.length)} tone="warning" />
              ) : null}
            </View>
            <Text variant="caption" tone="muted" style={styles.sectionDesc}>
              Records on file that expire within 30 days.
            </Text>
            {expiring_soon.length === 0 ? (
              <Text variant="bodySmall" tone="muted" style={styles.sectionEmpty}>
                No records expiring soon.
              </Text>
            ) : (
              <View style={styles.list}>
                {expiring_soon.map((row) => {
                  const sendKey = `${row.guest_id}:${row.compliance_type_id}`;
                  return (
                    <View key={row.id} style={styles.row}>
                      <View style={styles.rowText}>
                        <Text variant="bodyMedium" numberOfLines={1}>
                          {row.guest_name}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {row.compliance_type_name} · expires {formatComplianceDate(row.expires_at)}
                        </Text>
                      </View>
                      <View style={styles.rowActions}>
                        <Button
                          label="Send renewal"
                          variant="ghost"
                          size="sm"
                          loading={pendingSendKey === sendKey}
                          onPress={() =>
                            handleSendLink({
                              guestId: row.guest_id,
                              typeId: row.compliance_type_id,
                              typeName: row.compliance_type_name,
                            })
                          }
                        />
                        <Button
                          label="Contact"
                          variant="ghost"
                          size="sm"
                          onPress={() => router.push(`/client/${row.guest_id}` as Href)}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Card>

          {/* AWAITING SUBMISSION — reads from dashboard payload (no redundant fetch) */}
          <Card>
            <View style={styles.sectionHeader}>
              <Text variant="label">Awaiting client submission</Text>
              {awaitingRows.length > 0 ? (
                <Badge label={String(awaitingRows.length)} tone="brand" />
              ) : null}
            </View>
            <Text variant="caption" tone="muted" style={styles.sectionDesc}>
              Form links awaiting completion by the client.
            </Text>
            {awaitingRows.length === 0 ? (
              <Text variant="bodySmall" tone="muted" style={styles.sectionEmpty}>
                No outstanding form links.
              </Text>
            ) : (
              <View style={styles.list}>
                {awaitingRows.map((row) => (
                  <View key={row.id} style={styles.row}>
                    <View style={styles.rowText}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {row.guest_name ?? 'Guest'}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {row.compliance_type_name ?? 'Form'}
                        {row.sent_at ? ` · sent ${formatComplianceDate(row.sent_at)}` : ''}
                        {row.expires_at ? ` · expires ${formatComplianceDate(row.expires_at)}` : ''}
                      </Text>
                    </View>
                    <View style={styles.rowActions}>
                      <Button
                        label="Resend"
                        variant="ghost"
                        size="sm"
                        loading={pendingResendId === row.id}
                        onPress={() => handleResend(row.id, row.guest_name ?? 'guest')}
                      />
                      <Button
                        label="Revoke"
                        variant="ghost"
                        size="sm"
                        loading={pendingRevokeId === row.id}
                        onPress={() => handleRevoke(row.id, row.guest_name ?? 'guest')}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* SETUP CTA — the web dashboard's single pointer into Settings → Compliance
              (templates, per-service requirements and general defaults). */}
          <View style={[styles.setupCta, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
            <Text variant="bodySmall" tone="secondary" style={styles.setupCtaText}>
              Create or update your compliance types and choose which forms each service needs.
            </Text>
            <Button
              label="Set up types and requirements"
              variant="primary"
              onPress={() => router.push('/manage/compliance-settings' as Href)}
            />
          </View>
          <View style={styles.spacer} />
        </ScrollView>
      </Screen>

      {/* Capture sheet — opened from today's check-in panel */}
      {captureTarget ? (
        <ComplianceCaptureSheet
          visible
          onClose={() => setCaptureTarget(null)}
          guestId={captureTarget.guestId}
          complianceTypeId={captureTarget.complianceTypeId}
          complianceTypeName={captureTarget.complianceTypeName}
          bookingId={captureTarget.bookingId}
          initialChannel="client_walkin"
          onCaptured={() => {
            setCaptureTarget(null);
            void dashboard.refetch();
          }}
        />
      ) : null}

      {/* Channel picker / revoke confirm — a Sheet, since Alert.alert is a no-op on web. */}
      <Sheet visible={action !== null} onClose={() => setAction(null)}>
        <View style={styles.sheetBody}>
          {action?.kind === 'revoke' ? (
            <>
              <Text variant="subheading">Revoke {action.guestName}&apos;s form link?</Text>
              <Text variant="bodySmall" tone="secondary">
                They will no longer be able to submit it.
              </Text>
              <View style={styles.sheetActions}>
                <Button
                  label="Keep"
                  variant="secondary"
                  style={styles.flex1}
                  onPress={() => setAction(null)}
                />
                <Button
                  label="Revoke"
                  variant="danger"
                  style={styles.flex1}
                  onPress={runRevoke}
                />
              </View>
            </>
          ) : action ? (
            <>
              <Text variant="subheading">
                {action.kind === 'resend'
                  ? `Resend form to ${action.guestName}`
                  : `Send ${action.typeName} link`}
              </Text>
              <Text variant="bodySmall" tone="secondary">
                How should the guest receive the form?
              </Text>
              <View style={styles.sheetChannels}>
                <Button
                  label="Email"
                  variant="secondary"
                  style={styles.flex1}
                  onPress={() => (action.kind === 'resend' ? runResend('email') : runSend('email'))}
                />
                <Button
                  label="SMS"
                  variant="secondary"
                  style={styles.flex1}
                  onPress={() => (action.kind === 'resend' ? runResend('sms') : runSend('sms'))}
                />
              </View>
              {action.kind === 'send' ? (
                <Button
                  label="Copy link"
                  variant="secondary"
                  onPress={() => runSend('manual_copy')}
                />
              ) : null}
              <Button label="Cancel" variant="ghost" onPress={() => setAction(null)} />
            </>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  enableBlock: {
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  todayCard: {
    // Override Card default surface color for the "act now" emphasis — done via inline style above
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionDesc: {
    marginTop: spacing.xs,
  },
  sectionEmpty: {
    marginTop: spacing.sm,
  },
  list: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexShrink: 0,
  },
  checkInGroup: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
  },
  checkInGroupHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  checkInName: {
    flex: 1,
    minWidth: 0,
  },
  checkInItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  checkInItemText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  checkInItemActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexShrink: 0,
  },
  setupCta: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
  },
  setupCtaText: {
    textAlign: 'center',
  },
  spacer: {
    height: spacing.xl,
  },
  sheetBody: {
    gap: spacing.md,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  sheetChannels: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
});
