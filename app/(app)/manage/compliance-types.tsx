import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ComplianceTypeEditorSheet } from '@/components/compliance/ComplianceTypeEditorSheet';
import {
  CATEGORY_LABELS,
  RESULT_TYPE_LABELS,
  validityLabel,
} from '@/components/compliance/complianceTypeLabels';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  useComplianceTemplateDetailsList,
  useDiscoveredComplianceTemplates,
} from '@/lib/queries/useComplianceTypeManage';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const WEB_TEMPLATES_URL = 'https://app.resneo.com/dashboard/settings?tab=compliance';

/**
 * Compliance templates — list + edit the venue's compliance form templates
 * (types). The web list/create/library/form-builder routes are cookie-only,
 * so this screen lists templates discovered from Bearer-accessible compliance
 * activity and edits them via the Bearer PATCH route; everything else points
 * to the web dashboard inline.
 */
export default function ComplianceTypesScreen() {
  const { colors } = useTheme();
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';

  const discovery = useDiscoveredComplianceTemplates();
  const details = useComplianceTemplateDetailsList(discovery.templates.map((t) => t.id));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const header = <Stack.Screen options={{ title: 'Compliance templates' }} />;

  if (discovery.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  if (discovery.planGated) {
    return (
      <Screen>
        {header}
        <EmptyState
          title="Compliance isn't enabled"
          message={
            isAdmin
              ? 'Turn on compliance records from the Compliance page to manage templates.'
              : 'Compliance records are part of the appointments plan. Ask an admin to enable them.'
          }
        />
      </Screen>
    );
  }

  if (discovery.isError) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={
            discovery.error instanceof ApiError
              ? discovery.error.message
              : 'Could not load compliance templates.'
          }
          onRetry={discovery.refetch}
        />
      </Screen>
    );
  }

  return (
    <>
      <Screen scroll={false} padded={false}>
        {header}
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={discovery.isRefetching} onRefresh={discovery.refetch} />
          }>
          <Text variant="caption" tone="muted">
            The kinds of records this venue collects — patch tests, consent forms, intake
            questionnaires.{!isAdmin ? ' Only admins can edit templates.' : ''}
          </Text>

          {discovery.discoveryIncomplete ? (
            <Text variant="caption" tone="danger">
              Some compliance data could not be loaded — this list may be missing templates.
            </Text>
          ) : null}

          {discovery.templates.length === 0 ? (
            <Card>
              <Text variant="bodyMedium">No templates found</Text>
              <Text variant="bodySmall" tone="secondary" style={styles.emptyText}>
                The app finds templates through this venue&apos;s compliance activity (captured
                records, outstanding forms and upcoming bookings). Templates that have never been
                used — and the full list — are on the web dashboard.
              </Text>
            </Card>
          ) : (
            <Card>
              <Text variant="label">Templates</Text>
              <View style={styles.list}>
                {discovery.templates.map((template, index) => {
                  const detailQuery = details[index];
                  const detail = detailQuery?.data;
                  return (
                    <Pressable
                      key={template.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${detail?.type.name ?? template.name}`}
                      onPress={() => setSelectedId(template.id)}
                      style={({ pressed }) => [
                        styles.row,
                        pressed && { backgroundColor: colors.surface },
                      ]}>
                      <View style={styles.rowText}>
                        <View style={styles.rowTitle}>
                          <Text variant="bodyMedium" numberOfLines={1} style={styles.rowName}>
                            {detail?.type.name ?? template.name}
                          </Text>
                          {detail && !detail.type.is_active ? (
                            <Badge label="Archived" tone="warning" />
                          ) : null}
                        </View>
                        <Text variant="caption" tone="muted" numberOfLines={2}>
                          {detail
                            ? [
                                CATEGORY_LABELS[detail.type.category] ?? detail.type.category,
                                RESULT_TYPE_LABELS[detail.type.result_type] ??
                                  detail.type.result_type,
                                validityLabel(detail.type.validity_period_days),
                                detail.version ? `v${detail.version.version_number}` : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')
                            : detailQuery?.isError
                              ? 'Could not load details'
                              : 'Loading details…'}
                        </Text>
                      </View>
                      <Text variant="bodyMedium" tone="muted">
                        ›
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          )}

          {/* Web-only capabilities — cookie-authenticated routes the app can't call */}
          <Card style={{ backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder }}>
            <Text variant="label" color={colors.brand}>
              On the web dashboard
            </Text>
            <Text variant="bodySmall" tone="secondary" style={styles.webNoteText}>
              Creating new templates, adding from the template library, editing form fields
              (versions) and the complete template list are managed on the web dashboard. The app
              can edit a template&apos;s settings and archive or restore it.
            </Text>
            <Button
              label="Open the web dashboard"
              variant="ghost"
              size="sm"
              onPress={() => void Linking.openURL(WEB_TEMPLATES_URL)}
              style={styles.webBtn}
            />
          </Card>

          <View style={styles.spacer} />
        </ScrollView>
      </Screen>

      <ComplianceTypeEditorSheet
        visible={selectedId !== null}
        typeId={selectedId}
        canEdit={isAdmin}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  list: {
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    flexShrink: 1,
    minWidth: 0,
  },
  emptyText: {
    marginTop: spacing.xs,
  },
  webNoteText: {
    marginTop: spacing.xs,
  },
  webBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  spacer: {
    height: spacing.xl,
  },
});
