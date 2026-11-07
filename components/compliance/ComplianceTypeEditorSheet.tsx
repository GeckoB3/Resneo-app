import { useReducer, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

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
  COMPLIANCE_TYPE_CATEGORIES,
  FORM_LINK_EXPIRY_MAX,
  FORM_LINK_EXPIRY_MIN,
  useArchiveComplianceType,
  useComplianceTemplateDetail,
  useComplianceTypeVersions,
  useCreateComplianceTemplate,
  useDuplicateComplianceType,
  useRestoreComplianceType,
  useRestoreComplianceVersion,
  useUpdateComplianceTemplate,
  VALIDITY_DAYS_MAX,
  type ComplianceLibraryTemplate,
  type ComplianceTypeCaptureMethod,
  type ComplianceTypeCategory,
} from '@/lib/queries/useComplianceTypeManage';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import type { ChooseServicesForm } from './ComplianceChooseServicesSheet';
import { ComplianceFieldEditor } from './ComplianceFieldEditor';
import { CATEGORY_LABELS, RESULT_TYPE_LABELS, validityLabel } from './complianceTypeLabels';

type ValidityMode = 'lifetime' | 'per_visit' | 'days';

const VALIDITY_OPTIONS: { value: ValidityMode; label: string }[] = [
  { value: 'lifetime', label: 'No expiry' },
  { value: 'per_visit', label: 'Per visit' },
  { value: 'days', label: 'Expires after a number of days' },
];

/**
 * The one "Captured by" choice (web parity, 2026-11-07): the team can always fill a form in or
 * send a link, so staff capture is always on and only online completion by clients is a choice.
 */
function captureMethodsFor(clientsOnline: boolean): ComplianceTypeCaptureMethod[] {
  return ['staff_in_venue', ...(clientsOnline ? (['client_online'] as const) : [])];
}

/** "Archive {name}?" body: how many services ask for the form ("all bookings" counts as one). */
function archiveConfirmBody(serviceCount: number): string {
  const services = serviceCount === 1 ? '1 service' : `${serviceCount} services`;
  return `It is asked for on ${services}. Archiving stops it being asked for. Records are kept, and you can restore it at any time.`;
}

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
  /**
   * Create only: start from this library template, pre-filled so it can be changed before it is
   * created (web parity, 2026-11-07). Creating makes the venue's own form; the template never changes.
   */
  template?: ComplianceLibraryTemplate | null;
  /** Admins can edit + archive; everyone else gets a read-only view. */
  canEdit: boolean;
  /**
   * How many requirement rows ask for this form (the list's `service_requirement_count`; the
   * "All bookings" row counts as one). Archiving a form some service asks for confirms first.
   */
  serviceCount?: number;
  onClose: () => void;
  /** Fired after a successful create/version save so the list can refetch. */
  onSaved?: () => void;
  /** Open another form in the editor: Duplicate opens the copy (web parity, 2026-11-07). */
  onOpenType?: (typeId: string) => void;
  /**
   * A form was just created: ask which services need it (web parity, 2026-11-07). Given, it takes
   * the place of `onClose` after a create, so the parent closes the editor and then opens Choose
   * services on the new form. Without it the editor closes and says the form was created.
   */
  onCreated?: (form: ChooseServicesForm) => void;
  /**
   * "Choose services" for the open, active form. The parent closes the editor and then opens that
   * sheet, since one sheet cannot open over another. No button without it.
   */
  onChooseServices?: (form: ChooseServicesForm) => void;
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
  template = null,
  canEdit,
  serviceCount = 0,
  onClose,
  onSaved,
  onOpenType,
  onCreated,
  onChooseServices,
}: Props) {
  const { colors } = useTheme();
  const toast = useToast();
  const isCreate = mode === 'create';

  const detail = useComplianceTemplateDetail(visible && !isCreate ? typeId : null);
  // The result type can change until the first record is saved with this form (always, when creating).
  // An older web build sends no flag, which reads as locked.
  const resultTypeLocked = !isCreate && (detail.data?.result_type_locked ?? true);
  const update = useUpdateComplianceTemplate();
  const createType = useCreateComplianceTemplate();
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
  // "Clients can fill this in online": on by default.
  const [clientsOnline, setClientsOnline] = useState(true);
  const [expiryDaysText, setExpiryDaysText] = useState('');
  const [unmetMessage, setUnmetMessage] = useState('');
  const [changelog, setChangelog] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const bodyScrollRef = useRef<ScrollView>(null);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'save' | 'archive' | 'duplicate' | null>(null);

  // --- Field builder state (reducer) ---
  const [builder, dispatch] = useReducer(fieldBuilderReducer, emptyBuilderState);

  // Hydration key distinguishes create-mode from each edited type.
  const targetKey = isCreate ? `__create__${template ? `:${template.slug}` : ''}` : detail.data?.type.id ?? null;

  if (visible && targetKey && hydratedKey !== targetKey) {
    if (isCreate) {
      setName('');
      setCategory('test');
      setResultType('completed');
      setValidityMode('lifetime');
      setValidityDaysText('180');
      setClientsOnline(true);
      setExpiryDaysText('');
      setUnmetMessage('');
      setChangelog('');
      dispatch({ type: 'hydrate', state: emptyBuilderState });
      if (template) {
        // A copy of the library template, to change before it is created.
        setName(template.name);
        if ((COMPLIANCE_TYPE_CATEGORIES as readonly string[]).includes(template.category)) {
          setCategory(template.category as ComplianceTypeCategory);
        }
        if ((COMPLIANCE_RESULT_TYPES as readonly string[]).includes(template.result_type)) {
          setResultType(template.result_type as ComplianceResultType);
        }
        setValidityMode(
          template.validity_period_days == null
            ? 'lifetime'
            : template.validity_period_days === 0
              ? 'per_visit'
              : 'days',
        );
        if (template.validity_period_days != null && template.validity_period_days > 0) {
          setValidityDaysText(String(template.validity_period_days));
        }
        setClientsOnline((template.capture_methods ?? []).includes('client_online'));
        const parsedTemplate = template.form_schema ? parseFormSchema(template.form_schema) : null;
        if (parsedTemplate && parsedTemplate.ok) {
          dispatch({
            type: 'hydrate',
            state: {
              fields: parsedTemplate.schema.fields.map((f) => ({ ...f })),
              description: parsedTemplate.schema.description ?? template.description ?? '',
              introMarkdown: parsedTemplate.schema.intro_markdown ?? '',
              resultMapping: parsedTemplate.schema.result_mapping,
            },
          });
        }
      }
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
      setClientsOnline((t.capture_methods ?? []).includes('client_online'));
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

  /** Validate meta + schema. Returns parsed numeric fields + the built schema. */
  function validateAll(): {
    ok: boolean;
    validityDays: number | null;
    expiryDays: number | null;
  } {
    const problems: string[] = [];

    if (!name.trim()) problems.push('Give the form a name.');

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
      problems.push('Add at least one question.');
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
          capture_methods: captureMethodsFor(clientsOnline),
          form_link_expiry_days: expiryDays,
          online_unmet_message: unmetMessage.trim() ? unmetMessage.trim() : null,
          form_schema: schema,
          ...(template ? { library_template_slug: template.slug } : {}),
        },
        {
          onSuccess: (created) => {
            setPendingAction(null);
            hapticSuccess();
            onSaved?.();
            // Straight on to which services need it (web parity, 2026-11-07). Its title says the
            // form is ready, so there is no toast, which would be drawn behind that sheet anyway.
            const createdId = created?.type?.id;
            if (createdId && onCreated) {
              onCreated({
                id: createdId,
                name: created.type.name ?? name.trim(),
                clientOnline: clientsOnline,
              });
              return;
            }
            toast.success(`${name.trim()} created.`);
            onClose();
          },
          onError: (error) => {
            setPendingAction(null);
            hapticWarning();
            setErrors([error instanceof ApiError ? error.message : 'Could not create the form.']);
          },
        },
      );
      return;
    }

    if (!type) return;
    // Edit: a single atomic PATCH (web audit U7). The route publishes the new form
    // version FIRST, so an invalid schema aborts before any metadata change — no
    // split-write where settings persist but the form fields do not.
    update.mutate(
      {
        typeId: type.id,
        patch: {
          name: name.trim(),
          category,
          description: builder.description.trim() ? builder.description.trim() : null,
          // Unchanged unless the form has no records yet; the web refuses a change after that.
          ...(resultTypeLocked ? {} : { result_type: resultType }),
          validity_period_days: validityDays,
          capture_methods: captureMethodsFor(clientsOnline),
          form_link_expiry_days: expiryDays,
          online_unmet_message: unmetMessage.trim() ? unmetMessage.trim() : null,
          form_schema: schema,
          changelog: changelog.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setPendingAction(null);
          hapticSuccess();
          toast.success('Form saved.');
          onSaved?.();
          onClose();
        },
        onError: (error) => {
          setPendingAction(null);
          hapticWarning();
          setErrors([error instanceof ApiError ? error.message : 'Could not save the form.']);
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
        setErrors([error instanceof ApiError ? error.message : 'Could not update the form.']);
      },
    });
  }

  /**
   * Archiving a form some service asks for stops it being asked for, so it confirms first; a form
   * no service uses archives at once, and Restore never asks (web parity, 2026-11-07).
   */
  function handleArchivePress() {
    if (!isArchived && serviceCount > 0) {
      setConfirmingArchive(true);
      // The confirmation sits at the foot of the form; bring its buttons out from behind the footer.
      setTimeout(() => bodyScrollRef.current?.scrollToEnd({ animated: true }), 50);
    } else handleArchiveToggle();
  }

  /** Duplicate, then open the copy in the editor so it can be changed at once (web parity). */
  function handleDuplicate() {
    if (!type) return;
    setPendingAction('duplicate');
    duplicateType.mutate(type.id, {
      onSuccess: (copy) => {
        setPendingAction(null);
        hapticSuccess();
        toast.success('Copy made. Change anything you like.');
        onSaved?.();
        const copyId = copy?.type?.id;
        if (copyId && onOpenType) onOpenType(copyId);
        else onClose();
      },
      onError: (error) => {
        setPendingAction(null);
        hapticWarning();
        setErrors([error instanceof ApiError ? error.message : 'Could not duplicate the form.']);
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

  const saving = pendingAction === 'save' && (createType.isPending || update.isPending);
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
            {isCreate ? (template ? 'New form from a template' : 'New form') : type?.name ?? 'Edit form'}
          </Text>
          {version ? <Badge label={`v${version.version_number}`} tone="neutral" /> : null}
          {isArchived ? <Badge label="Archived" tone="warning" /> : null}
        </View>
        <Text variant="bodySmall" tone="muted">
          {!canEdit
            ? 'Only admins can edit forms.'
            : isCreate
              ? template
                ? `Starting from the library template ${template.name}. Change anything you like, then tap Create form. This makes your own form; the library template stays as it is.`
                : 'Build the form clients or staff will complete.'
              : 'Edit the settings and questions. Saving publishes a new version.'}
        </Text>
      </View>

      <ScrollView
        ref={bodyScrollRef}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        {loadingDetail ? (
          <Text variant="bodySmall" tone="muted">
            Loading form…
          </Text>
        ) : detailError ? (
          <Text variant="bodySmall" tone="danger">
            {detail.error instanceof ApiError ? detail.error.message : 'Could not load the form.'}
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
              <Text variant="caption" tone="muted">
                Only used to group your forms.
              </Text>
            </View>

            {/* Result type: editable until the first record is saved with this form (web parity) */}
            <View style={styles.fieldBlock}>
              <Text variant="label" tone="secondary">
                Result type
              </Text>
              {!resultTypeLocked ? (
                <View style={styles.chipWrap}>
                  {COMPLIANCE_RESULT_TYPES.map((r) => (
                    <Chip
                      key={r}
                      label={RESULT_TYPE_DROPDOWN_LABELS[r]}
                      selected={resultType === r}
                      onPress={() => {
                        setResultType(r);
                        // Add the question the result type needs (a signature, a file upload, or a
                        // staff Result wired to pass and fail), so the form is valid at once (web parity).
                        dispatch({ type: 'ensureFieldsForResultType', resultType: r });
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
              <Text variant="caption" tone="muted" testID="result-type-hint">
                {isCreate
                  ? 'Determines how the record result is recorded. You can change this until the first record is saved with this form.'
                  : resultTypeLocked
                    ? 'This cannot change now that records have been saved with this form, because it decides whether they count. To use a different result type, duplicate the form.'
                    : 'You can change this until the first record is saved with this form.'}
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
                    : 'Single-use: a new record is needed for every visit.'}
                </Text>
              )}
              {!isCreate ? (
                <Text variant="caption" tone="muted" testID="validity-edit-hint">
                  Changes apply to records collected from now on. Records you already hold keep their
                  expiry date.
                </Text>
              ) : null}
            </View>

            {/* Captured by: one choice (web parity, 2026-11-07). */}
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text variant="bodyMedium">Clients can fill this in online</Text>
                <Text variant="caption" tone="muted">
                  Your team can always fill it in at your business or send the client a link.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Clients can fill this in online"
                value={clientsOnline}
                onValueChange={setClientsOnline}
                trackColor={{ true: colors.brand, false: colors.border }}
                thumbColor={colors.surfaceRaised}
              />
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
              helper="Shown when a client can't book online because this form is missing and they can't fill it in themselves. It replaces the standard wording, which asks them to contact you, so add your number if you want them to call."
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
            <View style={styles.formActions}>
              {/* Which services ask for this form, in one place (web parity, 2026-11-07). */}
              {!isArchived && onChooseServices ? (
                <Button
                  label="Choose services"
                  variant="ghost"
                  size="sm"
                  onPress={() =>
                    onChooseServices({
                      id: type.id,
                      name: type.name,
                      clientOnline: (type.capture_methods ?? ['client_online']).includes('client_online'),
                    })
                  }
                />
              ) : null}
              <Button
                label="Duplicate"
                variant="ghost"
                size="sm"
                loading={duplicating}
                disabled={duplicating}
                onPress={handleDuplicate}
              />
            </View>
            {confirmingArchive && !isArchived ? (
              <View
                testID="archive-confirm"
                style={[
                  styles.archiveConfirm,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                <Text variant="bodyMedium">{`Archive ${type.name}?`}</Text>
                <Text variant="caption" tone="muted">
                  {archiveConfirmBody(serviceCount)}
                </Text>
                <View style={styles.archiveRow}>
                  <Button
                    label="Archive"
                    variant="danger"
                    size="sm"
                    loading={archiving}
                    onPress={handleArchiveToggle}
                    style={styles.archiveBtn}
                  />
                  <Button
                    label="Cancel"
                    variant="secondary"
                    size="sm"
                    disabled={archiving}
                    onPress={() => setConfirmingArchive(false)}
                    style={styles.archiveBtn}
                  />
                </View>
              </View>
            ) : (
              <Button
                label={isArchived ? 'Restore' : 'Archive'}
                variant={isArchived ? 'secondary' : 'ghost'}
                size="sm"
                loading={archiving}
                onPress={handleArchivePress}
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
            label={isCreate ? 'Create form' : 'Save changes'}
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
          label="Clients can fill this in online"
          value={(type.capture_methods ?? []).includes('client_online') ? 'Yes' : 'No'}
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
            This form has no questions.
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
  formActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  archiveConfirm: {
    alignSelf: 'stretch',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  archiveRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  switchText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
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
