import { useReducer, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  emptyBuilderState,
  fieldBuilderReducer,
  type FieldBuilderState,
} from '@/lib/compliance/field-builder';
import {
  COMPLIANCE_RESULT_TYPES,
  parseFormSchema,
  validateFormSchemaForType,
  type ComplianceField,
  type ComplianceResultType,
} from '@/lib/compliance/form-schema';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  COMPLIANCE_TYPE_CAPTURE_METHODS,
  COMPLIANCE_TYPE_CATEGORIES,
  FORM_LINK_EXPIRY_MAX,
  FORM_LINK_EXPIRY_MIN,
  useArchiveComplianceType,
  useComplianceTemplateDetail,
  useComplianceTypeVersions,
  useCreateComplianceTemplate,
  useCreateComplianceVersion,
  useDuplicateComplianceType,
  useRestoreComplianceType,
  useRestoreComplianceVersion,
  useUpdateComplianceTemplate,
  VALIDITY_DAYS_MAX,
  type ComplianceTypeCaptureMethod,
  type ComplianceTypeCategory,
} from '@/lib/queries/useComplianceTypeManage';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { ComplianceFieldEditor } from './ComplianceFieldEditor';
import {
  CAPTURE_METHOD_LABELS,
  CATEGORY_LABELS,
  RESULT_TYPE_LABELS,
  validityLabel,
} from './complianceTypeLabels';

type ValidityMode = 'lifetime' | 'per_visit' | 'days';

const VALIDITY_OPTIONS: { value: ValidityMode; label: string }[] = [
  { value: 'lifetime', label: 'No expiry' },
  { value: 'per_visit', label: 'Per visit' },
  { value: 'days', label: 'Expires after' },
];

/** Web builder's parenthetical result-type labels (aligns app ↔ web copy). */
const RESULT_TYPE_DROPDOWN_LABELS: Record<ComplianceResultType, string> = {
  pass_fail: 'Pass / fail (staff decide a result)',
  signed: 'Signed (requires a signature)',
  completed: 'Completed (no result)',
  file_uploaded: 'File upload (requires a file)',
};

/** DD/MM/YYYY for the version-history list. */
function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type Props = {
  visible: boolean;
  /** A type id to edit, or null to CREATE a new type (when `mode === 'create'`). */
  typeId: string | null;
  /** 'create' opens the empty builder; otherwise edits the given typeId. */
  mode?: 'create' | 'edit';
  /** Admins can edit + archive; everyone else gets a read-only view. */
  canEdit: boolean;
  onClose: () => void;
  /** Fired after a successful create/version save so the list can refetch. */
  onSaved?: () => void;
};

/**
 * Compliance template editor — the in-app form builder. Creates a new type
 * (POST /types) or edits an existing one's settings (PATCH /types/[id]) and form
 * fields (POST /types/[id]/versions). Form fields are edited with a real mobile
 * field builder (add/edit/reorder/delete, options, intro markdown, pass/fail
 * result mapping). Non-admins get a read-only summary.
 */
export function ComplianceTypeEditorSheet({
  visible,
  typeId,
  mode = 'edit',
  canEdit,
  onClose,
  onSaved,
}: Props) {
  const { colors } = useTheme();
  const toast = useToast();
  const isCreate = mode === 'create';

  const detail = useComplianceTemplateDetail(visible && !isCreate ? typeId : null);
  const update = useUpdateComplianceTemplate();
  const createType = useCreateComplianceTemplate();
  const createVersion = useCreateComplianceVersion();
  const versionsQuery = useComplianceTypeVersions(visible && !isCreate ? typeId : null);
  const restoreVersion = useRestoreComplianceVersion();
  const duplicateType = useDuplicateComplianceType();
  const archiveType = useArchiveComplianceType();
  const restoreType = useRestoreComplianceType();

  // --- Meta form state, hydrated once per opened template ---
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ComplianceTypeCategory>('test');
  const [resultType, setResultType] = useState<ComplianceResultType>('completed');
  const [validityMode, setValidityMode] = useState<ValidityMode>('lifetime');
  const [validityDaysText, setValidityDaysText] = useState('180');
  const [captureMethods, setCaptureMethods] = useState<ComplianceTypeCaptureMethod[]>([
    'staff_in_venue',
    'client_online',
  ]);
  const [expiryDaysText, setExpiryDaysText] = useState('');
  const [unmetMessage, setUnmetMessage] = useState('');
  const [changelog, setChangelog] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'save' | 'archive' | 'duplicate' | null>(null);

  // --- Field builder state (reducer) ---
  const [builder, dispatch] = useReducer(fieldBuilderReducer, emptyBuilderState);

  // Hydration key distinguishes create-mode from each edited type.
  const targetKey = isCreate ? '__create__' : detail.data?.type.id ?? null;

  if (visible && targetKey && hydratedKey !== targetKey) {
    if (isCreate) {
      setName('');
      setCategory('test');
      setResultType('completed');
      setValidityMode('lifetime');
      setValidityDaysText('180');
      setCaptureMethods(['staff_in_venue', 'client_online']);
      setExpiryDaysText('');
      setUnmetMessage('');
      setChangelog('');
      dispatch({ type: 'hydrate', state: emptyBuilderState });
    } else if (detail.data) {
      const t = detail.data.type;
      setName(t.name);
      setCategory(
        (COMPLIANCE_TYPE_CATEGORIES as readonly string[]).includes(t.category)
          ? (t.category as ComplianceTypeCategory)
          : 'test',
      );
      setResultType(
        (COMPLIANCE_RESULT_TYPES as readonly string[]).includes(t.result_type)
          ? (t.result_type as ComplianceResultType)
          : 'completed',
      );
      setValidityMode(
        t.validity_period_days == null
          ? 'lifetime'
          : t.validity_period_days === 0
            ? 'per_visit'
            : 'days',
      );
      setValidityDaysText(
        t.validity_period_days != null && t.validity_period_days > 0
          ? String(t.validity_period_days)
          : '180',
      );
      setCaptureMethods(
        (t.capture_methods ?? []).filter((m): m is ComplianceTypeCaptureMethod =>
          (COMPLIANCE_TYPE_CAPTURE_METHODS as readonly string[]).includes(m),
        ),
      );
      setExpiryDaysText(t.form_link_expiry_days != null ? String(t.form_link_expiry_days) : '');
      setUnmetMessage(t.online_unmet_message ?? '');
      setChangelog('');
      // Hydrate the field builder from the current version's schema.
      const raw = detail.data.version?.form_schema;
      const parsed = raw ? parseFormSchema(raw) : null;
      const hydrated: FieldBuilderState =
        parsed && parsed.ok
          ? {
              fields: parsed.schema.fields,
              description: parsed.schema.description ?? '',
              introMarkdown: parsed.schema.intro_markdown ?? '',
              resultMapping: parsed.schema.result_mapping,
            }
          : {
              // Fall back to the loosely-typed stored fields so a legacy schema
              // still renders rather than wiping the builder.
              fields: (raw?.fields ?? []) as ComplianceField[],
              description: raw?.description ?? '',
              introMarkdown: raw?.intro_markdown ?? '',
              resultMapping: undefined,
            };
      dispatch({ type: 'hydrate', state: hydrated });
    }
    setErrors([]);
    setConfirmingArchive(false);
    setHydratedKey(targetKey);
  }
  if (!visible && hydratedKey !== null) {
    setHydratedKey(null);
  }

  const type = isCreate ? null : detail.data?.type ?? null;
  const version = isCreate ? null : detail.data?.version ?? null;
  const isArchived = type ? !type.is_active : false;

  function toggleCaptureMethod(method: ComplianceTypeCaptureMethod) {
    setCaptureMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method],
    );
  }

  /** Validate meta + schema. Returns parsed numeric fields + the built schema. */
  function validateAll(): {
    ok: boolean;
    validityDays: number | null;
    expiryDays: number | null;
  } {
    const problems: string[] = [];

    if (!name.trim()) problems.push('Give the template a name.');
    if (captureMethods.length === 0) problems.push('Choose at least one capture method.');

    let validityDays: number | null = null;
    if (validityMode === 'per_visit') {
      validityDays = 0;
    } else if (validityMode === 'days') {
      const parsed = Number(validityDaysText.trim());
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > VALIDITY_DAYS_MAX) {
        problems.push(`Validity must be a whole number of days (1–${VALIDITY_DAYS_MAX}).`);
      } else {
        validityDays = parsed;
      }
    }

    let expiryDays: number | null = null;
    if (expiryDaysText.trim() !== '') {
      const parsed = Number(expiryDaysText.trim());
      if (!Number.isInteger(parsed) || parsed < FORM_LINK_EXPIRY_MIN || parsed > FORM_LINK_EXPIRY_MAX) {
        problems.push(
          `Form link expiry must be between ${FORM_LINK_EXPIRY_MIN} and ${FORM_LINK_EXPIRY_MAX} days.`,
        );
      } else {
        expiryDays = parsed;
      }
    }

    if (builder.fields.length === 0) {
      problems.push('Add at least one form field.');
    } else {
      // Run the ported cross-field schema validation against the result type.
      const schema = buildSchema();
      const validation = validateFormSchemaForType(schema, resultType);
      problems.push(...validation.errors);
    }

    setErrors(problems);
    return { ok: problems.length === 0, validityDays, expiryDays };
  }

  function buildSchema() {
    return {
      schema_version: '1.0' as const,
      title: name.trim() || 'Untitled form',
      description: builder.description.trim() || undefined,
      intro_markdown: builder.introMarkdown.trim() || undefined,
      fields: builder.fields,
      result_mapping: resultType === 'pass_fail' ? builder.resultMapping : undefined,
    };
  }

  function handleSave() {
    const { ok, validityDays, expiryDays } = validateAll();
    if (!ok) {
      hapticWarning();
      return;
    }
    const schema = buildSchema();
    setPendingAction('save');

    if (isCreate) {
      createType.mutate(
        {
          name: name.trim(),
          category,
          description: builder.description.trim() ? builder.description.trim() : null,
          result_type: resultType,
          validity_period_days: validityDays,
          capture_methods: captureMethods,
          form_link_expiry_days: expiryDays,
          online_unmet_message: unmetMessage.trim() ? unmetMessage.trim() : null,
          form_schema: schema,
        },
        {
          onSuccess: () => {
            setPendingAction(null);
            hapticSuccess();
            toast.success(`${name.trim()} created.`);
            onSaved?.();
            onClose();
          },
          onError: (error) => {
            setPendingAction(null);
            hapticWarning();
            setErrors([error instanceof ApiError ? error.message : 'Could not create the type.']);
          },
        },
      );
      return;
    }

    if (!type) return;
    // Edit: PATCH non-schema settings, then publish a new form version.
    update.mutate(
      {
        typeId: type.id,
        patch: {
          name: name.trim(),
          category,
          description: builder.description.trim() ? builder.description.trim() : null,
          validity_period_days: validityDays,
          capture_methods: captureMethods,
          form_link_expiry_days: expiryDays,
          online_unmet_message: unmetMessage.trim() ? unmetMessage.trim() : null,
        },
      },
      {
        onSuccess: () => {
          createVersion.mutate(
            { typeId: type.id, formSchema: schema, changelog: changelog.trim() || undefined },
            {
              onSuccess: () => {
                setPendingAction(null);
                hapticSuccess();
                toast.success('Template saved.');
                onSaved?.();
                onClose();
              },
              onError: (error) => {
                setPendingAction(null);
                hapticWarning();
                setErrors([
                  error instanceof ApiError ? error.message : 'Could not save the form fields.',
                ]);
              },
            },
          );
        },
        onError: (error) => {
          setPendingAction(null);
          hapticWarning();
          setErrors([error instanceof ApiError ? error.message : 'Could not save the template.']);
        },
      },
    );
  }

  /** Archive/restore via the dedicated routes (writes archived_at + the audit event). */
  function handleArchiveToggle() {
    if (!type) return;
    setPendingAction('archive');
    const mutation = isArchived ? restoreType : archiveType;
    mutation.mutate(type.id, {
      onSuccess: () => {
        setPendingAction(null);
        setConfirmingArchive(false);
        hapticSuccess();
        onSaved?.();
      },
      onError: (error) => {
        setPendingAction(null);
        setConfirmingArchive(false);
        hapticWarning();
        setErrors([error instanceof ApiError ? error.message : 'Could not update the template.']);
      },
    });
  }

  function handleDuplicate() {
    if (!type) return;
    setPendingAction('duplicate');
    duplicateType.mutate(type.id, {
      onSuccess: () => {
        setPendingAction(null);
        hapticSuccess();
        toast.success(`${type.name} duplicated.`);
        onSaved?.();
        onClose();
      },
      onError: (error) => {
        setPendingAction(null);
        hapticWarning();
        setErrors([error instanceof ApiError ? error.message : 'Could not duplicate the type.']);
      },
    });
  }

  function handleRestoreVersion(versionId: string) {
    if (!type) return;
    setRestoringVersionId(versionId);
    restoreVersion.mutate(
      { typeId: type.id, versionId },
      {
        onSuccess: async () => {
          hapticSuccess();
          toast.success('Version restored.');
          // Restore re-publishes as a new current version; re-hydrate the builder from it.
          await detail.refetch();
          setHydratedKey(null);
          void versionsQuery.refetch();
          setRestoringVersionId(null);
          onSaved?.();
        },
        onError: (error) => {
          setRestoringVersionId(null);
          hapticWarning();
          setErrors([error instanceof ApiError ? error.message : 'Could not restore the version.']);
        },
      },
    );
  }

  const saving =
    pendingAction === 'save' &&
    (createType.isPending || update.isPending || createVersion.isPending);
  const archiving = pendingAction === 'archive' && (archiveType.isPending || restoreType.isPending);
  const duplicating = pendingAction === 'duplicate' && duplicateType.isPending;
  const loadingDetail = !isCreate && detail.isLoading;
  const detailError = !isCreate && (detail.isError || !type);

  return (
    <Sheet visible={visible} onClose={onClose} fill maxHeight="92%">
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text variant="subheading" numberOfLines={1} style={styles.headerTitle}>
            {isCreate ? 'New compliance type' : type?.name ?? 'Compliance template'}
          </Text>
          {version ? <Badge label={`v${version.version_number}`} tone="neutral" /> : null}
          {isArchived ? <Badge label="Archived" tone="warning" /> : null}
        </View>
        <Text variant="bodySmall" tone="muted">
          {!canEdit
            ? 'Only venue admins can edit compliance templates.'
            : isCreate
              ? 'Build the form clients or staff will complete.'
              : 'Edit the settings and form fields. Saving publishes a new version.'}
        </Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        {loadingDetail ? (
          <Text variant="bodySmall" tone="muted">
            Loading template…
          </Text>
        ) : detailError ? (
          <Text variant="bodySmall" tone="danger">
            {detail.error instanceof ApiError ? detail.error.message : 'Could not load the template.'}
          </Text>
        ) : canEdit ? (
          <>
            <Input
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. PPD Patch Test"
              autoCapitalize="sentences"
            />

            {/* Category */}
            <View style={styles.fieldBlock}>
              <Text variant="label" tone="secondary">
                Category
              </Text>
              <View style={styles.chipWrap}>
                {COMPLIANCE_TYPE_CATEGORIES.map((c) => (
                  <Chip
                    key={c}
                    label={CATEGORY_LABELS[c] ?? c}
                    selected={category === c}
                    onPress={() => setCategory(c)}
                  />
                ))}
              </View>
            </View>

            {/* Result type — editable on create, immutable on edit (web parity) */}
            <View style={styles.fieldBlock}>
              <Text variant="label" tone="secondary">
                Result type
              </Text>
              {isCreate ? (
                <View style={styles.chipWrap}>
                  {COMPLIANCE_RESULT_TYPES.map((r) => (
                    <Chip
                      key={r}
                      label={RESULT_TYPE_DROPDOWN_LABELS[r]}
                      selected={resultType === r}
                      onPress={() => {
                        setResultType(r);
                        // Auto-wire a staff-only Pass/Fail result field so a valid
                        // pass_fail form exists immediately (web parity).
                        if (r === 'pass_fail') dispatch({ type: 'ensureResultField' });
                      }}
                    />
                  ))}
                </View>
              ) : (
                <View
                  style={[
                    styles.readonlyBox,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}>
                  <Text variant="body">{RESULT_TYPE_DROPDOWN_LABELS[resultType]}</Text>
                </View>
              )}
              <Text variant="caption" tone="muted">
                {isCreate
                  ? 'Determines how the record result is recorded.'
                  : "Result type can't change after creation."}
              </Text>
            </View>

            {/* Validity */}
            <View style={styles.fieldBlock}>
              <Text variant="label" tone="secondary">
                Validity
              </Text>
              <Segmented options={VALIDITY_OPTIONS} value={validityMode} onChange={setValidityMode} />
              {validityMode === 'days' ? (
                <Input
                  label="Days valid"
                  value={validityDaysText}
                  onChangeText={setValidityDaysText}
                  keyboardType="number-pad"
                  helper="Records expire this many days after capture."
                />
              ) : (
                <Text variant="caption" tone="muted">
                  {validityMode === 'lifetime'
                    ? 'Records never expire.'
                    : 'Single-use — a new record is needed for every visit.'}
                </Text>
              )}
            </View>

            {/* Capture methods */}
            <View style={styles.fieldBlock}>
              <Text variant="label" tone="secondary">
                Captured by
              </Text>
              <View style={styles.chipWrap}>
                {COMPLIANCE_TYPE_CAPTURE_METHODS.map((m) => (
                  <Chip
                    key={m}
                    label={CAPTURE_METHOD_LABELS[m] ?? m}
                    selected={captureMethods.includes(m)}
                    onPress={() => toggleCaptureMethod(m)}
                  />
                ))}
              </View>
            </View>

            <Input
              label="Form link expiry (days)"
              value={expiryDaysText}
              onChangeText={setExpiryDaysText}
              keyboardType="number-pad"
              placeholder="Default"
              helper="How long a client form link stays valid. Leave blank for the venue default."
            />

            <Input
              label="Message when online booking is blocked"
              value={unmetMessage}
              onChangeText={setUnmetMessage}
              placeholder="e.g. Please call us to arrange your patch test before booking."
              helper="Shown to clients who can't book online until this is on file. Max 500 characters."
              multiline
              maxLength={500}
              optional
            />

            {/* Form field builder */}
            <View
              style={[styles.builderDivider, { borderTopColor: colors.border }]}
              accessibilityRole="none"
            />
            <ComplianceFieldEditor
              state={builder}
              dispatch={dispatch}
              isPassFail={resultType === 'pass_fail'}
            />

            {!isCreate ? (
              <Input
                label="What changed"
                value={changelog}
                onChangeText={setChangelog}
                placeholder="e.g. Added a new consent question"
                helper="Saved with this version in the history below."
                optional
              />
            ) : null}

            {!isCreate && (versionsQuery.data?.versions.length ?? 0) > 1 ? (
              <View style={styles.fieldBlock}>
                <Text variant="label" tone="secondary">
                  Version history
                </Text>
                <Text variant="caption" tone="muted">
                  Restoring re-publishes an earlier form as the current version. Unsaved edits above
                  are discarded.
                </Text>
                <View
                  style={[
                    styles.readonlyBox,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}>
                  {(versionsQuery.data?.versions ?? []).map((v, idx) => {
                    const isCurrent = v.version_number === version?.version_number;
                    return (
                      <View
                        key={v.id}
                        style={[
                          styles.versionRow,
                          idx > 0 && {
                            borderTopColor: colors.border,
                            borderTopWidth: StyleSheet.hairlineWidth,
                          },
                        ]}>
                        <View style={styles.versionText}>
                          <Text variant="bodySmall">
                            v{v.version_number}
                            {isCurrent ? ' · current' : ''}
                          </Text>
                          <Text variant="caption" tone="muted" numberOfLines={2}>
                            {formatVersionDate(v.created_at)}
                            {v.changelog ? ` · ${v.changelog}` : ''}
                          </Text>
                        </View>
                        {!isCurrent ? (
                          <Button
                            label="Restore"
                            variant="ghost"
                            size="sm"
                            loading={restoringVersionId === v.id}
                            disabled={restoringVersionId !== null}
                            onPress={() => handleRestoreVersion(v.id)}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </>
        ) : (
          /* Read-only summary for non-admins */
          <ReadonlySummary
            type={type!}
            version={version}
            fields={builder.fields}
          />
        )}

        {/* Inline errors — never Alert-only feedback */}
        {errors.length > 0 ? (
          <View
            style={[styles.errorBox, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}>
            {errors.map((e) => (
              <Text key={e} variant="caption" tone="danger">
                {e}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Archive / restore — admin only, edit mode only */}
        {canEdit && !isCreate && type ? (
          <View style={styles.archiveBlock}>
            <Button
              label="Duplicate this type"
              variant="ghost"
              size="sm"
              loading={duplicating}
              disabled={duplicating}
              onPress={handleDuplicate}
            />
            {confirmingArchive && !isArchived ? (
              <>
                <Text variant="caption" tone="muted">
                  Archiving hides this template from capture and new requirements. Existing records
                  are kept.
                </Text>
                <View style={styles.archiveRow}>
                  <Button
                    label="Archive template"
                    variant="danger"
                    size="sm"
                    loading={archiving}
                    onPress={handleArchiveToggle}
                    style={styles.archiveBtn}
                  />
                  <Button
                    label="Keep active"
                    variant="secondary"
                    size="sm"
                    disabled={archiving}
                    onPress={() => setConfirmingArchive(false)}
                    style={styles.archiveBtn}
                  />
                </View>
              </>
            ) : (
              <Button
                label={isArchived ? 'Restore template' : 'Archive template'}
                variant={isArchived ? 'secondary' : 'ghost'}
                size="sm"
                loading={archiving}
                onPress={() => {
                  if (isArchived) handleArchiveToggle();
                  else setConfirmingArchive(true);
                }}
              />
            )}
          </View>
        ) : null}

        <View style={styles.spacer} />
      </ScrollView>

      {/* Footer */}
      <View
        style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
        <Button
          label={canEdit ? 'Cancel' : 'Close'}
          variant="secondary"
          onPress={onClose}
          style={styles.footerBtn}
        />
        {canEdit ? (
          <Button
            label={isCreate ? 'Create type' : 'Save changes'}
            variant="primary"
            loading={saving}
            disabled={loadingDetail || detailError}
            onPress={handleSave}
            style={styles.footerBtnPrimary}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

function ReadonlySummary({
  type,
  version,
  fields,
}: {
  type: {
    category: string;
    result_type: string;
    validity_period_days: number | null;
    capture_methods: string[];
    form_link_expiry_days: number | null;
    description: string | null;
    online_unmet_message?: string | null;
  };
  version: { version_number: number } | null;
  fields: ComplianceField[];
}) {
  const { colors } = useTheme();
  return (
    <>
      <View style={[styles.readonlyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ReadonlyRow label="Category" value={CATEGORY_LABELS[type.category] ?? type.category} />
        <ReadonlyRow
          label="Result type"
          value={RESULT_TYPE_LABELS[type.result_type] ?? type.result_type}
        />
        <ReadonlyRow label="Validity" value={validityLabel(type.validity_period_days)} />
        <ReadonlyRow
          label="Captured by"
          value={
            (type.capture_methods ?? []).map((m) => CAPTURE_METHOD_LABELS[m] ?? m).join(', ') || '—'
          }
        />
        <ReadonlyRow
          label="Form link expiry"
          value={type.form_link_expiry_days != null ? `${type.form_link_expiry_days} days` : 'Venue default'}
        />
        {type.description ? <ReadonlyRow label="Description" value={type.description} /> : null}
        {type.online_unmet_message ? (
          <ReadonlyRow label="Online block message" value={type.online_unmet_message} />
        ) : null}
      </View>

      <View style={styles.fieldBlock}>
        <Text variant="label" tone="secondary">
          Form fields{version ? ` (v${version.version_number})` : ''}
        </Text>
        {fields.length === 0 ? (
          <Text variant="caption" tone="muted">
            This template has no form fields.
          </Text>
        ) : (
          <View style={[styles.readonlyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {fields.map((field, index) => (
              <View
                key={field.id}
                style={[
                  styles.fieldRow,
                  index > 0 && {
                    borderTopColor: colors.border,
                    borderTopWidth: StyleSheet.hairlineWidth,
                  },
                ]}>
                <View style={styles.fieldRowText}>
                  <Text variant="bodySmall" numberOfLines={2}>
                    {field.label}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {field.type}
                    {field.required ? ' · required' : ''}
                    {field.staff_only ? ' · staff only' : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </>
  );
}

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readonlyRow}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="bodySmall">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
    gap: spacing.base,
  },
  fieldBlock: {
    gap: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  readonlyBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  readonlyRow: {
    gap: 1,
    paddingVertical: spacing.xs,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  fieldRowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  builderDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
  },
  errorBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  archiveBlock: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  archiveRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  archiveBtn: {
    flexGrow: 0,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  versionText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: {
    flex: 1,
  },
  footerBtnPrimary: {
    flex: 2,
  },
  spacer: {
    height: spacing.xl,
  },
});
