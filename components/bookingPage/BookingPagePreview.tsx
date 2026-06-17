import { Image } from 'expo-image';
import { Platform, StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import {
  BOOKING_COVER_DEFAULT_ASPECT,
  BOOKING_FONT_PRESET_LABELS,
  coverCropLayout,
  logoFramingTransform,
  readableTextColor,
  type BookingFontPreset,
  type BookingPageCoverCropBox,
  type BookingPageImageFraming,
} from '@/lib/booking/bookingPageConfig';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type BookingPagePreviewProps = {
  venueName: string;
  logoUrl: string | null;
  coverUrl: string | null;
  coverFullWidth: boolean;
  coverCropBox: BookingPageCoverCropBox | null;
  logoCrop: BookingPageImageFraming | null;
  /** Normalized '#rrggbb' or null → falls back to the app brand navy. */
  primary: string | null;
  /** Normalized '#rrggbb' or null → falls back to the app accent teal. */
  accent: string | null;
  fontPreset: BookingFontPreset | null;
  announcement: string;
};

// Brand fallbacks (mirror the web booking-page defaults: ResNeo Navy + Neo Teal).
const DEFAULT_PRIMARY = '#003B6F';
const DEFAULT_ACCENT = '#00C2C7';

// The 12 Google font pairings aren't loaded in-app, so we approximate the
// chosen preset with a serif-vs-sans hint. These presets pair a serif/elegant
// display face on the web; everything else is sans.
const SERIF_PRESETS = new Set<BookingFontPreset>([
  'elegant',
  'luxury',
  'editorial',
  'spa',
  'cinzel',
  'boutique',
]);

// A system serif stand-in for the elegant presets (no font loading — a hint).
const SYSTEM_SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const LOGO_SIZE = 64;
/** White hairline frame on the inset cover / logo badge (over brand colours). */
const RING = 'rgba(15, 23, 42, 0.08)';

export function BookingPagePreview({
  venueName,
  logoUrl,
  coverUrl,
  coverFullWidth,
  coverCropBox,
  logoCrop,
  primary,
  accent,
  fontPreset,
  announcement,
}: BookingPagePreviewProps): React.JSX.Element {
  const { colors } = useTheme();

  const brandPrimary = primary ?? DEFAULT_PRIMARY;
  const brandAccent = accent ?? DEFAULT_ACCENT;
  const onPrimary = readableTextColor(brandPrimary);

  const preset = fontPreset ?? 'default';
  const isSerif = SERIF_PRESETS.has(preset);
  const presetLabel = BOOKING_FONT_PRESET_LABELS[preset];

  const headingStyle: TextStyle = {
    fontFamily: isSerif ? SYSTEM_SERIF : fonts.bold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: isSerif ? 0.2 : -0.3,
    // Great Vibes (boutique) is a flowing script — italic best hints at it.
    fontStyle: preset === 'boutique' ? 'italic' : 'normal',
    color: colors.text,
  };

  const trimmedName = venueName.trim();
  const displayName = trimmedName.length > 0 ? trimmedName : 'Your venue';
  const showAnnouncement = announcement.trim().length > 0;
  const hasLogo = Boolean(logoUrl);

  return (
    <View
      style={[
        styles.frame,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      pointerEvents="none"
      accessibilityRole="image"
      accessibilityLabel={`Live preview of the ${displayName} booking page`}>
      {/* Inner "page" — white background + brand colours, like the real page. */}
      <View style={styles.page}>
        {showAnnouncement ? (
          <View style={[styles.announcement, { backgroundColor: brandPrimary }]}>
            <Text
              variant="caption"
              color={onPrimary}
              numberOfLines={1}
              style={styles.announcementText}>
              {announcement.trim()}
            </Text>
          </View>
        ) : null}

        <Cover
          coverUrl={coverUrl}
          coverFullWidth={coverFullWidth}
          coverCropBox={coverCropBox}
          mutedColor={colors.surfaceSunken}
        />

        {/* Header block: logo overlaps the cover's bottom edge, then the name. */}
        <View
          style={[
            styles.header,
            // Pull the header up so the logo straddles the cover edge.
            hasLogo ? { marginTop: -(LOGO_SIZE / 2) } : { marginTop: spacing.base },
          ]}>
          {hasLogo ? (
            <LogoBadge logoUrl={logoUrl as string} logoCrop={logoCrop} />
          ) : null}

          <Text variant="heading" numberOfLines={2} style={headingStyle}>
            {displayName}
          </Text>

          {/* Tiny hint so the user knows which font preset is active. */}
          <Text variant="caption" tone="muted" numberOfLines={1} style={styles.fontHint}>
            <Text variant="caption" tone="muted" style={isSerif ? { fontFamily: SYSTEM_SERIF } : undefined}>
              Aa
            </Text>
            {`  ·  ${presetLabel}`}
          </Text>

          {/* Brand "Book now" CTA — decorative, with an accent underline + dot. */}
          <View style={styles.ctaRow}>
            <View style={[styles.cta, { backgroundColor: brandPrimary }]}>
              <Text variant="label" color={onPrimary} numberOfLines={1}>
                Book now
              </Text>
              <View style={[styles.ctaUnderline, { backgroundColor: brandAccent }]} />
            </View>
            <View style={[styles.accentDot, { backgroundColor: brandAccent }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Cover image — full-bleed or contained, with optional free-form crop box.
// ---------------------------------------------------------------------------

function Cover({
  coverUrl,
  coverFullWidth,
  coverCropBox,
  mutedColor,
}: {
  coverUrl: string | null;
  coverFullWidth: boolean;
  coverCropBox: BookingPageCoverCropBox | null;
  mutedColor: string;
}): React.JSX.Element {
  // Full-bleed spans the page edge-to-edge; contained sits inset with margin,
  // rounded corners + a hairline ring on the inner image block.
  const wrapperStyle: ViewStyle = coverFullWidth ? styles.coverFull : styles.coverContained;
  const containedSkin: ViewStyle | null = coverFullWidth ? null : styles.coverContainedSkin;

  if (coverCropBox) {
    const layout = coverCropLayout(coverCropBox);
    return (
      <View style={wrapperStyle}>
        <View
          style={[
            styles.coverBlock,
            containedSkin,
            { aspectRatio: layout.containerAspect, backgroundColor: mutedColor },
          ]}>
          {coverUrl ? (
            <Image
              source={{ uri: coverUrl }}
              contentFit="cover"
              style={{
                position: 'absolute',
                top: `${layout.imageTopPct}%`,
                left: `${layout.imageLeftPct}%`,
                width: `${layout.imageWidthPct}%`,
                aspectRatio: layout.imageAspect,
              }}
            />
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={wrapperStyle}>
      <View
        style={[
          styles.coverBlock,
          containedSkin,
          { aspectRatio: BOOKING_COVER_DEFAULT_ASPECT, backgroundColor: mutedColor },
        ]}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} contentFit="cover" style={StyleSheet.absoluteFill} />
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Logo — circular badge with white bg + hairline ring, pan/zoom from config.
// ---------------------------------------------------------------------------

function LogoBadge({
  logoUrl,
  logoCrop,
}: {
  logoUrl: string;
  logoCrop: BookingPageImageFraming | null;
}): React.JSX.Element {
  const { translateX, translateY, scale } = logoFramingTransform(logoCrop, LOGO_SIZE);
  return (
    <View style={styles.logoBadge}>
      <Image
        source={{ uri: logoUrl }}
        contentFit="cover"
        style={{
          width: LOGO_SIZE,
          height: LOGO_SIZE,
          transform: [{ translateX }, { translateY }, { scale }],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Outer phone-ish frame — theme tokens only.
  frame: {
    borderRadius: radius.surface,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xs,
    overflow: 'hidden',
  },
  // Inner page — clips children to the page's rounded corners.
  page: {
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  announcement: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  announcementText: {
    textAlign: 'center',
  },
  // Full-bleed cover spans the page edge-to-edge.
  coverFull: {
    width: '100%',
  },
  // Contained cover sits inset with margin; corners + ring on the inner block.
  coverContained: {
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
  },
  coverBlock: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  // Contained covers get rounded corners + a hairline ring (full-bleed don't).
  coverContainedSkin: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RING,
  },
  header: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
    alignItems: 'flex-start',
  },
  logoBadge: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    marginBottom: spacing.sm,
    // Soft lift so the badge reads as floating over the cover.
    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.18)',
    elevation: 3,
  },
  fontHint: {
    marginTop: spacing.xxs,
  },
  ctaRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cta: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  ctaUnderline: {
    height: 2,
    width: 24,
    borderRadius: radius.pill,
    marginTop: spacing.xxs,
  },
  accentDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
});
