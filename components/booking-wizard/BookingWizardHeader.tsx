import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';

import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/useTheme';

type BookingWizardHeaderProps = {
  /**
   * Whether the user can step back a page within the form. When false the back
   * arrow is hidden, so on the first page the ✕ is the only way out.
   */
  canGoBack: boolean;
  /** Step back one page within the form. */
  onBack: () => void;
};

/**
 * Modal-header controls shared by every booking flow:
 *  - the top-left arrow steps BACK one page within the form (hidden on page one), and
 *  - the top-right ✕ closes the whole form.
 *
 * Each flow renders this so the header always reflects the active flow's current
 * step. It renders nothing itself — it only sets navigation options. Replaces the
 * old per-step "Back" button at the bottom of each step and the native back
 * chevron (which used to leave the form).
 */
export function BookingWizardHeader({ canGoBack, onBack }: BookingWizardHeaderProps) {
  const router = useRouter();
  const { colors } = useTheme();

  // Read the latest onBack at press time so the memoised header options don't
  // re-apply on every wizard re-render (e.g. each keystroke on the guest step).
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  const options = useMemo(
    () => ({
      // Swap the native back chevron for our own controls.
      headerBackVisible: false,
      headerLeft: canGoBack
        ? () => (
            <IconButton
              icon={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              accessibilityLabel="Back"
              tint={colors.text}
              iconSize={24}
              onPress={() => onBackRef.current()}
            />
          )
        : () => null,
      headerRight: () => (
        <IconButton
          icon={{ ios: 'xmark', android: 'close', web: 'close' }}
          accessibilityLabel="Close"
          tint={colors.text}
          iconSize={22}
          onPress={() => router.back()}
        />
      ),
    }),
    [canGoBack, colors.text, router],
  );

  return <Stack.Screen options={options} />;
}
