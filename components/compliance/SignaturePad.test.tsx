/**
 * SignaturePad QC: a drawn signature must be emitted as a base64 PNG data URL
 * (`data:image/png;base64,…`) — the ONLY image format the server accepts
 * (`^data:(image/(png|jpeg));base64,…`). The pad rasterises its rendered <Svg>
 * via react-native-svg's `toDataURL` ref method (which returns base64 WITHOUT the
 * data prefix), so we mock the Svg ref to return a fake base64 and assert the
 * pad prepends the correct prefix.
 *
 * jest hoists mock factories above imports, so factory-closed vars are `mock*`.
 */
import { act, render, screen } from '@testing-library/react-native';

const FAKE_B64 = 'iVBORw0KGgoFAKEpng==';

// Mock react-native-svg: <Svg> forwards a ref exposing toDataURL(cb) → fake base64.
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Svg = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      toDataURL: (cb: (b64: string) => void) => cb(FAKE_B64),
    }));
    return React.createElement(View, props, props.children);
  });
  Svg.displayName = 'Svg';
  const Path = (props: any) => React.createElement(View, props);
  return { __esModule: true, default: Svg, Svg, Path };
});

// Mock gesture-handler: capture the Pan callbacks so the test can fire a stroke,
// and render GestureDetector's child (the pad surface) inline. State mirrors the
// library's own values.
const mockGesture: {
  onBegin?: (e: any) => void;
  onUpdate?: (e: any) => void;
  onFinalize?: (e: any) => void;
} = {};
jest.mock('react-native-gesture-handler', () => {
  const chainable: any = {};
  for (const m of ['enabled', 'minDistance', 'onBegin', 'onUpdate', 'onFinalize']) {
    chainable[m] = (fn: any) => {
      if (m === 'onBegin' || m === 'onUpdate' || m === 'onFinalize') mockGesture[m] = fn;
      return chainable;
    };
  }
  return {
    Gesture: { Pan: () => chainable },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    State: { UNDETERMINED: 0, FAILED: 1, BEGAN: 2, CANCELLED: 3, ACTIVE: 4, END: 5 },
  };
});

const END = 5;
const FAILED = 1;
const CANCELLED = 3;

import { SignaturePad, strokeToPath } from '@/components/compliance/SignaturePad';

beforeEach(() => {
  mockGesture.onBegin = undefined;
  mockGesture.onUpdate = undefined;
  mockGesture.onFinalize = undefined;
  jest.useRealTimers();
  // rAF runs on the macrotask queue under jsdom; make it synchronous so the
  // capture's deferred toDataURL resolves within an awaited act().
  jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: any) => {
    cb(0);
    return 0 as unknown as number;
  });
});

afterEach(() => {
  (globalThis.requestAnimationFrame as jest.Mock).mockRestore?.();
});

/** Render the pad and lay it out so the <Svg> (and its toDataURL ref) mounts. */
async function renderPad(onChange: jest.Mock) {
  await render(<SignaturePad onChange={onChange} accessibilityLabel="Sign" />);
  const pad = screen.getByLabelText('Sign');
  await act(async () => {
    pad.props.onLayout({ nativeEvent: { layout: { width: 300, height: 180 } } });
  });
}

/** Fire one touch on the pad: its points, then the gesture's final state. */
async function touch(points: { x: number; y: number }[], finalState: number) {
  await act(async () => {
    const [first, ...rest] = points;
    mockGesture.onBegin?.(first);
    for (const p of rest) mockGesture.onUpdate?.(p);
    mockGesture.onFinalize?.({ state: finalState });
    await Promise.resolve();
  });
}

describe('SignaturePad', () => {
  it('emits a base64 PNG data URL on stroke commit (matches the server format)', async () => {
    const onChange = jest.fn();
    await renderPad(onChange);

    await touch(
      [
        { x: 10, y: 10 },
        { x: 40, y: 30 },
      ],
      END,
    );

    expect(onChange).toHaveBeenCalled();
    const emitted = onChange.mock.calls.at(-1)?.[0] as string;
    expect(emitted).toBe(`data:image/png;base64,${FAKE_B64}`);
    // Exactly the format the server's parseSignatureDataUrl accepts.
    expect(emitted).toMatch(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/);
    // Never the old (rejected) SVG data URL.
    expect(emitted.startsWith('data:image/svg+xml')).toBe(false);
    expect(screen.queryByText('Sign here')).toBeNull();
  });

  // The pan never activates on a touch that does not move, so it ends FAILED and
  // `onEnd` never runs. Committing only from `onEnd` left the dot on screen but
  // never emitted it, and the next stroke wiped it.
  it('keeps and emits a tap as a dot', async () => {
    const onChange = jest.fn();
    await renderPad(onChange);

    await touch([{ x: 10, y: 10 }], FAILED);

    expect(onChange).toHaveBeenLastCalledWith(`data:image/png;base64,${FAKE_B64}`);
    expect(screen.queryByText('Sign here')).toBeNull();
  });

  it('gives a tap a dot with some length, however many points it arrived as', () => {
    expect(strokeToPath([{ x: 10, y: 20 }])).toBe('M 10.0 20.0 L 10.5 20.0');
    // A move event that did not move: a zero-length line may not paint at all.
    expect(
      strokeToPath([
        { x: 10, y: 20 },
        { x: 10, y: 20 },
      ]),
    ).toBe('M 10.0 20.0 L 10.0 20.0 L 10.5 20.0');
    // A real stroke is drawn as it went, with no nudge.
    expect(
      strokeToPath([
        { x: 10, y: 20 },
        { x: 30, y: 25 },
      ]),
    ).toBe('M 10.0 20.0 L 30.0 25.0');
  });

  it('leaves no stray dot when something else takes the touch before it moves', async () => {
    const onChange = jest.fn();
    await renderPad(onChange);

    await touch([{ x: 10, y: 10 }], CANCELLED);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Sign here')).toBeTruthy();
  });

  it('keeps the ink of a stroke that was cancelled part way', async () => {
    const onChange = jest.fn();
    await renderPad(onChange);

    await touch(
      [
        { x: 10, y: 10 },
        { x: 40, y: 30 },
        { x: 80, y: 20 },
      ],
      CANCELLED,
    );

    expect(onChange).toHaveBeenLastCalledWith(`data:image/png;base64,${FAKE_B64}`);
  });
});
