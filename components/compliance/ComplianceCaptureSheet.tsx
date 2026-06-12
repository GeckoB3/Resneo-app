import { useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
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

/** Render a single field answer control. Returns the value as string or array. */
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
        <Text variant="label" tone="secondary" style={styles.fieldLabel}>
          {field.label}
          {field.required ? ' *' : ''}
        </Text>
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
        <Text variant="label" tone="secondary" style={styles.fieldLabel}>
          {field.label}
          {field.required ? ' *' : ''}
        </Text>
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
    // Signature is deferred to a link-based flow on v1. Show a text acknowledgement.
    return (
      <View style={styles.fieldRow}>
        <Text variant="label" tone="secondary" style={styles.fieldLabel}>
          {field.label}
          {field.required ? ' *' : ''}
        </Text>
        <TextInput
          value={strVal}
          onChangeText={(t) => onChange(t)}
          placeholder="Type full name as signature"
          placeholderTextColor={colors.textMuted}
          style={[
            styles.textInput,
            { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          autoCorrect={false}
        />
        <Text variant="caption" tone="muted">
          Type full name to act as a typed signature.
        </Text>
      </View>
    );
  }

  // text, textarea, date, and other types use a plain TextInput
  const isMultiline = field.type === 'textarea';
  return (
    <View style={styles.fieldRow}>
      <Text variant="label" tone="secondary" style={styles.fieldLabel}>
        {field.label}
        {field.required ? ' *' : ''}
      </Text>
      <TextInput
        value={strVal}
        onChangeText={(t) => onChange(t)}
        placeholder={field.placeholder ?? (field.type === 'date' ? 'DD/MM/YYYY' : undefined)}
        placeholderTextColor={colors.textMuted}
        multiline={isMultiline}
        numberOfLines={isMultiline ? 3 : 1}
        keyboardType={field.type === 'date' ? 'numbers-and-punctuation' : 'default'}
        style={[
          styles.textInput,
          isMultiline && styles.textArea,
          { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      />
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

  const typeQuery = useComplianceType(visible ? complianceTypeId : null);
  const capture = useCaptureComplianceRecord();

  const schema = typeQuery.data?.version?.form_schema ?? null;
  const mode = channel === 'client_walkin' ? 'public' : 'staff';
  // In public mode, filter out staff-only fields for validation
  const visibleFields = (schema?.fields ?? []).filter(
    (f) => mode === 'staff' || !f.staff_only,
  );

  function validate(): boolean {
    const errors: Record<string, string> = {};
    for (const field of visibleFields) {
      if (!field.required) continue;
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
            setResponses({});
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
          visibleFields.map((field) => (
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
          ))
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
  noForm: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
  },
  fieldRow: {
    gap: spacing.xs,
  },
  fieldLabel: {
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
