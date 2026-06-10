import * as Clipboard from 'expo-clipboard';
import { Alert, StyleSheet, View } from 'react-native';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useBookingCompliance,
  useSendComplianceFormLink,
  type ComplianceSendVia,
} from '@/lib/queries/useBookingCompliance';
import { spacing } from '@/theme/index';
import {
  complianceJoinedTypeName,
  type ComplianceRecordRow,
  type ComplianceRequirementState,
} from '@/types/booking-compliance';

type ComplianceCardProps = {
  bookingId: string;
  guestId: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
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
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Compliance for this booking — requirement states for the booked service +
 * the guest's records, with a "send form link" action (web ComplianceSection
 * parity; capture/void need the web dashboard).
 */
export function ComplianceCard({ bookingId, guestId, guestEmail, guestPhone }: ComplianceCardProps) {
  const query = useBookingCompliance(bookingId);
  const sendLink = useSendComplianceFormLink();

  // Plan-gated (402/403) → hide entirely; loading/error states render inline.
  if (query.data === null) return null;
  if (query.isError) {
    return (
      <Card>
        <Text variant="label">Compliance</Text>
        <Text variant="bodySmall" tone="muted" style={styles.sectionBody}>
          Could not load compliance details. Pull to refresh to try again.
        </Text>
      </Card>
    );
  }

  const requirements = query.data?.requirements ?? [];
  const records = query.data?.records ?? [];
  if (!query.isLoading && requirements.length === 0 && records.length === 0) {
    return null;
  }

  const dispatch = (complianceTypeId: string, sendVia: ComplianceSendVia) => {
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
          if (sendVia === 'manual_copy') {
            void Clipboard.setStringAsync(result.public_url);
            Alert.alert('Link copied', 'The form link is on your clipboard.');
          } else {
            Alert.alert(
              result.dispatched ? 'Form link sent' : 'Form link issued',
              result.reused ? 'An existing open link was re-used.' : undefined,
            );
          }
        },
        onError: (error) => {
          hapticWarning();
          Alert.alert(
            'Could not send link',
            error instanceof ApiError ? error.message : 'Please try again.',
          );
        },
      },
    );
  };

  const promptSend = (complianceTypeId: string, typeName: string) => {
    const options: { text: string; onPress: () => void }[] = [];
    if (guestEmail) {
      options.push({ text: 'Email', onPress: () => dispatch(complianceTypeId, 'email') });
    }
    if (guestPhone) {
      options.push({ text: 'SMS', onPress: () => dispatch(complianceTypeId, 'sms') });
    }
    options.push({ text: 'Copy link', onPress: () => dispatch(complianceTypeId, 'manual_copy') });
    Alert.alert(`Send ${typeName} form`, 'How should the guest receive the form link?', [
      ...options,
      { text: 'Cancel', style: 'cancel' as const, onPress: () => {} },
    ]);
  };

  return (
    <Card>
      <Text variant="label">Compliance</Text>

      {query.isLoading ? (
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
              {requirements.map((r) => {
                const pill = requirementPill(r.state);
                return (
                  <View key={r.requirement.id} style={styles.requirementRow}>
                    <View style={styles.requirementHeader}>
                      <Text variant="bodySmall" style={styles.requirementName} numberOfLines={1}>
                        {r.requirement.compliance_type_name}
                      </Text>
                      <Badge label={pill.label} tone={pill.tone} />
                    </View>
                    {r.lock_blocked ? (
                      <Text variant="caption" tone="danger">
                        A record exists but was captured too close to the booking to count.
                      </Text>
                    ) : null}
                    <Button
                      label="Send form link"
                      variant="secondary"
                      size="sm"
                      loading={sendLink.isPending}
                      onPress={() =>
                        promptSend(
                          r.requirement.compliance_type_id,
                          r.requirement.compliance_type_name,
                        )
                      }
                    />
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
                  <View key={rec.id} style={styles.recordRow}>
                    <View style={styles.recordText}>
                      <Text variant="bodySmall" numberOfLines={1}>
                        {complianceJoinedTypeName(rec.compliance_types)}
                      </Text>
                      <Text variant="caption" tone="muted">
                        Captured {formatComplianceDate(rec.captured_at)}
                        {rec.expires_at
                          ? ` · Expires ${formatComplianceDate(rec.expires_at)}`
                          : ''}
                        {rec.result ? ` · ${rec.result}` : ''}
                      </Text>
                    </View>
                    <Badge label={pill.label} tone={pill.tone} />
                  </View>
                );
              })
            )}
          </View>
        </>
      )}
    </Card>
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
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  recordText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});
