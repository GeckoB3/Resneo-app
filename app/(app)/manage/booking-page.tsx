import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { Stack, useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { BookingPagePreview } from '@/components/bookingPage/BookingPagePreview';
import { BookingPageQrCard } from '@/components/bookingPage/BookingPageQrCard';
import { CoverCropperSheet } from '@/components/bookingPage/CoverCropperSheet';
import { GalleryEditorSheet } from '@/components/bookingPage/GalleryEditorSheet';
import { LogoFramingSheet } from '@/components/bookingPage/LogoFramingSheet';
import { ServicePhotosSheet } from '@/components/bookingPage/ServicePhotosSheet';
import { TeamProfilesSheet } from '@/components/bookingPage/TeamProfilesSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  BOOKING_ABOUT_MAX,
  BOOKING_ANNOUNCEMENT_MAX,
  BOOKING_FONT_PRESETS,
  BOOKING_SOCIAL_MAX,
  BOOKING_THEME_PRESETS,
  isBookingFontPreset,
  normalizeHexColor,
  primaryNeedsDarkText,
  readableTextColor,
  type BookingFontPreset,
  type BookingPageConfig,
  type BookingPageCoverCropBox,
  type BookingPageImageFraming,
  type BookingTeamProfile,
} from '@/lib/booking/bookingPageConfig';
import {
  buildVenueEmbedSnippet,
  normalizeEmbedAccentHex,
} from '@/lib/embed/embedSnippet';
import { getWebUrl } from '@/lib/env';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useUpdateBookingPageConfig } from '@/lib/queries/useBookingPage';
import { useSlugAvailable } from '@/lib/queries/useSlugAvailable';
import {
  pickVenueImage,
  useUploadVenueCover,
  useUploadVenueLogo,
} from '@/lib/queries/useVenueImageUpload';
import { useUpdateVenue } from '@/lib/queries/useVenueSettings';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** Quick-pick colour swatches for the brand/accent hex inputs. */
const COLOUR_SWATCHES = [
  '#003b6f', '#0e7490', '#14532d', '#6b21a8', '#9f1239',
  '#1f2937', '#b45309', '#0f766e', '#4338ca', '#be123c',
];

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Assemble the editor-owned `booking_page_config` keys from raw field values.
 *  Excludes the sheet-managed keys (gallery / service_photos / team_profiles),
 *  which save themselves and are preserved by the server's key-by-key merge. */
function assembleConfig(raw: {
  primary: string;
  accent: string;
  fontPreset: BookingFontPreset | null;
  announcement: string;
  about: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  x: string;
  showServices: boolean;
  showTeam: boolean;
  showAbout: boolean;
  coverFullWidth: boolean;
  logoCrop: BookingPageImageFraming | null;
  coverCropBox: BookingPageCoverCropBox | null;
}): BookingPageConfig {
  return {
    brand_primary: normalizeHexColor(raw.primary),
    brand_accent: normalizeHexColor(raw.accent),
    // 'default' (Clean/Inter) is the implicit default — send null so it round-trips
    // identically to an absent value (the server doesn't store 'default').
    font_preset: raw.fontPreset && raw.fontPreset !== 'default' ? raw.fontPreset : null,
    announcement: raw.announcement.trim() || null,
    about: raw.about.trim() || null,
    social_links: {
      instagram: raw.instagram.trim() || null,
      facebook: raw.facebook.trim() || null,
      tiktok: raw.tiktok.trim() || null,
      x: raw.x.trim() || null,
    },
    show_services_tab: raw.showServices,
    show_team_tab: raw.showTeam,
    show_about_tab: raw.showAbout,
    cover_full_width: raw.coverFullWidth,
    logo_crop: raw.logoCrop,
    cover_crop_box: raw.coverCropBox,
  };
}

/** The editor-owned config JSON for a stored `booking_page_config` (the autosave baseline). */
function configJsonFromStored(cfg: BookingPageConfig): string {
  return JSON.stringify(
    assembleConfig({
      primary: cfg.brand_primary ?? '',
      accent: cfg.brand_accent ?? '',
      fontPreset: isBookingFontPreset(cfg.font_preset) ? cfg.font_preset : null,
      announcement: cfg.announcement ?? '',
      about: cfg.about ?? '',
      instagram: cfg.social_links?.instagram ?? '',
      facebook: cfg.social_links?.facebook ?? '',
      tiktok: cfg.social_links?.tiktok ?? '',
      x: cfg.social_links?.x ?? '',
      showServices: cfg.show_services_tab === true,
      showTeam: cfg.show_team_tab === true,
      showAbout: cfg.show_about_tab === true,
      coverFullWidth: cfg.cover_full_width === true,
      logoCrop: cfg.logo_crop ?? null,
      coverCropBox: cfg.cover_crop_box ?? null,
    }),
  );
}

/**
 * Public booking-page editor (admin only). Edits the venue `booking_page_config`
 * (brand colours, font, announcement, about, socials, tab visibility, logo/cover
 * framing) plus the logo + cover images. A **live preview** at the top reflects
 * changes instantly; branding/content **autosaves** (debounced) — image uploads,
 * crops and the gallery/service/team editors persist immediately. Full parity
 * with the web `BookingPageEditor`.
 */
export default function BookingPageScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const { venue, isLoading } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';

  const updateConfig = useUpdateBookingPageConfig();
  const uploadLogo = useUploadVenueLogo();
  const uploadCover = useUploadVenueCover();
  const updateVenue = useUpdateVenue();

  const logoUrl = venue?.logo_url ?? null;
  const coverUrl = venue?.cover_photo_url ?? null;
  const venueName = venue?.name ?? 'Your venue';

  // Config form state.
  const [primary, setPrimary] = useState('');
  const [accent, setAccent] = useState('');
  const [fontPreset, setFontPreset] = useState<BookingFontPreset | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [about, setAbout] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [x, setX] = useState('');
  const [showServices, setShowServices] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [coverFullWidth, setCoverFullWidth] = useState(false);
  const [logoCrop, setLogoCrop] = useState<BookingPageImageFraming | null>(null);
  const [coverCropBox, setCoverCropBox] = useState<BookingPageCoverCropBox | null>(null);
  const [openSheet, setOpenSheet] = useState<
    null | 'gallery' | 'service' | 'team' | 'logoFraming' | 'coverCrop'
  >(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  // The last config JSON we persisted (or seeded). Autosave compares against THIS,
  // not the refetched config, so server-side normalisation can never loop and a
  // not-yet-seeded mount can never overwrite stored config with empty state.
  const lastSavedJsonRef = useRef<string | null>(null);

  // Embed accent colour (a VENUE column, separate from the booking_page_config
  // brand colours) — drives the embed iframe `?accent=`. Autosaves via
  // useUpdateVenue (mirrors the web WidgetSection persistAccent), debounced and
  // compared against the last-persisted value so it never loops.
  const [embedAccent, setEmbedAccent] = useState('');
  const [embedAccentStatus, setEmbedAccentStatus] = useState<SaveStatus>('idle');
  const lastSavedEmbedAccentRef = useRef<string | null>(null);

  // Inline booking-page slug (co-located with the embed/URL — web parity). Edited
  // here AND on venue-profile; both PATCH `slug` via the same endpoint.
  const [slugInput, setSlugInput] = useState('');
  const [slugDebounced, setSlugDebounced] = useState<string | null>(null);
  const [slugSaveStatus, setSlugSaveStatus] = useState<SaveStatus>('idle');

  // Seed from the venue's stored config — once per venue id (background refetches
  // return the same id, so unsaved edits are preserved). Tab + cover defaults are
  // OPT-IN (=== true), matching the web/server (new venues: tabs off, cover contained).
  useEffect(() => {
    if (!venue) return;
    const cfg = venue.booking_page_config ?? {};
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when the venue loads
    setPrimary(cfg.brand_primary ?? '');
    setAccent(cfg.brand_accent ?? '');
    setFontPreset(isBookingFontPreset(cfg.font_preset) ? cfg.font_preset : 'default');
    setAnnouncement(cfg.announcement ?? '');
    setAbout(cfg.about ?? '');
    setInstagram(cfg.social_links?.instagram ?? '');
    setFacebook(cfg.social_links?.facebook ?? '');
    setTiktok(cfg.social_links?.tiktok ?? '');
    setX(cfg.social_links?.x ?? '');
    setShowServices(cfg.show_services_tab === true);
    setShowTeam(cfg.show_team_tab === true);
    setShowAbout(cfg.show_about_tab === true);
    setCoverFullWidth(cfg.cover_full_width === true);
    setLogoCrop(cfg.logo_crop ?? null);
    setCoverCropBox(cfg.cover_crop_box ?? null);
    lastSavedJsonRef.current = configJsonFromStored(cfg);
    setSaveStatus('idle');
    // Embed accent (venue column) — seed normalised (no `#`), tracking baseline.
    const seededAccent = normalizeEmbedAccentHex(venue.embed_accent_colour) ?? '';
    setEmbedAccent(seededAccent);
    lastSavedEmbedAccentRef.current = seededAccent;
    setEmbedAccentStatus('idle');
    // Slug (venue column) — seed the editable field + clear any pending check.
    setSlugInput(venue.slug ?? '');
    setSlugDebounced(null);
    setSlugSaveStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue?.id]);

  const normalizedPrimary = useMemo(() => normalizeHexColor(primary), [primary]);
  const normalizedAccent = useMemo(() => normalizeHexColor(accent), [accent]);
  const lowContrast = normalizedPrimary ? primaryNeedsDarkText(normalizedPrimary) : false;
  const colourError =
    (primary.trim() !== '' && !normalizedPrimary) || (accent.trim() !== '' && !normalizedAccent);

  // Assembled editor config (the keys this screen autosaves) + the stored baseline.
  const editorConfig = useMemo(
    () =>
      assembleConfig({
        primary, accent, fontPreset, announcement, about,
        instagram, facebook, tiktok, x,
        showServices, showTeam, showAbout, coverFullWidth, logoCrop, coverCropBox,
      }),
    [primary, accent, fontPreset, announcement, about, instagram, facebook, tiktok, x,
      showServices, showTeam, showAbout, coverFullWidth, logoCrop, coverCropBox],
  );
  const editorConfigJson = useMemo(() => JSON.stringify(editorConfig), [editorConfig]);

  // Autosave: debounce a PATCH whenever the assembled config diverges from the
  // last value we persisted. Skips while a colour field holds invalid text or
  // before the form has seeded.
  useEffect(() => {
    if (!isAdmin || isLoading || !venue) return;
    if (colourError) return;
    if (lastSavedJsonRef.current === null) return; // not seeded yet
    if (editorConfigJson === lastSavedJsonRef.current) return;
    const sent = editorConfig;
    const sentJson = editorConfigJson;
    const handle = setTimeout(() => {
      setSaveStatus('saving');
      // Autosave is silent (no haptic — it fires on every debounced edit); the
      // header status line is the feedback. Discrete actions (uploads, crops)
      // still haptic.
      updateConfig
        .mutateAsync(sent)
        .then(() => {
          lastSavedJsonRef.current = sentJson;
          setSaveStatus('saved');
        })
        .catch(() => setSaveStatus('error'));
    }, 700);
    return () => clearTimeout(handle);
    // editorConfig/editorConfigJson captured per-run; ref reads are intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorConfigJson, colourError, isAdmin, isLoading]);

  // Embed accent: normalised current value; `null` while the field holds invalid
  // partial input (so we don't autosave garbage). Empty field = cleared (valid).
  const embedAccentTrimmed = embedAccent.trim();
  const embedAccentNormalized = normalizeEmbedAccentHex(embedAccent);
  const embedAccentInvalid = embedAccentTrimmed !== '' && embedAccentNormalized === null;

  // Autosave the embed accent (a venue column) when it diverges from the last
  // persisted value. The baseline + comparison are the NORMALISED form so typing
  // "#" then 6 digits saves once, and a cleared field saves ''. Mirrors the web
  // WidgetSection debounce-and-save.
  useEffect(() => {
    if (!isAdmin || isLoading || !venue) return;
    if (lastSavedEmbedAccentRef.current === null) return; // not seeded
    if (embedAccentInvalid) return;
    const next = embedAccentNormalized ?? ''; // '' clears it
    if (next === lastSavedEmbedAccentRef.current) return;
    const handle = setTimeout(() => {
      setEmbedAccentStatus('saving');
      updateVenue
        .mutateAsync({ embed_accent_colour: next })
        .then(() => {
          lastSavedEmbedAccentRef.current = next;
          setEmbedAccentStatus('saved');
        })
        .catch(() => setEmbedAccentStatus('error'));
    }, 700);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedAccentNormalized, embedAccentInvalid, isAdmin, isLoading]);

  const applyPalette = (palettePrimary: string, paletteAccent: string) => {
    setPrimary(palettePrimary);
    setAccent(paletteAccent);
  };

  async function handleLogoUpload() {
    const picked = await pickVenueImage();
    if (!picked) return;
    try {
      await uploadLogo.mutateAsync(picked);
      setLogoCrop(null); // a new logo invalidates the old framing
      hapticSuccess();
      toast.success('Logo updated.');
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not upload the logo.');
    }
  }

  async function handleCoverUpload() {
    const picked = await pickVenueImage();
    if (!picked) return;
    try {
      await uploadCover.mutateAsync(picked);
      setCoverCropBox(null); // a new cover invalidates the old crop
      hapticSuccess();
      toast.success('Cover photo updated.');
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not upload the cover photo.');
    }
  }

  async function handleRemoveImage(which: 'logo' | 'cover') {
    try {
      await updateVenue.mutateAsync(
        which === 'logo' ? { logo_url: null } : { cover_photo_url: null },
      );
      if (which === 'logo') setLogoCrop(null);
      else setCoverCropBox(null);
      hapticSuccess();
      toast.success(which === 'logo' ? 'Logo removed.' : 'Cover photo removed.');
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not remove the image.');
    }
  }

  // Toggle the "Meet the team" tab. Web parity: turning it OFF cascades
  // `hidden:true` onto every existing team profile (hideAllTeamProfilesOnPage) so
  // re-enabling the tab later does not silently re-expose members who were
  // previously visible. The tab flag itself still autosaves via the config
  // baseline; we PATCH the cascaded team_profiles directly (a sheet-managed key
  // the config autosave intentionally omits).
  const handleToggleTeam = useCallback(
    (next: boolean) => {
      setShowTeam(next);
      if (next) return; // turning ON never changes per-member hidden flags
      const profiles = venue?.booking_page_config?.team_profiles;
      if (!profiles || Object.keys(profiles).length === 0) return;
      const hasVisible = Object.values(profiles).some((p) => p && p.hidden !== true);
      if (!hasVisible) return; // already all hidden — nothing to cascade
      const cascaded: Record<string, BookingTeamProfile> = {};
      for (const [id, p] of Object.entries(profiles)) {
        cascaded[id] = { ...(p ?? {}), hidden: true };
      }
      void updateConfig.mutateAsync({ team_profiles: cascaded }).catch(() => undefined);
    },
    [venue?.booking_page_config?.team_profiles, updateConfig],
  );

  const slug = venue?.slug ?? null;
  const webBase = getWebUrl() || 'https://app.resneo.com';
  const publicUrl = slug ? `${webBase}/book/${slug}` : null;
  const handleCopyUrl = useCallback(async () => {
    if (!publicUrl) return;
    await Clipboard.setStringAsync(publicUrl);
    hapticSuccess();
    toast.success('Booking link copied.');
  }, [publicUrl, toast]);
  const handleOpenPublic = useCallback(() => {
    if (!publicUrl) return;
    void WebBrowser.openBrowserAsync(publicUrl).catch(() => undefined);
  }, [publicUrl]);

  // ── Inline slug edit + availability ──────────────────────────────────────
  const slugNorm = slugInput.trim().toLowerCase();
  const currentSlug = (venue?.slug ?? '').trim().toLowerCase();
  const slugFormatValid = slugNorm === '' || /^[a-z0-9-]{1,100}$/.test(slugNorm);
  const slugChanged = slugNorm !== '' && slugNorm !== currentSlug;
  // Debounce the availability query input (only for a changed, well-formed slug).
  useEffect(() => {
    if (!slugChanged || !slugFormatValid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- debounce reset: clear the queued slug immediately when input is empty/invalid
      setSlugDebounced(null);
      return;
    }
    const handle = setTimeout(() => setSlugDebounced(slugNorm), 450);
    return () => clearTimeout(handle);
  }, [slugNorm, slugChanged, slugFormatValid]);
  const slugAvail = useSlugAvailable(slugDebounced);
  const slugAvailable = slugAvail.data?.available ?? null;
  const slugCanSave =
    isAdmin &&
    slugChanged &&
    slugFormatValid &&
    slugAvailable === true &&
    !updateVenue.isPending;
  const handleSaveSlug = useCallback(async () => {
    if (!slugCanSave) return;
    setSlugSaveStatus('saving');
    try {
      await updateVenue.mutateAsync({ slug: slugNorm });
      hapticSuccess();
      setSlugSaveStatus('saved');
      toast.success('Web address updated.');
    } catch (e) {
      hapticWarning();
      setSlugSaveStatus('error');
      toast.error(e instanceof ApiError ? e.message : 'Could not update the web address.');
    }
  }, [slugCanSave, slugNorm, toast, updateVenue]);

  // ── Embed snippet (built from the web origin + stored slug + accent) ──────
  const embedSnippet = useMemo(
    () =>
      slug
        ? buildVenueEmbedSnippet({
            baseUrl: webBase,
            venueSlug: slug,
            accentHex: embedAccentNormalized,
          }).snippet
        : null,
    [slug, webBase, embedAccentNormalized],
  );
  const handleCopySnippet = useCallback(async () => {
    if (!embedSnippet) return;
    await Clipboard.setStringAsync(embedSnippet);
    hapticSuccess();
    toast.success('Embed code copied.');
  }, [embedSnippet, toast]);

  const cfg = venue?.booking_page_config;
  const galleryCount = cfg?.gallery?.length ?? 0;
  const servicePhotoCount = cfg?.service_photos ? Object.keys(cfg.service_photos).length : 0;
  const teamProfileCount = cfg?.team_profiles
    ? Object.values(cfg.team_profiles).filter(
        (p) => p && (p.photo || p.bio?.trim() || p.specialties?.trim()),
      ).length
    : 0;

  const saveLabel =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'saved'
        ? 'All changes saved'
        : saveStatus === 'error'
          ? 'Couldn’t save'
          : '';

  if (!isLoading && !isAdmin) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: true, title: 'Booking page' }} />
        <View style={styles.gateWrap}>
          <EmptyState
            title="Admins only"
            message="Only venue admins can edit the public booking page."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Booking page',
          headerRight: () =>
            saveLabel ? (
              <Text
                variant="caption"
                color={saveStatus === 'error' ? colors.danger : colors.textMuted}
                style={styles.saveStatus}>
                {saveLabel}
              </Text>
            ) : null,
        }}
      />

      {/* Live preview */}
      <BookingPagePreview
        venueName={venueName}
        logoUrl={logoUrl}
        coverUrl={coverUrl}
        coverFullWidth={coverFullWidth}
        coverCropBox={coverCropBox}
        logoCrop={logoCrop}
        primary={normalizedPrimary}
        accent={normalizedAccent}
        fontPreset={fontPreset}
        announcement={announcement}
      />

      {/* Public URL + inline slug editor */}
      <SectionHeader title="Your booking page" />
      <Card style={styles.card}>
        {publicUrl ? (
          <>
            <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
              {publicUrl.replace(/^https?:\/\//, '')}
            </Text>
            <View style={styles.urlActions}>
              <Button label="Copy link" variant="secondary" size="sm" onPress={() => void handleCopyUrl()} />
              <Button label="Open page" variant="secondary" size="sm" onPress={handleOpenPublic} />
            </View>
          </>
        ) : (
          <Text variant="bodySmall" tone="muted">Set a web address below to publish your page.</Text>
        )}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Editable slug — co-located with the URL (web parity). Same PATCH as
            venue-profile; both edit `slug`. */}
        <Input
          label="Web address"
          value={slugInput}
          onChangeText={(v) => {
            setSlugInput(v.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
            setSlugSaveStatus('idle');
          }}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={100}
          placeholder="my-venue"
          helper={`/book/${slugNorm || 'my-venue'}`}
        />
        <SlugHint
          changed={slugChanged}
          formatValid={slugFormatValid}
          checking={slugChanged && slugFormatValid && slugAvail.isFetching}
          available={slugAvailable}
          saved={slugSaveStatus === 'saved' && !slugChanged}
        />
        {slugChanged ? (
          <Button
            label="Save web address"
            variant="secondary"
            size="sm"
            disabled={!slugCanSave}
            loading={slugSaveStatus === 'saving'}
            onPress={() => void handleSaveSlug()}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.push('/manage/venue-profile' as Href)}>
          <Text variant="caption" color={colors.brand}>Edit full venue profile →</Text>
        </Pressable>
      </Card>

      {/* Website embed (iframe snippet + accent colour) */}
      <SectionHeader title="Embed on your website" />
      <Card style={styles.card}>
        <Text variant="bodySmall" tone="secondary">
          Paste this into your website to show your booking form in a frame that resizes to fit.
        </Text>

        <ColourField
          label="Accent colour (optional)"
          value={embedAccent}
          preview={embedAccentNormalized ? `#${embedAccentNormalized}` : null}
          onChange={(v) => {
            setEmbedAccent(v.replace(/[^a-fA-F0-9#]/g, '').slice(0, 7));
            setEmbedAccentStatus('idle');
          }}
          onReset={() => setEmbedAccent('')}
        />
        <Text variant="caption" tone="muted">
          Buttons and highlights in the embedded widget. Enter a 6-digit hex — saved automatically.
        </Text>
        {embedAccentInvalid ? (
          <Text variant="caption" color={colors.danger}>
            Use a 6-digit hex like #4f46e5.
          </Text>
        ) : embedAccentStatus === 'saving' ? (
          <Text variant="caption" tone="muted">Saving accent…</Text>
        ) : embedAccentStatus === 'saved' ? (
          <Text variant="caption" color={colors.success}>Accent colour saved.</Text>
        ) : embedAccentStatus === 'error' ? (
          <Text variant="caption" color={colors.danger}>Couldn’t save the accent colour.</Text>
        ) : null}

        {embedSnippet ? (
          <>
            <View style={[styles.codeBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text variant="caption" color={colors.textSecondary} style={styles.codeText} selectable>
                {embedSnippet}
              </Text>
            </View>
            <Button
              label="Copy code"
              variant="secondary"
              size="sm"
              onPress={() => void handleCopySnippet()}
            />
          </>
        ) : (
          <Text variant="bodySmall" tone="muted">
            Set a web address above to generate your embed code.
          </Text>
        )}
      </Card>

      {/* QR code — isolated in an error boundary so a QR/SVG render failure
          degrades to a recoverable card instead of white-screening the editor. */}
      {publicUrl ? (
        <>
          <SectionHeader title="QR code" />
          <ErrorBoundary label="the QR code">
            <BookingPageQrCard url={publicUrl} venueName={venueName} slug={slug ?? ''} />
          </ErrorBoundary>
        </>
      ) : null}

      {/* Branding */}
      <SectionHeader title="Branding" />
      <Card style={styles.card}>
        <Text variant="label" tone="secondary">Quick palettes</Text>
        <View style={styles.paletteRow}>
          {BOOKING_THEME_PRESETS.map((preset) => {
            const selected =
              normalizedPrimary === preset.primary && normalizedAccent === preset.accent;
            return (
              <Pressable
                key={preset.key}
                accessibilityRole="button"
                accessibilityLabel={`${preset.label} palette`}
                accessibilityState={{ selected }}
                onPress={() => applyPalette(preset.primary, preset.accent)}
                style={({ pressed }) => [
                  styles.palette,
                  {
                    borderColor: selected ? colors.text : colors.border,
                    borderWidth: selected ? 2 : 1,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}>
                <View style={[styles.paletteSwatch, { backgroundColor: preset.primary }]} />
                <View style={[styles.paletteSwatch, { backgroundColor: preset.accent }]} />
              </Pressable>
            );
          })}
        </View>

        <ColourField
          label="Brand colour"
          value={primary}
          preview={normalizedPrimary}
          onChange={setPrimary}
          onReset={() => setPrimary('')}
        />
        {lowContrast ? (
          <Text variant="caption" color={colors.warning}>
            This colour is light — white button text may be hard to read on the booking page.
          </Text>
        ) : null}
        <ColourField
          label="Accent colour"
          value={accent}
          preview={normalizedAccent}
          onChange={setAccent}
          onReset={() => setAccent('')}
        />
        <SwatchRow onPick={(hex) => setPrimary(hex)} />

        <Text variant="label" tone="secondary" style={styles.fontLabel}>Font style</Text>
        <View style={styles.chipWrap}>
          {BOOKING_FONT_PRESETS.map((preset) => {
            const selected = fontPreset === preset.key;
            return (
              <Pressable
                key={preset.key}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setFontPreset(preset.key)}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.brand : colors.surface,
                    borderColor: selected ? colors.brand : colors.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}>
                <Text variant="label" color={selected ? colors.onBrand : colors.textSecondary}>
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {/* Simplification (audit 12, Low): rendering each chip in its own Google
            typeface would mean bundling 11 extra @expo-google-fonts packages
            (one per family). The chip label names the family instead; the chosen
            font renders for real on the live page — verify via "Open page". */}
        <Text variant="caption" tone="muted">
          The typeface name is shown in brackets; it renders for real on your live page.
        </Text>
      </Card>

      {/* Announcement */}
      <SectionHeader title="Announcement banner" />
      <Card style={styles.card}>
        <Input
          label="Message"
          optional
          helper="A short note shown across the very top of your page."
          value={announcement}
          onChangeText={setAnnouncement}
          maxLength={BOOKING_ANNOUNCEMENT_MAX}
        />
      </Card>

      {/* Logo & cover */}
      <SectionHeader title="Logo & cover" />
      <Card style={styles.card}>
        <ImageRow
          label="Logo"
          imageUrl={logoUrl}
          uploading={uploadLogo.isPending}
          removing={updateVenue.isPending}
          onUpload={() => void handleLogoUpload()}
          onRemove={() => void handleRemoveImage('logo')}
          adjustLabel="Reposition"
          onAdjust={() => setOpenSheet('logoFraming')}
        />
        <ImageRow
          label="Cover photo"
          imageUrl={coverUrl}
          uploading={uploadCover.isPending}
          removing={updateVenue.isPending}
          onUpload={() => void handleCoverUpload()}
          onRemove={() => void handleRemoveImage('cover')}
          adjustLabel="Crop"
          onAdjust={() => setOpenSheet('coverCrop')}
        />
        <Text variant="label" tone="secondary">Cover layout</Text>
        <Segmented<'full' | 'contained'>
          options={[
            { value: 'contained', label: 'Contained' },
            { value: 'full', label: 'Full width' },
          ]}
          value={coverFullWidth ? 'full' : 'contained'}
          onChange={(next) => setCoverFullWidth(next === 'full')}
        />
      </Card>

      {/* Public page tabs (each toggle co-located with what it controls) */}
      <SectionHeader title="Public page tabs" />
      <Card style={styles.card}>
        <SwitchRow label="Services tab" value={showServices} onValueChange={setShowServices} />
        {showServices ? (
          <NavRow
            label="Service photos"
            summary={servicePhotoCount > 0 ? `${servicePhotoCount} added` : 'Add a photo per service'}
            onPress={() => setOpenSheet('service')}
          />
        ) : null}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <SwitchRow label="Meet the team tab" value={showTeam} onValueChange={handleToggleTeam} />
        {showTeam ? (
          <NavRow
            label="Team profiles"
            summary={teamProfileCount > 0 ? `${teamProfileCount} with a profile` : 'Add photos & bios'}
            onPress={() => setOpenSheet('team')}
          />
        ) : null}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <SwitchRow label="About tab" value={showAbout} onValueChange={setShowAbout} />
        {showAbout ? (
          <View style={styles.aboutBlock}>
            <Input
              label="About / welcome"
              optional
              value={about}
              onChangeText={setAbout}
              multiline
              style={styles.multiline}
              maxLength={BOOKING_ABOUT_MAX}
            />
            <Input label="Instagram" optional value={instagram} onChangeText={setInstagram} autoCapitalize="none" maxLength={BOOKING_SOCIAL_MAX} />
            <Input label="Facebook" optional value={facebook} onChangeText={setFacebook} autoCapitalize="none" maxLength={BOOKING_SOCIAL_MAX} />
            <Input label="TikTok" optional value={tiktok} onChangeText={setTiktok} autoCapitalize="none" maxLength={BOOKING_SOCIAL_MAX} />
            <Input label="X (Twitter)" optional value={x} onChangeText={setX} autoCapitalize="none" maxLength={BOOKING_SOCIAL_MAX} />
            <NavRow
              label="Photo gallery"
              summary={galleryCount > 0 ? `${galleryCount}/12 photos` : 'Showcase your space'}
              onPress={() => setOpenSheet('gallery')}
            />
          </View>
        ) : null}
      </Card>

      {colourError ? (
        <Text variant="bodySmall" tone="danger">
          Colours must be a 6-digit hex like #003b6f — fix to keep saving.
        </Text>
      ) : null}

      <GalleryEditorSheet visible={openSheet === 'gallery'} onClose={() => setOpenSheet(null)} />
      <ServicePhotosSheet visible={openSheet === 'service'} onClose={() => setOpenSheet(null)} />
      <TeamProfilesSheet visible={openSheet === 'team'} onClose={() => setOpenSheet(null)} />
      <LogoFramingSheet
        visible={openSheet === 'logoFraming'}
        imageUrl={logoUrl}
        value={logoCrop}
        onClose={() => setOpenSheet(null)}
        onSave={(next) => {
          setLogoCrop(next);
          setOpenSheet(null);
        }}
      />
      <CoverCropperSheet
        visible={openSheet === 'coverCrop'}
        imageUrl={coverUrl}
        value={coverCropBox}
        onClose={() => setOpenSheet(null)}
        onSave={(next) => {
          setCoverCropBox(next);
          setOpenSheet(null);
        }}
      />
    </Screen>
  );
}

/** Inline availability hint under the slug field (mirrors venue-profile). */
function SlugHint({
  changed,
  formatValid,
  checking,
  available,
  saved,
}: {
  changed: boolean;
  formatValid: boolean;
  checking: boolean;
  available: boolean | null;
  saved: boolean;
}) {
  const { colors } = useTheme();
  if (!formatValid) {
    return (
      <Text variant="caption" color={colors.danger}>
        Use lowercase letters, numbers and hyphens only.
      </Text>
    );
  }
  if (!changed) {
    return saved ? (
      <Text variant="caption" color={colors.success}>This is your current web address.</Text>
    ) : null;
  }
  if (checking) {
    return <Text variant="caption" tone="muted">Checking availability…</Text>;
  }
  if (available === true) {
    return <Text variant="caption" color={colors.success}>This address is available.</Text>;
  }
  if (available === false) {
    return (
      <Text variant="caption" color={colors.danger}>
        Already taken — choose a different address.
      </Text>
    );
  }
  return null;
}

/** A hex colour input with a live preview swatch + reset. */
function ColourField({
  label,
  value,
  preview,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  preview: string | null;
  onChange: (next: string) => void;
  onReset: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.colourField}>
      <View
        style={[
          styles.colourPreview,
          { backgroundColor: preview ?? colors.surface, borderColor: colors.border },
        ]}>
        {preview ? (
          <Text variant="caption" color={readableTextColor(preview)}>Aa</Text>
        ) : (
          <Text variant="caption" tone="muted">—</Text>
        )}
      </View>
      <View style={styles.flex1}>
        <Input
          label={label}
          value={value}
          onChangeText={onChange}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="#003b6f"
          maxLength={7}
        />
      </View>
      {value.trim() ? (
        <IconButton
          icon={{ ios: 'arrow.counterclockwise', android: 'restart_alt', web: 'restart_alt' }}
          accessibilityLabel={`Reset ${label}`}
          tint={colors.textSecondary}
          onPress={onReset}
        />
      ) : null}
    </View>
  );
}

/** A row of quick colour swatches that set the brand colour. */
function SwatchRow({ onPick }: { onPick: (hex: string) => void }) {
  return (
    <View style={styles.swatchRow}>
      {COLOUR_SWATCHES.map((hex) => (
        <Pressable
          key={hex}
          accessibilityRole="button"
          accessibilityLabel={`Use ${hex}`}
          onPress={() => onPick(hex)}
          style={({ pressed }) => [styles.swatch, { backgroundColor: hex, opacity: pressed ? 0.7 : 1 }]}
        />
      ))}
    </View>
  );
}

function SwitchRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <Text variant="bodyMedium" style={styles.flex1}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

/** A tappable row that opens a sub-editor (sheet), with a one-line summary. */
function NavRow({
  label,
  summary,
  onPress,
}: {
  label: string;
  summary: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navRow,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <View style={styles.flex1}>
        <Text variant="bodyMedium">{label}</Text>
        <Text variant="caption" tone="muted">{summary}</Text>
      </View>
      <Text variant="bodyMedium" tone="muted">›</Text>
    </Pressable>
  );
}

function ImageRow({
  label,
  imageUrl,
  uploading,
  removing,
  onUpload,
  onRemove,
  adjustLabel,
  onAdjust,
}: {
  label: string;
  imageUrl: string | null;
  uploading: boolean;
  removing: boolean;
  onUpload: () => void;
  onRemove: () => void;
  adjustLabel?: string;
  onAdjust?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.imageRow}>
      <View style={[styles.imageThumb, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.imageThumbInner} contentFit="cover" />
        ) : (
          <Text variant="caption" tone="muted">None</Text>
        )}
      </View>
      <View style={styles.imageMeta}>
        <Text variant="bodyMedium">{label}</Text>
        <View style={styles.imageActions}>
          <Button
            label={imageUrl ? 'Change' : 'Upload'}
            variant="secondary"
            size="sm"
            loading={uploading}
            onPress={onUpload}
          />
          {imageUrl && adjustLabel && onAdjust ? (
            <Button label={adjustLabel} variant="secondary" size="sm" onPress={onAdjust} />
          ) : null}
          {imageUrl ? (
            <Button label="Remove" variant="ghost" size="sm" loading={removing} onPress={onRemove} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.sm,
    paddingBottom: spacing['3xl'],
  },
  card: {
    gap: spacing.md,
  },
  saveStatus: {
    marginRight: spacing.sm,
  },
  urlActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  codeBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  codeText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 11,
    lineHeight: 16,
  },
  paletteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  palette: {
    flexDirection: 'row',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  paletteSwatch: {
    width: 26,
    height: 32,
  },
  colourField: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  colourPreview: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
  },
  fontLabel: {
    marginTop: spacing.xs,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.xs,
  },
  aboutBlock: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  imageRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  imageThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imageThumbInner: {
    width: '100%',
    height: '100%',
  },
  imageMeta: {
    flex: 1,
    gap: spacing.sm,
  },
  imageActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  flex1: {
    flex: 1,
  },
});
