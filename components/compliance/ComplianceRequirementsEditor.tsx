import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { SectionCard } from '@/components/ui/SectionCard';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  COMPLIANCE_ENFORCEMENT_LABELS,
  COMPLIANCE_ENFORCEMENT_OPTIONS,
  useAddComplianceRequirement,
  useComplianceRequirements,
  useDeleteComplianceRequirement,
  useUpdateComplianceRequirement,
  type ComplianceEnforcement,
} from '@/lib/queries/useComplianceRequirements';
import { useComplianceTemplatesList } from '@/lib/queries/useComplianceTypeManage';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { CATEGORY_LABELS } from './complianceTypeLabels';

type Props = {
  /** The booked-service row id (the server resolves the polymorphic FK). */
  serviceId: string;
  /** Whether compliance is enabled for the venue — hides the whole card if not. */
  complianceEnabled: boolean;
};

/**
 * Per-service compliance requirements editor — the app port of the web
 * `ComplianceRequirementsEditor`. Lists a service's required compliance types,
 * adds one (POST /requirements), changes its enforcement (PATCH) and removes it
 * (DELETE). Rendered inside the service editor (admin-only, edit-mode) and
 * hidden entirely when compliance is off for the venue.
 */
export function ComplianceRequirementsEditor({ serviceId, complianceEnabled }: Props) {
  const { colors } = useTheme();
  const toast = useToast();

  const reqs = useComplianceRequirements(serviceId, complianceEnabled);
  const typesList = useComplianceTemplatesList(false);
  const addReq = useAddComplianceRequirement();
  const updateReq = useUpdateComplianceRequirement();
  const deleteReq = useDeleteComplianceRequirement();

  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const requirements = reqs.data?.requirements ?? [];
  const allTypes = useMemo(
    () => (typesList.data?.types ?? []).filter((t) => t.is_active),
    [typesList.data],
  );
  const assignedTypeIds = new Set(requirements.map((r) => r.compliance_type_id));
  const availableTypes = allTypes.filter((t) => !assignedTypeIds.has(t.id));

  if (!complianceEnabled) return null;

  function changeEnforcement(id: string, enforcement: ComplianceEnforcement) {
    setBusyId(id);
    updateReq.mutate(
      { id, enforcement },
      {
        onSuccess: () => {
          setBusyId(null);
          hapticSuccess();
        },
        onError: (error) => {
          setBusyId(null);
          hapticWarning();
          toast.error(error instanceof ApiError ? error.message : 'Could not update requirement.');
        },
      },
    );
  }

  function remove(id: string) {
    setBusyId(id);
    deleteReq.mutate(id, {
      onSuccess: () => {
        setBusyId(null);
        hapticSuccess();
        toast.success('Requirement removed.');
      },
      onError: (error) => {
        setBusyId(null);
        hapticWarning();
        toast.error(error instanceof ApiError ? error.message : 'Could not remove requirement.');
      },
    });
  }

  return (
    <SectionCard>
      <SectionCard.Header
        eyebrow="Compliance"
        title="Compliance requirements"
        description="Records this service needs before a booking. Missing or expired records warn or block at booking time."
        right={
          allTypes.length > 0 ? (
            <Button
              label="Add"
              variant="secondary"
              size="sm"
              disabled={availableTypes.length === 0}
              onPress={() => setAdding(true)}
            />
          ) : undefined
        }
      />
      <SectionCard.Body style={styles.body}>
        {reqs.isError ? (
          <Text variant="bodySmall" tone="danger">
            {reqs.error instanceof ApiError ? reqs.error.message : 'Could not load requirements.'}
          </Text>
        ) : allTypes.length === 0 && !typesList.isLoading ? (
          <Text variant="bodySmall" tone="secondary">
            No compliance types set up yet. Create one from the Compliance page first.
          </Text>
        ) : requirements.length === 0 ? (
          <Text variant="bodySmall" tone="secondary">
            This service has no compliance requirements. Add one to warn or block bookings without a
            valid record.
          </Text>
        ) : (
          <View style={styles.list}>
            {requirements.map((r) => (
              <View
                key={r.id}
                style={[styles.req, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={styles.reqHeader}>
                  <View style={styles.reqText}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {r.compliance_type_name}
                      {!r.compliance_type_is_active ? '  (archived)' : ''}
                    </Text>
                    <Badge
                      label={CATEGORY_LABELS[r.compliance_type_category] ?? r.compliance_type_category}
                      tone="neutral"
                    />
                  </View>
                  <Button
                    label="Remove"
                    variant="ghost"
                    size="sm"
                    customColors={{ background: 'transparent', text: colors.danger }}
                    loading={busyId === r.id && deleteReq.isPending}
                    onPress={() => remove(r.id)}
                  />
                </View>
                <Text variant="caption" tone="muted">
                  When unmet
                </Text>
                <View style={styles.enforcementWrap}>
                  {COMPLIANCE_ENFORCEMENT_OPTIONS.map((o) => (
                    <Chip
                      key={o.value}
                      label={o.label}
                      selected={r.enforcement === o.value}
                      onPress={() => {
                        if (r.enforcement !== o.value) changeEnforcement(r.id, o.value);
                      }}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </SectionCard.Body>

      <AddRequirementSheet
        visible={adding}
        onClose={() => setAdding(false)}
        availableTypes={availableTypes}
        submitting={addReq.isPending}
        onAdd={(typeId, enforcement) => {
          addReq.mutate(
            { service_id: serviceId, compliance_type_id: typeId, enforcement },
            {
              onSuccess: () => {
                hapticSuccess();
                toast.success('Requirement added.');
                setAdding(false);
              },
              onError: (error) => {
                hapticWarning();
                toast.error(
                  error instanceof ApiError ? error.message : 'Could not add requirement.',
                );
              },
            },
          );
        }}
      />
    </SectionCard>
  );
}

function AddRequirementSheet({
  visible,
  onClose,
  availableTypes,
  submitting,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  availableTypes: { id: string; name: string }[];
  submitting: boolean;
  onAdd: (typeId: string, enforcement: ComplianceEnforcement) => void;
}) {
  const [typeId, setTypeId] = useState<string | null>(null);
  const [enforcement, setEnforcement] = useState<ComplianceEnforcement>('warn_staff');

  // Reset the picker each time the sheet opens (render-time guard).
  const [wasVisible, setWasVisible] = useState(false);
  if (visible && !wasVisible) {
    setTypeId(null);
    setEnforcement('warn_staff');
    setWasVisible(true);
  }
  if (!visible && wasVisible) setWasVisible(false);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.sheetBody}>
        <Text variant="subheading">Add compliance requirement</Text>
        <Text variant="bodySmall" tone="secondary">
          Require a compliance record for this service.
        </Text>

        <Text variant="label" tone="secondary">
          Compliance type
        </Text>
        <View style={styles.enforcementWrap}>
          {availableTypes.map((t) => (
            <Chip
              key={t.id}
              label={t.name}
              selected={typeId === t.id}
              onPress={() => setTypeId(typeId === t.id ? null : t.id)}
            />
          ))}
        </View>

        <Text variant="label" tone="secondary">
          When unmet
        </Text>
        <View style={styles.enforcementWrap}>
          {COMPLIANCE_ENFORCEMENT_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              selected={enforcement === o.value}
              onPress={() => setEnforcement(o.value)}
            />
          ))}
        </View>

        <View style={styles.sheetActions}>
          <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
          <Button
            label={COMPLIANCE_ENFORCEMENT_LABELS[enforcement] ? 'Add requirement' : 'Add'}
            style={styles.flex1}
            loading={submitting}
            disabled={!typeId}
            onPress={() => {
              if (typeId) onAdd(typeId, enforcement);
            }}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  list: {
    gap: spacing.md,
  },
  req: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  reqHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reqText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  enforcementWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sheetBody: {
    gap: spacing.sm,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
});
