/**
 * The reading column: capped and centred where there is room to spare, and an
 * ordinary full-width view where there isn't.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';

const mockWindow = { width: 390, height: 844, scale: 2, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

import { ContentColumn } from '@/components/ui/ContentColumn';
import { CONTENT_MAX_WIDTH } from '@/lib/responsive';

function columnStyle() {
  return StyleSheet.flatten(screen.getByTestId('column').props.style);
}

async function renderAt(width: number, height: number) {
  mockWindow.width = width;
  mockWindow.height = height;
  await render(
    <ContentColumn testID="column">
      <View testID="child" />
    </ContentColumn>,
  );
}

describe('ContentColumn', () => {
  it('leaves a phone alone — full width, no cap', async () => {
    await renderAt(390, 844);
    const style = columnStyle();
    expect(style.width).toBe('100%');
    expect(style.maxWidth).toBeUndefined();
  });

  it('caps and centres on a tablet in portrait', async () => {
    await renderAt(834, 1194);
    expect(columnStyle().maxWidth).toBe(CONTENT_MAX_WIDTH);
    expect(columnStyle().alignSelf).toBe('center');
  });

  it('caps a tablet in landscape as well', async () => {
    await renderAt(1194, 834);
    expect(columnStyle().maxWidth).toBe(CONTENT_MAX_WIDTH);
  });

  it('caps a phone in landscape too — the cap is about the width in hand, not the device', async () => {
    await renderAt(844, 390);
    expect(columnStyle().maxWidth).toBe(CONTENT_MAX_WIDTH);
  });
});
