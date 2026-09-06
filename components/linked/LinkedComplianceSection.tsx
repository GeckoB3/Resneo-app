import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  formatComplianceDate,
  recordPill,
  requirementNeedsAction,
  requirementPill,
} from '@/components/bookings/ComplianceCard';
import { Badge } from '@/components/ui/Badge';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Text } from '@/components/ui/Text';
import { useLinkedBookingCompliance } from '@/lib/queries/useBookingCompliance';
import { spacing } from '@/theme/index';
import { complianceJoinedTypeName } from '@/types/booking-compliance';

/**
 * A linked venue's booking, its compliance state read through the link (web
 * 2026-09-05). The records are the OTHER venue's, so they are shown read only:
 * capture, send and record actions all write to the owner's data and stay on
 * its own dashboard. The two refusals the route can give (the link does not
 * share personal data; the owner does not use compliance records) are answers,
 * not faults, and read as plain notes.
 *
 * Collapsed by default, like the own-venue compliance card beside which it
 * sits in the booking panel (the owner found it open on a partner's booking
 * while closed on their own, 2026-09-06); anything needing action keeps a
 * danger marker on the header, as that card does.
 */
export function LinkedComplianceSection({ bookingId }: { bookingId: string }) {
  const query = useLinkedBookingCompliance(bookingId);

  let body: ReactNode;
  let summary: string | null = null;
  let needsActionCount = 0;
  if (query.isLoading) {
    summary = 'Loading…';
    body = (
      <Text variant="caption" tone="muted">
        Loading compliance…
      </Text>
    );
  } else if (query.isError || !query.data) {
    summary = 'Unavailable';
    body = (
      <Text variant="bodySmall" tone="danger">
        Couldn’t load compliance details. Please refresh to try again.
      </Text>
    );
  } else if (query.data.kind === 'note') {
    summary = 'Not available';
    body = (
      <Text variant="bodySmall" tone="secondary">
        {query.data.text}
      </Text>
    );
  } else {
    const { applicable, requirements, records } = query.data.data;
    needsActionCount = requirements.filter((r) => requirementNeedsAction(r.state)).length;
    // The own card's collapsed wording: the marker speaks when something needs
    // action, else "All current", else the record count.
    summary =
      needsActionCount > 0
        ? null
        : requirements.length > 0
          ? 'All current'
          : records.length > 0
            ? `${records.length} record${records.length === 1 ? '' : 's'}`
            : 'None required';
    body = (
      <>
        <Text variant="caption" tone="muted">
          Held by the linked venue and shown here read only. To capture, send or open a record, use
          that venue&rsquo;s dashboard.
        </Text>
        {!applicable && requirements.length === 0 && records.length === 0 ? (
          <Text variant="bodySmall" tone="muted">
            No compliance requirements for this service.
          </Text>
        ) : null}
        {requirements.map((r) => {
          const pill = requirementPill(r.state);
          return (
            <View key={r.requirement.id} style={styles.row}>
              <Text variant="bodySmall" numberOfLines={2} style={styles.rowText}>
                {r.requirement.compliance_type_name}
              </Text>
              <Badge label={pill.label} tone={pill.tone} />
            </View>
          );
        })}
        {records.length > 0 ? (
          <View style={styles.records}>
            <Text variant="overline" tone="muted">
              Records on file
            </Text>
            {records.map((record) => {
              const pill = recordPill(record);
              return (
                <View key={record.id} style={styles.row}>
                  <View style={styles.rowText}>
                    <Text variant="bodySmall" numberOfLines={1}>
                      {complianceJoinedTypeName(record.compliance_types)}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {`Captured ${formatComplianceDate(record.captured_at)}${
                        record.expires_at ? ` · expires ${formatComplianceDate(record.expires_at)}` : ''
                      }`}
                    </Text>
                  </View>
                  <Badge label={pill.label} tone={pill.tone} />
                </View>
              );
            })}
          </View>
        ) : null}
      </>
    );
  }

  return (
    <CollapsibleCard
      title="Compliance"
      summary={summary}
      marker={
        needsActionCount > 0 ? <Badge label={`${needsActionCount} to action`} tone="danger" /> : null
      }>
      <View style={styles.body}>{body}</View>
    </CollapsibleCard>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  records: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
