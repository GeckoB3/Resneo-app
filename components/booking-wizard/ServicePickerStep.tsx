import { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';
import {
  ANY_AVAILABLE_PRACTITIONER_ID,
  type AppointmentCatalogResponse,
  type AppointmentServiceOption,
} from '@/types/appointment-catalog';

type ServicePickerStepProps = {
  catalog: AppointmentCatalogResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onSelect: (option: AppointmentServiceOption) => void;
  /** Pre-filter to one practitioner (e.g. tapped on the calendar). */
  defaultPractitionerId?: string | null;
};

/** Builds one picker row per practitioner/service assignment. */
export function flattenCatalogServices(
  catalog: AppointmentCatalogResponse | undefined,
): AppointmentServiceOption[] {
  if (!catalog) {
    return [];
  }

  const options: AppointmentServiceOption[] = [];
  for (const practitioner of catalog.practitioners) {
    for (const service of practitioner.services) {
      options.push({
        serviceId: service.id,
        serviceName: service.name,
        durationMinutes: service.duration_minutes,
        pricePence: service.price_pence,
        depositPence: service.deposit_pence ?? null,
        practitionerId: practitioner.id,
        practitionerName: practitioner.name,
        addonGroups: service.addon_groups ?? [],
        variants: service.variants ?? [],
      });
    }
  }

  return options.sort((a, b) => a.serviceName.localeCompare(b.serviceName));
}

/**
 * One pooled "Any available" row per service offered by 2+ practitioners.
 * Slots for these rows are merged client-side across the candidate practitioners.
 */
export function buildAnyAvailableOptions(
  options: AppointmentServiceOption[],
): AppointmentServiceOption[] {
  const byService = new Map<string, AppointmentServiceOption[]>();
  for (const option of options) {
    const list = byService.get(option.serviceId) ?? [];
    list.push(option);
    byService.set(option.serviceId, list);
  }

  const pooled: AppointmentServiceOption[] = [];
  for (const list of byService.values()) {
    if (list.length < 2) continue;
    const first = list[0]!;
    pooled.push({
      ...first,
      practitionerId: ANY_AVAILABLE_PRACTITIONER_ID,
      practitionerName: 'Any available',
      candidatePractitionerIds: list.map((o) => o.practitionerId),
    });
  }
  return pooled;
}

function formatPrice(pricePence: number | null): string | null {
  if (pricePence == null) {
    return null;
  }
  return `£${(pricePence / 100).toFixed(2)}`;
}

/** Step 1 — choose a service (optionally filtered by practitioner). */
export function ServicePickerStep({
  catalog,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  onSelect,
  defaultPractitionerId,
}: ServicePickerStepProps) {
  const allServices = useMemo(() => flattenCatalogServices(catalog), [catalog]);
  const practitioners = catalog?.practitioners ?? [];

  const [filter, setFilter] = useState<string | null>(defaultPractitionerId ?? null);
  const effectiveFilter =
    filter && practitioners.some((p) => p.id === filter) ? filter : null;

  const services = useMemo(() => {
    if (effectiveFilter) {
      return allServices.filter((s) => s.practitionerId === effectiveFilter);
    }
    // No practitioner filter: offer pooled "Any available" rows ahead of the
    // per-practitioner duplicates for services with 2+ practitioners.
    const pooled = buildAnyAvailableOptions(allServices);
    return [...allServices, ...pooled].sort(
      (a, b) =>
        a.serviceName.localeCompare(b.serviceName) ||
        Number(b.practitionerId === ANY_AVAILABLE_PRACTITIONER_ID) -
          Number(a.practitionerId === ANY_AVAILABLE_PRACTITIONER_ID),
    );
  }, [allServices, effectiveFilter]);

  if (isLoading) {
    return <LoadingState message="Loading services…" />;
  }

  if (isError) {
    return <ErrorState message={errorMessage ?? 'Could not load services.'} onRetry={onRetry} />;
  }

  if (allServices.length === 0) {
    return (
      <EmptyState
        title="No services available"
        message="Add active services and staff in the web dashboard to take bookings here."
      />
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="heading">Choose a service</Text>

      {practitioners.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}>
          <Chip label="Anyone" selected={!effectiveFilter} onPress={() => setFilter(null)} />
          {practitioners.map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              selected={effectiveFilter === p.id}
              onPress={() => setFilter(p.id)}
            />
          ))}
        </ScrollView>
      ) : null}

      <FlatList
        data={services}
        keyExtractor={(item) => `${item.practitionerId}-${item.serviceId}`}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        renderItem={({ item }) => {
          const price = formatPrice(item.pricePence);
          return (
            <Card padded onPress={() => onSelect(item)}>
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {item.serviceName}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {item.durationMinutes} min · {item.practitionerName}
                  </Text>
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
  filterRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.base,
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
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
