import { Stack } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ComplianceTemplatesPanel } from '@/components/compliance/ComplianceTemplatesPanel';
import { Screen } from '@/components/ui/Screen';
import { useComplianceTemplatesList } from '@/lib/queries/useComplianceTypeManage';
import { spacing } from '@/theme/index';

/**
 * Compliance templates — list + create + edit the venue's compliance form types.
 * The panel itself is shared with the Compliance settings area (web
 * `ComplianceSettingsSection` TypesPanel); this screen keeps a standalone route
 * so non-admin staff can still view the template list read-only.
 */
export default function ComplianceTypesScreen() {
  // Cache-shared with the panel's own query — used here only to drive pull-to-refresh.
  const list = useComplianceTemplatesList(true);

  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen options={{ headerShown: true, title: 'Compliance templates' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
        }>
        <ComplianceTemplatesPanel />
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
  spacer: {
    height: spacing.xl,
  },
});
