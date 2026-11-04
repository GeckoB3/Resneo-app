import { Linking, StyleSheet, View } from 'react-native';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { customerBookingState } from '@/lib/booking/customer-booking-state';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import type { CustomerVisit, CustomerVisitService } from '@/lib/queries/useCustomerVisit';
import { spacing } from '@/theme/index';

/**
 * The whole visit on the booking screen (web split-visit plan 6.5; G2, G5): the day, start to
 * end, and every service with its time, person, business and status. A service a business has
 * cancelled stays listed and is shown as cancelled, so a client who opened it from an old link
 * sees what is still happening rather than a dead end.
 *
 * Statuses are read through `customerBookingState`, which compares case-insensitively (G19): the
 * server sends "Cancelled" and "No-Show", not lower-case keys.
 */
export function VisitSummaryCard({ visit }: { visit: CustomerVisit }) {
  const businessNames = new Map(visit.businesses.map((b) => [b.id, b.name]));
  const manyBusinesses = visit.businesses.length > 1;

  return (
    <Card testID="visit-summary">
      <Text variant="overline" tone="secondary">
        {visitStatusLabel(visit)}
      </Text>
      {visit.span ? (
        <>
          <Text variant="subheading" style={styles.gap}>
            Your visit
          </Text>
          <Text variant="body" tone="secondary" testID="visit-span">
            {formatDayHeading(visit.span.date)}, {visit.span.start} to {visit.span.end}
          </Text>
        </>
      ) : (
        <Text variant="subheading" style={styles.gap}>
          This visit is cancelled.
        </Text>
      )}
      <View style={styles.services}>
        {visit.services.map((service) => (
          <VisitServiceLine
            key={service.booking_id}
            service={service}
            business={manyBusinesses ? (businessNames.get(service.venue_id) ?? null) : null}
          />
        ))}
      </View>
    </Card>
  );
}

function VisitServiceLine({ service, business }: { service: CustomerVisitService; business: string | null }) {
  const state = customerBookingState(service.status);
  const gone = state === 'cancelled' || state === 'missed';
  const badge = serviceBadge(service);
  const who = [service.person_name ? `with ${service.person_name}` : null, business ? `at ${business}` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <View style={styles.serviceRow} testID={`visit-service-${service.booking_id}`}>
      <View style={styles.serviceMain}>
        <Text
          variant="bodyMedium"
          tone={gone ? 'muted' : 'default'}
          style={gone ? styles.struck : undefined}>
          {service.start_time} {service.service_name}
        </Text>
        <Text variant="bodySmall" tone="secondary">
          {who ? `${who}, ` : ''}
          {service.start_time} to {service.end_time}
        </Text>
      </View>
      {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
    </View>
  );
}

function serviceBadge(service: CustomerVisitService): { label: string; tone: BadgeTone } | null {
  const state = customerBookingState(service.status);
  if (state === 'cancelled') return { label: 'Cancelled', tone: 'neutral' };
  if (state === 'missed') return { label: 'Missed', tone: 'neutral' };
  if (state === 'completed') return { label: 'Completed', tone: 'neutral' };
  if (service.confirmed) return { label: 'Confirmed', tone: 'success' };
  return null;
}

function visitStatusLabel(visit: CustomerVisit): string {
  if (visit.state === 'cancelled') return 'CANCELLED';
  const live = visit.services.filter((s) => {
    const state = customerBookingState(s.status);
    return state !== 'cancelled' && state !== 'missed';
  });
  if (live.length > 0 && live.every((s) => customerBookingState(s.status) === 'completed')) {
    return 'COMPLETED';
  }
  return 'BOOKED';
}

/**
 * Whom to call about the visit (plan 6.5): each business with its phone and email, the lead
 * business first, so the client knows whom to ring about a particular service.
 */
export function VisitContactsCard({ visit }: { visit: CustomerVisit }) {
  const many = visit.businesses.length > 1;
  // A visit across businesses lists every business, with what each took (web split-visit plan 6.5).
  const listed = many ? visit.businesses : visit.businesses.filter((b) => b.phone || b.email);
  if (listed.length === 0) return null;

  return (
    <Card testID="visit-businesses">
      <Text variant="overline" tone="secondary">
        {many ? 'YOUR BUSINESSES' : 'CONTACT'}
      </Text>
      {many ? (
        <Text variant="bodySmall" tone="secondary" style={styles.gap}>
          Your visit is with {visit.businesses.length} businesses. Each provides, charges for and refunds its own services.
        </Text>
      ) : null}
      {listed.map((business) => (
        <View key={business.id} style={styles.business}>
          <Text variant="bodyMedium">{business.name}</Text>
          {many && business.payments ? (
            <Text variant="bodySmall" tone="secondary" testID={`visit-business-payments-${business.id}`}>
              {paymentsLine(business.payments)}
            </Text>
          ) : null}
          {many && business.address ? (
            <Text variant="bodySmall" tone="secondary">
              {business.address}
            </Text>
          ) : null}
          {business.phone ? (
            <Button
              label={`Call ${business.name}`}
              variant="secondary"
              onPress={() => void Linking.openURL(`tel:${business.phone}`)}
              style={styles.gap}
            />
          ) : null}
          {business.email ? (
            <Button
              label={`Email ${business.name}`}
              variant="secondary"
              onPress={() => void Linking.openURL(`mailto:${business.email}`)}
              style={styles.gap}
            />
          ) : null}
        </View>
      ))}
    </Card>
  );
}

/** "Paid £10.00.", "Paid £10.00. Refunded £10.00." or "Nothing paid online." */
export function paymentsLine(payments: { paid_pence: number; refunded_pence: number }): string {
  const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;
  const parts = [
    payments.paid_pence > 0 ? `Paid ${pounds(payments.paid_pence)}.` : null,
    payments.refunded_pence > 0 ? `Refunded ${pounds(payments.refunded_pence)}.` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Nothing paid online.';
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing.xs },
  services: { marginTop: spacing.sm, gap: spacing.sm },
  serviceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  serviceMain: { flex: 1, gap: 2 },
  struck: { textDecorationLine: 'line-through' },
  business: { marginTop: spacing.sm },
});
