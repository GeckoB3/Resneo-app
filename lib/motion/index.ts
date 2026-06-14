/**
 * Motion preferences — one place to respect the OS "Reduce Motion" setting.
 *
 * Reanimated exposes the live OS setting via useReducedMotion(); we re-export a
 * stable hook so every animated surface gates on the same source. When reduce
 * motion is on, pass `undefined` to a Reanimated `entering`/`exiting`/`layout`
 * prop (which disables the animation) via the helpers below.
 *
 * Usage:
 *   const reduceMotion = useReduceMotion();
 *   <Animated.View entering={motionSafe(FadeInDown, reduceMotion)} layout={layoutSafe(LinearTransition, reduceMotion)} />
 */
import { useReducedMotion } from 'react-native-reanimated';

/** True when the user has asked the OS to minimise motion. */
export function useReduceMotion(): boolean {
  return useReducedMotion();
}

/**
 * Return the given entering/exiting animation, or `undefined` when reduce
 * motion is on (Reanimated treats `undefined` as "no animation").
 */
export function motionSafe<T>(animation: T, reduceMotion: boolean): T | undefined {
  return reduceMotion ? undefined : animation;
}

/** Same as motionSafe, named for the `layout` prop for readability at call sites. */
export function layoutSafe<T>(transition: T, reduceMotion: boolean): T | undefined {
  return reduceMotion ? undefined : transition;
}
