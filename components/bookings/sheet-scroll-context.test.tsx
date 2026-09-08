import { renderHook, act } from '@testing-library/react-native';
import {
  Keyboard,
  Platform,
  StatusBar,
  TextInput,
  type KeyboardEvent,
  type ScrollView,
} from 'react-native';

import { useSheetKeyboardScroll } from '@/components/bookings/sheet-scroll-context';
import { spacing } from '@/theme/index';

type Listener = (event: KeyboardEvent) => void;
type Measure = (cb: (x: number, y: number, w: number, h: number) => void) => void;

const CLEARANCE = spacing['2xl'] + spacing.sm;

/**
 * The hook must NOT scroll in the same tick it grows the content padding: the
 * native scroll view clamps `scrollTo` to the content it has laid out, so a
 * body that fits the viewport would throw the lift away and the focused field
 * would stay behind the keyboard (the guest-details regression, 2026-09-08).
 */
describe('useSheetKeyboardScroll', () => {
  const listeners: Record<string, Listener> = {};
  let scrollTo: jest.Mock;
  let scrollRef: { current: ScrollView | null };
  let focused: { measureInWindow: Measure } | null;

  const keyboardEvent = (height: number, screenY: number): KeyboardEvent =>
    ({
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { height, screenY, screenX: 0, width: 390 },
      startCoordinates: { height: 0, screenY: screenY + height, screenX: 0, width: 390 },
      isEventFromThisApp: true,
    }) as KeyboardEvent;

  const inputAt = (y: number, h = 44) => ({
    measureInWindow: (cb: Parameters<Measure>[0]) => cb(0, y, 300, h),
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: Listener) => {
      listeners[name] = fn;
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    // A focused input whose bottom edge (600 + 44) sits below a keyboard top of 500.
    focused = inputAt(600);
    (TextInput.State as { currentlyFocusedInput: () => unknown }).currentlyFocusedInput =
      () => focused;
    scrollTo = jest.fn();
    scrollRef = { current: { scrollTo } as unknown as ScrollView };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const showEvent = () => (listeners.keyboardDidShow ?? listeners.keyboardWillShow)!;
  const expectedLift = 600 + 44 + CLEARANCE - 500;

  async function mount() {
    const { result, unmount } = await renderHook(() => useSheetKeyboardScroll(scrollRef));
    await act(async () => {
      result.current.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
      } as never);
      result.current.onContentSizeChange(390, 700); // body fits the viewport
    });
    return { result, unmount };
  }

  it('waits for the padded content before lifting the focused field', async () => {
    const { result } = await mount();

    await act(async () => showEvent()(keyboardEvent(300, 500)));
    // Content still 700 tall in a 700 viewport: nothing to scroll into yet.
    expect(scrollTo).not.toHaveBeenCalled();

    await act(async () => result.current.onContentSizeChange(390, 1000));
    expect(scrollTo).toHaveBeenCalledWith({ y: expectedLift, animated: true });
  });

  it('falls back to a clamped scroll if the content never reports growth', async () => {
    await mount();
    await act(async () => showEvent()(keyboardEvent(300, 500)));
    expect(scrollTo).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    // Max reachable offset is 0 with a 700-in-700 body, so the clamp yields no
    // scroll rather than a bogus one.
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls at once when the keyboard is already up and the room exists', async () => {
    const { result } = await mount();
    await act(async () => showEvent()(keyboardEvent(300, 500)));
    await act(async () => result.current.onContentSizeChange(390, 1000));
    scrollTo.mockClear();

    // Second show at the same height (iOS re-fires on focus change): no growth
    // to wait for, room already there.
    await act(async () => showEvent()(keyboardEvent(300, 500)));
    expect(scrollTo).toHaveBeenCalledWith({ y: expectedLift, animated: true });
  });

  it('does nothing when the focused field already clears the keyboard', async () => {
    await mount();
    await act(async () => showEvent()(keyboardEvent(40, 760)));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('lifts the field focus moves to while the keyboard stays up', async () => {
    const { result } = await mount();
    await act(async () => showEvent()(keyboardEvent(300, 500)));
    await act(async () => result.current.onContentSizeChange(390, 1000));
    scrollTo.mockClear();

    // Android sends no keyboard event for a focus change; the watch catches it.
    focused = inputAt(650);
    await act(async () => {
      jest.advanceTimersByTime(150);
    });
    expect(scrollTo).toHaveBeenCalledWith({ y: 650 + 44 + CLEARANCE - 500, animated: true });

    // A field that is not covered is left alone, and the same field is not
    // lifted twice.
    scrollTo.mockClear();
    focused = inputAt(100);
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('stops watching focus once the keyboard hides', async () => {
    const { result } = await mount();
    await act(async () => showEvent()(keyboardEvent(300, 500)));
    await act(async () => result.current.onContentSizeChange(390, 1000));
    await act(async () => listeners.keyboardWillHide?.(keyboardEvent(0, 800)));
    await act(async () => listeners.keyboardDidHide?.(keyboardEvent(0, 800)));
    scrollTo.mockClear();

    focused = inputAt(650);
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  describe('on Android', () => {
    const originalOS = Platform.OS;
    const originalStatusBar = StatusBar.currentHeight;

    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
      StatusBar.currentHeight = 24;
    });
    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
      StatusBar.currentHeight = originalStatusBar;
    });

    it('shifts the keyboard top up by the status bar before comparing', async () => {
      const { result } = await mount();
      await act(async () => listeners.keyboardDidShow(keyboardEvent(300, 500)));
      await act(async () => result.current.onContentSizeChange(390, 1000));
      // measureInWindow space is the screen minus the status bar, so the
      // keyboard's screenY of 500 is 476 there — the lift grows by 24.
      expect(scrollTo).toHaveBeenCalledWith({ y: expectedLift + 24, animated: true });
    });
  });
});
