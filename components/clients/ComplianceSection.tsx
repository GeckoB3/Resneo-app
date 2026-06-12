import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ComplianceRecordSheet } from '@/components/compliance/ComplianceRecordSheet';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Text } from '@/components/ui/Text';
import { minTouchTarget, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import { useGuestCompliance } from '@/lib/queries/useCompliance';
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
  const guestQuery = useGuestCompliance(guestId);
  const [viewRecordId, setViewRecordId] = useState<string | null>(null);

  // Plan-gated (402/403) → the route returns null; hide the section entirely.
  if (guestQuery.data === null) return null;

  const records: ComplianceRecordRow[] = guestQuery.data?.records ?? [];
  const auditEvents = guestQuery.data?.audit_events ?? [];

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
                          {rec.result ? ` · ${rec.result}` : ''}
                        </Text>
                      </View>
                      <Badge label={pill.label} tone={pill.tone} />
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
