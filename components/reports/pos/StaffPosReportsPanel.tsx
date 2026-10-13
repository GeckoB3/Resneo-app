import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { SalesSection } from '@/components/reports/pos/SalesSection';
import { TakingsSection } from '@/components/reports/pos/TakingsSection';
import {
  ReportCalendarPicker,
  ReportCalendarProvider,
  useReportCalendarFilter,
} from '@/components/reports/ReportCalendarFilter';
import { Segmented } from '@/components/ui/Segmented';
import { reportsCopy } from '@/lib/pos/reports-copy';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Reports for a team member given `view_reports` (web `StaffPosReportsPanel.tsx`, POS plan §4.32
 * row 24, UX spec §2.3): the Takings and Sales tabs only. Everything else in Reports stays admin
 * only, payouts included, and the report routes check `view_reports` (and `export` for CSV) on
 * every request.
 *
 * The same Showing picker as an admin's Reports, without linked businesses (lib/reports/report-calendar.ts), kept while
 * moving between the two tabs: it narrows Sales to one calendar and is greyed out on Takings, which
 * is always the whole venue's. It shows once the server lists two calendars for this login.
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
  // A team member never gets a linked business or everyone together: those are for admins only.
  const filter = useReportCalendarFilter(true, false);
  return (
    <ReportCalendarProvider showing={filter.showing} options={filter.options} onClear={filter.clear}>
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        <Segmented
          options={[
            { value: 'takings', label: reportsCopy('tab.takings') },
            { value: 'sales', label: reportsCopy('tab.sales') },
          ]}
          value={tab}
          onChange={setTab}
        />
        {filter.showPicker ? (
          <ReportCalendarPicker
            options={filter.options}
            value={filter.showing}
            onChange={filter.choose}
            // Takings is always the whole venue's: greyed out there, as on the web.
            disabled={tab === 'takings'}
          />
        ) : null}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab === 'takings' ? (
          <TakingsSection canExport={canExport} isAdmin={false} today={today} />
        ) : (
          <SalesSection canExport={canExport} today={today} />
        )}
        <View style={styles.spacer} />
      </ScrollView>
    </ReportCalendarProvider>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  content: { paddingHorizontal: spacing.base, paddingTop: spacing.sm, gap: spacing.base },
  spacer: { height: spacing['2xl'] },
});
