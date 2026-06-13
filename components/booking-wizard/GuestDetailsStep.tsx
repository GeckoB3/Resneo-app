import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { useGuests } from '@/lib/queries/useGuests';
import { buildGuestSchema, type GuestField } from '@/lib/validation/walk-in-guest';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { GuestListItem } from '@/types/guest-list';

export type GuestDetails = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  /** Free-text comments / requests (folded into dietary_notes on submit, web parity). */
  special_requests?: string;
};

type GuestDetailsStepProps = {
  value: GuestDetails;
  onChange: (value: GuestDetails) => void;
  onContinue: () => void;
  /** Walk-in bookings have NO mandatory fields (web parity). */
  isWalkIn?: boolean;
  /** When true, pre-fill fields are read-only (rebook flow). */
  readOnlyContact?: boolean;
  /** Fired when an existing/known contact is picked — flags the booking as returning. */
  onPickExistingContact?: () => void;
  /** Fired when the user edits a contact field manually — clears the returning flag. */
  onClearExistingContact?: () => void;
};

const SEARCH_DEBOUNCE_MS = 280;
const MIN_SEARCH_LENGTH = 2;

function guestDisplayName(guest: GuestListItem): string {
  return [guest.first_name, guest.last_name].filter(Boolean).join(' ').trim() || 'Unnamed guest';
}

function guestMeta(guest: GuestListItem): string {
  const visits =
    guest.visit_count > 0 ? `${guest.visit_count} visit${guest.visit_count === 1 ? '' : 's'}` : null;
  return [guest.phone, visits].filter(Boolean).join(' · ');
}

/**
 * Guest details — mirrors the web staff DetailsStep: separate First name +
 * Surname, optional email, phone (required for phone bookings, optional for
 * walk-ins), plus a comments box. Required fields carry a red asterisk; optional
 * ones say "(optional)". An existing-guest search fills all four contact fields.
 */
export function GuestDetailsStep({
  value,
  onChange,
  onContinue,
  isWalkIn = false,
  readOnlyContact = false,
  onPickExistingContact,
  onClearExistingContact,
}: GuestDetailsStepProps) {
  const { colors } = useTheme();
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<GuestField, string>>>({});
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
      first_name: guest.first_name ?? '',
      last_name: guest.last_name ?? '',
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
    const parsed = buildGuestSchema(isWalkIn).safeParse(value);
    if (!parsed.success) {
      const nextErrors: Partial<Record<GuestField, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !nextErrors[field as GuestField]) {
          nextErrors[field as GuestField] = issue.message;
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
          optional
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
                    {guestDisplayName(guest)}
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

      <View style={styles.nameRow}>
        <View style={styles.nameField}>
          <Input
            autoCapitalize="words"
            autoComplete="given-name"
            editable={!readOnlyContact}
            error={fieldErrors.first_name}
            label="First name"
            optional
            onChangeText={(first_name) => editContact({ first_name })}
            placeholder="First name"
            value={value.first_name}
          />
        </View>
        <View style={styles.nameField}>
          <Input
            autoCapitalize="words"
            autoComplete="family-name"
            editable={!readOnlyContact}
            error={fieldErrors.last_name}
            label="Surname"
            optional
            onChangeText={(last_name) => editContact({ last_name })}
            placeholder="Surname"
            value={value.last_name}
          />
        </View>
      </View>
      <Input
        autoCapitalize="none"
        autoComplete="email"
        editable={!readOnlyContact}
        error={fieldErrors.email}
        keyboardType="email-address"
        label="Email"
        optional
        onChangeText={(email) => editContact({ email })}
        placeholder="you@example.com"
        textContentType="emailAddress"
        value={value.email}
      />
      <Input
        autoComplete="tel"
        editable={!readOnlyContact}
        error={fieldErrors.phone}
        keyboardType="phone-pad"
        label="Phone"
        optional={isWalkIn}
        required={!isWalkIn}
        onChangeText={(phone) => editContact({ phone })}
        placeholder="Phone number"
        textContentType="telephoneNumber"
        value={value.phone}
      />

      <Input
        label="Comments or requests"
        optional
        placeholder="Anything we should know (access needs, preferences, running late…)"
        value={value.special_requests ?? ''}
        onChangeText={(special_requests) =>
          onChange({ ...value, special_requests: special_requests || undefined })
        }
        autoCapitalize="sentences"
        maxLength={500}
        multiline
        numberOfLines={3}
      />

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
  nameRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  nameField: {
    flex: 1,
  },
});
