import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { CALENDAR_KEY_ENTRIES, CALENDAR_KEY_FOOTNOTE } from '@/components/calendar/calendar-key';
import { CalendarKeyPanel } from '@/components/calendar/CalendarKeyPanel';
import { closureBandLook } from '@/components/calendar/closure-band';

/** Each swatch is painted with the very band look the grids draw for its cause. */
describe('CalendarKeyPanel', () => {
  it('lists every entry with its meaning and the footnote', async () => {
    await render(<CalendarKeyPanel />);
    for (const entry of CALENDAR_KEY_ENTRIES) {
      expect(screen.getByText(entry.label)).toBeTruthy();
      expect(screen.getByText(entry.meaning)).toBeTruthy();
    }
    expect(screen.getByText(CALENDAR_KEY_FOOTNOTE)).toBeTruthy();
  });

  it('paints each swatch with the grid band wash and border', async () => {
    await render(<CalendarKeyPanel />);
    for (const entry of CALENDAR_KEY_ENTRIES) {
      const look = closureBandLook(entry.blockType, false)!;
      const style = StyleSheet.flatten(
        screen.getByTestId(`calendar-key-swatch-${entry.blockType}`).props.style,
      ) as { backgroundColor?: string; borderColor?: string };
      expect(style.backgroundColor).toBe(look.backgroundColor);
      expect(style.borderColor).toBe(look.borderColor);
    }
  });
});
