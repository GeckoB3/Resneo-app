/**
 * Responsive layout helpers shared across the app shell.
 *
 * Tablet detection is by the device's SHORT edge so it's stable across
 * rotation: an iPad is a tablet in portrait and landscape, a phone never is.
 * (`useWindowDimensions` is reactive, so callers re-render on rotation.)
 */
import { useWindowDimensions } from 'react-native';

/** A tablet-class device has a short edge of at least this many dp. */
export const TABLET_MIN_SHORT_EDGE = 600;

/** True for tablet-class viewports, regardless of orientation. */
export function isTabletDimensions(width: number, height: number): boolean {
  return Math.min(width, height) >= TABLET_MIN_SHORT_EDGE;
}

/** Reactive tablet check — re-evaluates on rotation. */
export function useIsTablet(): boolean {
  const { width, height } = useWindowDimensions();
  return isTabletDimensions(width, height);
}

// ---------------------------------------------------------------------------
// Bottom tab bar sizing
// ---------------------------------------------------------------------------
// The navigator's default bar is cramped (~49dp content). We set an explicit,
// slightly taller content height for comfortable touch targets — more on
// tablets — and add the device's bottom safe-area inset on top so the row sits
// clear of the home indicator / gesture bar.

/** Tab-bar content height (above the safe-area inset). */
export const TAB_BAR_CONTENT_HEIGHT_PHONE = 58;
export const TAB_BAR_CONTENT_HEIGHT_TABLET = 70;

/** Content height for the tab bar by device class (excludes the safe-area inset). */
export function tabBarContentHeight(isTablet: boolean): number {
  return isTablet ? TAB_BAR_CONTENT_HEIGHT_TABLET : TAB_BAR_CONTENT_HEIGHT_PHONE;
}

/** Total tab-bar height: content + the bottom safe-area inset. */
export function tabBarHeight(isTablet: boolean, bottomInset: number): number {
  return tabBarContentHeight(isTablet) + bottomInset;
}
