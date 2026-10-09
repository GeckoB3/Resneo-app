import { useCallback, useEffect, useRef } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';

/**
 * Keeps the selected pill of a sideways-scrolling tab strip in view. A screen can open on a tab
 * that sits off the right edge (`?tab=suppliers`, `?tab=takings`): on mount, once the strip and the
 * selected pill have been measured, the strip jumps so that pill is centred (as far as the strip
 * can scroll), and it glides there again whenever the selected tab changes.
 *
 * Usage: pass `ref`, `onLayout` and `onContentSizeChange` to the horizontal `ScrollView`, and wrap
 * each pill in a `View` with `onLayout={(e) => onPillLayout(key, e)}`.
 */
export function useSelectedPillScroll(selected: string) {
  const ref = useRef<ScrollView>(null);
  const pills = useRef<Record<string, { x: number; width: number }>>({});
  const viewport = useRef(0);
  const content = useRef(0);
  // The tab the strip last scrolled to, so a later layout pass does not keep pulling it back.
  const settled = useRef<string | null>(null);
  const selectedRef = useRef(selected);

  const scrollTo = useCallback((key: string, animated: boolean): boolean => {
    const pill = pills.current[key];
    if (!pill || viewport.current <= 0 || content.current <= 0 || !ref.current) return false;
    const max = Math.max(0, content.current - viewport.current);
    const centred = pill.x + pill.width / 2 - viewport.current / 2;
    ref.current.scrollTo({ x: Math.min(max, Math.max(0, centred)), animated });
    settled.current = key;
    return true;
  }, []);

  // First measurement: jump without animation so the screen opens with the pill in view.
  const settle = useCallback(() => {
    if (settled.current !== selectedRef.current) scrollTo(selectedRef.current, false);
  }, [scrollTo]);

  useEffect(() => {
    selectedRef.current = selected;
    // A tab change after the first settle glides; before it, the layout callbacks handle it.
    if (settled.current !== null && settled.current !== selected) scrollTo(selected, true);
  }, [selected, scrollTo]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewport.current = e.nativeEvent.layout.width;
      settle();
    },
    [settle],
  );

  const onContentSizeChange = useCallback(
    (width: number) => {
      content.current = width;
      settle();
    },
    [settle],
  );

  const onPillLayout = useCallback(
    (key: string, e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      pills.current[key] = { x, width };
      if (key === selectedRef.current) settle();
    },
    [settle],
  );

  return { ref, onLayout, onContentSizeChange, onPillLayout };
}
