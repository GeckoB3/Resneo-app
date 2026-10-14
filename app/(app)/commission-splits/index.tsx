import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { BusinessSplitsPanel } from '@/components/commission-splits/BusinessSplitsPanel';
import { TeamCommissionPanel } from '@/components/commission-splits/TeamCommissionPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { splitsT } from '@/lib/commission/splits-copy';
import { queryKeys } from '@/lib/queries/keys';
import { useCommissionGate } from '@/lib/queries/useCommissionSplits';
import { useVenue } from '@/lib/queries/useVenue';
import { spacing } from '@/theme/index';

type Section = 'team' | 'businesses';

/**
 * Commission splits (web Settings, Commission splits tab; reports/Commission splits across linked
 * venues.md, 2026-10-14), for admins, whether or not Checkout is on. Two sections:
 *
 * - Your team: commission rates, what counts for services, the VAT basis and how each person is
 *   described (`TeamCommissionPanel`).
 * - Businesses you work with: splits agreed with a business you have a "Work as one team" link with
 *   or share a live collective with (`BusinessSplitsPanel`), each opening `/commission-splits/[id]`.
 *
 * `?section=businesses` opens the second (a notice about a split lands there). The old Checkout
 * settings route `/checkout-settings/commission` redirects here.
 */
export default function CommissionSplitsScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const { isAdmin, staffLoading } = useCommissionGate();
  const venue = useVenue();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>(params.section === 'businesses' ? 'businesses' : 'team');
  const [refreshing, setRefreshing] = useState(false);
  const header = <Stack.Screen options={{ headerShown: true, title: splitsT('page.title') }} />;

  if (staffLoading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }
  if (!isAdmin) {
    return (
      <Screen>
        {header}
        <EmptyState title={splitsT('app.adminOnly.title')} message={splitsT('app.adminOnly.body')} />
      </Screen>
    );
  }

  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.commissionSplits.all() });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen scroll={false} padded={false} keyboardAvoiding>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
        <Text variant="bodySmall" tone="secondary">
          {splitsT('page.intro')}
        </Text>
        <Segmented<Section>
          options={[
            { value: 'team', label: splitsT('team.title') },
            { value: 'businesses', label: splitsT('biz.title') },
          ]}
          value={section}
          onChange={setSection}
          wrapLabels
        />
        {section === 'team' ? <TeamCommissionPanel /> : <BusinessSplitsPanel currency={venue.data?.currency} />}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.base, paddingBottom: spacing['3xl'] },
});
