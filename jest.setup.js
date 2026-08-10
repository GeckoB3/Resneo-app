/**
 * Global Jest setup.
 *
 * Pure-logic suites need nothing here. Component suites add native-module mocks
 * (reanimated, gesture-handler, haptics, etc.) below as they are introduced.
 */

// Silence the noisy New-Architecture / Reanimated startup logs in test output.
// The real expo-haptics calls are async; lib/haptics.ts does `.catch()` on the
// returned promise (fire-and-forget). The mocks must resolve a promise, not
// return undefined, or pressing any haptic-enabled control throws
// "Cannot read properties of undefined (reading 'catch')".
// eslint-disable-next-line no-undef
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// There is no native provider under jest, so the real `useSafeAreaInsets`
// throws "No safe area value available" for anything that renders a Screen or a
// Sheet. A zero-inset default keeps those suites about their own behaviour;
// suites that care about the inset (Screen, Sheet) mock this module themselves,
// and a suite-level jest.mock takes precedence over this one.
// eslint-disable-next-line no-undef
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line no-undef
  const React = require('react');
  // eslint-disable-next-line no-undef
  const { View } = require('react-native');
  const insets = { top: 0, left: 0, right: 0, bottom: 0 };
  const frame = { x: 0, y: 0, width: 375, height: 812 };
  return {
    __esModule: true,
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children, ...props }) => React.createElement(View, props, children),
    SafeAreaInsetsContext: React.createContext(insets),
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets, frame },
  };
});

// react-native-reanimated's native part (worklets) is not initialized under
// jest-expo, so importing any component that pulls it in (Button, Input, Sheet,
// …) throws at module-load time. The library's own `/mock` entry transitively
// loads worklets too (v4), so it throws the same way — we provide a small,
// self-contained factory covering just the surface those components touch at
// import / render time. Pure-logic suites that never import reanimated are
// unaffected. This is enough to let *mixed* suites import a `.tsx` module and
// exercise its render-free helpers; it does not attempt real animation.
// eslint-disable-next-line no-undef
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line no-undef
  const React = require('react');
  // eslint-disable-next-line no-undef
  const { View, Text, ScrollView } = require('react-native');
  const passthrough = (Component) =>
    React.forwardRef((props, ref) => React.createElement(Component, { ...props, ref }));
  const AnimatedView = passthrough(View);
  const Animated = {
    View: AnimatedView,
    Text: passthrough(Text),
    ScrollView: passthrough(ScrollView),
    createAnimatedComponent: (Component) => passthrough(Component),
  };
  const ease = () => 0;
  ease.ease = ease;
  ease.inOut = () => ease;
  ease.out = () => ease;
  ease.in = () => ease;
  // Chainable no-op builder for layout/entering animations
  // (e.g. LinearTransition.duration(200).springify()).
  const layoutAnim = () => {
    const obj = {};
    const chain = () => obj;
    for (const m of [
      'duration', 'delay', 'springify', 'easing', 'withInitialValues',
      'damping', 'stiffness', 'mass', 'build', 'reduceMotion',
    ]) {
      obj[m] = chain;
    }
    return obj;
  };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    // Reanimated v4 shared values use .get()/.set() (plus legacy .value).
    // IMPORTANT: identity must be render-stable like the real hook — components
    // legitimately list shared values in effect deps, and a new object per
    // render makes those effects re-fire and clobber state (bit the framing
    // editor's seed effect).
    useSharedValue: (initial) => {
      const ref = React.useRef(null);
      if (ref.current === null) {
        let current = initial;
        ref.current = {
          get value() {
            return current;
          },
          set value(next) {
            current = next;
          },
          get: () => current,
          set: (next) => {
            current = typeof next === 'function' ? next(current) : next;
          },
          modify: (fn) => {
            current = typeof fn === 'function' ? fn(current) : current;
          },
          addListener: () => {},
          removeListener: () => {},
        };
      }
      return ref.current;
    },
    useAnimatedStyle: (factory) => (typeof factory === 'function' ? factory() : {}),
    // Returns the resolved prop object once (no animation) so animated SVG
    // components (e.g. the shimmer Skeleton) render their first frame in tests.
    useAnimatedProps: (factory) => (typeof factory === 'function' ? factory() : {}),
    useDerivedValue: (factory) => {
      const value = typeof factory === 'function' ? factory() : undefined;
      return { value, get: () => value, set: () => {} };
    },
    useAnimatedReaction: () => {},
    useAnimatedRef: () => ({ current: null }),
    withSpring: (toValue) => toValue,
    withTiming: (toValue) => toValue,
    withRepeat: (animation) => animation,
    withDelay: (_delay, animation) => animation,
    withSequence: (...animations) => animations[animations.length - 1],
    cancelAnimation: () => {},
    interpolate: () => 0,
    interpolateColor: (_value, _input, output) => (Array.isArray(output) ? output[0] : output),
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    Easing: ease,
    useReducedMotion: () => false,
    LinearTransition: layoutAnim(),
    FadeIn: layoutAnim(),
    FadeOut: layoutAnim(),
    // Directional variants are used by pinned bars and sheets; without them the
    // `.duration()` call in an `entering`/`exiting` prop throws at render.
    FadeInDown: layoutAnim(),
    FadeOutDown: layoutAnim(),
    FadeInUp: layoutAnim(),
    FadeOutUp: layoutAnim(),
  };
});
