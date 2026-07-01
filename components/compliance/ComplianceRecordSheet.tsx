import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Badge, CompliancePill, type ComplianceTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useComplianceRecord,
  useComplianceRecordFile,
  useUpdateComplianceRecord,
  useVoidComplianceRecord,
} from '@/lib/queries/useCompliance';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ComplianceFormField } from '@/types/compliance';

import { RESULT_LABELS } from './complianceTypeLabels';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** DD/MM/YYYY — handles both full ISO timestamps and bare YYYY-MM-DD dates. */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function recordStatusPill(record: {
  status: string;
  expires_at: string | null;
  voided_at: string | null;
}): { label: string; tone: ComplianceTone } {
  if (record.voided_at || record.status === 'voided') return { label: 'Voided', tone: 'voided' };
  if (record.status === 'expired') return { label: 'Expired', tone: 'expired' };
  if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) {
    return { label: 'Expired', tone: 'expired' };
  }
  return { label: 'Current', tone: 'current' };
}

/** Render a field response value to a human-readable string. */
function renderAnswer(field: ComplianceFormField, value: unknown): string {
  if (value == null || value === '') return '—';
  switch (field.type) {
    case 'signature': {
      const v = value as { method?: string };
      return v && typeof v === 'object' ? (v.method === 'typed' ? 'Signed (typed)' : 'Signature on file') : String(value);
    }
    case 'file': {
      const v = value as { file_name?: string };
      return (v && typeof v === 'object' && v.file_name) ? v.file_name : 'File uploaded';
    }
    case 'multiselect':
      return Array.isArray(value) ? (value as string[]).join(', ') : String(value);
    case 'select': {
      const opt = field.options?.find((o) => o.value === value);
      return opt?.label ?? String(value);
    }
    case 'date':
      return formatDate(String(value));
    default:
      return String(value);
  }
}

function joinedTypeName(
  join:
    | { name?: string; category?: string }
    | { name?: string; category?: string }[]
    | null
    | undefined,
): string {
  const t = Array.isArray(join) ? join[0] : join;
  return t?.name ?? 'Compliance record';
}

const CAPTURE_CHANNEL_LABELS: Record<string, string> = {
  staff_web: 'Staff entry',
  staff_mobile: 'Staff entry',
  client_walkin: 'Client self-completed',
  client_email: 'Client (email link)',
  client_sms: 'Client (SMS link)',
  client_booking: 'Client (at booking)',
  client_portal: 'Client portal',
  import: 'Imported',
  api: 'API',
};

/**
 * Fetches a short-lived (120s) signed URL for a captured signature/file on tap and
 * opens it in an in-app browser. Owns its loading state so multiple artefact buttons
 * on one record don't share a spinner.
 */
function RecordArtifactButton({
  recordId,
  fieldId,
  label,
}: {
  recordId: string;
  fieldId: string;
  label: string;
}) {
  const toast = useToast();
  const fileQuery = useComplianceRecordFile();

  function open() {
    fileQuery.mutate(
      { recordId, fieldId },
      {
        onSuccess: async (data) => {
          try {
            await WebBrowser.openBrowserAsync(data.url);
          } catch {
            toast.error('Could not open the file.');
          }
        },
        onError: (error) => {
          toast.error(error instanceof ApiError ? error.message : 'Could not open the file.');
        },
      },
    );
  }

  return (
    <Button
      label={fileQuery.isPending ? 'Opening…' : label}
      variant="ghost"
      size="sm"
      loading={fileQuery.isPending}
      onPress={open}
      style={styles.artifactBtn}
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  visible: boolean;
  onClose: () => void;
  recordId: string | null;
  onChanged?: () => void;
};

/**
 * Sheet to view a compliance record's full detail (captured responses + metadata)
 * and optionally void it with a reason.
 *
 * Opens on tapping any record row in ComplianceCard's "All compliance records" list.
 */
export function ComplianceRecordSheet({ visible, onClose, recordId, onChanged }: Props) {
  const { colors } = useTheme();
  const toast = useToast();
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const query = useComplianceRecord(visible && recordId ? recordId : null);
  const voidMutation = useVoidComplianceRecord();
  const updateRecord = useUpdateComplianceRecord();
  const [deciding, setDeciding] = useState<'pass' | 'fail' | 'inconclusive' | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);

  const record = query.data?.record;
  const schema = query.data?.version?.form_schema ?? null;
  const isVoided = Boolean(record?.voided_at || record?.status === 'voided');
  // A pass_fail record with no result is awaiting a staff decision (e.g. a client-
  // submitted patch test): it does not satisfy a booking until pass/fail is recorded.
  const typeJoin = record?.compliance_types;
  const resultType = (Array.isArray(typeJoin) ? typeJoin[0] : typeJoin)?.result_type;
  const needsDecision =
    Boolean(record) && !isVoided && resultType === 'pass_fail' && record?.result == null;

  function handleClose() {
    setShowVoidForm(false);
    setVoidReason('');
    onClose();
  }

  // Reveal the inline void form (which has its own reason + danger confirm).
  // The old Alert.alert confirm step was a no-op on web.
  function handleVoidPress() {
    if (!record) return;
    setShowVoidForm(true);
  }

  function handleVoidSubmit() {
    if (!recordId) return;
    if (voidReason.trim().length === 0) {
      // Reason input already enforces this via a disabled button; guard anyway.
      toast.info('Please enter a reason for voiding this record.');
      return;
    }
    voidMutation.mutate(
      { recordId, reason: voidReason.trim() },
      {
        onSuccess: () => {
          hapticSuccess();
          setShowVoidForm(false);
          setVoidReason('');
          toast.success('Record voided.');
          onChanged?.();
        },
        onError: (error) => {
          hapticWarning();
          toast.error(error instanceof ApiError ? error.message : 'Could not void the record.');
        },
      },
    );
  }

  function recordDecision(result: 'pass' | 'fail' | 'inconclusive') {
    if (!recordId) return;
    setDeciding(result);
    setDecideError(null);
    updateRecord.mutate(
      { recordId, result },
      {
        onSuccess: () => {
          setDeciding(null);
          hapticSuccess();
          toast.success('Decision recorded.');
          void query.refetch();
          onChanged?.();
        },
        onError: (error) => {
          setDeciding(null);
          hapticWarning();
          setDecideError(
            error instanceof ApiError ? error.message : 'Could not record the decision.',
          );
        },
      },
    );
  }

  const statusPill = record ? recordStatusPill(record) : null;

  return (
    <Sheet visible={visible} onClose={handleClose} fill maxHeight="90%">
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text variant="subheading" numberOfLines={1} style={styles.headerTitle}>
            Compliance record
          </Text>
          {statusPill ? <CompliancePill label={statusPill.label} tone={statusPill.tone} /> : null}
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        {query.isLoading ? (
          <Text variant="bodySmall" tone="muted">
            Loading record…
          </Text>
        ) : query.isError || !record ? (
          <Text variant="bodySmall" tone="danger">
            Could not load this record.
          </Text>
        ) : (
          <>
            {/* Record type & result */}
            <Text variant="bodyMedium">{joinedTypeName(record.compliance_types)}</Text>
            {record.result ? (
              <Badge label={RESULT_LABELS[record.result] ?? record.result} tone="neutral" />
            ) : null}

            {/* Awaiting a staff pass/fail decision */}
            {needsDecision ? (
              <View
                style={[
                  styles.decisionPanel,
                  { backgroundColor: colors.warning + '18', borderColor: colors.warning + '55' },
                ]}>
                <Text variant="label" color={colors.warning}>
                  Needs a pass or fail decision
                </Text>
                <Text variant="caption" tone="secondary">
                  The client completed this form. Record the result so it counts towards their
                  booking.
                </Text>
                {decideError ? (
                  <Text variant="caption" tone="danger">
                    {decideError}
                  </Text>
                ) : null}
                <View style={styles.decisionActions}>
                  <Button
                    label="Pass"
                    variant="primary"
                    size="sm"
                    loading={deciding === 'pass'}
                    disabled={deciding !== null}
                    onPress={() => recordDecision('pass')}
                    style={styles.decisionBtn}
                  />
                  <Button
                    label="Fail"
                    variant="danger"
                    size="sm"
                    loading={deciding === 'fail'}
                    disabled={deciding !== null}
                    onPress={() => recordDecision('fail')}
                    style={styles.decisionBtn}
                  />
                  <Button
                    label="Inconclusive"
                    variant="secondary"
                    size="sm"
                    loading={deciding === 'inconclusive'}
                    disabled={deciding !== null}
                    onPress={() => recordDecision('inconclusive')}
                    style={styles.decisionBtn}
                  />
                </View>
              </View>
            ) : null}

            {/* Metadata grid */}
            <View style={styles.metaGrid}>
              <View style={styles.metaItem}>
                <Text variant="caption" tone="muted">
                  Captured
                </Text>
                <Text variant="bodySmall">{formatDate(record.captured_at)}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text variant="caption" tone="muted">
                  Expires
                </Text>
                <Text variant="bodySmall">
                  {record.expires_at ? formatDate(record.expires_at) : 'No expiry'}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Text variant="caption" tone="muted">
                  Captured by
                </Text>
                <Text variant="bodySmall">
                  {CAPTURE_CHANNEL_LABELS[record.capture_channel] ?? record.capture_channel}
                </Text>
              </View>
            </View>

            {/* Voided notice */}
            {isVoided && record.voided_reason ? (
              <View
                style={[
                  styles.voidedBanner,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                <Text variant="label" tone="secondary">
                  Voided
                </Text>
                <Text variant="bodySmall" tone="secondary">
                  {record.voided_reason}
                </Text>
              </View>
            ) : null}

            {/* Form responses */}
            {schema && schema.fields.length > 0 ? (
              <View
                style={[
                  styles.responseTable,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                ]}>
                {schema.fields.map((field, idx) => {
                  const value = record.responses?.[field.id];
                  const storagePath =
                    value && typeof value === 'object'
                      ? (value as { storage_path?: unknown }).storage_path
                      : null;
                  const hasArtifact = typeof storagePath === 'string' && storagePath.length > 0;
                  const fileName =
                    value && typeof value === 'object'
                      ? (value as { file_name?: string }).file_name
                      : undefined;
                  return (
                    <View
                      key={field.id}
                      style={[
                        styles.responseRow,
                        idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                      ]}>
                      <Text variant="caption" tone="muted" style={styles.responseLabel}>
                        {field.label}
                      </Text>
                      {field.type === 'signature' && hasArtifact ? (
                        <RecordArtifactButton recordId={record.id} fieldId={field.id} label="View signature" />
                      ) : field.type === 'file' && hasArtifact ? (
                        <RecordArtifactButton
                          recordId={record.id}
                          fieldId={field.id}
                          label={`Download ${fileName ?? 'file'}`}
                        />
                      ) : (
                        <Text variant="bodySmall">{renderAnswer(field, value)}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Notes */}
            {record.notes ? (
              <View>
                <Text variant="caption" tone="muted">
                  Notes
                </Text>
                <Text variant="bodySmall">{record.notes}</Text>
              </View>
            ) : null}

            {/* Void section */}
            {!isVoided ? (
              showVoidForm ? (
                <View
                  style={[
                    styles.voidForm,
                    { backgroundColor: colors.dangerSurface, borderColor: colors.danger },
                  ]}>
                  <Text variant="label" tone="danger">
                    Void this record
                  </Text>
                  <Text variant="caption" tone="secondary">
                    Voiding is permanent and cannot be undone. The record remains in the audit trail
                    but no longer counts towards compliance.
                  </Text>
                  <Text variant="label" tone="secondary">
                    Reason for voiding *
                  </Text>
                  <TextInput
                    accessibilityLabel="Reason for voiding"
                    value={voidReason}
                    onChangeText={setVoidReason}
                    placeholder="Enter reason…"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={3}
                    maxLength={500}
                    style={[
                      styles.voidReasonInput,
                      {
                        color: colors.text,
                        backgroundColor: colors.surfaceRaised,
                        borderColor: colors.borderStrong,
                      },
                    ]}
                    textAlignVertical="top"
                  />
                  <View style={styles.voidActions}>
                    <Button
                      label="Cancel"
                      variant="secondary"
                      size="sm"
                      onPress={() => {
                        setShowVoidForm(false);
                        setVoidReason('');
                      }}
                    />
                    <Button
                      label="Void record"
                      variant="danger"
                      size="sm"
                      loading={voidMutation.isPending}
                      disabled={voidReason.trim().length === 0}
                      onPress={handleVoidSubmit}
                    />
                  </View>
                </View>
              ) : (
                <Button
                  label="Void this record"
                  variant="ghost"
                  size="sm"
                  onPress={handleVoidPress}
                  style={styles.voidBtn}
                />
              )
            ) : null}
          </>
        )}
        <View style={styles.spacer} />
      </ScrollView>

      <View
        style={[
          styles.footer,
          { borderTopColor: colors.border, backgroundColor: colors.surfaceRaised },
        ]}>
        <Button label="Close" variant="secondary" size="md" fullWidth onPress={handleClose} />
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
  metaGrid: {
    flexDirection: 'row',
    gap: spacing.base,
    flexWrap: 'wrap',
  },
  metaItem: {
    gap: 2,
    minWidth: 80,
  },
  voidedBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  responseTable: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  responseRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  responseLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  decisionPanel: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  decisionActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  decisionBtn: {
    flexGrow: 1,
    flexBasis: '30%',
  },
  artifactBtn: {
    alignSelf: 'flex-start',
  },
  voidForm: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  voidReasonInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    minHeight: 72,
  },
  voidActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  voidBtn: {
    alignSelf: 'flex-start',
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  spacer: {
    height: spacing.xl,
  },
});
