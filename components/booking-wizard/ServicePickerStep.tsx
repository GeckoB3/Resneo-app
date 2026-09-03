import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { StaffDurationControl } from '@/components/booking-wizard/StaffDurationControl';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PressableScale } from '@/components/ui/PressableScale';
import { SearchBar } from '@/components/ui/SearchBar';
import { Text } from '@/components/ui/Text';
import {
  compareByCategoryThenServiceOrder,
  groupServicesByCategory,
  hasServiceCategories,
  SERVICE_SEARCH_MIN_SERVICES,
  serviceMatchesSearch,
  type ServicesLayout,
} from '@/lib/booking/service-categories';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
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
  /** Selecting carries the per-service staff duration override (null = default). */
  onSelect: (option: AppointmentServiceOption, durationOverride: number | null) => void;
  /**
   * Pre-filter to one practitioner (e.g. tapped on the calendar). When set, the
   * dedupe collapses to that practitioner's own offering so the next step targets
   * them directly without a practitioner-choice step.
   */
  defaultPractitionerId?: string | null;
  /** Currently selected service id — seeds the duration pill on back-navigation. */
  selectedServiceId?: string | null;
  /** Existing override for the selected service — seeds the pill on back-navigation. */
  initialDurationOverride?: number | null;
  /**
   * How categories are shown once the venue has them (the booking page's own
   * `services_layout`): headed sections, or collapsible categories that all start
   * closed except the one holding the selected service. Flat when there are none.
   */
  layout?: ServicesLayout;
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

/** What the grouping helpers read off a row. */
function categorisable(row: ServiceRow) {
  return {
    id: row.option.serviceId,
    name: row.option.serviceName,
    sort_order: row.option.sortOrder ?? 0,
    category: row.option.category ?? null,
    description: row.option.description ?? null,
  };
}

/**
 * Collapse the catalog to ONE row per service id (the web's
 * `new Map(allServices.map(s => [s.id, s]))` dedupe). Earlier this emitted one
 * row per practitioner/service pair AND a pooled "Any available" row, so a
 * service offered by N practitioners showed N+1 times. Now each service shows
 * once with a "from £X" min price; the practitioner is chosen on its own step.
 *
 * Rows come back in booking-page order: category position, then the venue's own
 * drag order, then name — the same comparator the public page uses, so staff and
 * customer see one list. (This used to sort alphabetically, which ignored the
 * venue's order even before categories existed.)
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
            buffer_minutes: service.buffer_minutes,
            pricePence: service.price_pence,
            depositPence: service.deposit_pence ?? null,
            paymentRequirement: service.payment_requirement ?? null,
            // The chosen practitioner is decided on the practitioner step; this
            // row only identifies the service. Seed with the first offering so
            // a single-practitioner flow can book without a separate step.
            practitionerId: practitioner.id,
            practitionerName: practitioner.name,
            addonGroups: service.addon_groups ?? [],
            variants: service.variants ?? [],
            locationType: service.location_type,
            description: service.description ?? null,
            sortOrder: service.sort_order ?? 0,
            category: service.category ?? null,
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
    compareByCategoryThenServiceOrder(categorisable(a), categorisable(b)),
  );
}

/** A line of the picker: a category heading, or one service under it. */
export type PickerLine =
  | { kind: 'heading'; key: string; categoryId: string | null; name: string; count: number; open: boolean }
  | { kind: 'service'; key: string; row: ServiceRow; categoryName: string | null };

/**
 * The lines the list draws, from the rows and the venue's layout:
 *  - no categories → the services, flat (exactly as before);
 *  - `sections` → each heading followed by its services;
 *  - `accordion` → each heading, followed by its services only while open;
 *  - while a search is typed → the matches, flat, each naming its category, so
 *    nothing hides behind a closed heading.
 */
export function buildPickerLines(
  rows: readonly ServiceRow[],
  params: { layout: ServicesLayout; search: string; openCategoryIds: ReadonlySet<string | null> },
): PickerLine[] {
  const categorised = hasServiceCategories(rows.map(categorisable));
  const query = params.search.trim();
  if (query) {
    return rows
      .filter((row) => serviceMatchesSearch(categorisable(row), query))
      .map((row) => ({
        kind: 'service' as const,
        key: row.option.serviceId,
        row,
        categoryName: categorised ? (row.option.category?.name ?? null) : null,
      }));
  }
  if (!categorised) {
    return rows.map((row) => ({ kind: 'service' as const, key: row.option.serviceId, row, categoryName: null }));
  }
  const lines: PickerLine[] = [];
  for (const group of groupServicesByCategory(rows.map((row) => ({ ...categorisable(row), row })))) {
    const open = params.layout === 'sections' || params.openCategoryIds.has(group.id);
    lines.push({
      kind: 'heading',
      key: `heading:${group.id ?? 'other'}`,
      categoryId: group.id,
      name: group.name,
      count: group.services.length,
      open,
    });
    if (open) {
      for (const entry of group.services) {
        lines.push({ kind: 'service', key: entry.row.option.serviceId, row: entry.row, categoryName: null });
      }
    }
  }
  return lines;
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
  selectedServiceId,
  initialDurationOverride,
  layout = 'sections',
}: ServicePickerStepProps) {
  const { colors } = useTheme();
  const practitioners = catalog?.practitioners ?? [];
  const effectivePractitioner =
    defaultPractitionerId && practitioners.some((p) => p.id === defaultPractitionerId)
      ? defaultPractitionerId
      : null;

  const rows = useMemo(
    () => dedupeCatalogServices(catalog, effectivePractitioner),
    [catalog, effectivePractitioner],
  );

  // Per-service staff duration overrides (minutes). Seeded from the active
  // selection so going BACK to this step keeps a custom duration visible.
  const [overrides, setOverrides] = useState<Record<string, number>>(() =>
    selectedServiceId && initialDurationOverride != null
      ? { [selectedServiceId]: initialDurationOverride }
      : {},
  );

  const setOverride = (serviceId: string, minutes: number | null) =>
    setOverrides((prev) => {
      const next = { ...prev };
      if (minutes == null) delete next[serviceId];
      else next[serviceId] = minutes;
      return next;
    });

  const [search, setSearch] = useState('');

  // Collapsible categories all start closed (the owner's call, web 2026-09-02);
  // the one exception is the category holding the service already chosen, which
  // must never hide from someone coming back to change their mind.
  const [openCategoryIds, setOpenCategoryIds] = useState<Set<string | null>>(() => {
    const selected = selectedServiceId
      ? rows.find((r) => r.option.serviceId === selectedServiceId)
      : null;
    return selected ? new Set([selected.option.category?.id ?? null]) : new Set();
  });
  const toggleCategory = (categoryId: string | null) =>
    setOpenCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });

  const lines = useMemo(
    () => buildPickerLines(rows, { layout, search, openCategoryIds }),
    [rows, layout, search, openCategoryIds],
  );

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

      {rows.length >= SERVICE_SEARCH_MIN_SERVICES ? (
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search services"
        />
      ) : null}

      <FlatList
        data={lines}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text variant="bodySmall" tone="muted" style={styles.noResults}>
            No services match “{search.trim()}”.
          </Text>
        }
        renderItem={({ item }) => {
          if (item.kind === 'heading') {
            const collapsible = layout === 'accordion';
            return (
              <Pressable
                onPress={collapsible ? () => toggleCategory(item.categoryId) : undefined}
                disabled={!collapsible}
                accessibilityRole={collapsible ? 'button' : 'header'}
                accessibilityState={collapsible ? { expanded: item.open } : undefined}
                accessibilityLabel={`${item.name}, ${item.count} service${item.count === 1 ? '' : 's'}`}
                style={[styles.heading, collapsible && { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text variant="label" style={styles.headingText}>
                  {item.name}
                </Text>
                <Text variant="caption" tone="muted">
                  {item.count}
                </Text>
                {collapsible ? (
                  <SymbolView
                    name={
                      item.open
                        ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }
                        : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }
                    }
                    tintColor={colors.textMuted}
                    size={16}
                  />
                ) : null}
              </Pressable>
            );
          }

          const option = item.row.option;
          const hasVariants = (option.variants ?? []).length > 0;
          const natural = option.durationMinutes;
          const override = overrides[option.serviceId] ?? null;
          const displayedDuration = override ?? natural;
          const price = formatFromPrice(item.row);
          // Variant services choose their duration on the variant step (web parity).
          const metaParts = [
            hasVariants ? `From ${natural} min · ${practitionerSummary(item.row)}` : practitionerSummary(item.row),
            // A search result shows its category so a flat match still says where it lives.
            ...(item.categoryName ? [item.categoryName] : []),
          ];
          return (
            <Card padded={false}>
              <View style={styles.row}>
                <PressableScale
                  haptic
                  onPress={() => onSelect(option, hasVariants ? null : override)}
                  accessibilityLabel={`${option.serviceName}, ${
                    hasVariants ? `from ${natural}` : displayedDuration
                  } minutes${price ? `, ${price}` : ''}`}
                  style={styles.selectArea}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {option.serviceName}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {metaParts.join(' · ')}
                  </Text>
                </PressableScale>
                <View style={styles.rowRight}>
                  {price ? (
                    <Text variant="label" tone="brand">
                      {price}
                    </Text>
                  ) : null}
                  {hasVariants ? (
                    <SymbolView
                      name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                      tintColor={colors.textMuted}
                      size={16}
                    />
                  ) : (
                    <StaffDurationControl
                      naturalDuration={natural}
                      override={override}
                      onChange={(minutes) => setOverride(option.serviceId, minutes)}
                    />
                  )}
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
  list: {
    paddingBottom: spacing.xl,
  },
  noResults: {
    paddingVertical: spacing.lg,
  },
  separator: {
    height: spacing.sm,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  headingText: {
    flex: 1,
    fontFamily: fonts.semibold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.base,
    paddingRight: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectArea: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingVertical: spacing.sm,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
});
