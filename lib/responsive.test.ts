import {
  TABLET_MIN_SHORT_EDGE,
  TAB_BAR_CONTENT_HEIGHT_PHONE,
  TAB_BAR_CONTENT_HEIGHT_TABLET,
  isTabletDimensions,
  tabBarContentHeight,
  tabBarHeight,
} from '@/lib/responsive';

describe('isTabletDimensions', () => {
  it('is false for a phone in portrait and landscape (short edge < 600)', () => {
    expect(isTabletDimensions(390, 844)).toBe(false); // iPhone portrait
    expect(isTabletDimensions(844, 390)).toBe(false); // iPhone landscape
  });

  it('is true for a tablet in either orientation (short edge >= 600)', () => {
    expect(isTabletDimensions(820, 1180)).toBe(true); // iPad portrait
    expect(isTabletDimensions(1180, 820)).toBe(true); // iPad landscape
  });

  it('uses the short edge as the threshold', () => {
    expect(isTabletDimensions(TABLET_MIN_SHORT_EDGE, 2000)).toBe(true);
    expect(isTabletDimensions(TABLET_MIN_SHORT_EDGE - 1, 2000)).toBe(false);
  });
});

describe('tab bar height', () => {
  it('is taller on tablets than phones', () => {
    expect(tabBarContentHeight(true)).toBe(TAB_BAR_CONTENT_HEIGHT_TABLET);
    expect(tabBarContentHeight(false)).toBe(TAB_BAR_CONTENT_HEIGHT_PHONE);
    expect(TAB_BAR_CONTENT_HEIGHT_TABLET).toBeGreaterThan(TAB_BAR_CONTENT_HEIGHT_PHONE);
  });

  it('adds the bottom safe-area inset to the content height', () => {
    expect(tabBarHeight(false, 34)).toBe(TAB_BAR_CONTENT_HEIGHT_PHONE + 34);
    expect(tabBarHeight(true, 0)).toBe(TAB_BAR_CONTENT_HEIGHT_TABLET);
  });
});
