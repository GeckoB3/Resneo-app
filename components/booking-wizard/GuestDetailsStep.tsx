import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useSheetKeyboardScroll } from '@/components/bookings/sheet-scroll-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PhoneWithCountryField } from '@/components/ui/PhoneWithCountryField';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { useGuests } from '@/lib/queries/useGuests';
import { buildGuestSchema, type GuestField } from '@/lib/validation/walk-in-guest';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CountryCode } from '@/lib/phone/e164';
import type { GuestListItem } from '@/types/guest-list';

export type GuestDetails = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  /** Free-text comments / requests (folded into dietary_notes on submit, web parity). */
  special_requests?: string;
  /** Service-delivery address for at-home (`client_address`) services. */
  address_line1?: string;
  address_line2?: string;
  address_city?: string;
  address_postcode?: string;
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
  /**
   * When true, the chosen service is delivered at the client's address — show an
   * address fieldset (line1/town/postcode required). Mirrors the web DetailsStep
   * `collectClientAddress`.
   */
  collectClientAddress?: boolean;
  /**
   * When provided, render a Phone/Walk-in "Booking type" selector at the top of
   * this step so the source is chosen BEFORE contact details — a walk-in then
   * relaxes the phone requirement immediately. Used by the class/event/resource
   * flows, where the toggle otherwise only appears on the later confirm step
   * (so a walk-in couldn't get past this step without a phone). Keep `isWalkIn`
   * in sync (`source === 'walk-in'`) so the required-field logic follows.
   */
  source?: 'phone' | 'walk-in';
  onSourceChange?: (source: 'phone' | 'walk-in') => void;
  /**
   * The country the phone picker starts on (web: from the venue's currency,
   * `defaultPhoneCountryForVenueCurrency`). A picked contact's stored number
   * moves the picker to that number's own country.
   */
  phoneDefaultCountry?: CountryCode;
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
 * Surname, email and phone, ALL optional for every staff source since web #190
 * (a caller in a hurry can still be booked in; without a phone there is no text
 * reminder, without an email no confirmation), plus a comments box. Optional
 * fields say "(optional)". An existing-guest search fills all four contact fields.
 */
/** Address fields whose presence is gated when collecting a client address. */
type AddressField = 'address_line1' | 'address_city' | 'address_postcode';

export function GuestDetailsStep({
  value,
  onChange,
  onContinue,
  isWalkIn = false,
  readOnlyContact = false,
  onPickExistingContact,
  onClearExistingContact,
  collectClientAddress = false,
  source,
  onSourceChange,
  phoneDefaultCountry = 'GB',
}: GuestDetailsStepProps) {
  const { colors } = useTheme();
  // Keyboard avoidance. The wizard lives on a plain `Screen` (no
  // `keyboardAvoiding`), and the app runs edge-to-edge, so nothing built-in
  // lifts a field off the soft keyboard on Android (see the note in
  // sheet-scroll-context.tsx). Let the keyboard overlay the scroll body, pad the
  // scroll CONTENT by its height, and lift the focused field by only its overlap.
  const scrollRef = useRef<ScrollView>(null);
  const { onScroll, onLayout, onContentSizeChange, spacerStyle } =
    useSheetKeyboardScroll(scrollRef);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<GuestField, string>>>({});
  const [addressErrors, setAddressErrors] = useState<Partial<Record<AddressField, string>>>({});
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
    let ok = true;
    if (!parsed.success) {
      const nextErrors: Partial<Record<GuestField, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !nextErrors[field as GuestField]) {
          nextErrors[field as GuestField] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      ok = false;
    } else {
      setFieldErrors({});
    }

    // At-home services need an address. Staff walk-ins keep it optional so an
    // in-person booking is never blocked (web parity with `addressSchemaFields`).
    if (collectClientAddress && !isWalkIn) {
      const nextAddrErrors: Partial<Record<AddressField, string>> = {};
      if (!value.address_line1?.trim()) nextAddrErrors.address_line1 = 'Address line 1 is required';
      if (!value.address_city?.trim()) nextAddrErrors.address_city = 'Town or city is required';
      if (!value.address_postcode?.trim()) nextAddrErrors.address_postcode = 'Postcode is required';
      setAddressErrors(nextAddrErrors);
      if (Object.keys(nextAddrErrors).length > 0) ok = false;
    } else {
      setAddressErrors({});
    }

    if (!ok) return;
    onContinue();
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onScroll={onScroll}
      onLayout={onLayout}
      onContentSizeChange={onContentSizeChange}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}>
      <Animated.View style={[styles.container, spacerStyle]}>
        <Text variant="heading">Guest details</Text>

        {source && onSourceChange ? (
          <View style={styles.sourceBlock}>
            <Text variant="label" tone="secondary">
              Booking type
            </Text>
            <Segmented
              options={[
                { value: 'phone', label: 'Phone' },
                { value: 'walk-in', label: 'Walk-in' },
              ]}
              value={source}
              onChange={onSourceChange}
            />
          </View>
        ) : null}

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
            ) : debouncedSearch.length >= MIN_SEARCH_LENGTH && guestsQuery.isFetching ? (
              // Loading affordance — on a slow link the search would otherwise
              // appear to do nothing until results pop in. (results is empty here
              // because keepPreviousData has no prior page for a first search.)
              <View
                style={[styles.loadingRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                accessibilityRole="progressbar"
                accessibilityLabel="Searching guests">
                <ActivityIndicator size="small" color={colors.brand} />
                <Text variant="caption" tone="muted">
                  Searching…
                </Text>
              </View>
            ) : debouncedSearch.length >= MIN_SEARCH_LENGTH ? (
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
          helper="Without an email the client gets no confirmation."
          keyboardType="email-address"
          label="Email"
          optional
          onChangeText={(email) => editContact({ email })}
          placeholder="you@example.com"
          textContentType="emailAddress"
          value={value.email}
        />
        {/* Country code + national number, as the web's staff form (PhoneWithCountryField). */}
        <PhoneWithCountryField
          defaultCountry={phoneDefaultCountry}
          editable={!readOnlyContact}
          error={fieldErrors.phone}
          helper="Without a phone number the client gets no text reminder."
          label="Phone"
          optional
          onChange={(phone) => editContact({ phone })}
          value={value.phone}
        />

        {collectClientAddress ? (
          <View style={styles.addressBlock}>
            <Text variant="label" tone="secondary">
              Service address
            </Text>
            <Text variant="caption" tone="muted">
              Where should the practitioner travel to for this appointment?
            </Text>
            <Input
              autoCapitalize="words"
              autoComplete="address-line1"
              error={addressErrors.address_line1}
              label="Address line 1"
              required={!isWalkIn}
              optional={isWalkIn}
              onChangeText={(address_line1) => onChange({ ...value, address_line1 })}
              placeholder="Street address"
              textContentType="streetAddressLine1"
              value={value.address_line1 ?? ''}
            />
            <Input
              autoCapitalize="words"
              autoComplete="address-line2"
              label="Address line 2"
              optional
              onChangeText={(address_line2) => onChange({ ...value, address_line2 })}
              placeholder="Flat, building (optional)"
              textContentType="streetAddressLine2"
              value={value.address_line2 ?? ''}
            />
            <View style={styles.nameRow}>
              <View style={styles.nameField}>
                <Input
                  autoCapitalize="words"
                  error={addressErrors.address_city}
                  label="Town or city"
                  required={!isWalkIn}
                  optional={isWalkIn}
                  onChangeText={(address_city) => onChange({ ...value, address_city })}
                  placeholder="Town or city"
                  textContentType="addressCity"
                  value={value.address_city ?? ''}
                />
              </View>
              <View style={styles.nameField}>
                <Input
                  autoCapitalize="characters"
                  error={addressErrors.address_postcode}
                  label="Postcode"
                  required={!isWalkIn}
                  optional={isWalkIn}
                  onChangeText={(address_postcode) => onChange({ ...value, address_postcode })}
                  placeholder="Postcode"
                  textContentType="postalCode"
                  value={value.address_postcode ?? ''}
                />
              </View>
            </View>
          </View>
        ) : null}

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
          numberOfLines={2}
        />

        <Button label="Continue" fullWidth onPress={handleContinue} />
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  container: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  sourceBlock: {
    gap: spacing.sm,
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
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
  addressBlock: {
    gap: spacing.md,
  },
});
