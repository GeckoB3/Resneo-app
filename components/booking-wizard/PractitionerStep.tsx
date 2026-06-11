import { FlatList, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
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
  /** Called when the user picks a specific practitioner or "Any available". */
  onSelect: (option: AppointmentServiceOption) => void;
};

type PractitionerRow = {
  id: string;
  name: string;
  isAnyAvailable: boolean;
  option: AppointmentServiceOption;
};

/** Step 1b — choose a practitioner when a service has 2+ staff. */
export function PractitionerStep({ practitioners, serviceOption, onSelect }: PractitionerStepProps) {
  const rows: PractitionerRow[] = [];

  // "Any available" row first.
  rows.push({
    id: ANY_AVAILABLE_PRACTITIONER_ID,
    name: 'Any available',
    isAnyAvailable: true,
    option: {
      ...serviceOption,
      practitionerId: ANY_AVAILABLE_PRACTITIONER_ID,
      practitionerName: 'Any available',
      candidatePractitionerIds: practitioners.map((p) => p.id),
    },
  });

  // One row per practitioner that offers this service.
  for (const practitioner of practitioners) {
    const service = practitioner.services.find((s) => s.id === serviceOption.serviceId);
    if (!service) continue;
    rows.push({
      id: practitioner.id,
      name: practitioner.name,
      isAnyAvailable: false,
      option: {
        ...serviceOption,
        practitionerId: practitioner.id,
        practitionerName: practitioner.name,
        candidatePractitionerIds: undefined,
        // Use the practitioner-scoped service attributes (price/duration may differ).
        durationMinutes: service.duration_minutes,
        pricePence: service.price_pence,
        depositPence: service.deposit_pence ?? null,
        addonGroups: service.addon_groups ?? [],
        variants: service.variants ?? [],
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
        renderItem={({ item }) => (
          <Card padded onPress={() => onSelect(item.option)}>
            <View style={styles.row}>
              <Avatar
                name={item.isAnyAvailable ? '?' : item.name}
                size={36}
              />
              <View style={styles.rowText}>
                <Text variant="bodyMedium">{item.name}</Text>
                {item.isAnyAvailable ? (
                  <Text variant="caption" tone="muted">
                    First available staff member will be assigned
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>
        )}
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
