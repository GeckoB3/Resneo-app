/**
 * Which channel a staff-authored message goes out on — the app's stand-in for
 * the web `GuestMessageChannelSelect` (`src/components/booking/`).
 *
 * The web renders a plain <select> carrying all three options whatever the
 * guest has on file, defaulted to "Email & SMS (if available)" and disabled
 * only while a send is in flight. This keeps that contract: same options, same
 * labels, same default, no per-option hiding — a channel the guest cannot
 * receive is answered by the route, not silently removed from the picker.
 */
import { StyleSheet, View } from 'react-native';

import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import {
  GUEST_MESSAGE_CHANNEL_OPTIONS,
  type GuestMessageChannel,
} from '@/lib/communications/guest-message-channel';
import { spacing } from '@/theme/index';

export function GuestMessageChannelPicker({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: GuestMessageChannel;
  onChange: (value: GuestMessageChannel) => void;
  /** Small caption above the control ("Send via", "Channel"…). */
  label?: string;
  disabled?: boolean;
}) {
  return (
    <View style={styles.block}>
      {label ? (
        <Text variant="overline" tone="muted">
          {label}
        </Text>
      ) : null}
      {/* Three labels of very different lengths, so the segments wrap rather
          than shrink the long one to nothing. */}
      <View style={disabled ? styles.disabled : undefined}>
        <Segmented
          options={GUEST_MESSAGE_CHANNEL_OPTIONS}
          value={value}
          onChange={disabled ? noop : onChange}
          wrapLabels
        />
      </View>
    </View>
  );
}

function noop() {}

const styles = StyleSheet.create({
  block: {
    gap: spacing.xs,
  },
  disabled: {
    opacity: 0.5,
  },
});
