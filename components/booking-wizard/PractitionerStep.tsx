import { FlatList, StyleSheet, View } from 'react-native';

import { optionFromPricePence } from '@/components/booking-wizard/ServicePickerStep';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { DOES_NOT_USUALLY_OFFER } from '@/lib/booking/availability-override';
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
  /** Staff "Override availability" on (web #187): every person is listed, some unassigned. */
  overrideAvailability?: boolean;
  /**
   * Several services, and someone other than these people offers some of them (web split-visit plan
   * 6.1): offers "Choose someone different for each service" under the list.
   */
  onChooseEach?: () => void;
  /**
   * The visit's other services after the first, when several are booked with one person: the heading
   * names them all and each person's price is theirs for the whole visit (found 2026-11-04: the list
   * named the first service alone and priced it alone).
   */
  extraServices?: ReadonlyArray<{ serviceId: string; serviceName: string }>;
};

/**
 * The service as `practitioner` offers it: their own price, length, buffer, processing, options and
 * add-ons (each may differ by person, and on a collective by business).
 */
export function optionForPractitioner(
  serviceOption: AppointmentServiceOption,
  practitioner: AppointmentCatalogPractitioner,
): AppointmentServiceOption | null {
  const service = practitioner.services.find((s) => s.id === serviceOption.serviceId);
  if (!service) return null;
  return {
    ...serviceOption,
    practitionerId: practitioner.id,
    practitionerName: practitioner.name,
    candidatePractitionerIds: undefined,
    // Use the practitioner-scoped service attributes (price/duration/buffer
    // may differ; the pattern follows the same row, re-fitted server-side to
    // a custom staff length).
    durationMinutes: service.duration_minutes,
    buffer_minutes: service.buffer_minutes,
    processing_time_blocks: service.processing_time_blocks,
    pricePence: service.price_pence,
    depositPence: service.deposit_pence ?? null,
    paymentRequirement: service.payment_requirement ?? serviceOption.paymentRequirement ?? null,
    addonGroups: service.addon_groups ?? [],
    variants: service.variants ?? [],
    locationType: service.location_type ?? serviceOption.locationType,
  };
}

type PractitionerRow = {
  id: string;
  name: string;
  isAnyAvailable: boolean;
  /** Practitioner-scoped price (pence) for the row caption. */
  pricePence: number | null;
  /** The price is the cheapest of options priced differently, so it reads "from". */
  priceIsFrom?: boolean;
  /** Practitioner-scoped duration (minutes) for the row caption. */
  durationMinutes: number | null;
  /** Override catalogue only: false when this person is not assigned the service. */
  assigned?: boolean;
  option: AppointmentServiceOption;
};

function formatPrice(row: Pick<PractitionerRow, 'pricePence' | 'priceIsFrom'>): string | null {
  if (row.pricePence == null) return null;
  const amount = `£${(row.pricePence / 100).toFixed(2)}`;
  // Lower case, as the service step writes its "from" prices.
  return row.priceIsFrom ? `from ${amount}` : amount;
}

function rowCaption(
  row: PractitionerRow,
  durationOverride: number | null,
  overrideAvailability: boolean,
): string | null {
  if (row.isAnyAvailable) {
    return 'First available staff member will be assigned';
  }
  const parts: string[] = [];
  // A staff custom duration (set on the service step) applies to every
  // practitioner, so it wins over each one's service-default duration.
  const duration = durationOverride ?? row.durationMinutes;
  if (duration != null) parts.push(`${duration} min`);
  const price = formatPrice(row);
  if (price) parts.push(price);
  // The override lists every person; one not assigned the service says so.
  if (overrideAvailability && row.assigned === false) parts.push(DOES_NOT_USUALLY_OFFER);
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
  overrideAvailability = false,
  onChooseEach,
  extraServices = [],
}: PractitionerStepProps) {
  const visitIds = [serviceOption.serviceId, ...extraServices.map((e) => e.serviceId)];
  const isVisit = extraServices.length > 0;
  const rows: PractitionerRow[] = [];

  // A collective catalogue can withhold the pooled choice per offering
  // (`any_available: false`, web 2026-09-04); a venue's own catalogue never
  // sets it, so only an explicit false hides the row.
  if (allowAnyAvailable && practitioners.length >= 2 && serviceOption.anyAvailable !== false) {
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
    const option = optionForPractitioner(serviceOption, practitioner);
    if (!service || !option) continue;
    // The option is chosen after the person, so where this person's options
    // are priced differently the row says "from" the cheapest (web QA G-4).
    const optionFrom = optionFromPricePence(service.variants);
    if (isVisit) {
      // This person's price for every service of the visit; "from" when any has options priced apart.
      let total = 0;
      let from = false;
      let known = false;
      for (const id of visitIds) {
        const s = practitioner.services.find((x) => x.id === id);
        if (!s) continue;
        const sFrom = optionFromPricePence(s.variants);
        const pence = sFrom ?? s.price_pence;
        if (sFrom != null) from = true;
        if (pence != null) {
          total += pence;
          known = true;
        }
      }
      rows.push({
        id: practitioner.id,
        name: practitioner.name,
        isAnyAvailable: false,
        pricePence: known ? total : null,
        priceIsFrom: from,
        // A visit's length depends on its buffers and processing: the times step says it.
        durationMinutes: null,
        assigned: service.assigned,
        option,
      });
      continue;
    }
    rows.push({
      id: practitioner.id,
      name: practitioner.name,
      isAnyAvailable: false,
      pricePence: optionFrom ?? service.price_pence,
      priceIsFrom: optionFrom != null,
      durationMinutes: service.duration_minutes,
      assigned: service.assigned,
      option,
    });
  }

  return (
    <View style={styles.container}>
      <Text variant="heading">Choose a practitioner</Text>
      <Text variant="bodyMedium" tone="muted" testID="practitioner-step-services">
        {[serviceOption.serviceName, ...extraServices.map((e) => e.serviceName)].join(' + ')}
      </Text>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        ListFooterComponent={
          onChooseEach ? (
            <View style={styles.footer}>
              <Button
                label="Choose someone different for each service"
                variant="secondary"
                fullWidth
                testID="choose-each-person"
                onPress={() => {
                  hapticSelect();
                  onChooseEach();
                }}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const caption = rowCaption(item, isVisit ? null : durationOverride, overrideAvailability);
          const price = item.isAnyAvailable ? null : formatPrice(item);
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
  footer: {
    marginTop: spacing.md,
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
