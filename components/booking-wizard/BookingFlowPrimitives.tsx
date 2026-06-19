import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { PressableScale } from '@/components/ui/PressableScale';
import { ApiError } from '@/lib/api/client';
import { formatPence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useCreateBooking, type CreateBookingPayload } from '@/lib/queries/useCreateBooking';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

// ---------------------------------------------------------------------------
// Step heading
// ---------------------------------------------------------------------------

export function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.headingWrap}>
      <Text variant="heading">{title}</Text>
      {subtitle ? (
        <Text variant="bodySmall" tone="muted">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Selectable card row — used by every "pick a class/event/resource/session" list
// ---------------------------------------------------------------------------

type SelectableRowProps = {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  trailing?: string | null;
  /** Left colour dot (e.g. a class type's colour). */
  accentColour?: string | null;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

export function SelectableRow({
  title,
  subtitle,
  meta,
  trailing,
  accentColour,
  selected = false,
  disabled = false,
  onPress,
  accessibilityLabel,
}: SelectableRowProps) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      haptic
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ selected, disabled }}
      style={[
        styles.row,
        {
          backgroundColor: selected ? colors.brandSubtle : colors.surfaceRaised,
          borderColor: selected ? colors.brand : colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}>
      {accentColour ? <View style={[styles.dot, { backgroundColor: accentColour }]} /> : null}
      <View style={styles.rowBody}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" tone="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowTrailing}>
        {trailing ? (
          <Text variant="bodySmall" tone={selected ? 'brand' : 'muted'} style={styles.trailingText}>
            {trailing}
          </Text>
        ) : null}
        <SymbolView
          name={
            selected
              ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }
              : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
          }
          tintColor={selected ? colors.brand : colors.textMuted}
          size={20}
        />
      </View>
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// Shared confirm step — review summary, pick phone/walk-in, create the booking
// ---------------------------------------------------------------------------

export type SummaryRowItem = { label: string; value: string };

type BuildPayloadArgs = {
  source: 'phone' | 'walk-in';
  requireDeposit: boolean;
  overrideCompliance: boolean;
};

type BookingFlowConfirmProps = {
  /** Big line at the top of the summary card (e.g. the class/event/resource name). */
  headerTitle: string;
  /** Secondary line under the header (e.g. "60 min · with Jane"). */
  headerSubtitle?: string;
  rows: SummaryRowItem[];
  /** Total price in pence (shown as a Total row when > 0). */
  totalPence?: number | null;
  /** Deposit in pence — when > 0 a "Require deposit" toggle appears. */
  depositPence?: number | null;
  /** Build the create payload for the chosen source/deposit/override flags. */
  buildPayload: (args: BuildPayloadArgs) => CreateBookingPayload;
  guestName: string;
  successTitle: string;
  successSubtitle: string;
  initialSource?: 'phone' | 'walk-in';
  /**
   * Controlled booking source. When `source`/`onSourceChange` are supplied the
   * flow owns the Phone/Walk-in choice (e.g. surfaced on the guest step) and the
   * internal "Booking type" selector is hidden. Omit both for the default
   * uncontrolled selector shown here.
   */
  source?: 'phone' | 'walk-in';
  onSourceChange?: (source: 'phone' | 'walk-in') => void;
  onCreated: (bookingId: string) => void;
  onBookAnother?: () => void;
};

interface Confirmation {
  booking_id: string;
  payment_url?: string;
  requires_deposit?: boolean;
  deposit_amount_pence?: number;
}

const money = (pence: number): string => formatPence(pence) ?? '—';

function SummaryRow({ label, value }: SummaryRowItem) {
  return (
    <View style={styles.summaryRow}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

export function BookingFlowConfirm({
  headerTitle,
  headerSubtitle,
  rows,
  totalPence = null,
  depositPence = null,
  buildPayload,
  guestName,
  successTitle,
  successSubtitle,
  initialSource = 'phone',
  source: controlledSource,
  onSourceChange,
  onCreated,
  onBookAnother,
}: BookingFlowConfirmProps) {
  const { colors } = useTheme();
  const createBooking = useCreateBooking();
  // Controlled when the flow passes source/onSourceChange (it then renders the
  // selector itself, e.g. on the guest step); otherwise own the state here.
  const [internalSource, setInternalSource] = useState<'phone' | 'walk-in'>(initialSource);
  const source = controlledSource ?? internalSource;
  const setSource = onSourceChange ?? setInternalSource;
  const [requireDeposit, setRequireDeposit] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hasDeposit = depositPence != null && depositPence > 0;
  const depositLabel = hasDeposit ? money(depositPence) : null;

  const submit = (overrideCompliance: boolean) => {
    setComplianceError(null);
    setSubmitError(null);
    const payload = buildPayload({ source, requireDeposit, overrideCompliance });
    createBooking.mutate(payload, {
      onSuccess: (response) => {
        hapticSuccess();
        setConfirmation({
          booking_id: response.booking_id,
          payment_url: response.payment_url,
          requires_deposit: response.requires_deposit,
          deposit_amount_pence: response.deposit_amount_pence,
        });
      },
      onError: (error) => {
        const apiError = error instanceof ApiError ? error : null;
        const body = apiError?.body as { error?: string; message?: string } | null | undefined;
        if (apiError?.status === 409 && body?.error === 'COMPLIANCE_REQUIREMENT_UNMET') {
          hapticWarning();
          setComplianceError(body?.message ?? 'A compliance requirement is unmet for this guest.');
          return;
        }
        hapticWarning();
        setSubmitError(apiError ? apiError.message : 'Could not create booking. Please try again.');
      },
    });
  };

  if (confirmation) {
    return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.successHeader}>
          <SymbolView
            name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
            tintColor={colors.success}
            size={44}
          />
          <Text variant="heading">{successTitle}</Text>
          <Text variant="bodyMedium" tone="muted" style={styles.center}>
            {successSubtitle}
          </Text>
        </View>

        <Card>
          <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
            <Text variant="subheading">{headerTitle}</Text>
            {headerSubtitle ? (
              <Text variant="bodySmall" tone="muted">
                {headerSubtitle}
              </Text>
            ) : null}
          </View>
          {rows.map((row) => (
            <SummaryRow key={row.label} label={row.label} value={row.value} />
          ))}
          {confirmation.payment_url ||
          (confirmation.requires_deposit &&
            confirmation.deposit_amount_pence != null &&
            confirmation.deposit_amount_pence > 0) ? (
            <View style={[styles.depositNotice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text variant="bodySmall" tone="brand">
                {confirmation.deposit_amount_pence != null && confirmation.deposit_amount_pence > 0
                  ? `Deposit required: ${money(confirmation.deposit_amount_pence)}`
                  : 'Payment required'}
              </Text>
              {confirmation.payment_url ? (
                <Text variant="caption" tone="muted">
                  A payment link has been sent to the guest.
                </Text>
              ) : null}
            </View>
          ) : null}
        </Card>

        <View style={styles.actions}>
          <Button label="View booking" fullWidth onPress={() => onCreated(confirmation.booking_id)} />
          {onBookAnother ? (
            <Button label="Book another" variant="secondary" fullWidth onPress={onBookAnother} />
          ) : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      <Text variant="heading">Review &amp; confirm</Text>

      <Card>
        <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
          <Text variant="subheading">{headerTitle}</Text>
          {headerSubtitle ? (
            <Text variant="bodySmall" tone="muted">
              {headerSubtitle}
            </Text>
          ) : null}
        </View>
        {rows.map((row) => (
          <SummaryRow key={row.label} label={row.label} value={row.value} />
        ))}
        <SummaryRow label="Guest" value={guestName || '—'} />
        {totalPence != null && totalPence > 0 ? (
          <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
            <Text variant="label">Total</Text>
            <Text variant="label" tone="brand">
              {money(totalPence)}
            </Text>
          </View>
        ) : null}
        {depositLabel ? (
          <View style={styles.depositRow}>
            <Text variant="caption" tone="muted">
              Deposit
            </Text>
            <Text variant="bodySmall">{depositLabel}</Text>
          </View>
        ) : null}
      </Card>

      {/* Hidden when the flow controls the source (it renders the selector
          itself, e.g. on the guest step) to avoid a duplicate toggle. */}
      {onSourceChange ? null : (
        <View style={styles.sourceBlock}>
          <Text variant="label" tone="secondary">
            Booking type
          </Text>
          <Segmented
            options={[
              { value: 'phone', label: 'Phone' },
              { value: 'walk-in', label: 'Walk-in' },
            ]}
            value={source}
            onChange={setSource}
          />
        </View>
      )}

      {hasDeposit && source !== 'walk-in' ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: requireDeposit }}
          accessibilityLabel={`Require deposit ${depositLabel ?? ''}`}
          onPress={() => setRequireDeposit((prev) => !prev)}
          style={({ pressed }) => [
            styles.depositToggle,
            {
              backgroundColor: requireDeposit ? colors.surfaceRaised : colors.surface,
              borderColor: requireDeposit ? colors.brand : colors.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}>
          <View
            style={[
              styles.check,
              {
                borderColor: requireDeposit ? colors.brand : colors.borderStrong,
                backgroundColor: requireDeposit ? colors.brand : 'transparent',
              },
            ]}>
            {requireDeposit ? <Text style={[styles.checkMark, { color: colors.onBrand }]}>✓</Text> : null}
          </View>
          <Text variant="bodyMedium" style={styles.depositToggleLabel}>
            Require deposit{depositLabel ? ` (${depositLabel})` : ''}
          </Text>
        </Pressable>
      ) : null}

      {complianceError ? (
        <View style={[styles.complianceBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text variant="bodySmall" tone="danger">
            {complianceError}
          </Text>
          <Button
            label="Book anyway (admin override)"
            variant="secondary"
            fullWidth
            onPress={() => submit(true)}
            loading={createBooking.isPending}
          />
        </View>
      ) : null}

      {submitError ? (
        <Text variant="bodySmall" tone="danger">
          {submitError}
        </Text>
      ) : null}

      <Button
        label="Create booking"
        fullWidth
        loading={createBooking.isPending}
        onPress={() => submit(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { gap: spacing.lg, paddingBottom: spacing.xl },
  headingWrap: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.base,
  },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  rowBody: { flex: 1, gap: 2 },
  rowTrailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trailingText: { maxWidth: 120, textAlign: 'right' },
  cardHeader: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryRow: { gap: 2, marginBottom: spacing.md },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  depositRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  depositNotice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  sourceBlock: { gap: spacing.sm },
  depositToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  depositToggleLabel: { flex: 1, minWidth: 0 },
  check: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { fontSize: 13, fontFamily: fonts.bold, lineHeight: 16 },
  complianceBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.md,
  },
  successHeader: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.sm },
  center: { textAlign: 'center' },
  actions: { gap: spacing.md },
});
