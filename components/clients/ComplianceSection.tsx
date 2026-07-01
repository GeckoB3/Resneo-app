import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ComplianceRecordSheet } from '@/components/compliance/ComplianceRecordSheet';
import { auditEventLabel, RESULT_LABELS } from '@/components/compliance/complianceTypeLabels';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { minTouchTarget, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import {
  useGuestCompliance,
  useResendFormLink,
  useRevokeFormLink,
} from '@/lib/queries/useCompliance';
import { useToast } from '@/providers/ToastProvider';
import {
  complianceJoinedTypeName,
  type ComplianceRecordRow,
} from '@/types/booking-compliance';
import type { ComplianceAuditEvent } from '@/types/compliance';

type ComplianceSectionProps = {
  guestId: string;
};

/**
 * Pill for a record's own status (current / expired / voided) — mirrors the web
 * `recordStatusPill` in `_reference/Resneo/.../compliance/shared.ts`. Expiry is
 * resolved at render time against the record's `expires_at`.
 */
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

/** Collapsible audit trail — mirrors the web's `<details>` element. */
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
        accessibilityState={{ expanded }}
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
                idx > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                },
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

/**
 * Per-guest compliance — read-only records list with status pills, tap-to-view
 * (via ComplianceRecordSheet), and a collapsible audit trail. Mirrors the web
 * `ContactComplianceSection` (records + audit only, no booking requirements).
 *
 * Capture / send-link are intentionally deferred — this surface is read-only.
 * The caller gates rendering on the `compliance_records_enabled` feature flag.
 */
export function ComplianceSection({ guestId }: ComplianceSectionProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const guestQuery = useGuestCompliance(guestId);
  const resendLink = useResendFormLink();
  const revokeLink = useRevokeFormLink();
  const [viewRecordId, setViewRecordId] = useState<string | null>(null);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);

  // Plan-gated (402/403) → the route returns null; hide the section entirely.
  if (guestQuery.data === null) return null;

  const records: ComplianceRecordRow[] = guestQuery.data?.records ?? [];
  const auditEvents = guestQuery.data?.audit_events ?? [];
  // Pending (not-yet-completed) form links the guest still needs to fill.
  const pendingLinks = (guestQuery.data?.form_links ?? []).filter((l) => l.status === 'pending');

  function resend(id: string, sendVia: 'email' | 'sms') {
    setBusyLinkId(id);
    resendLink.mutate(
      { id, send_via: sendVia },
      {
        onSuccess: () => {
          setBusyLinkId(null);
          hapticSuccess();
          toast.success('Form link resent.');
          void guestQuery.refetch();
        },
        onError: (e) => {
          setBusyLinkId(null);
          hapticWarning();
          toast.error(e instanceof ApiError ? e.message : 'Could not resend the link.');
        },
      },
    );
  }

  function revoke(id: string) {
    setBusyLinkId(id);
    revokeLink.mutate(id, {
      onSuccess: () => {
        setBusyLinkId(null);
        hapticSuccess();
        toast.success('Form link revoked.');
        void guestQuery.refetch();
      },
      onError: (e) => {
        setBusyLinkId(null);
        hapticWarning();
        toast.error(e instanceof ApiError ? e.message : 'Could not revoke the link.');
      },
    });
  }

  const summary = guestQuery.isError
    ? null
    : records.length > 0
      ? `${records.length} record${records.length === 1 ? '' : 's'}`
      : null;

  return (
    <>
      <CollapsibleCard title="Compliance" summary={summary}>
        {guestQuery.isLoading ? (
          <Text variant="bodySmall" tone="muted">
            Loading compliance…
          </Text>
        ) : guestQuery.isError ? (
          <Text variant="bodySmall" tone="muted">
            Could not load compliance details. Pull to refresh to try again.
          </Text>
        ) : (
          <>
            {pendingLinks.length > 0 ? (
              <View style={styles.linksBlock}>
                <Text variant="caption" tone="muted">
                  Awaiting client
                </Text>
                {pendingLinks.map((link) => (
                  <View
                    key={link.id}
                    style={[
                      styles.linkRow,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                    ]}>
                    <View style={styles.linkText}>
                      <Text variant="bodySmall" numberOfLines={1}>
                        {link.compliance_type_name ?? 'Compliance form'}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {link.sent_via ? `Sent by ${link.sent_via}` : 'Not yet sent'}
                        {link.expires_at ? ` · Expires ${formatComplianceDate(link.expires_at)}` : ''}
                        {link.reminder_count
                          ? ` · Reminded ${link.reminder_count} time${link.reminder_count === 1 ? '' : 's'}`
                          : ''}
                      </Text>
                      <Badge label="Awaiting completion" tone="warning" />
                    </View>
                    <View style={styles.linkActions}>
                      <Button
                        label="Email"
                        variant="ghost"
                        size="sm"
                        disabled={busyLinkId !== null}
                        loading={busyLinkId === link.id && resendLink.isPending}
                        onPress={() => resend(link.id, 'email')}
                      />
                      <Button
                        label="SMS"
                        variant="ghost"
                        size="sm"
                        disabled={busyLinkId !== null}
                        onPress={() => resend(link.id, 'sms')}
                      />
                      <Button
                        label="Revoke"
                        variant="ghost"
                        size="sm"
                        disabled={busyLinkId !== null}
                        customColors={{ background: 'transparent', text: colors.danger }}
                        onPress={() => revoke(link.id)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {records.length === 0 ? (
              <Text variant="bodySmall" tone="muted">
                No compliance records on file for this guest yet.
              </Text>
            ) : (
              <View style={styles.recordList}>
                {records.map((rec) => {
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
                            ? // eslint-disable-next-line react-hooks/purity -- Date.now() intentionally checks expiry at render time
                              ` · ${new Date(rec.expires_at).getTime() <= Date.now() ? 'Expired' : 'Expires'} ${formatComplianceDate(rec.expires_at)}`
                            : ''}
                          {rec.result ? ` · ${RESULT_LABELS[rec.result] ?? rec.result}` : ''}
                        </Text>
                      </View>
                      <View style={styles.recordBadges}>
                        {rec.status === 'completed' && rec.result == null ? (
                          <Badge label="Awaiting decision" tone="warning" />
                        ) : null}
                        <Badge label={pill.label} tone={pill.tone} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Audit trail — mirrors web's collapsible <details> section. */}
            <AuditTrail events={auditEvents} />
          </>
        )}
      </CollapsibleCard>

      {/* Record detail / void sheet — reused as-is from the booking surface. */}
      <ComplianceRecordSheet
        visible={viewRecordId !== null}
        onClose={() => setViewRecordId(null)}
        recordId={viewRecordId}
        onChanged={() => {
          void guestQuery.refetch();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  recordList: {
    gap: spacing.xs,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: minTouchTarget,
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
  recordBadges: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  linksBlock: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  linkRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.sm,
  },
  linkText: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  linkActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  // Audit trail
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
    minHeight: minTouchTarget,
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
