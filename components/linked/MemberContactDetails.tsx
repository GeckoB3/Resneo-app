import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import {
  ContactDetailsSummary,
  ContactDisplayGrid,
  GuestEmailNotice,
  useGuestEmailGate,
  type GuestEmailSource,
} from '@/components/manage/ContactDetailsSection';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { resolveContactDisplay, venuePublicEmail, type ContactDisplay } from '@/lib/booking/contactDisplay';
import { collectiveSettingsCopy } from '@/lib/linked/collective-settings-copy';
import { useUpdateBookingPageConfig } from '@/lib/queries/useBookingPage';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';

/**
 * What a member keeps on this screen (web `MemberContactDetails`): its own details, and what the
 * page's Our locations list shows about it. The list reads the venue's own About choices, the same
 * ones its own page uses, so they carry across joining and leaving.
 */
export function MemberContactDetails({ hostName }: { hostName: string }) {
  const router = useRouter();
  const toast = useToast();
  const { venue } = useVenueContext();
  const update = useUpdateBookingPageConfig();
  const config = venue?.booking_page_config ?? null;
  const [display, setDisplay] = useState<ContactDisplay>(() => resolveContactDisplay(config));
  const guestEmail: GuestEmailSource = { address: venuePublicEmail(venue), loginEmails: venue?.login_emails ?? [] };
  const change = (next: ContactDisplay) => {
    setDisplay(next);
    update.mutate(
      { contact_display: next },
      { onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save that.') },
    );
  };
  const gate = useGuestEmailGate(display, change, guestEmail);
  const openProfile = () => router.push('/manage/venue-profile' as Href);
  return (
    <Card style={styles.card} testID="member-contact-details">
      <Text variant="label">{collectiveSettingsCopy.contactMemberTitle}</Text>
      <Text variant="bodySmall" tone="secondary">
        {collectiveSettingsCopy.contactMemberBody}
      </Text>
      <Text variant="bodySmall" tone="secondary">
        {collectiveSettingsCopy.contactMemberPageNote(hostName)}
      </Text>
      <ContactDetailsSummary
        values={{
          name: venue?.name ?? null,
          address: venue?.address ?? null,
          phone: venue?.phone ?? null,
          email: venuePublicEmail(venue),
          website: venue?.website_url ?? null,
        }}
        onEdit={openProfile}
      />
      <Text variant="label">{collectiveSettingsCopy.contactMemberListTitle}</Text>
      <Text variant="caption" tone="muted">
        {collectiveSettingsCopy.contactMemberListBody}
      </Text>
      <ContactDisplayGrid
        value={display}
        onChange={gate.onChange}
        places={['about']}
        details={['address', 'phone', 'email']}
        placeLabels={{ about: 'Show' }}
      />
      <GuestEmailNotice
        source={guestEmail}
        shown={display.about.email}
        pending={gate.pending}
        onAccept={gate.accept}
        onCancel={gate.cancel}
        onUseDifferent={openProfile}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
});
