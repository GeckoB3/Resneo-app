import { useRouter, type Href } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';

import { OpeningHoursEditor } from '@/components/manage/OpeningHoursEditor';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';
import type { CollectiveView } from '@/types/collectives';
import type { OpeningHours } from '@/types/venue';

/**
 * About: the contact details and opening hours the combined page shows
 * (web #190 `CombinedPageAboutSection`). Read-only. The combined page has no
 * contact details or opening hours of its own: its header and About tab show
 * the HOST venue's, read from the same columns the public page reads. The
 * section says where they come from, how to change them, and, the part that
 * catches people out, that the hours shown are information only: what a
 * customer can actually book on each calendar is decided by that calendar's
 * own venue account, in its own business hours, closures and calendar hours.
 */
export function CombinedPageAboutSection({ collective }: { collective: CollectiveView }) {
  const router = useRouter();
  const host =
    collective.members.find((m) => m.venueId === collective.hostVenueId)?.venueName ?? 'the host venue';
  const contact = collective.hostContact ?? null;
  const website = contact?.websiteUrl ?? null;
  const websiteHref = website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null;
  const hours = (contact?.openingHours ?? null) as OpeningHours | null;
  const hoursSet = Boolean(hours && Object.keys(hours).length > 0);

  const row = (label: string, value: string | null, onPress?: () => void) => (
    <View style={styles.row}>
      <Text variant="overline" tone="muted" style={styles.rowLabel}>
        {label}
      </Text>
      {value ? (
        onPress ? (
          <Text variant="bodySmall" tone="brand" onPress={onPress} style={styles.flex1}>
            {value}
          </Text>
        ) : (
          <Text variant="bodySmall" style={styles.flex1}>
            {value}
          </Text>
        )
      ) : (
        <Text variant="bodySmall" tone="muted" style={styles.flex1}>
          Not set
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <Card style={styles.card}>
        <Text variant="label">What the combined page shows</Text>
        <Text variant="bodySmall" tone="secondary">
          {`What the combined page shows in its header and About tab. These are ${host}’s details: the combined page has none of its own.`}
        </Text>
        {row('Phone', contact?.phone ?? null, contact?.phone ? () => void Linking.openURL(`tel:${contact.phone}`) : undefined)}
        {row('Website', website, websiteHref ? () => void Linking.openURL(websiteHref) : undefined)}
        {row('Address', contact?.address ?? null)}
        <View style={styles.hours}>
          <Text variant="overline" tone="muted">
            Opening hours
          </Text>
          {hoursSet && hours ? (
            <OpeningHoursEditor value={hours} onChange={() => undefined} editable={false} />
          ) : (
            <Text variant="bodySmall" tone="muted">
              Not set
            </Text>
          )}
        </View>
        <Text variant="bodySmall" tone="secondary">
          {`${host} sets the phone, website and address under Settings, Venue profile, and the opening hours under Settings, Business hours. There is no separate copy for the combined page, so a change there shows on the page straight away.${collective.isHost ? '' : ` To change them, ask ${host}.`}`}
        </Text>
        {collective.isHost ? (
          <View style={styles.actions}>
            <Button
              label="Edit contact details"
              size="sm"
              variant="secondary"
              onPress={() => router.push('/manage/venue-profile' as Href)}
            />
            <Button
              label="Edit opening hours"
              size="sm"
              variant="secondary"
              onPress={() => router.push('/manage/hours' as Href)}
            />
          </View>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Text variant="label">Hours shown are information only</Text>
        <Text variant="bodySmall" tone="secondary">
          The opening hours on the combined page are information for customers. They do not decide
          availability. Each linked account sets its own business hours, closures and calendar
          hours for its own people, and the combined page offers a time on a calendar only when
          that calendar’s own account says it is free. So a calendar at another venue can be open
          outside the hours shown here, or closed inside them.
        </Text>
        <Text variant="bodySmall" tone="secondary">
          {`Keep your own venue’s hours right under Business hours, and each person’s hours under Availability, since those are what bookings into your calendars follow. If the venues keep different hours, the header cannot match every calendar: ${host}’s business hours are the ones to set to describe the group as a whole.`}
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  rowLabel: {
    width: 84,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
  hours: {
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
