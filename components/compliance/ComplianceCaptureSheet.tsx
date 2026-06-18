import { useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { SignaturePad } from '@/components/compliance/SignaturePad';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { renderInlineMarkdown } from '@/lib/compliance/markdown';
import {
  seedDefaultResponses,
  type SignatureResponse,
} from '@/lib/compliance/form-schema';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useCaptureComplianceRecord, useComplianceType } from '@/lib/queries/useCompliance';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ComplianceFormField } from '@/types/compliance';

type CaptureChannel = 'staff_web' | 'client_walkin';

const CHANNEL_OPTIONS: { value: CaptureChannel; label: string }[] = [
  { value: 'staff_web', label: 'Staff entering' },
  { value: 'client_walkin', label: 'Client device' },
];

const SIGNATURE_METHODS: { value: 'drawn' | 'typed'; label: string }[] = [
  { value: 'drawn', label: 'Draw' },
  { value: 'typed', label: 'Type name' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  guestId: string;
  complianceTypeId: string;
  complianceTypeName: string;
  bookingId?: string | null;
  initialChannel?: CaptureChannel;
  onCaptured?: () => void;
};

/** Today as YYYY-MM-DD (used to seed/back date fields). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Field label + optional required marker + per-field help text. */
function FieldHeader({ field }: { field: ComplianceFormField }) {
  return (
    <View style={styles.fieldHeader}>
      <Text variant="label" tone="secondary">
        {field.label}
        {field.required ? ' *' : ''}
      </Text>
      {field.help_text ? (
        <Text variant="caption" tone="muted">
          {field.help_text}
        </Text>
      ) : null}
    </View>
  );
}

/** Render a single field answer control. Emits the value via onChange. */
function FieldInput({
  field,
  value,
  onChange,
  mode,
}: {
  field: ComplianceFormField;
  value: unknown;
  onChange: (val: unknown) => void;
  mode: 'staff' | 'public';
}) {
  const { colors } = useTheme();

  // Staff-only fields are hidden in public (client) mode.
  if (mode === 'public' && field.staff_only) return null;

  const strVal = value == null ? '' : String(value);

  if (field.type === 'select' && field.options) {
    const selectedOpt = field.options.find((o) => o.value === strVal);
    return (
      <View style={styles.fieldRow}>
        <FieldHeader field={field} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {field.options.map((opt) => {
            const selected = opt.value === strVal;
            return (
              <Button
                key={opt.value}
                label={opt.label}
                variant={selected ? 'primary' : 'secondary'}
                size="sm"
                onPress={() => onChange(selected ? '' : opt.value)}
                style={styles.chipBtn}
              />
            );
          })}
        </ScrollView>
        {selectedOpt ? (
          <Text variant="caption" tone="muted">
            Selected: {selectedOpt.label}
          </Text>
        ) : null}
      </View>
    );
  }

  if (field.type === 'multiselect' && field.options) {
    const arrVal: string[] = Array.isArray(value) ? (value as string[]) : [];
    return (
      <View style={styles.fieldRow}>
        <FieldHeader field={field} />
        <View style={styles.chipWrap}>
          {field.options.map((opt) => {
            const selected = arrVal.includes(opt.value);
            return (
              <Button
                key={opt.value}
                label={opt.label}
                variant={selected ? 'primary' : 'secondary'}
                size="sm"
                onPress={() => {
                  if (selected) {
                    onChange(arrVal.filter((v) => v !== opt.value));
                  } else {
                    onChange([...arrVal, opt.value]);
                  }
                }}
                style={styles.chipBtn}
              />
            );
          })}
        </View>
      </View>
    );
  }

  if (field.type === 'signature') {
    return <SignatureFieldInput field={field} value={value} onChange={onChange} />;
  }

  if (field.type === 'file') {
    return <FileFieldInput field={field} />;
  }

  if (field.type === 'date') {
    // Native date picker → always emits YYYY-MM-DD (server validates /^\d{4}-\d{2}-\d{2}$/).
    return (
      <View style={styles.fieldRow}>
        <FieldHeader field={field} />
        <DatePickerField
          value={strVal && /^\d{4}-\d{2}-\d{2}$/.test(strVal) ? strVal : todayIso()}
          onChange={(iso) => onChange(iso)}
          accessibilityLabel={field.label}
        />
        {!strVal ? (
          <Text variant="caption" tone="muted">
            Tap to choose a date.
          </Text>
        ) : null}
      </View>
    );
  }

  // text / textarea → plain TextInput
  const isMultiline = field.type === 'textarea';
  return (
    <View style={styles.fieldRow}>
      <FieldHeader field={field} />
      <TextInput
        accessibilityLabel={field.label}
        value={strVal}
        onChangeText={(t) => onChange(t)}
        placeholder={field.placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={isMultiline}
        numberOfLines={isMultiline ? 3 : 1}
        style={[
          styles.textInput,
          isMultiline && styles.textArea,
          { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      />
    </View>
  );
}

/** Drawn or typed signature → emits `{ method, data, signed_at }`. */
function SignatureFieldInput({
  field,
  value,
  onChange,
}: {
  field: ComplianceFormField;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const { colors } = useTheme();
  const current = (value ?? null) as SignatureResponse | null;
  const [method, setMethod] = useState<'drawn' | 'typed'>(current?.method ?? 'drawn');

  return (
    <View style={styles.fieldRow}>
      <FieldHeader field={field} />
      <Segmented
        options={SIGNATURE_METHODS}
        value={method}
        onChange={(m) => {
          setMethod(m);
          onChange(undefined); // switching method clears the prior signature
        }}
      />
      {method === 'drawn' ? (
        <SignaturePad
          accessibilityLabel={field.label}
          onChange={(dataUrl) =>
            onChange(
              dataUrl
                ? { method: 'drawn', data: dataUrl, signed_at: new Date().toISOString() }
                : undefined,
            )
          }
        />
      ) : (
        <>
          <TextInput
            accessibilityLabel={`${field.label} — typed signature`}
            value={current?.method === 'typed' ? current.data ?? '' : ''}
            onChangeText={(t) =>
              onChange(
                t.trim()
                  ? { method: 'typed', data: t, signed_at: new Date().toISOString() }
                  : undefined,
              )
            }
            placeholder="Type your full name"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            style={[
              styles.textInput,
              { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          />
          <Text variant="caption" tone="muted">
            Typing your full name acts as a signature.
          </Text>
        </>
      )}
    </View>
  );
}

/**
 * File field — DISABLED in staff capture (web parity with FormRenderer's FileField,
 * which is disabled whenever no upload URL is available). A valid file response
 * needs a server `storage_path`, and the only upload endpoint is the public,
 * code-scoped form — so staff cannot attach files here. We render a disabled
 * control with a hint pointing at the client's form link and emit NO value.
 */
function FileFieldInput({ field }: { field: ComplianceFormField }) {
  const { colors } = useTheme();

  return (
    <View style={styles.fieldRow}>
      <FieldHeader field={field} />
      <View
        accessibilityLabel={`${field.label} — file upload`}
        accessibilityState={{ disabled: true }}
        style={[
          styles.fileDisabled,
          { backgroundColor: colors.surface, borderColor: colors.border, opacity: 0.6 },
        ]}>
        <Text variant="bodySmall" tone="muted">
          File uploads are collected via the form link sent to the client.
        </Text>
      </View>
    </View>
  );
}

/**
 * In-venue compliance record capture sheet. Loads the compliance type's current
 * form schema, renders each field, and POSTs to /api/venue/compliance/records.
 *
 * Supports two capture channels:
 *  - staff_web     → staff enters details (all fields including staff-only)
 *  - client_walkin → client self-completes on a venue device (staff-only fields hidden)
 *
 * Capture fidelity matches the web FormRenderer: drawn signatures emit a base64
 * PNG data URL and typed signatures emit `{ method, data, signed_at }`, date
 * fields use the native picker (YYYY-MM-DD), and the schema's description / intro
 * markdown / help text + default values are honoured. `file` fields are rendered
 * disabled (web parity) — uploads are only possible via the client's public form
 * link, so staff are directed there rather than capturing files in-sheet.
 */
export function ComplianceCaptureSheet({
  visible,
  onClose,
  guestId,
  complianceTypeId,
  complianceTypeName,
  bookingId,
  initialChannel = 'staff_web',
  onCaptured,
}: Props) {
  const { colors } = useTheme();
  const toast = useToast();
  const [channel, setChannel] = useState<CaptureChannel>(initialChannel);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Track which type's defaults we've seeded so we don't clobber edits on re-render.
  const [seededTypeId, setSeededTypeId] = useState<string | null>(null);

  const typeQuery = useComplianceType(visible ? complianceTypeId : null);
  const capture = useCaptureComplianceRecord();

  const schema = typeQuery.data?.version?.form_schema ?? null;
  const mode = channel === 'client_walkin' ? 'public' : 'staff';

  // Seed default values once the schema lands (render-time guard, no effect/loop).
  if (visible && schema && seededTypeId !== complianceTypeId) {
    setResponses(seedDefaultResponses(schema.fields));
    setFieldErrors({});
    setSeededTypeId(complianceTypeId);
  }
  if (!visible && seededTypeId !== null) {
    setSeededTypeId(null);
  }

  // In public mode, filter out staff-only fields for rendering + validation.
  const visibleFields = (schema?.fields ?? []).filter((f) => mode === 'staff' || !f.staff_only);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    for (const field of visibleFields) {
      if (!field.required) continue;
      // File uploads can only be captured via the public form (no staff upload
      // endpoint). A required file field is never satisfiable here, so direct
      // staff to the client's form link rather than letting submit 400.
      if (field.type === 'file') {
        errors[field.id] = "File uploads can't be captured here — send the client's form link.";
        continue;
      }
      const val = responses[field.id];
      const isEmpty =
        val == null ||
        val === '' ||
        (Array.isArray(val) && (val as unknown[]).length === 0);
      if (isEmpty) {
        errors[field.id] = 'This field is required.';
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleClose() {
    setResponses({});
    setFieldErrors({});
    setSeededTypeId(null);
    onClose();
  }

  function handleSubmit() {
    if (!validate()) {
      hapticWarning();
      return;
    }
    capture.mutate(
      {
        guest_id: guestId,
        compliance_type_id: complianceTypeId,
        booking_id: bookingId ?? null,
        capture_channel: channel,
        responses,
      },
      {
        onSuccess: () => {
          hapticSuccess();
          toast.success(`${complianceTypeName} has been recorded.`);
          setResponses({});
          setFieldErrors({});
          setSeededTypeId(null);
          onCaptured?.();
          onClose();
        },
        onError: (error) => {
          hapticWarning();
          toast.error(error instanceof ApiError ? error.message : 'Could not capture the record.');
        },
      },
    );
  }

  const channelBadge: { label: string; tone: BadgeTone } =
    channel === 'client_walkin'
      ? { label: 'Client mode', tone: 'brand' }
      : { label: 'Staff entry', tone: 'neutral' };

  const introLines = schema?.intro_markdown ? renderInlineMarkdown(schema.intro_markdown) : [];

  return (
    <Sheet visible={visible} onClose={handleClose} fill maxHeight="92%">
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text variant="subheading" numberOfLines={1} style={styles.headerTitle}>
            {complianceTypeName}
          </Text>
          <Badge label={channelBadge.label} tone={channelBadge.tone} />
        </View>
        <Text variant="bodySmall" tone="muted">
          {channel === 'client_walkin'
            ? 'Hand the device to the client. Staff-only fields are hidden.'
            : 'Complete this record on behalf of, or with, the client.'}
        </Text>
        <Segmented
          options={CHANNEL_OPTIONS}
          value={channel}
          onChange={(v) => {
            setChannel(v);
            // Re-seed defaults for the new mode; clears any in-progress answers.
            setResponses(seedDefaultResponses(schema?.fields ?? []));
            setFieldErrors({});
          }}
        />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        {typeQuery.isLoading ? (
          <Text variant="bodySmall" tone="muted">
            Loading form…
          </Text>
        ) : typeQuery.isError ? (
          <Text variant="bodySmall" tone="danger">
            Could not load the form. Please try again.
          </Text>
        ) : !schema || visibleFields.length === 0 ? (
          <View
            style={[
              styles.noForm,
              { backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder },
            ]}>
            <Text variant="bodySmall" tone="secondary">
              This compliance type has no form fields to capture. Submitting will create a record
              with no responses.
            </Text>
          </View>
        ) : (
          <>
            {/* Author guidance — description + intro markdown (web parity). */}
            {schema.description ? (
              <Text variant="bodySmall" tone="secondary">
                {schema.description}
              </Text>
            ) : null}
            {introLines.length > 0 ? (
              <View
                style={[
                  styles.intro,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                {introLines.map((line, i) => (
                  <Text key={i} variant="bodySmall" tone="secondary">
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}

            {visibleFields.map((field) => (
              <View key={field.id}>
                <FieldInput
                  field={field}
                  value={responses[field.id]}
                  onChange={(val) => setResponses((prev) => ({ ...prev, [field.id]: val }))}
                  mode={mode}
                />
                {fieldErrors[field.id] ? (
                  <Text variant="caption" tone="danger" style={styles.fieldError}>
                    {fieldErrors[field.id]}
                  </Text>
                ) : null}
              </View>
            ))}
          </>
        )}
        <View style={styles.spacer} />
      </ScrollView>

      <View
        style={[
          styles.footer,
          { borderTopColor: colors.border, backgroundColor: colors.surfaceRaised },
        ]}>
        <Button
          label="Cancel"
          variant="secondary"
          size="md"
          onPress={handleClose}
          style={styles.footerBtn}
        />
        <Button
          label={channel === 'client_walkin' ? 'Submit & save' : 'Save record'}
          variant="primary"
          size="md"
          loading={capture.isPending}
          disabled={typeQuery.isLoading}
          onPress={handleSubmit}
          style={styles.footerBtnPrimary}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    gap: spacing.md,
  },
  intro: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  noForm: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
  },
  fieldRow: {
    gap: spacing.xs,
  },
  fieldHeader: {
    gap: 2,
    marginBottom: spacing.xs,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 44,
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexGrow: 0,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chipBtn: {
    marginRight: spacing.sm,
  },
  fileDisabled: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  fieldError: {
    marginTop: spacing.xs,
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
