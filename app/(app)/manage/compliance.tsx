import { Linking , Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { useState } from 'react';


import { ComplianceCaptureSheet } from '@/components/compliance/ComplianceCaptureSheet';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useComplianceDashboard,
  useResendFormLink,
  useRevokeFormLink,
} from '@/lib/queries/useCompliance';
import { useSendComplianceFormLink } from '@/lib/queries/useBookingCompliance';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useUpdateFeatureFlags } from '@/lib/queries/useVenueSettings';
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

/** Compliance — today's check-ins, expiring records, missing-for-booking flags & outstanding forms. */
export default function ComplianceScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const dashboard = useComplianceDashboard();
  const resend = useResendFormLink();
  const revoke = useRevokeFormLink();
  const sendLink = useSendComplianceFormLink();
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget | null>(null);
  // Per-link pending tracking to avoid shared spinner
  const [pendingResendId, setPendingResendId] = useState<string | null>(null);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);
  const [pendingSendKey, setPendingSendKey] = useState<string | null>(null);

  // Enable-compliance flow — admins can switch the feature flag on in-app.
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  const updateFlags = useUpdateFeatureFlags();
  const [enableError, setEnableError] = useState<string | null>(null);

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

  const handleResend = (id: string, guestName: string) => {
    Alert.alert(`Resend form to ${guestName}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Email',
        onPress: () => {
          setPendingResendId(id);
          resend.mutate(
            { id, send_via: 'email' },
            {
              onSuccess: () => { hapticSuccess(); setPendingResendId(null); },
              onError: () => { hapticWarning(); setPendingResendId(null); },
            },
          );
        },
      },
      {
        text: 'SMS',
        onPress: () => {
          setPendingResendId(id);
          resend.mutate(
            { id, send_via: 'sms' },
            {
              onSuccess: () => { hapticSuccess(); setPendingResendId(null); },
              onError: () => { hapticWarning(); setPendingResendId(null); },
            },
          );
        },
      },
    ]);
  };

  const handleRevoke = (id: string, guestName: string) => {
    Alert.alert(`Revoke ${guestName}'s form link?`, 'They will no longer be able to submit it.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: () => {
          setPendingRevokeId(id);
          revoke.mutate(id, {
            onSuccess: () => { hapticSuccess(); setPendingRevokeId(null); },
            onError: () => { hapticWarning(); setPendingRevokeId(null); },
          });
        },
      },
    ]);
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
    const key = `${opts.guestId}:${opts.typeId}`;
    Alert.alert(`Send ${opts.typeName} link`, 'How should the guest receive the form?', [
      {
        text: 'Email',
        onPress: () => {
          setPendingSendKey(key);
          sendLink.mutate(
            {
              guest_id: opts.guestId,
              compliance_type_id: opts.typeId,
              booking_id: opts.bookingId ?? undefined,
              send_via: 'email',
            },
            {
              onSuccess: () => { hapticSuccess(); setPendingSendKey(null); },
              onError: (err) => {
                hapticWarning();
                setPendingSendKey(null);
                Alert.alert(
                  'Could not send link',
                  err instanceof ApiError ? err.message : 'Please try again.',
                );
              },
            },
          );
        },
      },
      {
        text: 'SMS',
        onPress: () => {
          setPendingSendKey(key);
          sendLink.mutate(
            {
              guest_id: opts.guestId,
              compliance_type_id: opts.typeId,
              booking_id: opts.bookingId ?? undefined,
              send_via: 'sms',
            },
            {
              onSuccess: () => { hapticSuccess(); setPendingSendKey(null); },
              onError: (err) => {
                hapticWarning();
                setPendingSendKey(null);
                Alert.alert(
                  'Could not send link',
                  err instanceof ApiError ? err.message : 'Please try again.',
                );
              },
            },
          );
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
            onPress={() =>
              void Linking.openURL('https://app.resneo.com/dashboard/settings?tab=compliance')
            }
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
});
