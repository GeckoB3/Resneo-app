import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { SectionCard } from '@/components/ui/SectionCard';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  COMPLIANCE_ENFORCEMENT_DESCRIPTIONS,
  COMPLIANCE_ENFORCEMENT_LABELS,
  COMPLIANCE_ENFORCEMENT_OPTIONS,
  COMPLIANCE_ONLINE_COLLECTION_DESCRIPTIONS,
  COMPLIANCE_ONLINE_COLLECTION_OPTIONS,
  useAddComplianceRequirement,
  useComplianceRequirements,
  useDeleteComplianceRequirement,
  useUpdateComplianceRequirement,
  type ComplianceEnforcement,
  type ComplianceOnlineCollection,
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
  /**
   * Render without the SectionCard chrome — used when the editor already sits
   * inside a card (the per-service accordion in Compliance settings, mirroring
   * the web RequirementsPanel).
   */
  embedded?: boolean;
};

/** A type can be completed by clients online only when `client_online` is a capture method. */
function typeSupportsClientOnline(captureMethods: string[] | undefined): boolean {
  // Unknown (e.g. an archived type no longer in the active list) defaults to showing the
  // control; the booking flow and auto-send gate on the real capture methods regardless.
  return (captureMethods ?? ['client_online']).includes('client_online');
}

/** Clamp a lead-time value to the accepted range (0–8760 hours), blank → null. */
function parseLeadTime(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(8760, Math.round(n)));
}

/**
 * Per-service compliance requirements editor — the app port of the web
 * `ComplianceRequirementsEditor`. Lists a service's required compliance types and
 * lets an admin add one (POST /requirements), change its enforcement, lead time
 * (lock_period_hours) and online-collection mode (PATCH), and remove it (DELETE).
 * Rendered inside the service editor (admin-only, edit-mode) and in the
 * Compliance settings Service requirements panel (`embedded`); hidden entirely
 * when compliance is off for the venue.
 */
export function ComplianceRequirementsEditor({ serviceId, complianceEnabled, embedded }: Props) {
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
  // capture_methods per type id, so we know whether a requirement can be collected online.
  const captureMethodsByType = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of typesList.data?.types ?? []) m.set(t.id, t.capture_methods ?? []);
    return m;
  }, [typesList.data]);

  if (!complianceEnabled) return null;

  function patchReq(
    id: string,
    patch: {
      enforcement?: ComplianceEnforcement;
      online_collection?: ComplianceOnlineCollection;
      lock_period_hours?: number | null;
    },
  ) {
    setBusyId(id);
    updateReq.mutate(
      { id, ...patch },
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

  const addButton =
    allTypes.length > 0 ? (
      <Button
        label="Add"
        variant="secondary"
        size="sm"
        disabled={availableTypes.length === 0}
        onPress={() => setAdding(true)}
      />
    ) : undefined;

  const body = (
    <>
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
            {requirements.map((r) => {
              const supportsOnline = typeSupportsClientOnline(
                captureMethodsByType.get(r.compliance_type_id),
              );
              const blocksOnline = r.enforcement === 'block_online' || r.enforcement === 'block_all';
              return (
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
                        label={
                          CATEGORY_LABELS[r.compliance_type_category] ?? r.compliance_type_category
                        }
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
                  <View style={styles.chipWrap}>
                    {COMPLIANCE_ENFORCEMENT_OPTIONS.map((o) => (
                      <Chip
                        key={o.value}
                        label={o.label}
                        selected={r.enforcement === o.value}
                        onPress={() => {
                          if (r.enforcement !== o.value) patchReq(r.id, { enforcement: o.value });
                        }}
                      />
                    ))}
                  </View>
                  {COMPLIANCE_ENFORCEMENT_DESCRIPTIONS[r.enforcement] ? (
                    <Text variant="caption" tone="muted">
                      {COMPLIANCE_ENFORCEMENT_DESCRIPTIONS[r.enforcement]}
                    </Text>
                  ) : null}

                  {/* Lead time (lock_period_hours) */}
                  <View style={styles.subField}>
                    <Text variant="caption" tone="muted">
                      Lead time (hours before the appointment)
                    </Text>
                    <LeadTimeField
                      value={r.lock_period_hours}
                      disabled={busyId === r.id}
                      onCommit={(next) => patchReq(r.id, { lock_period_hours: next })}
                    />
                    <Text variant="caption" tone="muted">
                      Require the record at least this many hours before the visit (for example 48 for
                      a patch test). Leave blank for no lead time.
                    </Text>
                  </View>

                  {/* Online collection mode */}
                  {supportsOnline ? (
                    <View style={styles.subField}>
                      <Text variant="caption" tone="muted">
                        Online booking
                      </Text>
                      <View style={styles.chipWrap}>
                        {COMPLIANCE_ONLINE_COLLECTION_OPTIONS.map((o) => (
                          <Chip
                            key={o.value}
                            label={o.label}
                            selected={r.online_collection === o.value}
                            onPress={() => {
                              if (r.online_collection !== o.value) {
                                patchReq(r.id, { online_collection: o.value });
                              }
                            }}
                          />
                        ))}
                      </View>
                      {COMPLIANCE_ONLINE_COLLECTION_DESCRIPTIONS[r.online_collection] ? (
                        <Text variant="caption" tone="muted">
                          {COMPLIANCE_ONLINE_COLLECTION_DESCRIPTIONS[r.online_collection]}
                        </Text>
                      ) : null}
                      {blocksOnline && r.online_collection === 'none' ? (
                        <Text variant="caption" color={colors.warning}>
                          This blocks online booking but is not offered online, so clients cannot
                          complete it themselves. Choose how it is collected online above, or add an
                          unmet message on the type.
                        </Text>
                      ) : null}
                    </View>
                  ) : (
                    <Text variant="caption" tone="muted">
                      Your team completes this in venue. It is not shown to clients online.
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
    </>
  );

  const sheet = (
    <AddRequirementSheet
      visible={adding}
      onClose={() => setAdding(false)}
      availableTypes={availableTypes}
      submitting={addReq.isPending}
      onAdd={(input) => {
        addReq.mutate(
          {
            service_id: serviceId,
            compliance_type_id: input.typeId,
            enforcement: input.enforcement,
            lock_period_hours: input.lockPeriodHours,
            online_collection: input.onlineCollection,
          },
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
  );

  if (embedded) {
    return (
      <View style={styles.body}>
        {addButton ? <View style={styles.embeddedActions}>{addButton}</View> : null}
        {body}
        {sheet}
      </View>
    );
  }

  return (
    <SectionCard>
      <SectionCard.Header
        eyebrow="Compliance"
        title="Compliance requirements"
        description="Records this service needs before a booking. Missing or expired records warn or block at booking time."
        right={addButton}
      />
      <SectionCard.Body style={styles.body}>{body}</SectionCard.Body>
      {sheet}
    </SectionCard>
  );
}

/**
 * Numeric lead-time input that keeps a local draft and commits (clamped) on blur,
 * skipping no-ops. Reseeds from the persisted value after a successful patch.
 */
function LeadTimeField({
  value,
  disabled,
  onCommit,
}: {
  value: number | null;
  disabled: boolean;
  onCommit: (next: number | null) => void;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState(value == null ? '' : String(value));
  const [seed, setSeed] = useState(value);
  // Render-time reseed when the persisted value changes (after a patch resolves).
  if (value !== seed) {
    setText(value == null ? '' : String(value));
    setSeed(value);
  }

  function commit() {
    const next = parseLeadTime(text);
    // Reflect the clamped value back into the field.
    setText(next == null ? '' : String(next));
    if (next !== (value ?? null)) onCommit(next);
  }

  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onBlur={commit}
      editable={!disabled}
      keyboardType="number-pad"
      placeholder="None"
      placeholderTextColor={colors.textMuted}
      accessibilityLabel="Lead time in hours before the appointment"
      style={[
        styles.leadInput,
        { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    />
  );
}

type AvailableType = { id: string; name: string; capture_methods?: string[] };

function AddRequirementSheet({
  visible,
  onClose,
  availableTypes,
  submitting,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  availableTypes: AvailableType[];
  submitting: boolean;
  onAdd: (input: {
    typeId: string;
    enforcement: ComplianceEnforcement;
    lockPeriodHours: number | null;
    onlineCollection: ComplianceOnlineCollection;
  }) => void;
}) {
  const { colors } = useTheme();
  const [typeId, setTypeId] = useState<string | null>(null);
  const [enforcement, setEnforcement] = useState<ComplianceEnforcement>('warn_staff');
  const [onlineCollection, setOnlineCollection] =
    useState<ComplianceOnlineCollection>('confirmation_link');
  const [leadTime, setLeadTime] = useState('');

  // Reset the picker each time the sheet opens (render-time guard).
  const [wasVisible, setWasVisible] = useState(false);
  if (visible && !wasVisible) {
    setTypeId(null);
    setEnforcement('warn_staff');
    setOnlineCollection('confirmation_link');
    setLeadTime('');
    setWasVisible(true);
  }
  if (!visible && wasVisible) setWasVisible(false);

  const selectedType = availableTypes.find((t) => t.id === typeId);
  const supportsOnline = Boolean(selectedType) && typeSupportsClientOnline(selectedType?.capture_methods);

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
        <View style={styles.chipWrap}>
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
        <View style={styles.chipWrap}>
          {COMPLIANCE_ENFORCEMENT_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              selected={enforcement === o.value}
              onPress={() => setEnforcement(o.value)}
            />
          ))}
        </View>
        {COMPLIANCE_ENFORCEMENT_DESCRIPTIONS[enforcement] ? (
          <Text variant="caption" tone="muted">
            {COMPLIANCE_ENFORCEMENT_DESCRIPTIONS[enforcement]}
          </Text>
        ) : null}

        <Text variant="label" tone="secondary">
          Lead time (hours before the appointment)
        </Text>
        <TextInput
          value={leadTime}
          onChangeText={setLeadTime}
          keyboardType="number-pad"
          placeholder="None"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Lead time in hours before the appointment"
          style={[
            styles.leadInput,
            { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        />
        <Text variant="caption" tone="muted">
          Require the record on file at least this many hours before the visit, for example 48 for a
          patch test. Leave blank for no lead time.
        </Text>

        {supportsOnline ? (
          <>
            <Text variant="label" tone="secondary">
              Online booking
            </Text>
            <View style={styles.chipWrap}>
              {COMPLIANCE_ONLINE_COLLECTION_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={onlineCollection === o.value}
                  onPress={() => setOnlineCollection(o.value)}
                />
              ))}
            </View>
            {COMPLIANCE_ONLINE_COLLECTION_DESCRIPTIONS[onlineCollection] ? (
              <Text variant="caption" tone="muted">
                {COMPLIANCE_ONLINE_COLLECTION_DESCRIPTIONS[onlineCollection]}
              </Text>
            ) : null}
          </>
        ) : null}

        <View style={styles.sheetActions}>
          <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
          <Button
            label={COMPLIANCE_ENFORCEMENT_LABELS[enforcement] ? 'Add requirement' : 'Add'}
            style={styles.flex1}
            loading={submitting}
            disabled={!typeId}
            onPress={() => {
              if (!typeId) return;
              onAdd({
                typeId,
                enforcement,
                lockPeriodHours: parseLeadTime(leadTime),
                onlineCollection: supportsOnline ? onlineCollection : 'none',
              });
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
  embeddedActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  subField: {
    gap: spacing.xs,
  },
  leadInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    fontSize: 16,
    minHeight: 44,
    alignSelf: 'flex-start',
    minWidth: 120,
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
