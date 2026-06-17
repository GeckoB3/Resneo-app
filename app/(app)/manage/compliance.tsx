import { Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Stack, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';


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
import { getWebUrl } from '@/lib/env';
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
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ComplianceMissingRow } from '@/types/compliance';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Web Settings → Compliance tab, where templates are managed. */
const WEB_COMPLIANCE_PATH = '/dashboard/settings?tab=compliance';

/** Resolve a staff-dashboard URL on the configured WEB origin (prod fallback). */
function webDashboardUrl(path: string): string {
  const base = getWebUrl();
  return base ? `${base}${path}` : `https://app.resneo.com${path}`;
}

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
  const toast = useToast();
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

  // In-app browser tab (SFSafariViewController / Chrome Custom Tab) on the
  // configured web origin, with a system-browser fallback — no full app exit.
  const openWeb = useCallback(
    (path: string) => {
      const url = webDashboardUrl(path);
      void WebBrowser.openBrowserAsync(url).catch(() =>
        Linking.openURL(url).catch(() => toast.error('Could not open the browser.')),
      );
    },
    [toast],
  );

  // Enable-compliance flow — admins can switch the feature flag on in-app.
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

  const header = <Stack.Screen options={{ title: 'Compliance' }} />;

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
          <View style={styles.enableBlock}>
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

  const todayStr = new Date().toISOString().slice(0, 10);
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

  const runSend = (send_via: 'email' | 'sms') => {
    if (action?.kind !== 'send') return;
    const { key, guestId, typeId, bookingId } = action;
    setAction(null);
    setPendingSendKey(key);
    sendLink.mutate(
      {
        guest_id: guestId,
        compliance_type_id: typeId,
        booking_id: bookingId ?? undefined,
        send_via,
      },
      {
        onSuccess: () => {
          hapticSuccess();
          setPendingSendKey(null);
          toast.success(send_via === 'email' ? 'Form link emailed.' : 'Form link sent by SMS.');
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
          <Button
            label="Compliance templates"
            variant="secondary"
            size="sm"
            onPress={() => router.push('/manage/compliance-types' as Href)}
          />

          {allClear ? (
            <EmptyState
              title="All clear"
              message="No expiring records, missing requirements or outstanding forms."
            />
          ) : null}

          {/* TODAY'S CHECK-IN PANEL */}
          {todayCheckIns.length > 0 ? (
            <Card style={[styles.todayCard, { backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder }]}>
              <View style={styles.sectionHeader}>
                <Text variant="label" color={colors.brand}>
                  Check-in today
                </Text>
                <Badge label={String(todayCheckIns.reduce((n, g) => n + g.items.length, 0))} tone="danger" />
              </View>
              <Text variant="caption" tone="muted" style={styles.sectionDesc}>
                Today&apos;s bookings with outstanding required forms.
              </Text>
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
                            label="Capture"
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
            </Card>
          ) : null}

          {/* MISSING FOR UPCOMING BOOKINGS */}
          {upcomingMissing.length > 0 ? (
            <Card>
              <View style={styles.sectionHeader}>
                <Text variant="label">Missing for upcoming bookings</Text>
                <Badge label={String(upcomingMissing.length)} tone="danger" />
              </View>
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
            </Card>
          ) : null}

          {/* EXPIRING SOON */}
          {expiring_soon.length > 0 ? (
            <Card>
              <View style={styles.sectionHeader}>
                <Text variant="label">Expiring soon</Text>
                <Badge label={String(expiring_soon.length)} tone="warning" />
              </View>
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
                          label="Renew"
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
            </Card>
          ) : null}

          {/* AWAITING SUBMISSION — reads from dashboard payload (no redundant fetch) */}
          {awaitingRows.length > 0 ? (
            <Card>
              <View style={styles.sectionHeader}>
                <Text variant="label">Awaiting submission</Text>
                <Badge label={String(awaitingRows.length)} tone="brand" />
              </View>
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
            </Card>
          ) : null}

          <Button
            label="Manage compliance types on the web"
            variant="ghost"
            size="sm"
            onPress={() => openWeb(WEB_COMPLIANCE_PATH)}
            style={styles.webLink}
          />
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
    paddingBottom: spacing.xl,
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
  webLink: {
    alignSelf: 'center',
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
