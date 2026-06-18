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
// and render GestureDetector's child (the pad surface) inline.
const mockGesture: { onBegin?: (e: any) => void; onEnd?: () => void } = {};
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const chainable: any = {};
  for (const m of ['enabled', 'minDistance', 'onBegin', 'onUpdate', 'onEnd']) {
    chainable[m] = (fn: any) => {
      if (m === 'onBegin') mockGesture.onBegin = fn;
      if (m === 'onEnd') mockGesture.onEnd = fn;
      return chainable;
    };
  }
  return {
    Gesture: { Pan: () => chainable },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});

import { SignaturePad } from '@/components/compliance/SignaturePad';

beforeEach(() => {
  mockGesture.onBegin = undefined;
  mockGesture.onEnd = undefined;
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

describe('SignaturePad', () => {
  it('emits a base64 PNG data URL on stroke commit (matches the server format)', async () => {
    const onChange = jest.fn();
    await render(<SignaturePad onChange={onChange} accessibilityLabel="Sign" />);

    // Lay the pad out so the <Svg> (and its toDataURL ref) mounts.
    const pad = screen.getByLabelText('Sign');
    await act(async () => {
      pad.props.onLayout({ nativeEvent: { layout: { width: 300, height: 180 } } });
    });

    // Draw a one-point stroke (begin → end) and let the capture resolve.
    await act(async () => {
      mockGesture.onBegin?.({ x: 10, y: 10 });
      mockGesture.onEnd?.();
      await Promise.resolve();
    });

    expect(onChange).toHaveBeenCalled();
    const emitted = onChange.mock.calls.at(-1)?.[0] as string;
    expect(emitted).toBe(`data:image/png;base64,${FAKE_B64}`);
    // Exactly the format the server's parseSignatureDataUrl accepts.
    expect(emitted).toMatch(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/);
    // Never the old (rejected) SVG data URL.
    expect(emitted.startsWith('data:image/svg+xml')).toBe(false);
  });
});
