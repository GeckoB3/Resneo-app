import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { addMinutesToTime } from '@/lib/booking/booking-format';
import type { MultiServiceSegment } from '@/lib/booking/multi-service-chain';
import { chainTotalPence } from '@/lib/booking/multi-service-chain';
import { formatPence } from '@/lib/format';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
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
  /** Append a service (by catalog service id) to the chain; returns once revalidated. */
  onAddService: (serviceId: string) => void;
  onRemoveSegment: (index: number) => void;
  onContinue: () => void;
  /** Inline error from a failed append/remove (e.g. server rejects the chain). */
  errorMessage?: string | null;
};

/**
 * Review step for a multi-service (back-to-back) visit. Lists each chosen
 * segment with its auto-computed start/end, lets staff append more services with
 * the same practitioner (start times recompute automatically) or remove extras,
 * then continue to guest details. Mirrors the web `multi_service` step.
 */
export function MultiServiceReviewStep({
  segments,
  visitPractitioner,
  onAddService,
  onRemoveSegment,
  onContinue,
  errorMessage,
}: MultiServiceReviewStepProps) {
  const { colors } = useTheme();
  const [showServiceList, setShowServiceList] = useState(false);
  const totalPence = chainTotalPence(segments);
  const canAddMore = segments.length < MAX_MULTI_SERVICE_SEGMENTS;
  const practitionerName = visitPractitioner?.name ?? segments[0]?.practitionerName ?? '';

  // Only services WITHOUT options can be appended: the append path can't carry a
  // variant choice, so a variant-driven service would be added with its base
  // duration and the server's consecutive-chain check fails ("must be
  // consecutive"). Such services are booked on their own instead.
  const appendableServices = (visitPractitioner?.services ?? []).filter(
    (svc) => (svc.variants?.length ?? 0) === 0,
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text variant="heading">Review your services</Text>
        <Text variant="bodySmall" tone="muted">
          {practitionerName
            ? `Same visit with ${practitionerName}, back-to-back. Add more or continue to details.`
            : 'Add more services (back-to-back) or continue to details.'}
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

        {canAddMore ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              hapticSelect();
              setShowServiceList((v) => !v);
            }}
            style={({ pressed }) => [
              styles.addToggle,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Text variant="bodyMedium" tone="brand">
              {showServiceList ? 'Hide service list' : '+ Add another service'}
            </Text>
          </Pressable>
        ) : (
          <Text variant="caption" tone="muted">
            You can book up to {MAX_MULTI_SERVICE_SEGMENTS} services in one visit.
          </Text>
        )}

        {showServiceList && visitPractitioner ? (
          <View style={[styles.serviceList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="caption" tone="muted">
              Next start time is calculated automatically.
            </Text>
            {appendableServices.length > 0 ? (
              <View style={styles.chips}>
                {appendableServices.map((svc) => (
                  <Pressable
                    key={svc.id}
                    accessibilityRole="button"
                    onPress={() => {
                      hapticSelect();
                      onAddService(svc.id);
                      setShowServiceList(false);
                    }}
                    style={({ pressed }) => [
                      styles.serviceChip,
                      { borderColor: colors.border, backgroundColor: colors.surfaceRaised, opacity: pressed ? 0.7 : 1 },
                    ]}>
                    <Text variant="bodySmall">{svc.name}</Text>
                    <Text variant="caption" tone="muted">
                      {svc.duration_minutes} min
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text variant="caption" tone="muted">
                No more services can be added to this visit. Services with options are booked on their own.
              </Text>
            )}
          </View>
        ) : null}

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
  addToggle: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  serviceList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  serviceChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  actions: { gap: spacing.sm },
});
