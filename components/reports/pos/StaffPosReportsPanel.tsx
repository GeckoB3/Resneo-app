import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { SalesSection } from '@/components/reports/pos/SalesSection';
import { TakingsSection } from '@/components/reports/pos/TakingsSection';
import { Segmented } from '@/components/ui/Segmented';
import { reportsCopy } from '@/lib/pos/reports-copy';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Reports for a team member given `view_reports` (web `StaffPosReportsPanel.tsx`, POS plan §4.32
 * row 24, UX spec §2.3): the Takings and Sales tabs only. Everything else in Reports stays admin
 * only, payouts included, and the report routes check `view_reports` (and `export` for CSV) on
 * every request.
 */
export function StaffPosReportsPanel({
  canExport,
  today,
  initialTab = 'takings',
}: {
  canExport: boolean;
  today: string;
  initialTab?: 'takings' | 'sales';
}) {
  const { colors } = useTheme();
  const [tab, setTab] = useState<'takings' | 'sales'>(initialTab);
  return (
    <>
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        <Segmented
          options={[
            { value: 'takings', label: reportsCopy('tab.takings') },
            { value: 'sales', label: reportsCopy('tab.sales') },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab === 'takings' ? (
          <TakingsSection canExport={canExport} isAdmin={false} today={today} />
        ) : (
          <SalesSection canExport={canExport} today={today} />
        )}
        <View style={styles.spacer} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  toolbar: { paddingHorizontal: spacing.base, paddingTop: spacing.sm, paddingBottom: spacing.md, borderBottomWidth: 1 },
  content: { paddingHorizontal: spacing.base, paddingTop: spacing.sm, gap: spacing.base },
  spacer: { height: spacing['2xl'] },
});
