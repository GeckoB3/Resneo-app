import { FlatList, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { spacing } from '@/theme/index';
import {
  ANY_AVAILABLE_PRACTITIONER_ID,
  type AppointmentCatalogPractitioner,
  type AppointmentCatalogResponse,
} from '@/types/appointment-catalog';

type StaffRow = {
  id: string;
  name: string;
  caption: string | null;
  /** `null` for the pooled "Any available" row. */
  value: AppointmentCatalogPractitioner | null;
};

type StaffPickerStepProps = {
  catalog: AppointmentCatalogResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry: () => void;
  /** Offer the pooled "Any available" row (flag on + 2+ bookable people). */
  allowAnyAvailable: boolean;
  /**
   * Chosen id, so returning to this step by Back shows what is already picked.
   * {@link ANY_AVAILABLE_PRACTITIONER_ID} for the pooled row.
   */
  selectedPractitionerId?: string | null;
  /** `null` id = "Any available". */
  onSelect: (practitioner: AppointmentCatalogPractitioner | null) => void;
};

/**
 * FIRST step of the staff-first ordering — choose the person, then see only what
 * they offer. Shown instead of (not as well as) the practitioner step, which in
 * service-first ordering sits after the service.
 *
 * Anyone with at least one bookable service is listed; the catalogue is already
 * scoped to what this venue sells, so a practitioner with an empty service list
 * would be a dead end and is filtered out.
 */
export function StaffPickerStep({
  catalog,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  allowAnyAvailable,
  selectedPractitionerId = null,
  onSelect,
}: StaffPickerStepProps) {
  const practitioners = (catalog?.practitioners ?? []).filter((p) => p.services.length > 0);

  if (isLoading) {
    return <ListSkeleton />;
  }
  if (isError) {
    return (
      <View style={styles.stateWrap}>
        <ErrorState message={errorMessage ?? 'Could not load your team.'} onRetry={onRetry} />
      </View>
    );
  }
  if (practitioners.length === 0) {
    return (
      <View style={styles.stateWrap}>
        <EmptyState
          title="Nobody to book with yet"
          message="Add a bookable calendar with at least one service, then take a booking here."
        />
      </View>
    );
  }

  const rows: StaffRow[] = [];

  // Pooled row first, matching the practitioner step and the public page.
  if (allowAnyAvailable && practitioners.length >= 2) {
    rows.push({
      id: ANY_AVAILABLE_PRACTITIONER_ID,
      name: 'Any available',
      caption: 'First available staff member will be assigned',
      value: null,
    });
  }

  for (const practitioner of practitioners) {
    const count = practitioner.services.length;
    rows.push({
      id: practitioner.id,
      name: practitioner.name,
      caption: `${count} service${count === 1 ? '' : 's'}`,
      value: practitioner,
    });
  }

  return (
    <View style={styles.container}>
      <Text variant="heading">Who is it with?</Text>
      <Text variant="bodyMedium" tone="muted">
        Pick the person, then choose from what they offer.
      </Text>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        renderItem={({ item }) => {
          const isSelected = selectedPractitionerId === item.id;
          return (
            <Card
              padded
              onPress={() => {
                hapticSelect();
                onSelect(item.value);
              }}>
              <View
                style={styles.row}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${item.name}${item.caption ? `, ${item.caption}` : ''}`}>
                <Avatar name={item.value === null ? '?' : item.name} size={36} />
                <View style={styles.rowText}>
                  <Text variant="bodyMedium">{item.name}</Text>
                  {item.caption ? (
                    <Text variant="caption" tone="muted">
                      {item.caption}
                    </Text>
                  ) : null}
                </View>
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
  stateWrap: {
    flex: 1,
    padding: spacing.base,
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
