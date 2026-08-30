import { View } from 'react-native';

import { LoadingState } from '@/components/ui/LoadingState';
import { useTheme } from '@/theme/useTheme';

/**
 * Where a signed-in person waits while the app works out which side to show
 * them.
 *
 * **A real screen rather than an overlay, deliberately.** The root router needs
 * exactly one active destination at every moment: Expo Router falls back to
 * "the first available unprotected screen" when no guarded one is active, and
 * the first unprotected sibling is `set-password`, so without this the app
 * would flash a set-a-password form at people who already have one.
 *
 * It is also what lets the router avoid mounting a side before it knows which.
 * The alternative, mounting the staff side immediately and correcting later, is
 * a navigator unmount, and Expo Router's documented behaviour is to remove
 * every history entry for a screen whose guard turns false. That is the shape
 * of the crash loop this app suffered on 2026-08-16.
 *
 * It says nothing about staff or customers, because at this point we do not
 * know, and a wrong guess in the copy is worse than a neutral word.
 */
export default function ModeLoadingScreen() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LoadingState message="Loading your account…" />
    </View>
  );
}
