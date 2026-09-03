import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { Stack, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { RecentImportsSection } from '@/components/manage/RecentImportsSection';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Screen } from '@/components/ui/Screen';
import { SearchBar } from '@/components/ui/SearchBar';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { getWebUrl } from '@/lib/env';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { normalizePhone } from '@/lib/phone/normalize';
import { buildAddress, parseAddress } from '@/lib/venue/addressFormat';
import { isValidWebsiteUrlInput } from '@/lib/validation/url';
import { isAppointmentPlanTier } from '@/lib/venue/venue-experience';
import { useUpdateVenue } from '@/lib/queries/useVenueSettings';
import { useSlugAvailable } from '@/lib/queries/useSlugAvailable';
import {
  pickVenueImage,
  useUploadVenueLogo,
  useUploadVenueCover,
} from '@/lib/queries/useVenueImageUpload';
import { useVenueContext } from '@/providers/VenueProvider';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

// ------------------------------------------------------------------
// Slug availability hint
// ------------------------------------------------------------------
type SlugHint = 'idle' | 'checking' | 'current' | 'available' | 'taken' | 'invalid';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
const SLUG_RE = /^[a-z0-9-]+$/;

/** Web Profile-tab hand-offs (tools that still live on the web dashboard). */
const WEB_TABLE_MGMT_PATH = '/dashboard/availability?tab=table';
const WEB_IMPORT_PATH = '/dashboard/import';

/** Resolve a staff-dashboard URL on the configured WEB origin (prod fallback). */
function webDashboardUrl(path: string): string {
  const base = getWebUrl();
  return base ? `${base}${path}` : `https://app.resneo.com${path}`;
}

/**
 * Curated IANA zones — the fallback when `Intl.supportedValuesOf('timeZone')`
 * is unavailable (older engines). UK/Ireland first (the app's primary market),
 * then the rest of the common world zones.
 */
const CURATED_TIMEZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Lisbon',
  'Europe/Brussels',
  'Europe/Zurich',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
] as const;

/** All IANA zones the picker offers (engine list when available, else curated). */
const IANA_TIMEZONES: string[] = (() => {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.('timeZone');
  const list = supported && supported.length > 0 ? supported : [...CURATED_TIMEZONES];
  return [...list].sort((a, b) => a.localeCompare(b));
})();

/** Fast membership check used to validate the saved value. */
const IANA_TIMEZONE_SET = new Set(IANA_TIMEZONES);

/** Price band options — matches the web Profile tab select (£/££/£££, empty = not set). */
const PRICE_BANDS = [
  { value: '', label: 'Not set' },
  { value: '£', label: '£' },
  { value: '££', label: '££' },
  { value: '£££', label: '£££' },
] as const;

type PriceBand = (typeof PRICE_BANDS)[number]['value'];

function buildPayloadFingerprint(fields: {
  name: string;
  addrName: string;
  addrStreet: string;
  addrTown: string;
  addrPostcode: string;
  phone: string;
  email: string;
  website: string;
  slug: string;
  timezone: string;
  noShowGrace: string;
  cuisineType: string;
  priceBand: string;
  kitchenEmail: string;
}): string {
  return JSON.stringify({
    name: fields.name.trim(),
    address: buildAddress({
      name: fields.addrName.trim(),
      street: fields.addrStreet.trim(),
      town: fields.addrTown.trim(),
      postcode: fields.addrPostcode.trim(),
    }),
    // Normalise so a freshly-normalised edited value compares equal to the stored
    // (already-E.164) value and the dirty check doesn't flag a phantom change.
    phone: normalizePhone(fields.phone),
    email: fields.email.trim(),
    website_url: fields.website.trim(),
    slug: fields.slug.trim().toLowerCase(),
    timezone: fields.timezone.trim(),
    no_show_grace_minutes: parseInt(fields.noShowGrace, 10) || 15,
    cuisine_type: fields.cuisineType.trim(),
    price_band: fields.priceBand,
    kitchen_email: fields.kitchenEmail.trim(),
  });
}

/** Venue profile & contact details — full parity with web Settings → Profile tab (admin). */
export default function VenueProfileScreen() {
  const { venue, isLoading } = useVenueContext();
  const router = useRouter();
  const update = useUpdateVenue();
  const uploadLogo = useUploadVenueLogo();
  const uploadCover = useUploadVenueCover();
  const { colors } = useTheme();

  const isAdmin = venue?.current_user_role === 'admin';
  const isAppointments = isAppointmentPlanTier(venue?.pricing_tier);

  // ------------------------------------------------------------------
  // Form state
  // ------------------------------------------------------------------
  const [seeded, setSeeded] = useState(false);
  const [name, setName] = useState('');
  const [addrName, setAddrName] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrTown, setAddrTown] = useState('');
  const [addrPostcode, setAddrPostcode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState('');
  const [noShowGrace, setNoShowGrace] = useState('');
  // Restaurant-only fields (hidden on appointments plans — web parity)
  const [cuisineType, setCuisineType] = useState('');
  const [priceBand, setPriceBand] = useState('');
  const [kitchenEmail, setKitchenEmail] = useState('');

  // ------------------------------------------------------------------
  // Validation errors
  // ------------------------------------------------------------------
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [noShowError, setNoShowError] = useState<string | null>(null);
  const [slugFieldError, setSlugFieldError] = useState<string | null>(null);
  const [kitchenEmailError, setKitchenEmailError] = useState<string | null>(null);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);

  // Timezone picker (searchable Sheet of IANA zones — replaces free text).
  const [tzPickerOpen, setTzPickerOpen] = useState(false);
  const [tzQuery, setTzQuery] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inline feedback for logo/cover uploads (Alert.alert is a no-op on web)
  const [brandingFeedback, setBrandingFeedback] = useState<{
    tone: 'success' | 'danger';
    text: string;
  } | null>(null);

  // ------------------------------------------------------------------
  // Slug availability
  // ------------------------------------------------------------------
  const [debouncedSlug, setDebouncedSlug] = useState<string | null>(null);
  const [slugHint, setSlugHint] = useState<SlugHint>('idle');

  const slugAvailResult = useSlugAvailable(
    slugHint === 'checking' ? debouncedSlug : null,
  );

  // Derived fingerprint for dirty check
  const currentFingerprint = venue
    ? buildPayloadFingerprint({
        name: venue.name ?? '',
        addrName: parseAddress(venue.address).name,
        addrStreet: parseAddress(venue.address).street,
        addrTown: parseAddress(venue.address).town,
        addrPostcode: parseAddress(venue.address).postcode,
        phone: venue.phone ?? '',
        email: venue.email ?? '',
        website: venue.website_url ?? '',
        slug: venue.slug ?? '',
        timezone: venue.timezone ?? '',
        noShowGrace: String((venue as VenueBootstrapExtended).no_show_grace_minutes ?? 15),
        cuisineType: (venue as VenueBootstrapExtended).cuisine_type ?? '',
        priceBand: (venue as VenueBootstrapExtended).price_band ?? '',
        kitchenEmail: (venue as VenueBootstrapExtended).kitchen_email ?? '',
      })
    : null;

  const editedFingerprint = venue
    ? buildPayloadFingerprint({
        name,
        addrName,
        addrStreet,
        addrTown,
        addrPostcode,
        phone,
        email,
        website,
        slug,
        timezone,
        noShowGrace,
        cuisineType,
        priceBand,
        kitchenEmail,
      })
    : null;

  const hasChanges = Boolean(
    currentFingerprint && editedFingerprint && currentFingerprint !== editedFingerprint,
  );

  // ------------------------------------------------------------------
  // Seed from venue once loaded
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!venue || seeded) return;
    const parsed = parseAddress(venue.address);
    const ext = venue as VenueBootstrapExtended;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(venue.name ?? '');
     
    setAddrName(parsed.name);
     
    setAddrStreet(parsed.street);
     
    setAddrTown(parsed.town);
     
    setAddrPostcode(parsed.postcode);
     
    setPhone(venue.phone ?? '');
     
    setEmail(venue.email ?? '');
     
    setWebsite(venue.website_url ?? '');
     
    setSlug(venue.slug ?? '');
     
    setTimezone(venue.timezone ?? 'Europe/London');

    setNoShowGrace(String(ext.no_show_grace_minutes ?? 15));

    setCuisineType(ext.cuisine_type ?? '');

    setPriceBand(ext.price_band ?? '');

    setKitchenEmail(ext.kitchen_email ?? '');

    setSeeded(true);
  }, [venue, seeded]);

  // ------------------------------------------------------------------
  // Slug debounce + availability check
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!venue || !isAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSlugHint('idle');
      return;
    }
    const norm = slug.trim().toLowerCase();
    const current = (venue.slug ?? '').trim().toLowerCase();

    if (!norm) {
       
      setSlugHint('idle');
       
      setDebouncedSlug(null);
      return;
    }
    if (!SLUG_RE.test(norm) || norm.length > 100) {
       
      setSlugHint('invalid');
       
      setDebouncedSlug(null);
      return;
    }
    if (norm === current) {
       
      setSlugHint('current');
       
      setDebouncedSlug(null);
      return;
    }
     
    setSlugHint('checking');
    const timer = setTimeout(() => {
      setDebouncedSlug(norm);
    }, 450);
    return () => clearTimeout(timer);
  }, [slug, venue, isAdmin]);

  useEffect(() => {
    if (slugHint !== 'checking') return;
    if (slugAvailResult.isSuccess) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSlugHint(slugAvailResult.data.available ? 'available' : 'taken');
    } else if (slugAvailResult.isError) {
       
      setSlugHint('idle');
    }
  }, [slugHint, slugAvailResult.isSuccess, slugAvailResult.isError, slugAvailResult.data]);

  // ------------------------------------------------------------------
  // Clear stale "Saved" after 2500 ms
  // ------------------------------------------------------------------
  useEffect(() => {
    if (savedAt === null) return;
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedAt(null), 2500);
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, [savedAt]);

  // ------------------------------------------------------------------
  // Client-side validation
  // ------------------------------------------------------------------
  function validate(): boolean {
    let ok = true;
    setNameError(null);
    setEmailError(null);
    setWebsiteError(null);
    setNoShowError(null);
    setSlugFieldError(null);
    setKitchenEmailError(null);
    setTimezoneError(null);

    if (!name.trim()) {
      setNameError('Business name is required.');
      ok = false;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError('Enter a valid email address.');
      ok = false;
    }
    if (website.trim() && !isValidWebsiteUrlInput(website.trim())) {
      setWebsiteError('Enter a valid web address (e.g. example.com or https://example.com).');
      ok = false;
    }
    const grace = parseInt(noShowGrace, 10);
    if (noShowGrace.trim() && (isNaN(grace) || grace < 10 || grace > 60)) {
      setNoShowError('Grace period must be between 10 and 60 minutes.');
      ok = false;
    }
    const slugNorm = slug.trim().toLowerCase();
    if (slugNorm && (!SLUG_RE.test(slugNorm) || slugNorm.length > 100)) {
      setSlugFieldError('Lowercase letters, numbers and hyphens only (max 100 characters).');
      ok = false;
    }
    if (slugHint === 'taken') {
      setSlugFieldError('This booking page address is already taken.');
      ok = false;
    }
    if (kitchenEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kitchenEmail.trim())) {
      setKitchenEmailError('Enter a valid email address.');
      ok = false;
    }
    const tz = timezone.trim();
    if (!tz || !IANA_TIMEZONE_SET.has(tz)) {
      setTimezoneError('Choose a timezone from the list.');
      ok = false;
    }
    return ok;
  }

  // ------------------------------------------------------------------
  // Save handler
  // ------------------------------------------------------------------
  async function handleSave() {
    if (!venue) return;
    if (!validate()) return;

    setError(null);
    setSavedAt(null);

    const prev = venue as VenueBootstrapExtended;
    const parsedPrev = parseAddress(venue.address);

    // Diff-only PATCH body
    const patch: Record<string, unknown> = {};

    if (name.trim() !== (venue.name ?? '')) patch.name = name.trim();

    // A blank building name is filled with the business name (web 2026-09-02,
    // matching onboarding), so the stored address reads "Name, Street, Town,
    // Postcode" and the booking page's map and directions link can find the
    // business rather than a bare street. Only once there is a street: a venue
    // with no address must not gain one of just its name.
    const newAddr = buildAddress({
      name: addrName.trim() || (addrStreet.trim() ? name.trim() : ''),
      street: addrStreet.trim(),
      town: addrTown.trim(),
      postcode: addrPostcode.trim(),
    });
    const prevAddr = buildAddress({
      name: parsedPrev.name,
      street: parsedPrev.street,
      town: parsedPrev.town,
      postcode: parsedPrev.postcode,
    });
    if (newAddr !== prevAddr) patch.address = newAddr;

    const normalisedPhone = normalizePhone(phone);
    if (normalisedPhone !== (venue.phone ?? '')) patch.phone = normalisedPhone;
    if (email.trim() !== (venue.email ?? '')) patch.email = email.trim();
    if (website.trim() !== (venue.website_url ?? '')) patch.website_url = website.trim();

    const slugNorm = slug.trim().toLowerCase();
    if (slugNorm !== (venue.slug ?? '').trim().toLowerCase()) patch.slug = slugNorm;

    if (timezone.trim() !== (venue.timezone ?? '')) patch.timezone = timezone.trim();

    const grace = parseInt(noShowGrace, 10);
    if (!isNaN(grace) && grace !== (prev.no_show_grace_minutes ?? 15)) {
      patch.no_show_grace_minutes = grace;
    }

    // Restaurant-only fields — only editable (and only sent) on non-appointments plans
    if (!isAppointments) {
      if (cuisineType.trim() !== (prev.cuisine_type ?? '')) patch.cuisine_type = cuisineType.trim();
      if (priceBand !== (prev.price_band ?? '')) patch.price_band = priceBand;
      if (kitchenEmail.trim() !== (prev.kitchen_email ?? '')) {
        patch.kitchen_email = kitchenEmail.trim();
      }
    }

    if (Object.keys(patch).length === 0) {
      // Nothing changed
      setSavedAt(Date.now());
      return;
    }

    try {
      await update.mutateAsync(patch as Parameters<typeof update.mutateAsync>[0]);
      hapticSuccess();
      setSavedAt(Date.now());
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save venue details. Please try again.');
    }
  }

  // Timezone picker handlers.
  const openTzPicker = useCallback(() => {
    hapticSelect();
    setTzQuery('');
    setTzPickerOpen(true);
  }, []);

  const selectTimezone = useCallback((zone: string) => {
    hapticSelect();
    setTimezone(zone);
    setTimezoneError(null);
    setTzPickerOpen(false);
  }, []);

  // In-app browser tab on the configured web origin (system-browser fallback);
  // inline error if neither opens — keeps the user inside the app.
  const openWeb = useCallback((path: string) => {
    const url = webDashboardUrl(path);
    void WebBrowser.openBrowserAsync(url).catch(() =>
      Linking.openURL(url).catch(() => setError(`Could not open the browser: ${url}`)),
    );
  }, []);

  // ------------------------------------------------------------------
  // Image upload handlers
  // ------------------------------------------------------------------
  const handleLogoUpload = useCallback(async () => {
    hapticSelect();
    setBrandingFeedback(null);
    const picked = await pickVenueImage();
    if (!picked) return;
    try {
      await uploadLogo.mutateAsync(picked);
      hapticSuccess();
      setBrandingFeedback({ tone: 'success', text: 'Logo updated.' });
    } catch (e) {
      hapticWarning();
      setBrandingFeedback({
        tone: 'danger',
        text: e instanceof ApiError ? e.message : 'Could not upload logo.',
      });
    }
  }, [uploadLogo]);

  const handleCoverUpload = useCallback(async () => {
    hapticSelect();
    setBrandingFeedback(null);
    const picked = await pickVenueImage();
    if (!picked) return;
    try {
      await uploadCover.mutateAsync(picked);
      hapticSuccess();
      setBrandingFeedback({ tone: 'success', text: 'Cover photo updated.' });
    } catch (e) {
      hapticWarning();
      setBrandingFeedback({
        tone: 'danger',
        text: e instanceof ApiError ? e.message : 'Could not upload cover photo.',
      });
    }
  }, [uploadCover]);

  // ------------------------------------------------------------------
  // Slug hint text
  // ------------------------------------------------------------------
  function slugHintText(): { text: string; tone: 'success' | 'danger' | 'muted' } | null {
    if (slugFieldError) return null; // shown as Input error
    switch (slugHint) {
      case 'checking':
        return { text: 'Checking availability…', tone: 'muted' };
      case 'current':
        return { text: 'This is your current booking page address.', tone: 'success' };
      case 'available':
        return { text: 'This address is available.', tone: 'success' };
      case 'taken':
        return { text: 'Already taken — choose a different address.', tone: 'danger' };
      case 'invalid':
        return { text: 'Use lowercase letters, numbers and hyphens only.', tone: 'danger' };
      default:
        return null;
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  const header = <Stack.Screen options={{ headerShown: true, title: 'Venue profile' }} />;

  if (isLoading || !venue || !seeded) {
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

  const isSaving = update.isPending;
  const ext = venue as VenueBootstrapExtended;
  const hintInfo = slugHintText();

  return (
    <>
    <Screen scroll={false} padded={false}>
      {header}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Business name */}
          <SectionHeader title="Business details" />

          <Input
            label="Business name *"
            value={name}
            onChangeText={(v) => { setName(v); setNameError(null); }}
            maxLength={200}
            autoCapitalize="words"
            error={nameError ?? undefined}
          />

          {/* Address — 4 structured fields */}
          <View style={[styles.fieldset, { borderLeftColor: colors.border }]}>
            <Text variant="label" tone="secondary">Address</Text>
            <Input
              label="Building / venue name"
              value={addrName}
              onChangeText={setAddrName}
              maxLength={200}
              placeholder="e.g. The Old Mill"
              autoCapitalize="words"
            />
            <Input
              label="Street"
              value={addrStreet}
              onChangeText={setAddrStreet}
              maxLength={200}
              placeholder="e.g. 12 Main Street"
              autoCapitalize="words"
            />
            <Input
              label="Town / city"
              value={addrTown}
              onChangeText={setAddrTown}
              maxLength={100}
              placeholder="e.g. Belfast"
              autoCapitalize="words"
            />
            <Input
              label="Postcode"
              value={addrPostcode}
              onChangeText={setAddrPostcode}
              maxLength={20}
              placeholder="e.g. BT1 1AA"
              autoCapitalize="characters"
            />
          </View>

          {/* Contact */}
          <SectionHeader title="Contact" />

          <PhoneInput
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="+44 7700 900123"
            helper="Include the country code to ensure the number is valid (e.g. +44 for UK)."
            optional
          />
          <Input
            label="Email"
            value={email}
            onChangeText={(v) => { setEmail(v); setEmailError(null); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={255}
            helper="Guest replies to booking confirmations are sent to this address."
            error={emailError ?? undefined}
          />
          <Input
            label="Business website"
            value={website}
            onChangeText={(v) => { setWebsite(v); setWebsiteError(null); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            maxLength={2000}
            placeholder="example.com or https://example.com"
            helper="You can enter a domain without https://; we save a secure link."
            error={websiteError ?? undefined}
          />

          {/* Booking page address (slug) */}
          <SectionHeader title="Booking page" />

          <View>
            <Input
              label="Booking page address"
              value={slug}
              onChangeText={(v) => {
                setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                setSlugFieldError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={100}
              placeholder="my-venue"
              helper={undefined}
              error={slugFieldError ?? undefined}
            />
            {/* Prefix label */}
            <Text variant="caption" tone="muted" style={styles.slugPrefix}>
              Public URL: /book/{slug.trim().toLowerCase() || 'my-venue'}
            </Text>
            {hintInfo ? (
              <Text variant="caption" tone={hintInfo.tone}>
                {hintInfo.text}
              </Text>
            ) : null}
          </View>

          {/* Restaurant details — web parity: hidden for appointments plans */}
          {!isAppointments ? (
            <>
              <SectionHeader title="Restaurant details" />

              <Input
                label="Cuisine type"
                value={cuisineType}
                onChangeText={setCuisineType}
                maxLength={100}
                placeholder="e.g. Style or category"
                autoCapitalize="words"
              />

              <View style={styles.priceBandGroup}>
                <Text variant="label" tone="secondary">Price band</Text>
                <Segmented
                  options={[...PRICE_BANDS]}
                  value={(PRICE_BANDS.some((b) => b.value === priceBand) ? priceBand : '') as PriceBand}
                  onChange={(v) => setPriceBand(v)}
                />
                <Text variant="caption" tone="muted">
                  £ budget · ££ mid-range · £££ fine dining
                </Text>
              </View>

              <Input
                label="Kitchen email"
                value={kitchenEmail}
                onChangeText={(v) => { setKitchenEmail(v); setKitchenEmailError(null); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={255}
                placeholder="kitchen@venue.com"
                helper="Receives the daily dietary digest email."
                error={kitchenEmailError ?? undefined}
              />
            </>
          ) : null}

          {/* Operational settings */}
          <SectionHeader title="Operational settings" />

          <Input
            label={`No-show grace period (minutes) — ${isAppointments ? 'appointments' : 'reservations'}`}
            value={noShowGrace}
            onChangeText={(v) => { setNoShowGrace(v.replace(/[^0-9]/g, '')); setNoShowError(null); }}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="15"
            helper="How long after the scheduled time before staff can mark no-show (10–60 min)."
            error={noShowError ?? undefined}
          />

          <View style={styles.tzField}>
            <Text variant="label" tone="secondary">
              Timezone
            </Text>
            <Pressable
              onPress={openTzPicker}
              accessibilityRole="button"
              accessibilityLabel={`Timezone, ${timezone || 'not set'}. Tap to change.`}
              style={[
                styles.tzTrigger,
                {
                  backgroundColor: colors.surface,
                  borderColor: timezoneError ? colors.danger : colors.border,
                },
              ]}>
              <Text
                variant="body"
                color={timezone ? colors.text : colors.textMuted}
                style={styles.tzTriggerText}
                numberOfLines={1}>
                {timezone || 'Choose a timezone'}
              </Text>
              <SymbolView
                name={{ ios: 'chevron.up.chevron.down', android: 'unfold_more', web: 'unfold_more' }}
                tintColor={colors.textMuted}
                size={16}
              />
            </Pressable>
            {timezoneError ? (
              <Text variant="caption" tone="danger">
                {timezoneError}
              </Text>
            ) : (
              <Text variant="caption" tone="muted">
                IANA timezone (e.g. Europe/London, America/New_York). Controls appointment slot
                times.
              </Text>
            )}
          </View>

          {/* Images section */}
          <SectionHeader title="Branding" />

          <ImageUploadRow
            label="Venue logo"
            imageUrl={ext.logo_url ?? null}
            onPress={() => void handleLogoUpload()}
            loading={uploadLogo.isPending}
            colors={colors}
          />
          <ImageUploadRow
            label="Cover photo"
            imageUrl={ext.cover_photo_url ?? null}
            onPress={() => void handleCoverUpload()}
            loading={uploadCover.isPending}
            colors={colors}
          />

          {brandingFeedback ? (
            <Text variant="bodySmall" tone={brandingFeedback.tone}>
              {brandingFeedback.text}
            </Text>
          ) : null}

          <Button
            label="Edit booking page branding"
            variant="secondary"
            onPress={() => router.push('/manage/booking-page' as Href)}
          />
          <Text variant="caption" tone="muted" style={styles.webLink}>
            Brand colours, fonts, announcement, social links and public tabs.
          </Text>

          {/* Table management — web Profile tab parity (restaurant venues; tool lives on the web) */}
          {!isAppointments ? (
            <>
              <SectionHeader title="Table management & availability" />
              <Pressable
                onPress={() => openWeb(WEB_TABLE_MGMT_PATH)}
                hitSlop={8}
              >
                <Text variant="bodySmall" tone="secondary">
                  Floor plan, table combinations, legacy availability, and related deposit options
                  are managed on the web dashboard under Dining Availability → Table Management.{' '}
                  <Text variant="bodySmall" tone="brand">
                    Open on the web →
                  </Text>
                </Text>
              </Pressable>
            </>
          ) : null}

          {/* Data import — web Profile tab parity (admin-only; tool lives on the web) */}
          <SectionHeader title="Data import" />

          <Text variant="bodySmall" tone="secondary">
            Import clients and bookings from CSV exports of your previous booking system. The
            import tool (column mapping, validation, 24-hour undo) runs on the web dashboard.
          </Text>
          <Button
            label="Open Data Import on the web"
            variant="secondary"
            fullWidth
            onPress={() => openWeb(WEB_IMPORT_PATH)}
          />

          {/* Read-only recent-imports list + 24h-undo window (Domain 05). The
              backend list/undo routes are cookie-only, so this degrades to a
              "manage on the web" note when unreachable with a Bearer token. */}
          <RecentImportsSection onOpenWeb={openWeb} webImportPath={WEB_IMPORT_PATH} />

          {/* Feedback */}
          {error ? (
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          ) : null}
          {savedAt !== null ? (
            <Text variant="bodySmall" tone="success">
              Saved.
            </Text>
          ) : null}

          {/* Save */}
          <Button
            label="Save changes"
            fullWidth
            loading={isSaving}
            disabled={!hasChanges || isSaving}
            onPress={() => void handleSave()}
          />

          <View style={styles.spacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>

    <TimezonePickerSheet
      visible={tzPickerOpen}
      current={timezone}
      query={tzQuery}
      onQueryChange={setTzQuery}
      onSelect={selectTimezone}
      onClose={() => setTzPickerOpen(false)}
    />
    </>
  );
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <Text variant="subheading" style={styles.sectionHeader}>
      {title}
    </Text>
  );
}

interface TimezonePickerSheetProps {
  visible: boolean;
  current: string;
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (zone: string) => void;
  onClose: () => void;
}

/** Searchable IANA timezone picker — replaces the old free-text field. */
function TimezonePickerSheet({
  visible,
  current,
  query,
  onQueryChange,
  onSelect,
  onClose,
}: TimezonePickerSheetProps) {
  const { colors } = useTheme();

  // Always offer the current value even if the engine list omits it (legacy).
  const base =
    current && !IANA_TIMEZONE_SET.has(current)
      ? [current, ...IANA_TIMEZONES]
      : IANA_TIMEZONES;
  const q = query.trim().toLowerCase();
  const matches = q
    ? base.filter((z) => z.toLowerCase().includes(q))
    : base;

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="80%">
      <Text variant="subheading">Timezone</Text>
      <SearchBar
        value={query}
        onChangeText={onQueryChange}
        placeholder="Search zones (e.g. London, New_York)"
        autoFocus
      />
      {/* FlatList (not a ScrollView+map): the IANA list is ~600 rows, so
          virtualizing keeps the picker from mounting every row on open. */}
      <FlatList
        style={styles.tzList}
        data={matches}
        keyExtractor={(zone) => zone}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <Text variant="bodySmall" tone="muted" style={styles.tzEmpty}>
            No matching timezones.
          </Text>
        }
        renderItem={({ item: zone }) => {
          const selected = zone === current;
          return (
            <Pressable
              onPress={() => onSelect(zone)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={zone}
              style={({ pressed }) => [
                styles.tzRow,
                { borderBottomColor: colors.border },
                pressed && { backgroundColor: colors.surface },
              ]}>
              <Text
                variant="body"
                color={selected ? colors.brand : colors.text}
                style={styles.tzRowText}
                numberOfLines={1}>
                {zone}
              </Text>
              {selected ? (
                <SymbolView
                  name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                  tintColor={colors.brand}
                  size={16}
                />
              ) : null}
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}

interface ImageUploadRowProps {
  label: string;
  imageUrl: string | null;
  onPress: () => void;
  loading: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
}

function ImageUploadRow({ label, imageUrl, onPress, loading, colors }: ImageUploadRowProps) {
  return (
    <View style={styles.imageRow}>
      <View style={styles.imageRowLeft}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={[styles.imageThumbnail, { backgroundColor: colors.surface }]}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.imageThumbnail, styles.imagePlaceholder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="caption" tone="muted">None</Text>
          </View>
        )}
        <Text variant="bodySmall">{label}</Text>
      </View>
      <Button
        label={loading ? 'Uploading…' : 'Change'}
        variant="secondary"
        loading={loading}
        disabled={loading}
        onPress={onPress}
      />
    </View>
  );
}

// ------------------------------------------------------------------
// Extended type — VenueBootstrap doesn't declare these optional fields yet;
// we cast to this to read them safely from the GET /api/venue payload.
// (Fields needed added to types/venue.ts — reported as sharedChangeRequest.)
// ------------------------------------------------------------------
interface VenueBootstrapExtended {
  no_show_grace_minutes?: number | null;
  logo_url?: string | null;
  cover_photo_url?: string | null;
  cuisine_type?: string | null;
  price_band?: string | null;
  kitchen_email?: string | null;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.base,
    gap: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  fieldset: {
    gap: spacing.md,
    // Visual grouping — slight indent
    paddingLeft: spacing.sm,
    borderLeftWidth: 2,
  },
  sectionHeader: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  slugPrefix: {
    marginTop: spacing.xs,
  },
  priceBandGroup: {
    gap: spacing.xs,
  },
  imageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  imageRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  imageThumbnail: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
  },
  imagePlaceholder: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webLink: {
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  tzField: {
    gap: spacing.sm,
  },
  tzTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: minTouchTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  tzTriggerText: {
    flex: 1,
    minWidth: 0,
  },
  tzList: {
    maxHeight: 360,
  },
  tzEmpty: {
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
  tzRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: minTouchTarget,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tzRowText: {
    flex: 1,
    minWidth: 0,
  },
  spacer: {
    height: spacing.xl,
  },
});
