import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useUpdateVenue } from '@/lib/queries/useVenueSettings';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';

/** Venue profile & contact details — mirrors the web Settings → Profile tab (admin). */
export default function VenueProfileScreen() {
  const { venue, isLoading } = useVenueContext();
  const update = useUpdateVenue();

  const isAdmin = venue?.current_user_role === 'admin';

  const [seeded, setSeeded] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (venue && !seeded) {
    setSeeded(true);
    setName(venue.name ?? '');
    setAddress(venue.address ?? '');
    setPhone(venue.phone ?? '');
    setEmail(venue.email ?? '');
    setWebsite(venue.website_url ?? '');
  }

  const hasChanges =
    !!venue &&
    (name.trim() !== (venue.name ?? '') ||
      address.trim() !== (venue.address ?? '') ||
      phone.trim() !== (venue.phone ?? '') ||
      email.trim() !== (venue.email ?? '') ||
      website.trim() !== (venue.website_url ?? ''));

  async function handleSave() {
    if (!venue) return;
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync({
        ...(name.trim() !== (venue.name ?? '') ? { name: name.trim() } : {}),
        ...(address.trim() !== (venue.address ?? '') ? { address: address.trim() } : {}),
        ...(phone.trim() !== (venue.phone ?? '') ? { phone: phone.trim() } : {}),
        ...(email.trim() !== (venue.email ?? '') ? { email: email.trim() } : {}),
        ...(website.trim() !== (venue.website_url ?? '') ? { website_url: website.trim() } : {}),
      });
      hapticSuccess();
      setSaved(true);
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save venue details.');
    }
  }

  const header = <Stack.Screen options={{ title: 'Venue profile' }} />;

  if (isLoading || !venue) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  if (!isAdmin) {
    return (
      <Screen>
        {header}
        <ErrorState message="Venue details can only be edited by admins." />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Input label="Business name" value={name} onChangeText={setName} maxLength={200} />
        <Input label="Address" value={address} onChangeText={setAddress} multiline style={styles.multiline} />
        <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Input
          label="Website"
          value={website}
          onChangeText={setWebsite}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {error ? (
          <Text variant="bodySmall" tone="danger">
            {error}
          </Text>
        ) : null}
        {saved && !hasChanges ? (
          <Text variant="bodySmall" tone="success">
            Saved.
          </Text>
        ) : null}

        <Button
          label="Save changes"
          fullWidth
          loading={update.isPending}
          disabled={!hasChanges}
          onPress={() => void handleSave()}
        />
        <Text variant="caption" tone="muted" style={styles.footnote}>
          Logo, cover photo and booking-page branding are managed on the web dashboard.
        </Text>
        <View style={styles.spacer} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.md,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  footnote: {
    textAlign: 'center',
  },
  spacer: {
    height: spacing.xl,
  },
});
