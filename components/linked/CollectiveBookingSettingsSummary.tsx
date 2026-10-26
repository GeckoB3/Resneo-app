import { StyleSheet } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { hostSettingsNote } from '@/lib/linked/collective-membership-copy';
import { spacing } from '@/theme/index';
import type { CollectiveView } from '@/types/collectives';

/**
 * The collective's own booking settings, which its page and every venue in it book under (web
 * `CollectiveBookingSettingsSummary`, collective booking settings plan CBS-1, copy word for word),
 * plus what the page takes from the host venue's profile. The host changes them in Booking
 * settings; a member reads them here.
 */
export function CollectiveBookingSettingsSummary({ collective }: { collective: CollectiveView }) {
  const host =
    collective.members.find((m) => m.venueId === collective.hostVenueId)?.venueName ?? 'the host venue';
  // Older servers send only the two flow flags; the others then read as unknown and are left out.
  const s = collective.bookingSettings;
  const onOff = (on: boolean | undefined) => (on ? 'on' : 'off');
  return (
    <Card style={styles.card} testID="collective-booking-settings-summary">
      <Text variant="label">{`Booking settings for ${collective.name}`}</Text>
      <Text variant="caption" tone="muted">
        {collective.isHost
          ? `These apply to the ${collective.name} page and to online bookings at every venue in it. Change them in Settings, Booking settings.`
          : `These apply to the ${collective.name} page and to online bookings at every venue in it, yours included. ${host} sets them.`}
      </Text>
      {s ? (
        <>
          <Text variant="bodySmall" tone="secondary">{`Guests sign in to book: ${onOff(s.requireAccountLogin)}`}</Text>
          <Text variant="bodySmall" tone="secondary">
            {`Guests change their own appointments online: ${onOff(s.guestSelfReschedule)}`}
          </Text>
          <Text variant="bodySmall" tone="secondary">{`Appointment waitlist: ${onOff(s.waitlist)}`}</Text>
        </>
      ) : null}
      <Text variant="bodySmall" tone="secondary">
        {`“Any available”: ${onOff(s?.anyAvailablePractitioner ?? collective.hostAnyAvailablePractitioner)}`}
      </Text>
      <Text variant="bodySmall" tone="secondary">
        {`Guests choose the person first: ${onOff(s?.staffFirstBookingFlow ?? collective.hostStaffFirstBookingFlow)}`}
      </Text>
      <Text variant="caption" tone="muted">
        {`From ${host}’s own settings: the address, phone and website in the header and the currency and wording (Settings, Profile), and the opening hours shown to guests (Settings, Business hours).`}
      </Text>
      <Text variant="caption" tone="muted">
        {hostSettingsNote(collective, host)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
});
