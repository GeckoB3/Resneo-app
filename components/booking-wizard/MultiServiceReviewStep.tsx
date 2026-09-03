import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { addMinutesToTime } from '@/lib/booking/booking-format';
import type { MultiServiceSegment } from '@/lib/booking/multi-service-chain';
import { chainTotalPence } from '@/lib/booking/multi-service-chain';
import { formatPence } from '@/lib/format';
import { hapticSelect } from '@/lib/haptics';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AppointmentCatalogPractitioner } from '@/types/appointment-catalog';

/** Max consecutive services in one visit — matches the server (`services.min(1).max(4)`). */
export const MAX_MULTI_SERVICE_SEGMENTS = 4;

function fmtTime(time: string): string {
  const [h, m] = time.slice(0, 5).split(':');
  const hour = Number(h);
  const suffix = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${m}${suffix}`;
}

type MultiServiceReviewStepProps = {
  segments: MultiServiceSegment[];
  /** The practitioner the whole visit is with (concrete, never the "any" sentinel). */
  visitPractitioner: AppointmentCatalogPractitioner | null;
  /**
   * Back to the picker with the visit's services ticked (web 2026-09-02: the
   * services are chosen first and the times found for the whole visit, so
   * "add another" here would offer a start the chain may not fit).
   */
  onChangeServices?: () => void;
  onRemoveSegment: (index: number) => void;
  onContinue: () => void;
  /** Inline error from a failed append/remove (e.g. server rejects the chain). */
  errorMessage?: string | null;
};

/**
 * Review step for a multi-service (back-to-back) visit. Lists each chosen
 * segment with its auto-computed start/end, lets staff remove an extra or go
 * back to the picker to change the set, then continue to guest details.
 * Mirrors the web `multi_service` step.
 */
export function MultiServiceReviewStep({
  segments,
  visitPractitioner,
  onChangeServices,
  onRemoveSegment,
  onContinue,
  errorMessage,
}: MultiServiceReviewStepProps) {
  const { colors } = useTheme();
  const totalPence = chainTotalPence(segments);
  const practitionerName = visitPractitioner?.name ?? segments[0]?.practitionerName ?? '';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text variant="heading">Review your services</Text>
        <Text variant="bodySmall" tone="muted">
          {practitionerName
            ? `Same visit with ${practitionerName}, back-to-back. Change the services or continue to details.`
            : 'Change the services or continue to details.'}
        </Text>

        <Card>
          {segments.map((seg, index) => {
            const endTime = addMinutesToTime(seg.startTime, seg.durationMinutes);
            return (
              <View
                key={`${seg.serviceId}-${index}`}
                style={[
                  styles.segmentRow,
                  index > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null,
                ]}>
                <View style={styles.segmentMain}>
                  <Text variant="bodyMedium">{seg.serviceName}</Text>
                  <Text variant="caption" tone="muted">
                    {fmtTime(seg.startTime)}–{fmtTime(endTime)} · {seg.durationMinutes} min
                    {seg.pricePence != null ? ` · ${formatPence(seg.pricePence)}` : ''}
                  </Text>
                </View>
                {segments.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${seg.serviceName}`}
                    hitSlop={8}
                    onPress={() => {
                      hapticSelect();
                      onRemoveSegment(index);
                    }}
                    style={({ pressed }) => [styles.removeBtn, { opacity: pressed ? 0.6 : 1 }]}>
                    <Text variant="bodySmall" tone="danger">
                      Remove
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          {totalPence > 0 ? (
            <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
              <Text variant="label">Total</Text>
              <Text variant="label" tone="brand">
                {formatPence(totalPence)}
              </Text>
            </View>
          ) : null}
        </Card>

        {onChangeServices ? (
          <Button
            label="Change services"
            variant="secondary"
            fullWidth
            onPress={() => {
              hapticSelect();
              onChangeServices();
            }}
          />
        ) : null}
        <Text variant="caption" tone="muted">
          Up to {MAX_MULTI_SERVICE_SEGMENTS} services in one visit; the times offered are where the
          whole visit fits.
        </Text>

        {errorMessage ? (
          <Text variant="bodySmall" tone="danger">
            {errorMessage}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <Button label="Continue to details" fullWidth onPress={onContinue} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.base },
  scroll: { gap: spacing.base, paddingBottom: spacing.lg },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  segmentMain: { flex: 1, gap: 2 },
  removeBtn: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actions: { gap: spacing.sm },
});
