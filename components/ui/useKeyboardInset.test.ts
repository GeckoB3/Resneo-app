import { keyboardLift } from '@/components/ui/useKeyboardInset';

describe('keyboardLift', () => {
  it('takes Android’s height as it comes: the navigation bar is already left out of it', () => {
    // Samsung S23: keyboard 991px with a 126px bar, so the event reports 865. The base pad carries
    // the bar and this the rest, which together reach the keyboard's top edge.
    expect(keyboardLift(865, 126, 'android')).toBe(865);
    expect(126 + keyboardLift(865, 126, 'android')).toBe(991);
  });

  it('nets the home indicator off iOS’s full height, which the base pad already carries', () => {
    expect(keyboardLift(336, 34, 'ios')).toBe(302);
  });

  it('never goes negative', () => {
    expect(keyboardLift(0, 34, 'ios')).toBe(0);
    expect(keyboardLift(-10, 34, 'android')).toBe(0);
  });
});
