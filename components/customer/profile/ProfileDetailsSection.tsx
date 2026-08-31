import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import { useCustomerProfile, useUpdateCustomerProfile } from '@/lib/queries/useCustomerProfile';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/**
 * Name and phone, which are what a venue sees when the customer books.
 *
 * **Email is shown but not editable here.** Changing it is a different
 * operation with its own route and its own two-step confirmation: the new
 * address has to be confirmed from its own inbox before anything moves, because
 * an email change that took effect immediately would let a typo lock somebody
 * out of their own account. Putting it in this form beside two fields that save
 * instantly would misrepresent what pressing Save does.
 */
export function ProfileDetailsSection() {
  const toast = useToast();
  const { data, isLoading } = useCustomerProfile();
  const update = useUpdateCustomerProfile();

  const profile = data?.profile;
  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  if (isLoading) return <LoadingState message="Loading your details…" />;

  /*
    Local state starts null and falls back to the server value, so the fields
    show what is saved until the customer types. Seeding state from the query in
    an effect would fight every refetch for the cursor.
  */
  const firstValue = firstName ?? profile?.first_name ?? '';
  const lastValue = lastName ?? profile?.last_name ?? '';
  const phoneValue = phone ?? profile?.phone ?? '';
  const displayValue = displayName ?? profile?.display_name ?? '';

  const dirty =
    (firstName !== null && firstName !== (profile?.first_name ?? '')) ||
    (lastName !== null && lastName !== (profile?.last_name ?? '')) ||
    (phone !== null && phone !== (profile?.phone ?? '')) ||
    (displayName !== null && displayName !== (profile?.display_name ?? ''));

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        YOUR DETAILS
      </Text>

      {/*
        The lengths are the server's own, not invented here. `PATCH
        /api/v1/me/profile` refuses the whole save with "A text field exceeds
        the maximum length" past 100, 100, 32 and 200, and it does so without
        naming the field. Stopping the typing is a better answer than losing an
        edit to a message that does not say which box was wrong.
      */}
      <Input
        label="First name"
        value={firstValue}
        onChangeText={setFirstName}
        autoCapitalize="words"
        autoComplete="given-name"
        maxLength={100}
      />
      <Input
        label="Last name"
        value={lastValue}
        onChangeText={setLastName}
        autoCapitalize="words"
        autoComplete="family-name"
        maxLength={100}
      />
      <Input
        label="Phone"
        value={phoneValue}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={32}
        optional
        helper="Venues use this to reach you about a booking."
      />
      {/*
        The web has this and the app did not, so a name chosen there was
        invisible here and a save from this screen left it untouched but
        unexplained.
      */}
      <Input
        label="Preferred display name"
        value={displayValue}
        onChangeText={setDisplayName}
        autoCapitalize="words"
        maxLength={200}
        optional
        placeholder="How we greet you"
        helper="Used in place of your first name when we address you."
      />

      <View style={styles.emailRow}>
        <Text variant="caption" tone="muted">
          Email
        </Text>
        <Text variant="body">{data?.user?.email ?? 'Not set'}</Text>
        <Text variant="caption" tone="muted">
          To change this, please use the ResNeo website. You will need to confirm the new address
          from its inbox before it takes effect.
        </Text>
      </View>

      <Button
        label="Save"
        disabled={!dirty}
        loading={update.isPending}
        onPress={() =>
          update.mutate(
            {
              // Only what changed. The route merges, and sending untouched
              // fields back would overwrite a value edited on the web a moment
              // ago with the copy this screen happened to load.
              ...(firstName !== null ? { first_name: firstName.trim() || null } : {}),
              ...(lastName !== null ? { last_name: lastName.trim() || null } : {}),
              ...(phone !== null ? { phone: phone.trim() || null } : {}),
              ...(displayName !== null ? { display_name: displayName.trim() || null } : {}),
            },
            {
              onSuccess: () => {
                setFirstName(null);
                setLastName(null);
                setPhone(null);
                setDisplayName(null);
                toast.success('Saved.');
              },
              onError: () => toast.error('Could not save. Please try again.'),
            },
          )
        }
        style={styles.save}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  emailRow: { marginTop: spacing.base, gap: 2 },
  save: { marginTop: spacing.base },
});
