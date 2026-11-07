import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import {
  ComplianceChooseServicesSheet,
  type ChooseServicesForm,
} from '@/components/compliance/ComplianceChooseServicesSheet';
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
  type ComplianceLibraryTemplate,
} from '@/lib/queries/useComplianceTypeManage';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** Time for the editor sheet to leave before Choose services is shown (iOS drops a sheet opened over a closing one). */
const SHEET_HANDOFF_MS = 350;

/** Whether clients can complete the form online; unknown reads as yes, as on the web. */
function isClientOnline(captureMethods: string[] | undefined): boolean {
  return (captureMethods ?? ['client_online']).includes('client_online');
}

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
 * Forms panel: the app port of the web `ComplianceSettingsSection` TypesPanel. Lists every
 * compliance type, called a form wherever a user reads it (incl. archived and never-used, with
 * service/record counts); admins can create a form, add one from the starter library, duplicate
 * a form (which opens the copy), choose which services ask for an active form (also offered
 * straight after one is created), and open the editor sheet. Lives in Compliance settings, Forms.
 */
export function ComplianceTemplatesPanel() {
  const { colors } = useTheme();
  const toast = useToast();
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';

  const list = useComplianceTemplatesList(true);
  const duplicate = useDuplicateComplianceType();
  const [editorTarget, setEditorTarget] = useState<
    | { mode: 'create'; template?: ComplianceLibraryTemplate }
    | { mode: 'edit'; id: string }
    | null
  >(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  // Archived forms are out of the way until asked for (web parity, 2026-11-07).
  const [showArchived, setShowArchived] = useState(false);
  // Choose services (web parity, 2026-11-07). The form stays set while the sheet slides away.
  const [choosing, setChoosing] = useState<{ form: ChooseServicesForm; justCreated: boolean } | null>(null);
  const [chooseVisible, setChooseVisible] = useState(false);
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (handoffTimer.current) clearTimeout(handoffTimer.current);
    },
    [],
  );

  const allTypes = list.data?.types ?? [];
  const archivedCount = allTypes.filter((t) => !t.is_active).length;
  const types = showArchived ? allTypes : allTypes.filter((t) => t.is_active);
  const planGated = isPlanGate(list.error);

  /** Duplicate, then open the copy in the editor so it can be changed at once (web parity). */
  function handleDuplicate(typeId: string) {
    setDuplicatingId(typeId);
    duplicate.mutate(typeId, {
      onSuccess: (copy) => {
        setDuplicatingId(null);
        hapticSuccess();
        toast.success('Copy made. Change anything you like.');
        void list.refetch();
        const copyId = copy?.type?.id;
        if (copyId) setEditorTarget({ mode: 'edit', id: copyId });
      },
      onError: (error) => {
        setDuplicatingId(null);
        hapticWarning();
        toast.error(error instanceof ApiError ? error.message : 'Could not duplicate the form.');
      },
    });
  }

  function openChoose(form: ChooseServicesForm, justCreated: boolean) {
    setChoosing({ form, justCreated });
    setChooseVisible(true);
  }

  /** Close the editor, then open Choose services once it has gone: one sheet cannot open over another. */
  function chooseAfterEditor(form: ChooseServicesForm, justCreated: boolean) {
    setEditorTarget(null);
    if (handoffTimer.current) clearTimeout(handoffTimer.current);
    handoffTimer.current = setTimeout(() => {
      handoffTimer.current = null;
      openChoose(form, justCreated);
    }, SHEET_HANDOFF_MS);
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
            ? 'Turn on compliance records in the General tab to manage forms.'
            : 'Compliance records are part of the appointments plan. Ask an admin to enable them.'
        }
      />
    );
  }

  if (list.isError) {
    return (
      <ErrorState
        message={list.error instanceof ApiError ? list.error.message : 'Could not load your forms.'}
        onRetry={() => void list.refetch()}
      />
    );
  }

  // The editor's archive confirmation names how many services ask for the open form.
  const editingRow =
    editorTarget?.mode === 'edit' ? allTypes.find((t) => t.id === editorTarget.id) : undefined;

  return (
    <>
      <View style={styles.panel}>
        <Text variant="caption" tone="muted">
          The forms your business collects: patch tests, consent forms, intake questionnaires.
          {!isAdmin ? ' Only admins can edit forms.' : ''}
        </Text>

        {isAdmin ? (
          <View style={styles.actionsRow}>
            <Button
              label="Create a form"
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

        {archivedCount > 0 ? (
          <View style={styles.switchRow}>
            <Text variant="bodySmall" tone="secondary">
              Show archived ({archivedCount})
            </Text>
            <Switch
              accessibilityLabel="Show archived"
              value={showArchived}
              onValueChange={setShowArchived}
              trackColor={{ true: colors.brand, false: colors.border }}
              thumbColor={colors.surfaceRaised}
            />
          </View>
        ) : null}

        {types.length === 0 ? (
          // One line, as on the web. Non-admins cannot add a form, so they get the first sentence only.
          <Text variant="bodySmall" tone="secondary" testID="forms-empty">
            {allTypes.length === 0
              ? isAdmin
                ? 'No forms yet. Add one from the library or create your own.'
                : 'No forms yet.'
              : isAdmin
                ? 'Every form is archived. Turn on Show archived to see them, or add a new one.'
                : 'Every form is archived. Turn on Show archived to see them.'}
          </Text>
        ) : (
          <Card>
            <Text variant="label">Forms</Text>
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
                      <View style={styles.rowActions}>
                        {/* Which services ask for it, in one place (web parity, 2026-11-07). */}
                        {t.is_active ? (
                          <Button
                            label="Choose services"
                            variant="ghost"
                            size="sm"
                            accessibilityLabel={`Choose services for ${t.name}`}
                            onPress={() =>
                              openChoose(
                                { id: t.id, name: t.name, clientOnline: isClientOnline(t.capture_methods) },
                                false,
                              )
                            }
                          />
                        ) : null}
                        <Button
                          label="Duplicate"
                          variant="ghost"
                          size="sm"
                          loading={duplicatingId === t.id && duplicate.isPending}
                          onPress={() => handleDuplicate(t.id)}
                        />
                      </View>
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
        template={editorTarget?.mode === 'create' ? (editorTarget.template ?? null) : null}
        canEdit={isAdmin}
        serviceCount={editingRow?.service_requirement_count ?? 0}
        onClose={() => setEditorTarget(null)}
        onSaved={() => void list.refetch()}
        onOpenType={(id) => setEditorTarget({ mode: 'edit', id })}
        // A form just made (blank or from a template): straight on to which services need it.
        onCreated={(form) => chooseAfterEditor(form, true)}
        onChooseServices={(form) => chooseAfterEditor(form, false)}
      />

      {choosing ? (
        <ComplianceChooseServicesSheet
          visible={chooseVisible}
          onClose={() => setChooseVisible(false)}
          form={choosing.form}
          justCreated={choosing.justCreated}
          onSaved={() => void list.refetch()}
        />
      ) : null}

      <ComplianceLibrarySheet
        visible={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onUseTemplate={(template) => {
          setLibraryOpen(false);
          setEditorTarget({ mode: 'create', template });
        }}
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  rowActions: {
    alignItems: 'flex-end',
  },
});
