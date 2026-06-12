import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ComplianceCaptureSheet } from '@/components/compliance/ComplianceCaptureSheet';
import { ComplianceRecordSheet } from '@/components/compliance/ComplianceRecordSheet';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useToast } from '@/providers/ToastProvider';
import { hapticSuccess } from '@/lib/haptics';
import {
  useBookingCompliance,
  useSendComplianceFormLink,
  type ComplianceSendVia,
} from '@/lib/queries/useBookingCompliance';
import { useGuestCompliance } from '@/lib/queries/useCompliance';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import {
  complianceJoinedTypeName,
  type ComplianceRecordRow,
  type ComplianceRequirementState,
} from '@/types/booking-compliance';
import type { ComplianceAuditEvent } from '@/types/compliance';

type ComplianceCardProps = {
  bookingId: string;
  guestId: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
};

type CaptureTarget = {
  complianceTypeId: string;
  complianceTypeName: string;
};

/** Web `requirementStatePill` mapping. */
function requirementPill(state: ComplianceRequirementState): { label: string; tone: BadgeTone } {
  switch (state) {
    case 'satisfied':
      return { label: 'Current', tone: 'success' };
    case 'expiring_soon':
      return { label: 'Expiring soon', tone: 'warning' };
    case 'expired':
      return { label: 'Expired', tone: 'danger' };
    case 'missing':
      return { label: 'Missing', tone: 'danger' };
    default:
      return { label: 'Not applicable', tone: 'neutral' };
  }
}

/** Whether a requirement needs action (matches web's `needsAction` guard). */
function requirementNeedsAction(state: ComplianceRequirementState): boolean {
  return state === 'missing' || state === 'expired' || state === 'expiring_soon';
}

/** Web `recordStatusPill` mapping. */
function recordPill(record: ComplianceRecordRow): { label: string; tone: BadgeTone } {
  if (record.voided_at || record.status === 'voided') return { label: 'Voided', tone: 'neutral' };
  if (record.status === 'expired') return { label: 'Expired', tone: 'danger' };
  if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) {
    return { label: 'Expired', tone: 'danger' };
  }
  return { label: 'Current', tone: 'success' };
}

/** dd/mm/yyyy — matches web `formatComplianceDate`. */
function formatComplianceDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Audit event type → human label (mirrors web's AUDIT_EVENT_LABELS). */
const AUDIT_EVENT_LABELS: Record<string, string> = {
  'record.captured': 'Record captured',
  'record.updated': 'Record updated',
  'record.voided': 'Record voided',
  'record.viewed': 'Record viewed',
  'link.issued': 'Form link issued',
  'link.sent': 'Form link sent',
  'link.consumed': 'Form submitted',
  'link.expired': 'Form link expired',
  'link.revoked': 'Form link revoked',
  'type.created': 'Type created',
  'type.updated': 'Type updated',
  'type.archived': 'Type archived',
  'type.restored': 'Type restored',
  'version.created': 'New form version',
  'requirement.added': 'Requirement added',
  'requirement.removed': 'Requirement removed',
  'requirement.updated': 'Requirement updated',
};

function auditEventLabel(eventType: string): string {
  return AUDIT_EVENT_LABELS[eventType] ?? eventType;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Collapsible audit trail — mirrors web's `<details>` element. */
function AuditTrail({ events }: { events: ComplianceAuditEvent[] }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  if (events.length === 0) return null;

  return (
    <View style={[styles.auditContainer, { borderColor: colors.border }]}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={styles.auditToggle}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse audit trail' : 'Expand audit trail'}>
        <Text variant="caption" tone="muted" style={styles.auditToggleLabel}>
          Audit trail ({events.length})
        </Text>
        <Text variant="caption" tone="muted">
          {expanded ? '▲' : '▼'}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={[styles.auditList, { borderTopColor: colors.border }]}>
          {events.map((e, idx) => (
            <View
              key={e.id}
              style={[
                styles.auditRow,
                idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}>
              <Text variant="caption" style={styles.auditLabel}>
                {auditEventLabel(e.event_type)}
              </Text>
              <Text variant="caption" tone="muted">
                {e.actor_type} · {formatComplianceDate(e.created_at)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Compliance for this booking — requirement states for the booked service +
 * the guest's full compliance records (from guest endpoint), audit trail,
 * with send-link and capture actions. Tapping a record row opens the full
 * detail sheet (view + void).
 */
export function ComplianceCard({ bookingId, guestId, guestEmail, guestPhone }: ComplianceCardProps) {
  const { colors } = useTheme();
  const toast = useToast();
  // Requirements come from the booking-scoped endpoint
  const bookingQuery = useBookingCompliance(bookingId);
  // All records + audit trail come from the guest-level endpoint (richer)
  const guestQuery = useGuestCompliance(guestId);
  const sendLink = useSendComplianceFormLink();
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget | null>(null);
  const [viewRecordId, setViewRecordId] = useState<string | null>(null);
  // Channel chooser for the "Send link" action — a Sheet (Alert.alert is a web no-op).
  const [sendTarget, setSendTarget] = useState<{ typeId: string; typeName: string } | null>(null);
  // Per-link pending tracking for send button
  const [sendingTypeId, setSendingTypeId] = useState<string | null>(null);

  // Plan-gated (402/403) → hide entirely; loading/error states render inline.
  if (bookingQuery.data === null) return null;
  if (bookingQuery.isError) {
    return (
      <Card>
        <Text variant="label">Compliance</Text>
        <Text variant="bodySmall" tone="muted" style={styles.sectionBody}>
          Could not load compliance details. Pull to refresh to try again.
        </Text>
      </Card>
    );
  }

  const requirements = bookingQuery.data?.requirements ?? [];
  // Prefer guest-level records (richer, all records for this guest regardless of type)
  // Fall back to booking-scoped records while guest data loads
  const records: ComplianceRecordRow[] = guestQuery.data?.records ?? bookingQuery.data?.records ?? [];
  const auditEvents = guestQuery.data?.audit_events ?? [];

  if (!bookingQuery.isLoading && requirements.length === 0 && records.length === 0) {
    return null;
  }

  const dispatch = (complianceTypeId: string, sendVia: ComplianceSendVia) => {
    setSendingTypeId(complianceTypeId);
    sendLink.mutate(
      {
        guest_id: guestId,
        compliance_type_id: complianceTypeId,
        booking_id: bookingId,
        send_via: sendVia,
      },
      {
        onSuccess: (result) => {
          hapticSuccess();
          setSendingTypeId(null);
          if (sendVia === 'manual_copy') {
            void Clipboard.setStringAsync(result.public_url);
            toast.success('Form link copied to your clipboard.');
          } else {
            toast.success(
              result.reused
                ? 'An existing open link was re-used.'
                : result.dispatched
                  ? 'Form link sent to the guest.'
                  : 'Form link issued.',
            );
          }
        },
        onError: (error) => {
          setSendingTypeId(null);
          toast.error(error instanceof ApiError ? error.message : 'Could not send the link.');
        },
      },
    );
  };

  const promptSend = (complianceTypeId: string, typeName: string) => {
    setSendTarget({ typeId: complianceTypeId, typeName });
  };

  const runSend = (sendVia: ComplianceSendVia) => {
    if (!sendTarget) return;
    const typeId = sendTarget.typeId;
    setSendTarget(null);
    dispatch(typeId, sendVia);
  };

  const refreshAll = () => {
    void bookingQuery.refetch();
    void guestQuery.refetch();
  };

  return (
    <>
      <Card>
        <Text variant="label">Compliance</Text>

        {bookingQuery.isLoading ? (
          <Text variant="bodySmall" tone="muted" style={styles.sectionBody}>
            Loading compliance…
          </Text>
        ) : (
          <>
            {requirements.length > 0 ? (
              <View style={styles.sectionBody}>
                <Text variant="caption" tone="muted">
                  Requirements for this booking
                </Text>
                {requirements.map((r, idx) => {
                  const pill = requirementPill(r.state);
                  const needsAction = requirementNeedsAction(r.state);
                  const isSendingThis = sendingTypeId === r.requirement.compliance_type_id;
                  const matchingRecordId = r.matching_record?.id ?? null;
                  return (
                    <View
                      key={r.requirement.id}
                      style={[
                        styles.requirementRow,
                        idx > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: colors.border,
                          paddingTop: spacing.sm,
                          marginTop: spacing.xs,
                        },
                      ]}>
                      <View style={styles.requirementHeader}>
                        <Text
                          variant="bodySmall"
                          style={styles.requirementName}
                          numberOfLines={1}>
                          {r.requirement.compliance_type_name}
                        </Text>
                        <Badge label={pill.label} tone={pill.tone} />
                      </View>
                      {r.lock_blocked ? (
                        <Text variant="caption" tone="danger">
                          A record exists but was captured too close to the booking to count.
                        </Text>
                      ) : null}
                      {/* View record button when a matching (satisfying) record exists */}
                      {matchingRecordId && !needsAction ? (
                        <Button
                          label="View record"
                          variant="ghost"
                          size="sm"
                          onPress={() => setViewRecordId(matchingRecordId)}
                          style={styles.viewRecordBtn}
                        />
                      ) : null}
                      {needsAction ? (
                        <View style={styles.requirementActions}>
                          <Button
                            label="Capture now"
                            variant="primary"
                            size="sm"
                            onPress={() =>
                              setCaptureTarget({
                                complianceTypeId: r.requirement.compliance_type_id,
                                complianceTypeName: r.requirement.compliance_type_name,
                              })
                            }
                            style={styles.actionBtn}
                          />
                          <Button
                            label="Send link"
                            variant="secondary"
                            size="sm"
                            loading={isSendingThis}
                            disabled={sendLink.isPending && !isSendingThis}
                            onPress={() =>
                              promptSend(
                                r.requirement.compliance_type_id,
                                r.requirement.compliance_type_name,
                              )
                            }
                            style={styles.actionBtn}
                          />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.sectionBody}>
              <Text variant="caption" tone="muted">
                All compliance records
              </Text>
              {records.length === 0 ? (
                <Text variant="bodySmall" tone="muted">
                  No compliance records on file for this guest yet.
                </Text>
              ) : (
                records.map((rec) => {
                  const pill = recordPill(rec);
                  return (
                    <Pressable
                      key={rec.id}
                      style={({ pressed }) => [
                        styles.recordRow,
                        pressed && styles.recordRowPressed,
                      ]}
                      onPress={() => setViewRecordId(rec.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${complianceJoinedTypeName(rec.compliance_types)} record`}>
                      <View style={styles.recordText}>
                        <Text variant="bodySmall" numberOfLines={1}>
                          {complianceJoinedTypeName(rec.compliance_types)}
                        </Text>
                        <Text variant="caption" tone="muted">
                          Captured {formatComplianceDate(rec.captured_at)}
                          {rec.expires_at
                            // eslint-disable-next-line react-hooks/purity -- Date.now() intentionally checks expiry at render time
                            ? ` · ${new Date(rec.expires_at).getTime() <= Date.now() ? 'Expired' : 'Expires'} ${formatComplianceDate(rec.expires_at)}`
                            : ''}
                          {rec.result ? ` · ${rec.result}` : ''}
                        </Text>
                      </View>
                      <Badge label={pill.label} tone={pill.tone} />
                    </Pressable>
                  );
                })
              )}
            </View>

            {/* Audit trail — mirrors web's collapsible <details> section */}
            <AuditTrail events={auditEvents} />
          </>
        )}
      </Card>

      {/* In-venue capture sheet */}
      {captureTarget ? (
        <ComplianceCaptureSheet
          visible
          onClose={() => setCaptureTarget(null)}
          guestId={guestId}
          complianceTypeId={captureTarget.complianceTypeId}
          complianceTypeName={captureTarget.complianceTypeName}
          bookingId={bookingId}
          onCaptured={() => {
            setCaptureTarget(null);
            refreshAll();
          }}
        />
      ) : null}

      {/* Record detail / void sheet */}
      <ComplianceRecordSheet
        visible={viewRecordId !== null}
        onClose={() => setViewRecordId(null)}
        recordId={viewRecordId}
        onChanged={() => {
          refreshAll();
        }}
      />

      {/* Send-link channel chooser — replaces the Alert action sheet (web no-op). */}
      <Sheet visible={sendTarget !== null} onClose={() => setSendTarget(null)}>
        <Text variant="subheading">Send {sendTarget?.typeName} form</Text>
        <Text variant="bodySmall" tone="muted">
          How should the guest receive the form link?
        </Text>
        <View style={styles.sendOptions}>
          {guestEmail ? (
            <Button label="Email" variant="primary" fullWidth onPress={() => runSend('email')} />
          ) : null}
          {guestPhone ? (
            <Button label="SMS" variant="secondary" fullWidth onPress={() => runSend('sms')} />
          ) : null}
          <Button
            label="Copy link"
            variant="secondary"
            fullWidth
            onPress={() => runSend('manual_copy')}
          />
          <Button label="Cancel" variant="ghost" fullWidth onPress={() => setSendTarget(null)} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  sectionBody: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  requirementRow: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  requirementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  requirementName: {
    flex: 1,
    minWidth: 0,
  },
  requirementActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  viewRecordBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  actionBtn: {
    flex: 1,
  },
  sendOptions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  recordRowPressed: {
    opacity: 0.7,
  },
  recordText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  // Audit trail styles
  auditContainer: {
    marginTop: spacing.sm,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  auditToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  auditToggleLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  auditList: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  auditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  auditLabel: {
    flex: 1,
    minWidth: 0,
  },
});
