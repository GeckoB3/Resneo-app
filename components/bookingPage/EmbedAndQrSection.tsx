import * as Clipboard from 'expo-clipboard';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { BookingPageQrCard } from '@/components/bookingPage/BookingPageQrCard';
import { ColourField } from '@/components/bookingPage/ColourField';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Text } from '@/components/ui/Text';
import { buildCollectiveEmbedSnippet, buildVenueEmbedSnippet } from '@/lib/embed/embedSnippet';
import { hapticSuccess } from '@/lib/haptics';
import type { CollectiveEmbedOption } from '@/lib/linked/collective-page';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** The embed accent colour, a venue setting the Booking page screen owns and autosaves. */
export interface EmbedAccentField {
  value: string;
  /** 6-digit lowercase hex without `#`, or null when empty or half-typed. */
  normalized: string | null;
  invalid: boolean;
  status: 'idle' | 'saving' | 'saved' | 'error';
  onChange: (next: string) => void;
  onReset: () => void;
}

/**
 * The Booking page screen's website embed and QR code (web `ShareAndEmbedGroup` +
 * `WidgetSection`, 4a05756e).
 *
 * - On the venue's own page it embeds this venue, and a venue in a live
 *   collective gets the web's "What to embed" choice between its own page and
 *   the combined page. The QR code follows the choice.
 * - In the combined scope (`lockedCollective`) it embeds that collective only,
 *   with no choice, and the QR code opens and is named after the combined page.
 *
 * The accent colour is one venue setting in both: the own widget and the
 * combined one use the same value.
 */
export function EmbedAndQrSection({
  webBase,
  venueSlug,
  venueName,
  accent,
  lockedCollective = null,
  collectiveOptions = [],
}: {
  webBase: string;
  venueSlug: string | null;
  venueName: string;
  accent: EmbedAccentField;
  lockedCollective?: CollectiveEmbedOption | null;
  collectiveOptions?: readonly CollectiveEmbedOption[];
}) {
  const { colors } = useTheme();
  const toast = useToast();
  /** 'venue' = this venue's own page; otherwise a collective slug. */
  const [target, setTarget] = useState<'venue' | string>('venue');

  const locked = lockedCollective != null;
  // A choice whose collective has gone (dissolved, left) falls back to the venue.
  const chosen: CollectiveEmbedOption | null =
    lockedCollective ?? (target === 'venue' ? null : collectiveOptions.find((c) => c.slug === target) ?? null);
  const root = webBase.replace(/\/$/, '');

  const snippet = useMemo(() => {
    if (chosen) return buildCollectiveEmbedSnippet({ baseUrl: webBase, collectiveSlug: chosen.slug, accentHex: accent.normalized }).snippet;
    if (venueSlug) return buildVenueEmbedSnippet({ baseUrl: webBase, venueSlug, accentHex: accent.normalized }).snippet;
    return null;
  }, [chosen, venueSlug, webBase, accent.normalized]);

  const qr = chosen
    ? { url: `${root}${chosen.path}`, label: chosen.name, slug: chosen.slug, combined: true }
    : venueSlug
      ? { url: `${root}/book/${venueSlug}`, label: venueName, slug: venueSlug, combined: false }
      : null;

  const handleCopy = useCallback(async () => {
    if (!snippet) return;
    await Clipboard.setStringAsync(snippet);
    hapticSuccess();
    toast.success('Embed code copied.');
  }, [snippet, toast]);

  return (
    <>
      <SectionHeader title="Embed on your website" />
      <Card style={styles.card}>
        <Text variant="bodySmall" tone="secondary">
          {lockedCollective
            ? `Paste this into your website to show the ${lockedCollective.name} combined booking page in a frame that resizes to fit.`
            : 'Paste this into your website to show your booking form in a frame that resizes to fit.'}
        </Text>

        {!locked && collectiveOptions.length > 0 ? (
          <View style={styles.choice} accessibilityRole="radiogroup" accessibilityLabel="What to embed">
            <Text variant="label" tone="secondary">
              What to embed
            </Text>
            <RadioRow
              label={`My venue only (${venueName})`}
              selected={chosen === null}
              onPress={() => setTarget('venue')}
            />
            {collectiveOptions.map((c) => (
              <RadioRow
                key={c.slug}
                label={`Venue collective: ${c.name}`}
                selected={chosen?.slug === c.slug}
                onPress={() => setTarget(c.slug)}
              />
            ))}
            <Text variant="caption" tone="muted">
              {chosen
                ? 'This embeds the combined collective booking page.'
                : 'This embeds only your own venue’s booking flow.'}
            </Text>
          </View>
        ) : null}

        <ColourField
          label="Accent colour (optional)"
          value={accent.value}
          preview={accent.normalized ? `#${accent.normalized}` : null}
          onChange={accent.onChange}
          onReset={accent.onReset}
        />
        <Text variant="caption" tone="muted">
          {locked
            ? 'Buttons and highlights in the embedded widget. Enter a 6-digit hex value, saved automatically. Leave it empty to use the combined page’s own colour. This venue’s own widget uses the same setting.'
            : 'Buttons and highlights in the embedded widget. Enter a 6-digit hex value, saved automatically.'}
        </Text>
        {accent.invalid ? (
          <Text variant="caption" color={colors.danger}>
            Use a 6-digit hex like #4f46e5.
          </Text>
        ) : accent.status === 'saving' ? (
          <Text variant="caption" tone="muted">Saving accent…</Text>
        ) : accent.status === 'saved' ? (
          <Text variant="caption" color={colors.success}>Accent colour saved.</Text>
        ) : accent.status === 'error' ? (
          <Text variant="caption" color={colors.danger}>Couldn’t save the accent colour.</Text>
        ) : null}

        {snippet ? (
          <>
            <View style={[styles.codeBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text variant="caption" color={colors.textSecondary} style={styles.codeText} selectable>
                {snippet}
              </Text>
            </View>
            <Button label="Copy code" variant="secondary" size="sm" onPress={() => void handleCopy()} />
          </>
        ) : (
          <Text variant="bodySmall" tone="muted">
            Set a web address above to generate your embed code.
          </Text>
        )}
      </Card>

      {/* The QR card sits in an error boundary so a QR/SVG render failure degrades
          to a recoverable card instead of white-screening the screen. */}
      {qr ? (
        <>
          <SectionHeader title="QR code" />
          <ErrorBoundary label="the QR code">
            <BookingPageQrCard url={qr.url} label={qr.label} slug={qr.slug} combined={qr.combined} />
          </ErrorBoundary>
        </>
      ) : null}
    </>
  );
}

function RadioRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.radioRow, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.radioOuter, { borderColor: selected ? colors.brand : colors.borderStrong }]}>
        {selected ? <View style={[styles.radioInner, { backgroundColor: colors.brand }]} /> : null}
      </View>
      <Text variant="bodySmall" style={styles.flex1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  choice: {
    gap: spacing.xxs,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
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
  flex1: {
    flex: 1,
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
});
