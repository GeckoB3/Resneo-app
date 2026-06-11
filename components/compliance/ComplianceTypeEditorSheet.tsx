import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  COMPLIANCE_TYPE_CAPTURE_METHODS,
  COMPLIANCE_TYPE_CATEGORIES,
  FORM_LINK_EXPIRY_MAX,
  FORM_LINK_EXPIRY_MIN,
  useComplianceTemplateDetail,
  useUpdateComplianceTemplate,
  VALIDITY_DAYS_MAX,
  type ComplianceTypeCaptureMethod,
  type ComplianceTypeCategory,
} from '@/lib/queries/useComplianceTypeManage';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import {
  CAPTURE_METHOD_LABELS,
  CATEGORY_LABELS,
  FIELD_TYPE_LABELS,
  RESULT_TYPE_DESCRIPTIONS,
  RESULT_TYPE_LABELS,
  validityLabel,
} from './complianceTypeLabels';

type ValidityMode = 'lifetime' | 'per_visit' | 'days';

const VALIDITY_OPTIONS: { value: ValidityMode; label: string }[] = [
  { value: 'lifetime', label: 'No expiry' },
  { value: 'per_visit', label: 'Per visit' },
  { value: 'days', label: 'Expires after' },
];

type Props = {
  visible: boolean;
  typeId: string | null;
  /** Admins can edit + archive; everyone else gets a read-only view. */
  canEdit: boolean;
  onClose: () => void;
};

/**
 * Compliance template editor — the Bearer-accessible subset of the web's
 * form-builder page. Edits the template's settings (name, category, validity,
 * capture methods, description, link expiry) and archives/restores via
 * PATCH /api/venue/compliance/types/[id]. Form FIELDS are immutable versions
 * created by the web form builder (cookie-only route), so they render
 * read-only here with a "manage on the web dashboard" note.
 */
export function ComplianceTypeEditorSheet({ visible, typeId, canEdit, onClose }: Props) {
  const { colors } = useTheme();
  const detail = useComplianceTemplateDetail(visible ? typeId : null);
  const update = useUpdateComplianceTemplate();

  // --- Form state, hydrated once per opened template ---
  const [hydratedTypeId, setHydratedTypeId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ComplianceTypeCategory>('test');
  const [validityMode, setValidityMode] = useState<ValidityMode>('lifetime');
  const [validityDaysText, setValidityDaysText] = useState('180');
  const [captureMethods, setCaptureMethods] = useState<ComplianceTypeCaptureMethod[]>([]);
  const [description, setDescription] = useState('');
  const [expiryDaysText, setExpiryDaysText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'archive' | null>(null);

  // Derived-state hydration (guarded render-time setState — same pattern as
  // SessionSettingsSheet; avoids an effect and never loops).
  if (visible && detail.data && hydratedTypeId !== detail.data.type.id) {
    const t = detail.data.type;
    setName(t.name);
    setCategory(
      (COMPLIANCE_TYPE_CATEGORIES as readonly string[]).includes(t.category)
        ? (t.category as ComplianceTypeCategory)
        : 'test',
    );
    setValidityMode(
      t.validity_period_days == null ? 'lifetime' : t.validity_period_days === 0 ? 'per_visit' : 'days',
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
    setDescription(t.description ?? '');
    setExpiryDaysText(t.form_link_expiry_days != null ? String(t.form_link_expiry_days) : '');
    setErrors([]);
    setConfirmingArchive(false);
    setHydratedTypeId(t.id);
  }
  if (!visible && hydratedTypeId !== null) {
    // Reset so the next open re-hydrates from fresh server state.
    setHydratedTypeId(null);
  }

  const type = detail.data?.type ?? null;
  const version = detail.data?.version ?? null;
  const fields = version?.form_schema?.fields ?? [];
  const isArchived = type ? !type.is_active : false;

  function toggleCaptureMethod(method: ComplianceTypeCaptureMethod) {
    setCaptureMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method],
    );
  }

  function validate(): { ok: boolean; validityDays: number | null; expiryDays: number | null } {
    const problems: string[] = [];

    if (!name.trim()) {
      problems.push('Give the template a name.');
    }
    if (captureMethods.length === 0) {
      problems.push('Choose at least one capture method.');
    }

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
      if (
        !Number.isInteger(parsed) ||
        parsed < FORM_LINK_EXPIRY_MIN ||
        parsed > FORM_LINK_EXPIRY_MAX
      ) {
        problems.push(
          `Form link expiry must be between ${FORM_LINK_EXPIRY_MIN} and ${FORM_LINK_EXPIRY_MAX} days.`,
        );
      } else {
        expiryDays = parsed;
      }
    }

    setErrors(problems);
    return { ok: problems.length === 0, validityDays, expiryDays };
  }

  function handleSave() {
    if (!type) return;
    const { ok, validityDays, expiryDays } = validate();
    if (!ok) {
      hapticWarning();
      return;
    }

    setPendingAction('save');
    update.mutate(
      {
        typeId: type.id,
        patch: {
          name: name.trim(),
          category,
          description: description.trim() ? description.trim() : null,
          validity_period_days: validityDays,
          capture_methods: captureMethods,
          form_link_expiry_days: expiryDays,
        },
      },
      {
        onSuccess: () => {
          setPendingAction(null);
          hapticSuccess();
          onClose();
        },
        onError: (error) => {
          setPendingAction(null);
          hapticWarning();
          setErrors([
            error instanceof ApiError ? error.message : 'Could not save the template.',
          ]);
        },
      },
    );
  }

  /** Archive/restore via PATCH is_active — the dedicated routes are web-only. */
  function handleArchiveToggle() {
    if (!type) return;
    setPendingAction('archive');
    update.mutate(
      { typeId: type.id, patch: { is_active: isArchived } },
      {
        onSuccess: () => {
          setPendingAction(null);
          setConfirmingArchive(false);
          hapticSuccess();
        },
        onError: (error) => {
          setPendingAction(null);
          setConfirmingArchive(false);
          hapticWarning();
          setErrors([
            error instanceof ApiError ? error.message : 'Could not update the template.',
          ]);
        },
      },
    );
  }

  const saving = update.isPending && pendingAction === 'save';
  const archiving = update.isPending && pendingAction === 'archive';

  return (
    <Sheet visible={visible} onClose={onClose} fill maxHeight="92%">
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text variant="subheading" numberOfLines={1} style={styles.headerTitle}>
            {type?.name ?? 'Compliance template'}
          </Text>
          {version ? <Badge label={`v${version.version_number}`} tone="neutral" /> : null}
          {isArchived ? <Badge label="Archived" tone="warning" /> : null}
        </View>
        <Text variant="bodySmall" tone="muted">
          {canEdit
            ? 'Edit the template settings. Form fields are managed on the web dashboard.'
            : 'Only venue admins can edit compliance templates.'}
        </Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        {detail.isLoading ? (
          <Text variant="bodySmall" tone="muted">
            Loading template…
          </Text>
        ) : detail.isError || !type ? (
          <Text variant="bodySmall" tone="danger">
            {detail.error instanceof ApiError
              ? detail.error.message
              : 'Could not load the template.'}
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

            {/* Result type — immutable after creation (matches the web builder) */}
            <View style={styles.fieldBlock}>
              <Text variant="label" tone="secondary">
                Result type
              </Text>
              <View
                style={[
                  styles.readonlyBox,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                <Text variant="body">{RESULT_TYPE_LABELS[type.result_type] ?? type.result_type}</Text>
                {RESULT_TYPE_DESCRIPTIONS[type.result_type] ? (
                  <Text variant="caption" tone="muted">
                    {RESULT_TYPE_DESCRIPTIONS[type.result_type]}
                  </Text>
                ) : null}
              </View>
              <Text variant="caption" tone="muted">
                Result type can&apos;t change after creation.
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
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />
          </>
        ) : (
          /* Read-only summary for non-admins */
          <View
            style={[
              styles.readonlyBox,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <ReadonlyRow label="Category" value={CATEGORY_LABELS[type.category] ?? type.category} />
            <ReadonlyRow
              label="Result type"
              value={RESULT_TYPE_LABELS[type.result_type] ?? type.result_type}
            />
            <ReadonlyRow label="Validity" value={validityLabel(type.validity_period_days)} />
            <ReadonlyRow
              label="Captured by"
              value={
                (type.capture_methods ?? [])
                  .map((m) => CAPTURE_METHOD_LABELS[m] ?? m)
                  .join(', ') || '—'
              }
            />
            <ReadonlyRow
              label="Form link expiry"
              value={
                type.form_link_expiry_days != null
                  ? `${type.form_link_expiry_days} days`
                  : 'Venue default'
              }
            />
            {type.description ? <ReadonlyRow label="Description" value={type.description} /> : null}
          </View>
        )}

        {/* Form fields — read-only; versions are created in the web form builder */}
        {type && !detail.isLoading ? (
          <View style={styles.fieldBlock}>
            <Text variant="label" tone="secondary">
              Form fields{version ? ` (v${version.version_number})` : ''}
            </Text>
            {fields.length === 0 ? (
              <Text variant="caption" tone="muted">
                This template has no form fields.
              </Text>
            ) : (
              <View
                style={[
                  styles.readonlyBox,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                {fields.map((field, index) => (
                  <View
                    key={field.id}
                    style={[
                      styles.fieldRow,
                      index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                    ]}>
                    <View style={styles.fieldRowText}>
                      <Text variant="bodySmall" numberOfLines={2}>
                        {field.label}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {FIELD_TYPE_LABELS[field.type] ?? field.type}
                        {field.required ? ' · required' : ''}
                        {field.staff_only ? ' · staff only' : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <View
              style={[
                styles.webNote,
                { backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder },
              ]}>
              <Text variant="caption" tone="secondary">
                Form fields are saved as immutable versions by the form builder on the web
                dashboard — they can&apos;t be edited in the app.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Inline errors — never Alert-only feedback */}
        {errors.length > 0 ? (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: colors.dangerSurface, borderColor: colors.danger },
            ]}>
            {errors.map((e) => (
              <Text key={e} variant="caption" tone="danger">
                {e}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Archive / restore — admin only */}
        {canEdit && type && !detail.isLoading ? (
          <View style={styles.archiveBlock}>
            {confirmingArchive && !isArchived ? (
              <>
                <Text variant="caption" tone="muted">
                  Archiving hides this template from capture and new requirements. Existing
                  records are kept.
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
                  if (isArchived) {
                    handleArchiveToggle();
                  } else {
                    setConfirmingArchive(true);
                  }
                }}
              />
            )}
          </View>
        ) : null}

        <View style={styles.spacer} />
      </ScrollView>

      {/* Footer */}
      <View
        style={[
          styles.footer,
          { borderTopColor: colors.border, backgroundColor: colors.surfaceRaised },
        ]}>
        <Button
          label={canEdit ? 'Cancel' : 'Close'}
          variant="secondary"
          onPress={onClose}
          style={styles.footerBtn}
        />
        {canEdit ? (
          <Button
            label="Save changes"
            variant="primary"
            loading={saving}
            disabled={detail.isLoading || detail.isError || !type}
            onPress={handleSave}
            style={styles.footerBtnPrimary}
          />
        ) : null}
      </View>
    </Sheet>
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
  webNote: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
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
