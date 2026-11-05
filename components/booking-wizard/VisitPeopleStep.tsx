import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { optionFromPricePence } from '@/components/booking-wizard/ServicePickerStep';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import {
  addressExclusionLine,
  choicesAsPersonChoices,
  nobodyHereLine,
  peopleForService,
  type StoredPersonChoice,
} from '@/lib/booking/visit-people';
import { formatPence } from '@/lib/format';
import { hapticSelect } from '@/lib/haptics';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import {
  ANY_AVAILABLE_PRACTITIONER_ID,
  type AppointmentCatalogPractitioner,
} from '@/types/appointment-catalog';

type VisitPeopleStepProps = {
  /** The visit's services in order: the first, then each extra. */
  services: readonly { serviceId: string; serviceName: string }[];
  /** Everyone this person may book for (already through `catalogForDiary`). */
  people: readonly AppointmentCatalogPractitioner[];
  /** One per service: a calendar id, the "any available" id, or null until chosen. */
  choices: readonly StoredPersonChoice[];
  /** A collective: a person is offered only when their business shares an address with those chosen. */
  isCollective: boolean;
  /** Whether "Any available" may be offered at all (the venue's setting, and no override). */
  allowAnyAvailable: boolean;
  onChoose: (index: number, choice: string) => void;
  onContinue: () => void;
  /** Back to the services, offered when a service has nobody to do it. */
  onChangeServices: () => void;
};

/** A person's price for a service: "from" the cheapest option when its options are priced differently. */
function personPrice(person: AppointmentCatalogPractitioner, serviceId: string): string | null {
  const service = person.services.find((s) => s.id === serviceId);
  if (!service) return null;
  const from = optionFromPricePence(service.variants);
  if (from != null) return `from ${formatPence(from)}`;
  return service.price_pence != null ? formatPence(service.price_pence) : null;
}

/**
 * Who does each service of a visit (web split-visit plan 6.1, the web's `VisitPeoplePanel`): one list
 * per service, in visit order, of the people who offer it. On a collective, someone whose business
 * does not share an address with those already chosen is left out, with the D11 line under the list.
 * Continue once every service has someone.
 */
export function VisitPeopleStep({
  services,
  people,
  choices,
  isCollective,
  allowAnyAvailable,
  onChoose,
  onContinue,
  onChangeServices,
}: VisitPeopleStepProps) {
  const { colors } = useTheme();
  const lists = services.map((svc, index) => {
    const { people: listed, excluded } = peopleForService({
      people,
      serviceId: svc.serviceId,
      chosen: choicesAsPersonChoices(choices.slice(0, index), ANY_AVAILABLE_PRACTITIONER_ID),
      isCollective,
    });
    // A collective can withhold the pooled choice per offering (`any_available: false`).
    const offeredAny = listed.some((p) => p.services.find((s) => s.id === svc.serviceId)?.any_available === false)
      ? false
      : allowAnyAvailable;
    return { svc, index, listed, excluded, showAny: listed.length > 1 && offeredAny };
  });
  const blocked = lists.some((l) => l.listed.length === 0);
  const complete = !blocked && services.every((_, i) => Boolean(choices[i]));

  return (
    <View style={styles.container} testID="visit-people">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text variant="heading">Who is each service with?</Text>
        <Text variant="bodySmall" tone="muted">
          Choose who does each service. It can be a different person for each one.
        </Text>
        {lists.map(({ svc, index, listed, excluded, showAny }) => {
          const chosen = choices[index] ?? null;
          const exclusion = addressExclusionLine(excluded.map((p) => p.name));
          return (
            <View key={`${svc.serviceId}-${index}`} style={styles.section} testID={`visit-people-service-${index}`}>
              <Text variant="label">{`${index + 1}. ${svc.serviceName}`}</Text>
              {listed.length === 0 ? (
                <View style={[styles.note, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
                  {exclusion ? <Text variant="bodySmall">{exclusion}</Text> : null}
                  <Text variant="bodySmall">{nobodyHereLine(svc.serviceName)}</Text>
                </View>
              ) : (
                <View style={styles.list}>
                  {showAny ? (
                    <PersonRow
                      name="Any available"
                      avatar="?"
                      selected={chosen === ANY_AVAILABLE_PRACTITIONER_ID}
                      onPress={() => onChoose(index, ANY_AVAILABLE_PRACTITIONER_ID)}
                    />
                  ) : null}
                  {listed.map((person) => (
                    <PersonRow
                      key={person.id}
                      name={person.name}
                      avatar={person.name}
                      detail={isCollective ? person.owning_venue_label?.trim() || person.owning_venue_name || null : null}
                      price={personPrice(person, svc.serviceId)}
                      selected={chosen === person.id}
                      onPress={() => onChoose(index, person.id)}
                    />
                  ))}
                  {exclusion ? (
                    <Text variant="caption" tone="muted" testID={`visit-people-excluded-${index}`}>
                      {exclusion}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.actions}>
        {blocked ? (
          <Button label="Change services" variant="secondary" fullWidth onPress={onChangeServices} />
        ) : null}
        <Button label="Continue" fullWidth disabled={!complete} onPress={onContinue} testID="visit-people-continue" />
      </View>
    </View>
  );
}

function PersonRow({
  name,
  avatar,
  detail = null,
  price = null,
  selected,
  onPress,
}: {
  name: string;
  avatar: string;
  detail?: string | null;
  price?: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name}${detail ? `, ${detail}` : ''}${price ? `, ${price}` : ''}`}
      onPress={() => {
        hapticSelect();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: selected ? colors.brand : colors.border,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <Avatar name={avatar} size={32} />
      <View style={styles.rowText}>
        <Text variant="bodyMedium">{name}</Text>
        {detail ? (
          <Text variant="caption" tone="muted">
            {detail}
          </Text>
        ) : null}
      </View>
      {price ? (
        <Text variant="label" tone="brand">
          {price}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.base },
  scroll: { gap: spacing.base, paddingBottom: spacing.lg },
  section: { gap: spacing.sm },
  list: { gap: spacing.sm },
  note: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  actions: { gap: spacing.sm },
});
