import { forwardRef, useState, type ComponentProps } from 'react';
import type { TextInput } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/theme/useTheme';

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'secureTextEntry' | 'rightSlot'>;

/**
 * A password field with a show / hide toggle at its trailing edge, so the
 * person can check what they typed before pressing Update (owner's ask,
 * 2026-09-10). Masked by default; the eye reveals it for as long as it is
 * pressed on, and the accessibility label says which way it will go.
 *
 * The toggle is a separate control, so flipping `secureTextEntry` is an
 * ordinary re-render rather than a setState inside onFocus / onBlur, which is
 * the pattern the Fabric focus rule forbids ([[textinput-focus-fabric]]).
 * Autocorrect and capitalisation stay off whichever way the field is showing.
 */
export const PasswordInput = forwardRef<TextInput, PasswordInputProps>(function PasswordInput(
  { accessibilityLabel, ...props },
  ref,
) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <Input
      ref={ref}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      accessibilityLabel={accessibilityLabel}
      secureTextEntry={!visible}
      rightSlot={
        <IconButton
          icon={
            visible
              ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' }
              : { ios: 'eye', android: 'visibility', web: 'visibility' }
          }
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          onPress={() => setVisible((v) => !v)}
          tint={colors.textMuted}
          size={36}
          iconSize={20}
          haptic={false}
        />
      }
    />
  );
});
