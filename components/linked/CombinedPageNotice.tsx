import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { SettingsCollectiveNote } from '@/lib/linked/collective-page';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Top of the Booking page settings for a venue in a live collective (web
 * 2026-09-05, `CombinedPageNotice`): says the venue uses a combined page, where
 * it is managed, and points there. Hosts get a button that opens Manage
 * combined page; members get Linked venues, where they can view the combined
 * page and their part in it. Copy is the web's, verbatim.
 */
export function CombinedPageNotice({
  collective,
  onManage,
  onOpenLinkedAccounts,
}: {
  collective: SettingsCollectiveNote;
  onManage: () => void;
  onOpenLinkedAccounts: () => void;
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
          ? 'Your combined booking page is set up under Manage combined page: its services, calendars, headings, photos and branding all live there, not on this tab.'
          : `${collective.hostVenueName} hosts your combined booking page and manages its services, calendars and branding under Manage combined page. You can view the combined page, and your part in it, under Linked venues.`}
      </Text>
      <Text variant="bodySmall" tone="secondary">
        {collective.adoptedThisVenue
          ? 'The combined page is served at this venue’s own booking address, so guests who use that address see the combined page. The settings below shape this venue’s own page only.'
          : 'The settings below shape this venue’s own booking page only. The combined page has its own address and its own settings.'}
      </Text>
      <View style={styles.actions}>
        {collective.isHost ? (
          <Button label="Manage combined page" size="sm" onPress={onManage} />
        ) : null}
        <Button
          label="Open Linked venues"
          size="sm"
          variant={collective.isHost ? 'secondary' : 'primary'}
          onPress={onOpenLinkedAccounts}
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
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
