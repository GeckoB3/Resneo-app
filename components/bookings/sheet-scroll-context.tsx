import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { findNodeHandle, ScrollView, View } from 'react-native';

type FieldRef = RefObject<View | null>;

type SheetScrollValue = {
  /**
   * Scroll a just-focused field to near the top of the (keyboard-shrunk)
   * viewport so it sits above the keyboard. Pass the wrapping view's ref.
   */
  ensureVisible: (node: FieldRef) => void;
};

const SheetScrollContext = createContext<SheetScrollValue>({ ensureVisible: () => {} });

/**
 * Lets text fields deep inside a sheet's scroll body ask to be scrolled above
 * the keyboard on focus. The provider owns the ScrollView; consumers call
 * `ensureVisible` from a field's `onFocus`. Outside a provider (e.g. the
 * full-screen booking route) it is a no-op — the OS handles scrolling there.
 */
export function useSheetScroll() {
  return useContext(SheetScrollContext);
}

/**
 * Hook for a keyboard-aware field: spread `ref` on a wrapping <View> and
 * `onFocus` on the <TextInput>. Measuring + scrolling on focus never calls
 * setState, so it is safe on Fabric (setState in onFocus drops Android focus).
 */
export function useScrollIntoViewOnFocus() {
  const ref = useRef<View>(null);
  const { ensureVisible } = useSheetScroll();
  const handleFocus = useCallback(() => ensureVisible(ref), [ensureVisible]);
  return { ref, handleFocus };
}

export function SheetScrollProvider({
  scrollRef,
  children,
}: {
  scrollRef: RefObject<ScrollView | null>;
  children: ReactNode;
}) {
  const ensureVisible = useCallback<SheetScrollValue['ensureVisible']>(
    (node) => {
      const scroller = scrollRef.current;
      const target = node.current;
      if (!scroller || !target) return;
      const scrollNode = findNodeHandle(scroller);
      if (scrollNode == null) return;
      // Coordinates come back in the ScrollView's content space — the same
      // space scrollTo expects. Land the field just below the top edge.
      target.measureLayout(
        scrollNode,
        (_x, y) => {
          scroller.scrollTo({ y: Math.max(0, y - 24), animated: true });
        },
        () => {},
      );
    },
    [scrollRef],
  );

  return (
    <SheetScrollContext.Provider value={{ ensureVisible }}>{children}</SheetScrollContext.Provider>
  );
}
