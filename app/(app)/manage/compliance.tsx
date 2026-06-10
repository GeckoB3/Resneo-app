import { format, parseISO } from 'date-fns';
import { Stack, useRouter, type Href } from 'expo-router';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

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
  useComplianceFormLinks,
  useResendFormLink,
  useRevokeFormLink,
} from '@/lib/queries/useCompliance';
import { spacing } from '@/theme/index';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

/** Compliance — expiring records, missing-for-booking flags & outstanding forms. */
export default function ComplianceScreen() {
  const router = useRouter();
  const dashboard = useComplianceDashboard();
  const formLinks = useComplianceFormLinks();
  const resend = useResendFormLink();
  const revoke = useRevokeFormLink();

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
          message="Compliance records are part of the appointments plan's compliance add-on. Enable it on the web dashboard."
        />
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

  // "Awaiting submission" renders from the form-links query (it carries the
  // resend/revoke link ids the dashboard rows lack).
  const { expiring_soon, missing_for_bookings } = dashboard.data;
  const links = (formLinks.data?.links ?? []).filter(
    (link) => (link.status ?? 'pending') === 'pending',
  );

  const handleResend = (id: string, guestName: string) => {
    Alert.alert(`Resend form to ${guestName}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Email',
        onPress: () =>
          resend.mutate(
            { id, send_via: 'email' },
            { onSuccess: () => hapticSuccess(), onError: () => hapticWarning() },
          ),
      },
      {
        text: 'SMS',
        onPress: () =>
          resend.mutate(
            { id, send_via: 'sms' },
            { onSuccess: () => hapticSuccess(), onError: () => hapticWarning() },
          ),
      },
    ]);
  };

  const handleRevoke = (id: string, guestName: string) => {
    Alert.alert(`Revoke ${guestName}'s form link?`, 'They will no longer be able to submit it.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: () =>
          revoke.mutate(id, { onSuccess: () => hapticSuccess(), onError: () => hapticWarning() }),
      },
    ]);
  };

  const allClear =
    expiring_soon.length === 0 && missing_for_bookings.length === 0 && links.length === 0;

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={dashboard.isRefetching || formLinks.isRefetching}
            onRefresh={() => {
              void dashboard.refetch();
              void formLinks.refetch();
            }}
          />
        }>
        {allClear ? (
          <EmptyState
            title="All clear"
            message="No expiring records, missing requirements or outstanding forms."
          />
        ) : null}

        {missing_for_bookings.length > 0 ? (
          <Card>
            <View style={styles.sectionHeader}>
              <Text variant="label">Missing for upcoming bookings</Text>
              <Badge label={String(missing_for_bookings.length)} tone="danger" />
            </View>
            <View style={styles.list}>
              {missing_for_bookings.map((row) => (
                <View key={`${row.booking_id}-${row.compliance_type_id}`} style={styles.row}>
                  <View style={styles.rowText}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {row.guest_name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {row.compliance_type_name} · {formatDate(row.booking_date)}
                      {row.booking_time ? ` ${row.booking_time.slice(0, 5)}` : ''}
                    </Text>
                  </View>
                  <Button
                    label="Booking"
                    variant="ghost"
                    size="sm"
                    onPress={() => router.push(`/booking/${row.booking_id}` as Href)}
                  />
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {expiring_soon.length > 0 ? (
          <Card>
            <View style={styles.sectionHeader}>
              <Text variant="label">Expiring soon</Text>
              <Badge label={String(expiring_soon.length)} tone="warning" />
            </View>
            <View style={styles.list}>
              {expiring_soon.map((row) => (
                <View key={row.id} style={styles.row}>
                  <View style={styles.rowText}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {row.guest_name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {row.compliance_type_name} · expires {formatDate(row.expires_at)}
                    </Text>
                  </View>
                  <Button
                    label="Contact"
                    variant="ghost"
                    size="sm"
                    onPress={() => router.push(`/client/${row.guest_id}` as Href)}
                  />
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {links.length > 0 ? (
          <Card>
            <View style={styles.sectionHeader}>
              <Text variant="label">Awaiting submission</Text>
              <Badge label={String(links.length)} tone="brand" />
            </View>
            <View style={styles.list}>
              {links.map((link) => (
                <View key={link.id} style={styles.row}>
                  <View style={styles.rowText}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {link.guest_name ?? 'Guest'}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {link.compliance_type_name ?? 'Form'}
                      {link.sent_at ? ` · sent ${formatDate(link.sent_at)}` : ''}
                      {link.expires_at ? ` · expires ${formatDate(link.expires_at)}` : ''}
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    <Button
                      label="Resend"
                      variant="ghost"
                      size="sm"
                      loading={resend.isPending}
                      onPress={() => handleResend(link.id, link.guest_name ?? 'guest')}
                    />
                    <Button
                      label="Revoke"
                      variant="ghost"
                      size="sm"
                      loading={revoke.isPending}
                      onPress={() => handleRevoke(link.id, link.guest_name ?? 'guest')}
                    />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <Text variant="caption" tone="muted" style={styles.footnote}>
          Form templates, requirements & full record history are managed on the web dashboard.
        </Text>
        <View style={styles.spacer} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
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
  },
  footnote: {
    textAlign: 'center',
  },
  spacer: {
    height: spacing.xl,
  },
});
