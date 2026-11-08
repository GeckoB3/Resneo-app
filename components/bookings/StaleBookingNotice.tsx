import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { STALE_BOOKING_MESSAGE } from '@/lib/booking/stale-booking';
import { invalidateBookingCaches } from '@/lib/queries/useBookingMutations';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useQueryClient } from '@tanstack/react-query';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Shown in a staff edit sheet when the save was refused because someone else changed the booking
 * after the sheet opened (web 412 `stale_booking`, QA X-F2). Refresh reads the booking again and
 * closes the sheet, so the next edit starts from what is saved now.
 */
export function StaleBookingNotice({
  bookingId,
  onRefreshed,
}: {
  bookingId: string | null | undefined;
  /** Called after the caches are refreshed; the sheet closes itself here. */
  onRefreshed: () => void;
}) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const accessToken = useAccessToken();
  return (
    <View
      testID="stale-booking-notice"
      style={[styles.box, { borderColor: colors.warning, backgroundColor: colors.surface }]}>
      <Text variant="bodySmall" color={colors.warning}>
        {STALE_BOOKING_MESSAGE}
      </Text>
      <Button
        label="Refresh"
        variant="secondary"
        onPress={() => {
          if (bookingId) invalidateBookingCaches(queryClient, accessToken, bookingId);
          onRefreshed();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: spacing.md,
  },
});
