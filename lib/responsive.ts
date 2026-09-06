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
// Reading column
// ---------------------------------------------------------------------------
// Prose and single-column forms get unreadable when a tablet stretches them to
// the full 1000+dp of the window: the eye loses the start of the next line, and
// a label sits half a screen from the field it names. Above the phone widths we
// cap the column and centre it, which is what the web dashboard does with its
// own `max-w-*` containers.

/** Widest a column of prose / form fields is allowed to get (dp). */
export const CONTENT_MAX_WIDTH = 720;

/**
 * Widest a bottom sheet is allowed to get (dp). A sheet is one focused task, so
 * it is capped tighter than a page — a confirm sheet stretched across a landscape
 * tablet puts its title at one edge and its buttons at the other.
 */
export const SHEET_MAX_WIDTH = 640;

/**
 * The width to cap a single content column at, or `undefined` on a viewport
 * that is already narrower than the cap (a phone — no cap, no wasted margin).
 *
 * Keyed on the CURRENT width rather than on `useIsTablet`, so a tablet in
 * portrait, a tablet in landscape and a phone each get the right answer, and so
 * do the in-between widths (a foldable, an iPad in a narrow Split View).
 */
export function useContentMaxWidth(max: number = CONTENT_MAX_WIDTH): number | undefined {
  const { width } = useWindowDimensions();
  return width > max ? max : undefined;
}

// ---------------------------------------------------------------------------
// Wrapping tile grids
// ---------------------------------------------------------------------------
// The tile grids (More's quick actions, Today's KPIs) lay themselves out by
// flex basis inside a `flexWrap` row rather than by a fixed column count, so
// they reflow with the window. 47% is two across, which is right on a phone —
// and wrong on a tablet, where it leaves two enormous tiles holding a line of
// text each. The basis shrinks as the width grows so more of them fit.

/** Flex basis for one tile of a wrapping grid, for the width in hand. */
export function useTileBasis(): `${number}%` {
  const { width } = useWindowDimensions();
  if (width >= 1100) return '22%'; // four across — a large tablet in landscape
  if (width >= 700) return '30%'; // three across — most tablet widths
  return '47%'; // two across — every phone, and a narrow Split View
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
