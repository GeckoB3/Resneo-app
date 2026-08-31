import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import { BuyPassSection } from '@/components/customer/passes/BuyPassSection';
import { nameById } from '@/components/customer/passes/lookup';
import { membershipCancelConsequence, membershipStateLine } from '@/components/customer/passes/passes-copy';
import {
  useCancelMembership,
  useMemberships,
  useResumeMembership,
  type Membership,
} from '@/lib/queries/useCustomerPasses';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/** Statuses that entitle the customer to something today. */
const LIVE = new Set(['active', 'trialing', 'past_due']);

/**
 * Memberships, and the two things a customer can do about one.
 *
 * Cancelling is scheduled rather than immediate: the membership stays usable
 * until the period ends. Saying so is the whole job of the confirmation, because
 * "cancel" reads as "stop now" and a customer who believes they have lost what
 * they already paid for behaves very differently from one who knows the date.
 *
 * Resuming exists because before the web added it, no surface anywhere could
 * clear a pending cancellation, and the only remedy was ringing the venue and
 * asking someone to do it in Stripe. It gets NO confirmation of its own:
 * confirming that you want to keep paying for something you already had is
 * friction pointed the wrong way.
 */
export function MembershipsSection() {
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useMemberships();
  const cancel = useCancelMembership();
  const resume = useResumeMembership();
  const [pending, setPending] = useState<Membership | null>(null);

  const forSale = data?.purchase_catalog?.products ?? [];
  const catalogVenues = data?.purchase_catalog?.venues ?? data?.venues;

  if (isLoading) return <LoadingState message="Loading your memberships…" />;
  if (isError) {
    return <ErrorState message="Could not load your memberships." onRetry={() => void refetch()} />;
  }

  const live = (data?.memberships ?? []).filter((m) => LIVE.has(m.status));

  if (live.length === 0) {
    return (
      <View style={styles.list}>
        <EmptyState
          title="No memberships"
          message="A membership you take out with a venue will appear here, with what it covers."
        />
        {/* Offered with none held: an empty tab is where somebody looks for how
            to get one. */}
      <BuyPassSection
        heading="TAKE OUT A MEMBERSHIP"
        kind="membership"
        products={forSale}
        venues={catalogVenues}
        note="A membership renews until you cancel it. You can cancel here at any time, and it stays usable until the period you have paid for ends."
      />
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {live.map((membership) => (
        <Card key={membership.id}>
          <Text variant="bodyMedium">{nameById(data?.venues, membership.venue_id)}</Text>
          <Text variant="bodySmall" tone="secondary">
            {nameById(data?.products, membership.product_id, 'Membership')}
          </Text>
          <Text variant="bodySmall" tone="secondary" style={styles.gap}>
            {membershipStateLine(membership)}
          </Text>

          {membership.cancel_at_period_end ? (
            <Button
              label="Keep my membership"
              variant="secondary"
              loading={resume.isPending}
              onPress={() =>
                resume.mutate(
                  { membershipId: membership.id },
                  {
                    onSuccess: () => toast.success('Your membership will keep renewing.'),
                    onError: () => toast.error('Could not restart it. Please ring the venue.'),
                  },
                )
              }
              style={styles.gap}
            />
          ) : (
            <Button
              label="Cancel at renewal"
              variant="secondary"
              onPress={() => setPending(membership)}
              style={styles.gap}
            />
          )}
        </Card>
      ))}

      <BuyPassSection
        heading="TAKE OUT A MEMBERSHIP"
        kind="membership"
        products={forSale}
        venues={catalogVenues}
        note="A membership renews until you cancel it. You can cancel here at any time, and it stays usable until the period you have paid for ends."
      />

      <ConfirmSheet
        visible={pending !== null}
        title="Cancel this membership?"
        message={pending ? membershipCancelConsequence(pending) : ''}
        confirmLabel="Cancel at renewal"
        cancelLabel="Keep it"
        loading={cancel.isPending}
        onClose={() => setPending(null)}
        onConfirm={() => {
          // Read into a local first: the sheet clears its own state on confirm,
          // so `pending` is gone by the time the request would be built.
          const target = pending;
          setPending(null);
          if (!target) return;
          cancel.mutate(
            { membershipId: target.id },
            {
              onSuccess: () => toast.success(membershipCancelConsequence(target)),
              onError: () => toast.error('Could not cancel. Please ring the venue.'),
            },
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  gap: { marginTop: spacing.sm },
});
