import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CreditsSection } from '@/components/customer/passes/CreditsSection';
import { CoursesSection } from '@/components/customer/passes/CoursesSection';
import { MembershipsSection } from '@/components/customer/passes/MembershipsSection';
import { RecurringSection } from '@/components/customer/passes/RecurringSection';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { spacing } from '@/theme/index';

type Tab = 'credits' | 'memberships' | 'courses' | 'recurring';

/**
 * Passes and plans, in one screen with four sections.
 *
 * One screen rather than four, mirroring what the web concluded in P1-5 when it
 * folded four commerce pages into one: these are all answers to "what have I
 * already paid for", and splitting them made a customer visit four places to
 * find out.
 *
 * Each section fetches its own data, so a venue with only credits does not wait
 * on three requests it has no use for, and one failing read does not blank the
 * others.
 */
export default function CustomerPassesScreen() {
  const [tab, setTab] = useState<Tab>('credits');

  return (
    <Screen scroll padded>
      <Segmented
        options={[
          { value: 'credits', label: 'Credits' },
          { value: 'memberships', label: 'Memberships' },
          { value: 'courses', label: 'Courses' },
          { value: 'recurring', label: 'Weekly' },
        ]}
        value={tab}
        onChange={(v) => setTab(v as Tab)}
      />
      <View style={styles.body}>
        {tab === 'credits' ? <CreditsSection /> : null}
        {tab === 'memberships' ? <MembershipsSection /> : null}
        {tab === 'courses' ? <CoursesSection /> : null}
        {tab === 'recurring' ? <RecurringSection /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: spacing.base, gap: spacing.sm },
});
