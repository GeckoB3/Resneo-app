import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useAppointmentCatalog } from '@/lib/queries/useAppointmentCatalog';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** A selectable option with an optional trailing tally. */
export type FilterOption = { key: string; label: string; count?: number };

type Practitioner = { id: string; name: string };
type TimeWindow = { key: string; label: string; start: number; end: number };

/** Rose tint shared with the inline "Needs compliance" chip. */
const COMPLIANCE_TINT = '#E11D48';

type BookingFilterSheetProps = {
  visible: boolean;
  onClose: () => void;

  // Status (always shown)
  statusOptions: FilterOption[];
  status: string;
  onChangeStatus: (key: string) => void;

  // Staff — pass an empty array to hide the section.
  practitioners: Practitioner[];
  practitionerFilter: string | null;
  onChangePractitioner: (id: string | null) => void;

  // Booking-model type — pass an empty array to hide the section.
  typeOptions: FilterOption[];
  typeFilter: string | null;
  onChangeType: (key: string | null) => void;

  // Time of day — day scope only.
  showTimeOfDay: boolean;
  timeWindows: TimeWindow[];
  dayHourRange: { start: number; end: number } | null;
  onChangeDayHourRange: (range: { start: number; end: number } | null) => void;

  // Service — appointment venues only. Loaded from the appointment catalog.
  showService: boolean;
  venueId: string | null | undefined;
  serviceFilter: string | null;
  onChangeService: (id: string | null) => void;

  // Compliance — only when there are bookings needing compliance.
  showCompliance: boolean;
  complianceNeedsCount: number;
  needsComplianceOnly: boolean;
  onToggleCompliance: (next: boolean) => void;

  // Reset — clears every filter below back to its default.
  anyFilterActive: boolean;
  onReset: () => void;
};

type ServiceEntry = { id: string; name: string };

/** Deduplicate services across practitioners for the service filter chips. */
function extractServices(
  data: { practitioners: { services: { id: string; name: string }[] }[] } | undefined,
): ServiceEntry[] {
  if (!data) return [];
  const seen = new Set<string>();
  const out: ServiceEntry[] = [];
  for (const p of data.practitioners) {
    for (const s of p.services) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        out.push({ id: s.id, name: s.name });
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="overline" tone="muted">
        {title}
      </Text>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

/**
 * One bottom sheet for every booking filter — status, staff, type, time of day,
 * service and compliance — replacing the stacked horizontal chip rows that ate
 * the top of the appointments list. The parent owns all filter state; this is a
 * presentational shell. Each section hides itself when it has nothing to show.
 */
export function BookingFilterSheet({
  visible,
  onClose,
  statusOptions,
  status,
  onChangeStatus,
  practitioners,
  practitionerFilter,
  onChangePractitioner,
  typeOptions,
  typeFilter,
  onChangeType,
  showTimeOfDay,
  timeWindows,
  dayHourRange,
  onChangeDayHourRange,
  showService,
  venueId,
  serviceFilter,
  onChangeService,
  showCompliance,
  complianceNeedsCount,
  needsComplianceOnly,
  onToggleCompliance,
  anyFilterActive,
  onReset,
}: BookingFilterSheetProps) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();

  // Only fetch the catalog while the sheet is open and the section is shown.
  const catalogQuery = useAppointmentCatalog(visible && showService ? venueId : null);
  const services = useMemo(() => extractServices(catalogQuery.data), [catalogQuery.data]);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Text variant="subheading">Filters</Text>
        {anyFilterActive ? (
          <Pressable onPress={onReset} hitSlop={8}>
            <Text variant="label" color={colors.brand}>
              Reset
            </Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        style={{ maxHeight: height * 0.62 }}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}>
        <Section title="Status">
          {statusOptions.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              count={option.count}
              selected={status === option.key}
              onPress={() => onChangeStatus(option.key)}
            />
          ))}
        </Section>

        {practitioners.length > 0 ? (
          <Section title="Staff">
            <Chip
              label="All staff"
              selected={practitionerFilter === null}
              onPress={() => onChangePractitioner(null)}
            />
            {practitioners.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                selected={practitionerFilter === p.id}
                onPress={() => onChangePractitioner(practitionerFilter === p.id ? null : p.id)}
              />
            ))}
          </Section>
        ) : null}

        {typeOptions.length > 0 ? (
          <Section title="Type">
            <Chip
              label="All types"
              selected={typeFilter === null}
              onPress={() => onChangeType(null)}
            />
            {typeOptions.map((option) => (
              <Chip
                key={option.key}
                label={option.label}
                count={option.count}
                selected={typeFilter === option.key}
                onPress={() => onChangeType(typeFilter === option.key ? null : option.key)}
              />
            ))}
          </Section>
        ) : null}

        {showTimeOfDay ? (
          <Section title="Time of day">
            <Chip
              label="All day"
              selected={dayHourRange === null}
              onPress={() => onChangeDayHourRange(null)}
            />
            {timeWindows.map((w) => {
              const active = dayHourRange?.start === w.start && dayHourRange?.end === w.end;
              return (
                <Chip
                  key={w.key}
                  label={w.label}
                  selected={active}
                  onPress={() => onChangeDayHourRange(active ? null : { start: w.start, end: w.end })}
                />
              );
            })}
          </Section>
        ) : null}

        {showService ? (
          <Section title="Service">
            <Chip
              label="All services"
              selected={serviceFilter === null}
              onPress={() => onChangeService(null)}
            />
            {catalogQuery.isLoading
              ? [0, 1, 2].map((i) => (
                  <Skeleton key={i} width={96} height={36} radius={radius.pill} />
                ))
              : services.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.name}
                    selected={serviceFilter === s.id}
                    onPress={() => onChangeService(serviceFilter === s.id ? null : s.id)}
                  />
                ))}
          </Section>
        ) : null}

        {showCompliance ? (
          <Section title="Compliance">
            <Chip
              label="Needs compliance"
              count={complianceNeedsCount}
              selected={needsComplianceOnly}
              selectedColor={COMPLIANCE_TINT}
              onPress={() => onToggleCompliance(!needsComplianceOnly)}
            />
          </Section>
        ) : null}
      </ScrollView>

      <Button label="Done" variant="primary" fullWidth onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  body: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
