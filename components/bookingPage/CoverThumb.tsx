import { Image, type ImageLoadEventData } from 'expo-image';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  BOOKING_COVER_DEFAULT_ASPECT,
  coverCropLayout,
  type BookingPageCoverCropBox,
} from '@/lib/booking/bookingPageConfig';

/**
 * The natural aspect ratio (width ÷ height) of an image by URL, once it has
 * loaded anywhere in the app. The web never needs this: an `<img>` with
 * `height: auto` takes its own shape. Native needs a number, so a photo with
 * no crop used to be squeezed into a 16:9 box with cover-fit, which showed a
 * portrait cover as a hugely zoomed band (reported 2026-09-10 on the combined
 * page). Cached per URL so a re-render or a second mount does not re-flash the
 * fallback shape.
 */
const naturalAspectByUrl = new Map<string, number>();
const listeners = new Set<() => void>();

export function rememberNaturalAspect(url: string, event: ImageLoadEventData): void {
  const { width, height } = event.source;
  if (!(width > 0) || !(height > 0)) return;
  const aspect = width / height;
  if (naturalAspectByUrl.get(url) === aspect) return;
  naturalAspectByUrl.set(url, aspect);
  listeners.forEach((l) => l());
}

export function useNaturalAspect(url: string | null): number | null {
  const subscribe = useCallback((l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const get = () => (url ? (naturalAspectByUrl.get(url) ?? null) : null);
  return useSyncExternalStore(subscribe, get, get);
}

/**
 * The shape a cover shows at (web `BookingPageCoverPhoto`): the crop's shape
 * when there is one, else the whole photo at its own shape, else the default
 * banner while the photo's size is unknown.
 */
export function coverAspect(
  cropBox: BookingPageCoverCropBox | null | undefined,
  naturalAspect: number | null,
): number {
  if (cropBox) return coverCropLayout(cropBox).containerAspect;
  return naturalAspect ?? BOOKING_COVER_DEFAULT_ASPECT;
}

/**
 * A cover photo drawn exactly as the page will show it: the crop region when
 * a crop is set, else the whole photo at its natural shape. `width` bounds the
 * frame; the height follows the photo (web
 * `BOOKING_PAGE_COVER_SETTINGS_FRAME_CLASS`: "bounded width; height follows
 * the photo/crop").
 */
export function CoverThumb({
  coverUrl,
  cropBox,
  style,
}: {
  coverUrl: string;
  cropBox: BookingPageCoverCropBox | null | undefined;
  style?: StyleProp<ViewStyle>;
}) {
  const natural = useNaturalAspect(coverUrl);
  const [failed, setFailed] = useState(false);
  const aspect = coverAspect(cropBox, natural);
  if (cropBox) {
    const layout = coverCropLayout(cropBox);
    return (
      <View style={[styles.frame, { aspectRatio: aspect }, style]}>
        <Image
          source={{ uri: coverUrl }}
          contentFit="cover"
          onLoad={(e) => rememberNaturalAspect(coverUrl, e)}
          style={{
            position: 'absolute',
            top: `${layout.imageTopPct}%`,
            left: `${layout.imageLeftPct}%`,
            width: `${layout.imageWidthPct}%`,
            aspectRatio: layout.imageAspect,
          }}
        />
      </View>
    );
  }
  return (
    <View style={[styles.frame, { aspectRatio: aspect }, style]}>
      <Image
        source={{ uri: coverUrl }}
        // Exact once the natural shape is known; `cover` only matters for the
        // first frame, before the size arrives.
        contentFit={natural || failed ? 'cover' : 'contain'}
        onLoad={(e) => rememberNaturalAspect(coverUrl, e)}
        onError={() => setFailed(true)}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
});
