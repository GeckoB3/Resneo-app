import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import type { SettingsCollectiveNote } from '@/lib/linked/collective-page';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** Which booking page the screen is managing. */
export type BookingPageScope = 'combined' | 'own';

/**
 * Top of the Booking page screen for a venue in a live collective (web
 * `CombinedPageScopeSwitch`, settings-booking-page-collective-scope-plan):
 * says the venue shares one booking page with the other members and switches
 * the screen between that combined page and this venue's own page. Copy is
 * the web's, verbatim.
 */
export function CombinedPageScopeSwitch({
  collective,
  scope,
  onScopeChange,
}: {
  collective: SettingsCollectiveNote;
  scope: BookingPageScope;
  onScopeChange: (scope: BookingPageScope) => void;
}) {
  const { colors } = useTheme();
  return (
    <Card style={[styles.card, { borderColor: colors.brand }]}>
      <Text variant="overline" tone="muted">
        Venue collective
      </Text>
      <Text variant="subheading">{`This venue is part of ${collective.name}`}</Text>
      <Text variant="bodySmall" tone="secondary">
        {collective.isHost
          ? `This venue shares one booking page with the other members of ${collective.name}, and hosts it. Guests who book with you use the combined page. This venue’s own page is separate.`
          : `This venue shares one booking page with the other members of ${collective.name}. ${collective.hostVenueName} hosts it. Guests who book with you use the combined page. This venue’s own page is separate.`}
      </Text>
      {collective.adoptedThisVenue ? (
        <Text variant="bodySmall" tone="secondary">
          The combined page is served at this venue’s own address, so its settings are what guests
          see there.
        </Text>
      ) : null}
      <View style={styles.switch}>
        <Segmented<BookingPageScope>
          options={[
            { value: 'combined', label: `Combined page (${collective.name})` },
            { value: 'own', label: 'This venue’s own page' },
          ]}
          value={scope}
          onChange={onScopeChange}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  switch: {
    marginTop: spacing.xs,
  },
});
