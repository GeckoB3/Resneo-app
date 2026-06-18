import { FlatList, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { spacing } from '@/theme/index';
import {
  ANY_AVAILABLE_PRACTITIONER_ID,
  type AppointmentCatalogPractitioner,
  type AppointmentServiceOption,
} from '@/types/appointment-catalog';

type PractitionerStepProps = {
  /** All practitioners that offer the selected service. */
  practitioners: AppointmentCatalogPractitioner[];
  /** The base service option (from ServicePickerStep). */
  serviceOption: AppointmentServiceOption;
  /** Whether to surface an "Any available" pooled option (feature-flagged + 2+ staff). */
  allowAnyAvailable: boolean;
  /** Staff duration override (minutes) chosen at the service step — shown in each
   *  practitioner's caption in place of the service default. */
  durationOverride?: number | null;
  /** Called when the user picks a specific practitioner or "Any available". */
  onSelect: (option: AppointmentServiceOption) => void;
};

type PractitionerRow = {
  id: string;
  name: string;
  isAnyAvailable: boolean;
  /** Practitioner-scoped price (pence) for the row caption. */
  pricePence: number | null;
  /** Practitioner-scoped duration (minutes) for the row caption. */
  durationMinutes: number | null;
  option: AppointmentServiceOption;
};

function formatPrice(pricePence: number | null): string | null {
  if (pricePence == null) return null;
  return `£${(pricePence / 100).toFixed(2)}`;
}

function rowCaption(row: PractitionerRow, durationOverride: number | null): string | null {
  if (row.isAnyAvailable) {
    return 'First available staff member will be assigned';
  }
  const parts: string[] = [];
  // A staff custom duration (set on the service step) applies to every
  // practitioner, so it wins over each one's service-default duration.
  const duration = durationOverride ?? row.durationMinutes;
  if (duration != null) parts.push(`${duration} min`);
  const price = formatPrice(row.pricePence);
  if (price) parts.push(price);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Step — choose the practitioner for the selected service. Always shown after
 * the service (unless a single practitioner / calendar-prefill resolves it).
 * Each practitioner shows THEIR own price/duration; "Any available" appears on
 * top only when the feature flag is on and 2+ staff offer the service.
 */
export function PractitionerStep({
  practitioners,
  serviceOption,
  allowAnyAvailable,
  durationOverride = null,
  onSelect,
}: PractitionerStepProps) {
  const rows: PractitionerRow[] = [];

  if (allowAnyAvailable && practitioners.length >= 2) {
    rows.push({
      id: ANY_AVAILABLE_PRACTITIONER_ID,
      name: 'Any available',
      isAnyAvailable: true,
      pricePence: null,
      durationMinutes: null,
      option: {
        ...serviceOption,
        practitionerId: ANY_AVAILABLE_PRACTITIONER_ID,
        practitionerName: 'Any available',
        candidatePractitionerIds: practitioners.map((p) => p.id),
      },
    });
  }

  // One row per practitioner that offers this service, each with their own price.
  for (const practitioner of practitioners) {
    const service = practitioner.services.find((s) => s.id === serviceOption.serviceId);
    if (!service) continue;
    rows.push({
      id: practitioner.id,
      name: practitioner.name,
      isAnyAvailable: false,
      pricePence: service.price_pence,
      durationMinutes: service.duration_minutes,
      option: {
        ...serviceOption,
        practitionerId: practitioner.id,
        practitionerName: practitioner.name,
        candidatePractitionerIds: undefined,
        // Use the practitioner-scoped service attributes (price/duration/buffer may differ).
        durationMinutes: service.duration_minutes,
        buffer_minutes: service.buffer_minutes,
        pricePence: service.price_pence,
        depositPence: service.deposit_pence ?? null,
        addonGroups: service.addon_groups ?? [],
        variants: service.variants ?? [],
        locationType: service.location_type ?? serviceOption.locationType,
      },
    });
  }

  return (
    <View style={styles.container}>
      <Text variant="heading">Choose a practitioner</Text>
      <Text variant="bodyMedium" tone="muted">
        {serviceOption.serviceName}
      </Text>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        renderItem={({ item }) => {
          const caption = rowCaption(item, durationOverride);
          const price = item.isAnyAvailable ? null : formatPrice(item.pricePence);
          return (
            <Card
              padded
              onPress={() => {
                hapticSelect();
                onSelect(item.option);
              }}>
              <View
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}${caption ? `, ${caption}` : ''}`}>
                <Avatar name={item.isAnyAvailable ? '?' : item.name} size={36} />
                <View style={styles.rowText}>
                  <Text variant="bodyMedium">{item.name}</Text>
                  {caption ? (
                    <Text variant="caption" tone="muted">
                      {caption}
                    </Text>
                  ) : null}
                </View>
                {price ? (
                  <Text variant="label" tone="brand">
                    {price}
                  </Text>
                ) : null}
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.md,
  },
  list: {
    paddingBottom: spacing.xl,
  },
  separator: {
    height: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
