import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { useGuests } from '@/lib/queries/useGuests';
import { walkInGuestSchema } from '@/lib/validation/walk-in-guest';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { GuestListItem } from '@/types/guest-list';

export type GuestDetails = {
  name: string;
  phone: string;
  email: string;
  /** Optional dietary requirements (max 500 chars). */
  dietary_notes?: string;
  /** Occasion for the visit (max 200 chars). */
  occasion?: string;
  /** Any special requests (max 500 chars). */
  special_requests?: string;
};

type GuestDetailsStepProps = {
  value: GuestDetails;
  onChange: (value: GuestDetails) => void;
  onContinue: () => void;
  /** When true, pre-fill fields are read-only (rebook flow). */
  readOnlyContact?: boolean;
  /** Fired when an existing/known contact is picked — flags the booking as returning. */
  onPickExistingContact?: () => void;
  /** Fired when the user edits a contact field manually — clears the returning flag. */
  onClearExistingContact?: () => void;
};

const SEARCH_DEBOUNCE_MS = 280;
const MIN_SEARCH_LENGTH = 2;

function guestName(guest: GuestListItem): string {
  return [guest.first_name, guest.last_name].filter(Boolean).join(' ').trim() || 'Unnamed guest';
}

function guestMeta(guest: GuestListItem): string {
  const visits =
    guest.visit_count > 0 ? `${guest.visit_count} visit${guest.visit_count === 1 ? '' : 's'}` : null;
  return [guest.phone, visits].filter(Boolean).join(' · ');
}

/** Step 4 — find an existing guest or enter new contact details. */
export function GuestDetailsStep({
  value,
  onChange,
  onContinue,
  readOnlyContact = false,
  onPickExistingContact,
  onClearExistingContact,
}: GuestDetailsStepProps) {
  const { colors } = useTheme();
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'name' | 'phone' | 'email', string>>>({});
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const guestsQuery = useGuests({
    search: debouncedSearch.length >= MIN_SEARCH_LENGTH ? debouncedSearch : undefined,
    page: 0,
    limit: 8,
  });
  const results =
    debouncedSearch.length >= MIN_SEARCH_LENGTH ? guestsQuery.data?.guests ?? [] : [];

  const pickGuest = (guest: GuestListItem) => {
    onChange({
      ...value,
      name: guestName(guest),
      phone: guest.phone ?? '',
      email: guest.email ?? '',
    });
    onPickExistingContact?.();
    setSearchInput('');
    setDebouncedSearch('');
    setFieldErrors({});
  };

  // Manual edits to a contact field break the "known contact" link → clear the flag.
  const editContact = (patch: Partial<GuestDetails>) => {
    onClearExistingContact?.();
    onChange({ ...value, ...patch });
  };

  const handleContinue = () => {
    const parsed = walkInGuestSchema.safeParse(value);
    if (!parsed.success) {
      const nextErrors: Partial<Record<'name' | 'phone' | 'email', string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !nextErrors[field as 'name' | 'phone' | 'email']) {
          nextErrors[field as 'name' | 'phone' | 'email'] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    onContinue();
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <Text variant="heading">Guest details</Text>

      {!readOnlyContact ? (
        <Input
          label="Find an existing guest"
          placeholder="Search name or phone"
          value={searchInput}
          onChangeText={setSearchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      ) : null}

      {!readOnlyContact ? (
        <>
          {results.length > 0 ? (
            <View style={styles.results}>
              {results.map((guest) => (
                <Pressable
                  key={guest.id}
                  accessibilityRole="button"
                  onPress={() => pickGuest(guest)}
                  style={({ pressed }) => [
                    styles.resultRow,
                    { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                  ]}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {guestName(guest)}
                  </Text>
                  {guestMeta(guest) ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {guestMeta(guest)}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : debouncedSearch.length >= MIN_SEARCH_LENGTH && !guestsQuery.isFetching ? (
            <Text variant="caption" tone="muted">
              No matching guests — enter details below.
            </Text>
          ) : null}

          <View style={styles.divider}>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
            <Text variant="caption" tone="muted">
              or enter details
            </Text>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
          </View>
        </>
      ) : null}

      <Input
        autoCapitalize="words"
        autoComplete="name"
        editable={!readOnlyContact}
        error={fieldErrors.name}
        label="Name"
        onChangeText={(name) => editContact({ name })}
        placeholder="Guest name"
        value={value.name}
      />
      <Input
        autoComplete="tel"
        editable={!readOnlyContact}
        error={fieldErrors.phone}
        keyboardType="phone-pad"
        label="Phone"
        onChangeText={(phone) => editContact({ phone })}
        placeholder="Phone number"
        textContentType="telephoneNumber"
        value={value.phone}
      />
      <Input
        autoCapitalize="none"
        autoComplete="email"
        editable={!readOnlyContact}
        error={fieldErrors.email}
        keyboardType="email-address"
        label="Email (optional)"
        onChangeText={(email) => editContact({ email })}
        placeholder="Email address"
        textContentType="emailAddress"
        value={value.email}
      />

      {/* Appointment wizard only — restaurant-specific fields (dietary,
          occasion) live on RestaurantWalkInForm, not here. */}
      <View style={styles.optionalSection}>
        <Text variant="label" tone="secondary">
          Notes (optional)
        </Text>
        <Input
          label="Special requests"
          placeholder="Anything the team should know"
          value={value.special_requests ?? ''}
          onChangeText={(special_requests) => onChange({ ...value, special_requests: special_requests || undefined })}
          autoCapitalize="sentences"
          maxLength={500}
          multiline
          numberOfLines={3}
        />
      </View>

      <Button label="Continue" fullWidth onPress={handleContinue} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    gap: spacing.base,
    paddingBottom: spacing.xl,
  },
  results: {
    gap: spacing.sm,
  },
  resultRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: 2,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  optionalSection: {
    gap: spacing.md,
  },
});
