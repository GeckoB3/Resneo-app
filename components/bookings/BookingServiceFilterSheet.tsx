import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { useAppointmentCatalog } from '@/lib/queries/useAppointmentCatalog';
import { spacing, radius } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type ServiceEntry = {
  id: string;
  name: string;
};

/** Deduplicate services across practitioners. */
function extractServices(data: { practitioners: { services: { id: string; name: string }[] }[] } | undefined): ServiceEntry[] {
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

type BookingServiceFilterSheetProps = {
  visible: boolean;
  onClose: () => void;
  venueId: string | null | undefined;
  selectedServiceId: string | null;
  onSelect: (serviceId: string | null) => void;
};

/**
 * Bottom sheet to filter bookings by appointment service name.
 * Loads services from the appointment catalog (cached for the venue).
 */
export function BookingServiceFilterSheet({
  visible,
  onClose,
  venueId,
  selectedServiceId,
  onSelect,
}: BookingServiceFilterSheetProps) {
  const { colors } = useTheme();
  const catalogQuery = useAppointmentCatalog(visible ? venueId : null);
  const services = useMemo(() => extractServices(catalogQuery.data), [catalogQuery.data]);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text variant="subheading">Filter by service</Text>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {/* All option */}
        <Pressable
          onPress={() => {
            hapticSelect();
            onSelect(null);
            onClose();
          }}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: selectedServiceId === null ? colors.brandSubtle : 'transparent',
              opacity: pressed ? 0.75 : 1,
            },
          ]}>
          <Text variant="body" color={selectedServiceId === null ? colors.brand : colors.text}>
            All services
          </Text>
          {selectedServiceId === null ? (
            <Text variant="caption" color={colors.brand}>
              ✓
            </Text>
          ) : null}
        </Pressable>

        {catalogQuery.isLoading ? (
          <View style={styles.skeletons}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} width="80%" height={18} style={{ marginBottom: spacing.sm }} />
            ))}
          </View>
        ) : (
          services.map((s) => {
            const isActive = s.id === selectedServiceId;
            return (
              <Pressable
                key={s.id}
                onPress={() => {
                  hapticSelect();
                  onSelect(s.id);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: isActive ? colors.brandSubtle : 'transparent',
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}>
                <Text variant="body" color={isActive ? colors.brand : colors.text}>
                  {s.name}
                </Text>
                {isActive ? (
                  <Text variant="caption" color={colors.brand}>
                    ✓
                  </Text>
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: {
    maxHeight: 400,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginBottom: 2,
  },
  skeletons: {
    paddingTop: spacing.md,
  },
});
