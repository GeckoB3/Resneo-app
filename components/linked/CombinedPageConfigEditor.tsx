import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { BookingPagePreview } from '@/components/bookingPage/BookingPagePreview';
import { CoverCropperSheet } from '@/components/bookingPage/CoverCropperSheet';
import { LogoFramingSheet } from '@/components/bookingPage/LogoFramingSheet';
import { CombinedPageGallery } from '@/components/linked/CombinedPageGallery';
import { CombinedPageTeamProfiles } from '@/components/linked/CombinedPageTeamProfiles';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
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
  type BookingPageCoverCropBox,
  type BookingPageImageFraming,
} from '@/lib/booking/bookingPageConfig';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { collectiveAdoptedSlug } from '@/lib/linked/collective-page';
import {
  pickVenueImage,
  useUpdateCollective,
  useUploadPageAsset,
} from '@/lib/queries/useCollectives';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CombinedBookingPageConfig, CollectiveView } from '@/types/collectives';

/** Quick-pick colour swatches for the brand hex input (matches the venue editor). */
const COLOUR_SWATCHES = [
  '#003b6f', '#0e7490', '#14532d', '#6b21a8', '#9f1239',
  '#1f2937', '#b45309', '#0f766e', '#4338ca', '#be123c',
];

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Assemble the editor-owned `bookingPageConfig` keys from raw field values.
 * Excludes the image URL keys (cover_photo_url / logo are saved via their own
 * endpoints) and gallery (its own sheet on the venue editor; here gallery is
 * not editor-owned). Includes the logo/cover crop framing (logo_crop /
 * cover_crop_box), which the server stores in the same config and merges
 * key-by-key, so omitted keys are preserved.
 */
function assembleConfig(raw: {
  primary: string;
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
}): CombinedBookingPageConfig {
  return {
    brand_primary: normalizeHexColor(raw.primary),
    font_preset: raw.fontPreset && raw.fontPreset !== 'default' ? raw.fontPreset : null,
    announcement: raw.announcement.trim() || null,
    about: raw.about.trim() || null,
    social_links: {
      instagram: raw.instagram.trim() || undefined,
      facebook: raw.facebook.trim() || undefined,
      tiktok: raw.tiktok.trim() || undefined,
      x: raw.x.trim() || undefined,
    },
    show_services_tab: raw.showServices,
    show_team_tab: raw.showTeam,
    show_about_tab: raw.showAbout,
    cover_full_width: raw.coverFullWidth,
    // `null` round-trips identically to an absent crop (whole image). The
    // framing helpers normalise a centred/full-frame selection back to null.
    logo_crop: raw.logoCrop,
    cover_crop_box: raw.coverCropBox,
  };
}

/**
 * Combined-page config editor (Flow 11/12, host only). Parity with the
 * single-venue `manage/booking-page.tsx`: a live booking-page preview at the top,
 * page name, address (dedicated vs adopt a member's slug), brand colours, font
 * preset, logo + cover upload with crop/reposition framing, announcement, about +
 * social links, tab toggles. Branding/content autosaves (debounced) via
 * `useUpdateCollective` (config merged non-destructively, including the
 * logo_crop / cover_crop_box framing); images persist immediately via
 * `useUploadPageAsset`.
 *
 * Includes the photo gallery (CombinedPageGallery) and per-calendar team
 * profiles (CombinedPageTeamProfiles), both saved non-destructively against the
 * stored bookingPageConfig.
 *
 * Logo/cover crop framing reuses the single-venue editor's native sheets
 * (LogoFramingSheet / CoverCropperSheet); the chosen boxes are saved in the
 * config payload and feed the live preview.
 */
export function CombinedPageConfigEditor({
  collective,
  onChanged,
}: {
  collective: CollectiveView;
  /** Called after a settings change that affects the collective list. */
  onChanged: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const update = useUpdateCollective();
  const upload = useUploadPageAsset();

  const cfg = collective.bookingPageConfig ?? {};

  // Page name (inline save on blur).
  const [name, setName] = useState(collective.name);
  const [nameSave, setNameSave] = useState<SaveStatus>('idle');

  // Address strategy.
  const adopt = collective.slugStrategy === 'adopt_member';
  const adoptedSlug = collectiveAdoptedSlug(collective);
  const activeMembers = collective.members.filter((m) => m.status === 'active');

  // Config form state.
  const [primary, setPrimary] = useState(cfg.brand_primary ?? '');
  const [fontPreset, setFontPreset] = useState<BookingFontPreset | null>(
    isBookingFontPreset(cfg.font_preset) ? cfg.font_preset : 'default',
  );
  const [announcement, setAnnouncement] = useState(cfg.announcement ?? '');
  const [about, setAbout] = useState(cfg.about ?? '');
  const [instagram, setInstagram] = useState(cfg.social_links?.instagram ?? '');
  const [facebook, setFacebook] = useState(cfg.social_links?.facebook ?? '');
  const [tiktok, setTiktok] = useState(cfg.social_links?.tiktok ?? '');
  const [x, setX] = useState(cfg.social_links?.x ?? '');
  const [showServices, setShowServices] = useState(cfg.show_services_tab === true);
  const [showTeam, setShowTeam] = useState(cfg.show_team_tab === true);
  const [showAbout, setShowAbout] = useState(cfg.show_about_tab === true);
  const [coverFullWidth, setCoverFullWidth] = useState(cfg.cover_full_width === true);

  // Image slots (mirror the web manager: logo on branding, cover in config).
  const [logoUrl, setLogoUrl] = useState<string | null>(collective.branding?.logo_url ?? null);
  const [coverUrl, setCoverUrl] = useState<string | null>(cfg.cover_photo_url ?? null);

  // Crop framing (config keys; autosaved with the rest of the config).
  const [logoCrop, setLogoCrop] = useState<BookingPageImageFraming | null>(cfg.logo_crop ?? null);
  const [coverCropBox, setCoverCropBox] = useState<BookingPageCoverCropBox | null>(
    cfg.cover_crop_box ?? null,
  );
  // Which framing sheet is open (mirrors the single-venue editor's openSheet).
  const [openSheet, setOpenSheet] = useState<null | 'logoFraming' | 'coverCrop'>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const lastSavedJsonRef = useRef<string | null>(null);

  // Reseed when the collective entity changes.
  useEffect(() => {
    const c = collective.bookingPageConfig ?? {};
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state on entity switch
    setName(collective.name);
    setPrimary(c.brand_primary ?? '');
    setFontPreset(isBookingFontPreset(c.font_preset) ? c.font_preset : 'default');
    setAnnouncement(c.announcement ?? '');
    setAbout(c.about ?? '');
    setInstagram(c.social_links?.instagram ?? '');
    setFacebook(c.social_links?.facebook ?? '');
    setTiktok(c.social_links?.tiktok ?? '');
    setX(c.social_links?.x ?? '');
    setShowServices(c.show_services_tab === true);
    setShowTeam(c.show_team_tab === true);
    setShowAbout(c.show_about_tab === true);
    setCoverFullWidth(c.cover_full_width === true);
    setLogoUrl(collective.branding?.logo_url ?? null);
    setCoverUrl(c.cover_photo_url ?? null);
    setLogoCrop(c.logo_crop ?? null);
    setCoverCropBox(c.cover_crop_box ?? null);
    setNameSave('idle');
    setSaveStatus('idle');
    lastSavedJsonRef.current = JSON.stringify(
      assembleConfig({
        primary: c.brand_primary ?? '',
        fontPreset: isBookingFontPreset(c.font_preset) ? c.font_preset : null,
        announcement: c.announcement ?? '',
        about: c.about ?? '',
        instagram: c.social_links?.instagram ?? '',
        facebook: c.social_links?.facebook ?? '',
        tiktok: c.social_links?.tiktok ?? '',
        x: c.social_links?.x ?? '',
        showServices: c.show_services_tab === true,
        showTeam: c.show_team_tab === true,
        showAbout: c.show_about_tab === true,
        coverFullWidth: c.cover_full_width === true,
        logoCrop: c.logo_crop ?? null,
        coverCropBox: c.cover_crop_box ?? null,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collective.id]);

  const normalizedPrimary = useMemo(() => normalizeHexColor(primary), [primary]);
  const lowContrast = normalizedPrimary ? primaryNeedsDarkText(normalizedPrimary) : false;
  const colourError = primary.trim() !== '' && !normalizedPrimary;

  const editorConfig = useMemo(
    () =>
      assembleConfig({
        primary, fontPreset, announcement, about,
        instagram, facebook, tiktok, x, showServices, showTeam, showAbout, coverFullWidth,
        logoCrop, coverCropBox,
      }),
    [primary, fontPreset, announcement, about, instagram, facebook, tiktok, x,
      showServices, showTeam, showAbout, coverFullWidth, logoCrop, coverCropBox],
  );
  const editorConfigJson = useMemo(() => JSON.stringify(editorConfig), [editorConfig]);

  // Autosave the merged config (debounced) when it diverges from the last saved value.
  useEffect(() => {
    if (colourError) return;
    if (lastSavedJsonRef.current === null) return;
    if (editorConfigJson === lastSavedJsonRef.current) return;
    const sent = editorConfig;
    const sentJson = editorConfigJson;
    const handle = setTimeout(() => {
      setSaveStatus('saving');
      update
        .mutateAsync({ collectiveId: collective.id, payload: { bookingPageConfig: sent } })
        .then(() => {
          lastSavedJsonRef.current = sentJson;
          setSaveStatus('saved');
          onChanged();
        })
        .catch(() => setSaveStatus('error'));
    }, 700);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorConfigJson, colourError]);

  const applyPalette = (p: string) => {
    setPrimary(p);
  };

  const commitName = () => {
    const v = name.trim();
    if (v.length < 2 || v === collective.name) return;
    setNameSave('saving');
    update
      .mutateAsync({ collectiveId: collective.id, payload: { name: v } })
      .then(() => {
        setNameSave('saved');
        onChanged();
        setTimeout(() => setNameSave((s) => (s === 'saved' ? 'idle' : s)), 2500);
      })
      .catch(() => setNameSave('error'));
  };

  const setAddressDedicated = () => {
    update.mutate(
      { collectiveId: collective.id, payload: { slugStrategy: 'dedicated' } },
      {
        onSuccess: () => onChanged(),
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.message : 'Could not update the address.'),
      },
    );
  };

  const setAddressAdopt = (venueId: string) => {
    update.mutate(
      {
        collectiveId: collective.id,
        payload: { slugStrategy: 'adopt_member', adoptedVenueId: venueId },
      },
      {
        onSuccess: () => onChanged(),
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.message : 'Could not update the address.'),
      },
    );
  };

  async function handleUpload(kind: 'logo' | 'cover') {
    const picked = await pickVenueImage();
    if (!picked) return;
    try {
      const url = await upload.mutateAsync({
        collectiveId: collective.id,
        kind,
        uri: picked.uri,
        mimeType: picked.mimeType,
      });
      if (kind === 'logo') {
        await update.mutateAsync({ collectiveId: collective.id, payload: { logoUrl: url } });
        setLogoUrl(url);
        setLogoCrop(null); // a new logo invalidates the old framing
      } else {
        await update.mutateAsync({ collectiveId: collective.id, payload: { coverPhotoUrl: url } });
        setCoverUrl(url);
        setCoverCropBox(null); // a new cover invalidates the old crop
      }
      hapticSuccess();
      onChanged();
      toast.success(kind === 'logo' ? 'Logo updated.' : 'Cover photo updated.');
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not upload the image.');
    }
  }

  async function handleRemove(kind: 'logo' | 'cover') {
    try {
      await update.mutateAsync({
        collectiveId: collective.id,
        payload: kind === 'logo' ? { logoUrl: '' } : { coverPhotoUrl: '' },
      });
      if (kind === 'logo') {
        setLogoUrl(null);
        setLogoCrop(null);
      } else {
        setCoverUrl(null);
        setCoverCropBox(null);
      }
      hapticSuccess();
      onChanged();
      toast.success(kind === 'logo' ? 'Logo removed.' : 'Cover photo removed.');
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not remove the image.');
    }
  }

  const saveLabel =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'saved'
        ? 'All changes saved'
        : saveStatus === 'error'
          ? 'Couldn’t save'
          : '';

  return (
    <View style={styles.root}>
      {/* Live preview — reflects the editor's current state (assembled config +
          normalised colours + crop framing), exactly like the single-venue
          booking-page editor. */}
      <BookingPagePreview
        venueName={name}
        logoUrl={logoUrl}
        coverUrl={coverUrl}
        coverFullWidth={editorConfig.cover_full_width ?? false}
        coverCropBox={editorConfig.cover_crop_box ?? null}
        logoCrop={editorConfig.logo_crop ?? null}
        primary={normalizedPrimary || null}
        fontPreset={fontPreset}
        announcement={announcement}
      />

      {saveLabel ? (
        <Text
          variant="caption"
          color={saveStatus === 'error' ? colors.danger : colors.textMuted}>
          {saveLabel}
        </Text>
      ) : null}

      {/* Page name */}
      <SectionHeader title="Page name" />
      <Card style={styles.card}>
        <Input
          label="Page name (shown to customers)"
          value={name}
          onChangeText={setName}
          onBlur={commitName}
          maxLength={120}
          helper={
            nameSave === 'saving'
              ? 'Saving…'
              : nameSave === 'saved'
                ? 'Saved'
                : nameSave === 'error'
                  ? 'Couldn’t save — try again'
                  : undefined
          }
        />
      </Card>

      {/* Booking-page address */}
      <SectionHeader title="Booking page address" />
      <Card style={styles.card}>
        <Text variant="caption" tone="muted">
          Your combined page works like a single venue — one services menu and one team across all
          members. Choose where customers reach it.
        </Text>
        <RadioRow
          label={`Dedicated address — /book/c/${collective.slug}`}
          selected={!adopt}
          disabled={update.isPending}
          onPress={setAddressDedicated}
        />
        <RadioRow
          label="Use a member venue’s existing booking address"
          selected={adopt}
          disabled={update.isPending}
          onPress={() => {
            const first = activeMembers[0];
            if (first) setAddressAdopt(first.venueId);
          }}
        />
        {adopt ? (
          <View style={styles.adoptBlock}>
            {activeMembers.map((m) => (
              <RadioRow
                key={m.venueId}
                label={m.venueName}
                selected={collective.adoptedVenueId === m.venueId}
                disabled={update.isPending}
                onPress={() => setAddressAdopt(m.venueId)}
                indent
              />
            ))}
            <Text variant="caption" color={colors.warning}>
              That venue’s own page will show the combined page. It can keep a separate page only
              under a new address.
            </Text>
            {adoptedSlug ? (
              <Text variant="caption" tone="muted">
                {`Customers reach it at /book/${adoptedSlug}.`}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Card>

      {/* Branding */}
      <SectionHeader title="Branding" />
      <Card style={styles.card}>
        <Text variant="label" tone="secondary">
          Quick palettes
        </Text>
        <View style={styles.paletteRow}>
          {BOOKING_THEME_PRESETS.map((preset) => {
            const selected = normalizedPrimary === preset.primary;
            return (
              <Pressable
                key={preset.key}
                accessibilityRole="button"
                accessibilityLabel={`${preset.label} palette`}
                accessibilityState={{ selected }}
                onPress={() => applyPalette(preset.primary)}
                style={({ pressed }) => [
                  styles.palette,
                  {
                    borderColor: selected ? colors.text : colors.border,
                    borderWidth: selected ? 2 : 1,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}>
                <View style={[styles.paletteSwatch, { backgroundColor: preset.primary }]} />
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
        <View style={styles.swatchRow}>
          {COLOUR_SWATCHES.map((hex) => (
            <Pressable
              key={hex}
              accessibilityRole="button"
              accessibilityLabel={`Use ${hex}`}
              onPress={() => setPrimary(hex)}
              style={({ pressed }) => [
                styles.swatch,
                { backgroundColor: hex, opacity: pressed ? 0.7 : 1 },
              ]}
            />
          ))}
        </View>

        <Text variant="label" tone="secondary" style={styles.fontLabel}>
          Font style
        </Text>
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
          uploading={upload.isPending}
          removing={update.isPending}
          onUpload={() => void handleUpload('logo')}
          onRemove={() => void handleRemove('logo')}
          adjustLabel="Reposition"
          onAdjust={() => setOpenSheet('logoFraming')}
        />
        <ImageRow
          label="Cover photo"
          imageUrl={coverUrl}
          uploading={upload.isPending}
          removing={update.isPending}
          onUpload={() => void handleUpload('cover')}
          onRemove={() => void handleRemove('cover')}
          adjustLabel="Crop"
          onAdjust={() => setOpenSheet('coverCrop')}
        />
        <Text variant="label" tone="secondary">
          Cover layout
        </Text>
        <Segmented<'full' | 'contained'>
          options={[
            { value: 'contained', label: 'Contained' },
            { value: 'full', label: 'Full width' },
          ]}
          value={coverFullWidth ? 'full' : 'contained'}
          onChange={(next) => setCoverFullWidth(next === 'full')}
        />
      </Card>

      {/* Public page tabs */}
      <SectionHeader title="Public page tabs" />
      <Card style={styles.card}>
        <SwitchRow label="Services tab" value={showServices} onValueChange={setShowServices} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <SwitchRow label="Meet the team tab" value={showTeam} onValueChange={setShowTeam} />
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
          </View>
        ) : null}
      </Card>

      {/* Per-calendar team profiles (sourced from the catalogue's member calendars). */}
      <CombinedPageTeamProfiles
        collectiveId={collective.id}
        config={cfg}
        onChanged={onChanged}
      />

      {/* Photo gallery (lives on the About tab on the public page). */}
      <CombinedPageGallery collectiveId={collective.id} config={cfg} onChanged={onChanged} />

      {/* Settings the combined page follows from the host venue (web 2026-09-05). */}
      <HostInheritedSettingsNote collective={collective} />

      {colourError ? (
        <Text variant="bodySmall" tone="danger">
          Colours must be a 6-digit hex like #003b6f — fix to keep saving.
        </Text>
      ) : null}

      {/* Crop / reposition sheets (reused from the single-venue editor). Saving a
          box updates local state → autosaves with the config + feeds the preview. */}
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
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (ported from the venue booking-page editor)
// ---------------------------------------------------------------------------

/**
 * The combined page has no settings of its own for the things below: it works
 * like one venue and follows the HOST venue. Say so, because a host looking
 * for these switches here would otherwise conclude the combined page cannot do
 * them (web 2026-09-05, `HostInheritedSettingsNote`, copy verbatim).
 */
function HostInheritedSettingsNote({ collective }: { collective: CollectiveView }) {
  const host =
    collective.members.find((m) => m.venueId === collective.hostVenueId)?.venueName ??
    'the host venue';
  const anyAvailable = collective.hostAnyAvailablePractitioner ? 'on' : 'off';
  const staffFirst = collective.hostStaffFirstBookingFlow ? 'on' : 'off';
  return (
    <>
      <SectionHeader title="Settings that follow the host venue" />
      <Card style={styles.card}>
        <Text variant="caption" tone="muted">
          {`Your combined page follows ${host} for these. Change them in that venue's Settings and the combined page updates with it.`}
        </Text>
        <Text variant="bodySmall" tone="secondary">
          {`Any available practitioner (currently ${anyAvailable}) and staff-first booking (currently ${staffFirst}): Settings, Booking settings.`}
        </Text>
        <Text variant="bodySmall" tone="secondary">
          Address, phone, website and opening hours shown in the header: Settings, Profile.
        </Text>
        <Text variant="bodySmall" tone="secondary">
          Currency and wording (for example &ldquo;appointment&rdquo;): Settings, Profile.
        </Text>
        <Text variant="caption" tone="muted">
          Prices, durations, deposits and cancellation notice come from each member venue&rsquo;s own
          service, because every booking is made with that venue. If any member requires customers
          to sign in to book, the combined page asks them to sign in too.
        </Text>
      </Card>
    </>
  );
}

function RadioRow({
  label,
  selected,
  disabled,
  onPress,
  indent,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  indent?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.radioRow, indent && styles.radioIndent, { opacity: pressed ? 0.7 : 1 }]}>
      <View
        style={[
          styles.radioOuter,
          { borderColor: selected ? colors.brand : colors.borderStrong },
        ]}>
        {selected ? <View style={[styles.radioInner, { backgroundColor: colors.brand }]} /> : null}
      </View>
      <Text variant="bodySmall" style={styles.flex1}>
        {label}
      </Text>
    </Pressable>
  );
}

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
          <Text variant="caption" color={readableTextColor(preview)}>
            Aa
          </Text>
        ) : (
          <Text variant="caption" tone="muted">
            —
          </Text>
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
      <Text variant="bodyMedium" style={styles.flex1}>
        {label}
      </Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
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
          <Text variant="caption" tone="muted">
            None
          </Text>
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
  root: {
    gap: spacing.sm,
  },
  card: {
    gap: spacing.md,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  radioIndent: {
    paddingLeft: spacing.lg,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
  },
  adoptBlock: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
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
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
