import type { ImageSourcePropType } from 'react-native';

/** A rectangle inside the artwork, as fractions (0–1) of its width and height. */
export type ArtworkRegion = { left: number; top: number; width: number; height: number };

export type TapToPaySplashArtwork = {
  source: ImageSourcePropType;
  /** Width ÷ height of the export, so it is never cropped or stretched. */
  aspectRatio: number;
  /** What the artwork says, for VoiceOver (an image of text is otherwise silent). */
  accessibilityLabel: string;
  /** The artwork's call-to-action button: where it sits, and what it says. */
  cta: { region: ArtworkRegion; label: string };
};

/**
 * Apple's artwork for the in-app introduction (checklist 3.2 / 6.2), from the
 * Tap to Pay on iPhone Marketing Toolkit (UK, Q4 2026).
 *
 * Template: `GBEN_TTPoiP_Q426_In_App_Tile_Accept_iPhone_Payments_9x16.psd` —
 * the In-App Tile, 2160×3840, chosen over the In-App Splash Modal because the
 * splash's copy needs a merchant offer ("Get [offer] when you enable…") that
 * Resneo does not run. The only change is the template's own placeholder: the
 * button's "[Your CTA]" now reads "Get started", in the system font at the
 * placeholder's size, colour and baseline. Everything else is Apple's, unaltered.
 * Exported at 1296×2304 (0.6×), which is sharp at 3× on every iPhone.
 *
 * Apple's marketing terms forbid drawing our own: no custom illustrations,
 * photography or icons of iPhone or Tap to Pay on iPhone. Replace this file only
 * with another export from the toolkit.
 */
export const TAP_TO_PAY_SPLASH_ARTWORK: TapToPaySplashArtwork | null = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  source: require('../../assets/images/tap-to-pay/in-app-splash.jpg'),
  aspectRatio: 2160 / 3840,
  accessibilityLabel:
    'Tap to Pay on iPhone. Your customer simply holds their device over the contactless symbol on your iPhone for a few seconds until the Done tick appears. Terms apply.',
  cta: {
    // The template's `AV_Size_G (WWEN)` button layer: 214,3146 → 794,3370.
    region: {
      left: 214 / 2160,
      top: 3146 / 3840,
      width: (794 - 214) / 2160,
      height: (3370 - 3146) / 3840,
    },
    label: 'Get started',
  },
};
