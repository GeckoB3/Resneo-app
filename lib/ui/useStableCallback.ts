import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A callback that keeps one identity for the component's life and always runs the latest code.
 *
 * Android's date and time pickers need this: `@react-native-community/datetimepicker` lists its
 * callbacks in the dependencies of the effect that opens the dialog, so a new callback REOPENS it.
 * With an inline arrow function, any re-render behind an open dialog (the diary's clock tick, live
 * sync) threw away what the person had picked, and OK returned the old value.
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(callback);
  useLayoutEffect(() => {
    latest.current = callback;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
