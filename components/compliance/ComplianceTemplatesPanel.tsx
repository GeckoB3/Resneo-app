import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ComplianceLibrarySheet } from '@/components/compliance/ComplianceLibrarySheet';
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
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useComplianceTemplatesList,
  useDuplicateComplianceType,
} from '@/lib/queries/useComplianceTypeManage';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** A plan-gate is a 403 (no compliance entitlement) or 402 (payment required). */
function isPlanGate(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 402);
}

/** Format a per-type count suffix, e.g. "2 services · 14 records". */
function countSummary(serviceCount?: number, recordCount?: number): string | null {
  const parts: string[] = [];
  if (typeof serviceCount === 'number') {
    parts.push(`${serviceCount} service${serviceCount === 1 ? '' : 's'}`);
  }
  if (typeof recordCount === 'number') {
    parts.push(`${recordCount} record${recordCount === 1 ? '' : 's'}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Templates & types panel — the app port of the web `ComplianceSettingsSection`
 * TypesPanel. Lists every compliance type (incl. archived and never-used, with
 * service/record counts); admins can create a custom type, add one from the
 * starter library, duplicate a type, and open the editor sheet. Shared between
 * the standalone Compliance templates screen (staff can view read-only) and the
 * Compliance settings area.
 */
export function ComplianceTemplatesPanel() {
  const { colors } = useTheme();
  const toast = useToast();
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';

  const list = useComplianceTemplatesList(true);
  const duplicate = useDuplicateComplianceType();
  const [editorTarget, setEditorTarget] = useState<
    { mode: 'create' } | { mode: 'edit'; id: string } | null
  >(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const types = list.data?.types ?? [];
  const planGated = isPlanGate(list.error);

  function handleDuplicate(typeId: string) {
    setDuplicatingId(typeId);
    duplicate.mutate(typeId, {
      onSuccess: () => {
        setDuplicatingId(null);
        hapticSuccess();
        toast.success('Template duplicated.');
      },
      onError: (error) => {
        setDuplicatingId(null);
        hapticWarning();
        toast.error(error instanceof ApiError ? error.message : 'Could not duplicate the template.');
      },
    });
  }

  if (list.isLoading) {
    return <DetailSkeleton />;
  }

  if (planGated) {
    return (
      <EmptyState
        title="Compliance isn't enabled"
        message={
          isAdmin
            ? 'Turn on compliance records from the Compliance page to manage templates.'
            : 'Compliance records are part of the appointments plan. Ask an admin to enable them.'
        }
      />
    );
  }

  if (list.isError) {
    return (
      <ErrorState
        message={
          list.error instanceof ApiError ? list.error.message : 'Could not load compliance templates.'
        }
        onRetry={() => void list.refetch()}
      />
    );
  }

  return (
    <>
      <View style={styles.panel}>
        <Text variant="caption" tone="muted">
          The kinds of records this venue collects — patch tests, consent forms, intake
          questionnaires.{!isAdmin ? ' Only admins can edit templates.' : ''}
        </Text>

        {isAdmin ? (
          <View style={styles.actionsRow}>
            <Button
              label="Create custom type"
              size="sm"
              style={styles.actionBtn}
              onPress={() => setEditorTarget({ mode: 'create' })}
            />
            <Button
              label="Add from library"
              variant="secondary"
              size="sm"
              style={styles.actionBtn}
              onPress={() => setLibraryOpen(true)}
            />
          </View>
        ) : null}

        {types.length === 0 ? (
          <EmptyState
            title="No compliance types yet"
            message={
              isAdmin
                ? 'Create a custom type or add one from the library to start collecting records.'
                : 'No compliance types have been set up yet.'
            }
          />
        ) : (
          <Card>
            <Text variant="label">Templates</Text>
            <View style={styles.list}>
              {types.map((t) => {
                const counts = countSummary(t.service_requirement_count, t.record_count);
                return (
                  <View key={t.id} style={styles.row}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${isAdmin ? 'Edit' : 'View'} ${t.name}`}
                      onPress={() => setEditorTarget({ mode: 'edit', id: t.id })}
                      style={({ pressed }) => [
                        styles.rowPress,
                        pressed && { backgroundColor: colors.surface },
                      ]}>
                      <View style={styles.rowText}>
                        <View style={styles.rowTitle}>
                          <Text variant="bodyMedium" numberOfLines={1} style={styles.rowName}>
                            {t.name}
                          </Text>
                          {!t.is_active ? <Badge label="Archived" tone="warning" /> : null}
                        </View>
                        <Text variant="caption" tone="muted" numberOfLines={2}>
                          {[
                            CATEGORY_LABELS[t.category] ?? t.category,
                            RESULT_TYPE_LABELS[t.result_type] ?? t.result_type,
                            validityLabel(t.validity_period_days),
                            t.current_version_number ? `v${t.current_version_number}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                        {counts ? (
                          <Text variant="caption" tone="muted">
                            {counts}
                          </Text>
                        ) : null}
                      </View>
                      <Text variant="bodyMedium" tone="muted">
                        ›
                      </Text>
                    </Pressable>
                    {isAdmin ? (
                      <Button
                        label="Duplicate"
                        variant="ghost"
                        size="sm"
                        loading={duplicatingId === t.id && duplicate.isPending}
                        onPress={() => handleDuplicate(t.id)}
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>
          </Card>
        )}
      </View>

      <ComplianceTypeEditorSheet
        visible={editorTarget !== null}
        mode={editorTarget?.mode ?? 'edit'}
        typeId={editorTarget?.mode === 'edit' ? editorTarget.id : null}
        canEdit={isAdmin}
        onClose={() => setEditorTarget(null)}
        onSaved={() => void list.refetch()}
      />

      <ComplianceLibrarySheet
        visible={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onCloned={() => void list.refetch()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.base,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
  },
  list: {
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowPress: {
    flex: 1,
    minWidth: 0,
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
});
