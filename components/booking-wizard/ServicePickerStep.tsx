import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { SearchBar } from '@/components/ui/SearchBar';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { spacing } from '@/theme/index';
import type {
  AppointmentCatalogResponse,
  AppointmentServiceOption,
} from '@/types/appointment-catalog';

type ServicePickerStepProps = {
  catalog: AppointmentCatalogResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onSelect: (option: AppointmentServiceOption) => void;
  /**
   * Pre-filter to one practitioner (e.g. tapped on the calendar). When set, the
   * dedupe collapses to that practitioner's own offering so the next step targets
   * them directly without a practitioner-choice step.
   */
  defaultPractitionerId?: string | null;
};

/** One UNIQUE service per row, carrying its cheapest price across practitioners. */
export interface ServiceRow {
  option: AppointmentServiceOption;
  /** Cheapest price across all practitioners offering this service (pence). */
  fromPricePence: number | null;
  /** True when 2+ practitioners offer the service (so a price is a "from" price). */
  multiplePractitioners: boolean;
  /** How many practitioners offer this service. */
  practitionerCount: number;
}

/**
 * Collapse the catalog to ONE row per service id (the web's
 * `new Map(allServices.map(s => [s.id, s]))` dedupe). Earlier this emitted one
 * row per practitioner/service pair AND a pooled "Any available" row, so a
 * service offered by N practitioners showed N+1 times. Now each service shows
 * once with a "from £X" min price; the practitioner is chosen on its own step.
 *
 * When `practitionerId` is given the rows are scoped to that practitioner, so a
 * calendar-prefilled flow books them directly.
 */
export function dedupeCatalogServices(
  catalog: AppointmentCatalogResponse | undefined,
  practitionerId?: string | null,
): ServiceRow[] {
  if (!catalog) {
    return [];
  }

  const byService = new Map<string, ServiceRow>();

  for (const practitioner of catalog.practitioners) {
    if (practitionerId && practitioner.id !== practitionerId) {
      continue;
    }
    for (const service of practitioner.services) {
      const existing = byService.get(service.id);
      const price = service.price_pence;
      if (!existing) {
        byService.set(service.id, {
          option: {
            serviceId: service.id,
            serviceName: service.name,
            durationMinutes: service.duration_minutes,
            pricePence: service.price_pence,
            depositPence: service.deposit_pence ?? null,
            // The chosen practitioner is decided on the practitioner step; this
            // row only identifies the service. Seed with the first offering so
            // a single-practitioner flow can book without a separate step.
            practitionerId: practitioner.id,
            practitionerName: practitioner.name,
            addonGroups: service.addon_groups ?? [],
            variants: service.variants ?? [],
          },
          fromPricePence: price,
          multiplePractitioners: false,
          practitionerCount: 1,
        });
        continue;
      }
      existing.practitionerCount += 1;
      existing.multiplePractitioners = true;
      if (price != null && (existing.fromPricePence == null || price < existing.fromPricePence)) {
        existing.fromPricePence = price;
      }
    }
  }

  return [...byService.values()].sort((a, b) =>
    a.option.serviceName.localeCompare(b.option.serviceName),
  );
}

function formatFromPrice(row: ServiceRow): string | null {
  if (row.fromPricePence == null) {
    return null;
  }
  const amount = `£${(row.fromPricePence / 100).toFixed(2)}`;
  return row.multiplePractitioners ? `from ${amount}` : amount;
}

function practitionerSummary(row: ServiceRow): string {
  if (row.practitionerCount > 1) {
    return `${row.practitionerCount} practitioners`;
  }
  return row.option.practitionerName;
}

/** Step 1 — choose a UNIQUE service (optionally pre-scoped to one practitioner). */
export function ServicePickerStep({
  catalog,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  onSelect,
  defaultPractitionerId,
}: ServicePickerStepProps) {
  const practitioners = catalog?.practitioners ?? [];
  const effectivePractitioner =
    defaultPractitionerId && practitioners.some((p) => p.id === defaultPractitionerId)
      ? defaultPractitionerId
      : null;

  const rows = useMemo(
    () => dedupeCatalogServices(catalog, effectivePractitioner),
    [catalog, effectivePractitioner],
  );

  const [search, setSearch] = useState('');
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => row.option.serviceName.toLowerCase().includes(query));
  }, [rows, search]);

  if (isLoading) {
    return <LoadingState message="Loading services…" />;
  }

  if (isError) {
    return <ErrorState message={errorMessage ?? 'Could not load services.'} onRetry={onRetry} />;
  }

  if (rows.length === 0) {
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

      {rows.length > 4 ? (
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search services"
        />
      ) : null}

      <FlatList
        data={filteredRows}
        keyExtractor={(item) => item.option.serviceId}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text variant="bodySmall" tone="muted" style={styles.noResults}>
            No services match “{search.trim()}”.
          </Text>
        }
        renderItem={({ item }) => {
          const price = formatFromPrice(item);
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
                accessibilityLabel={`${item.option.serviceName}, ${item.option.durationMinutes} minutes${
                  price ? `, ${price}` : ''
                }`}>
                <View style={styles.rowText}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {item.option.serviceName}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {item.option.durationMinutes} min · {practitionerSummary(item)}
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
  list: {
    paddingBottom: spacing.xl,
  },
  noResults: {
    paddingVertical: spacing.lg,
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
