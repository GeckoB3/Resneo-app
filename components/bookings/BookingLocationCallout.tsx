import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { hapticTap } from '@/lib/haptics';
import type { StaffBookingLocationView } from '@/lib/booking/staff-booking-location';
import { minTouchTarget, radius, spacing, typography } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type SymbolName = SymbolViewProps['name'];

const ONLINE_ICON: SymbolName = { ios: 'video.fill', android: 'videocam', web: 'videocam' };
const ADDRESS_ICON: SymbolName = {
  ios: 'mappin.and.ellipse',
  android: 'place',
  web: 'place',
};

/**
 * Staff-facing "where is this happening" callout for a booking that is not at the
 * business venue (web parity: `BookingLocationCallout`).
 *
 * Deliberately a callout rather than another meta chip or detail row: on a phone,
 * the person reading this booking is often the one about to travel to it, so the
 * address needs to be the first thing they see and the first thing they can tap.
 * The address opens Maps; the join link opens the meeting.
 *
 * Renders nothing when `view` is null (business venue, or a legacy booking with
 * no location snapshot).
 */
export function BookingLocationCallout({ view }: { view: StaffBookingLocationView | null }) {
  const { colors } = useTheme();

  if (!view) return null;

  const online = view.kind === 'online';
  // info (navy) for online, success (emerald) for an address — the same split the
  // web callout makes with sky/emerald, mapped onto tokens that work in both themes.
  const tint = online ? colors.info : colors.success;
  const surface = online ? colors.infoSurface : colors.successSurface;

  const openUrl = (url: string) => {
    hapticTap();
    Linking.openURL(url).catch(() => undefined);
  };

  return (
    <View style={[styles.callout, { backgroundColor: surface, borderColor: tint }]}>
      <View style={styles.header}>
        <SymbolView
          name={online ? ONLINE_ICON : ADDRESS_ICON}
          size={14}
          tintColor={tint}
          fallback={null}
        />
        <Text variant="overline" color={tint}>
          {online ? 'Online appointment' : "At the client's address"}
        </Text>
      </View>

      {online ? (
        <OnlineBody view={view} tint={tint} onOpen={openUrl} />
      ) : (
        <AddressBody view={view} onOpen={openUrl} />
      )}
    </View>
  );
}

function OnlineBody({
  view,
  tint,
  onOpen,
}: {
  view: StaffBookingLocationView;
  tint: string;
  onOpen: (url: string) => void;
}) {
  const { colors } = useTheme();

  return (
    <>
      {view.joinUrl ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Join the online appointment"
          hitSlop={spacing.sm}
          onPress={() => onOpen(view.joinUrl as string)}
          style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}>
          <Text variant="bodySmall" color={tint} style={styles.link}>
            {view.joinUrl}
          </Text>
          <SymbolView
            name={{ ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' }}
            size={13}
            tintColor={tint}
            fallback={null}
          />
        </Pressable>
      ) : view.gap === 'link_pending' ? (
        <Text variant="bodySmall" tone="muted" style={styles.body}>
          Checking for joining details…
        </Text>
      ) : (
        <Text variant="bodySmall" color={colors.warning} style={styles.body}>
          No meeting link is set for this service. Add one in Services so the client receives it.
        </Text>
      )}

      {view.joinInfo ? (
        <Text variant="caption" tone="secondary" style={styles.body}>
          {view.joinInfo}
        </Text>
      ) : null}
    </>
  );
}

function AddressBody({
  view,
  onOpen,
}: {
  view: StaffBookingLocationView;
  onOpen: (url: string) => void;
}) {
  const { colors } = useTheme();

  if (view.address && view.mapsUrl) {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${view.address} in Maps`}
        hitSlop={spacing.sm}
        onPress={() => onOpen(view.mapsUrl as string)}
        style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}>
        <Text variant="bodySmall" color={colors.success} style={styles.link}>
          {view.address}
        </Text>
        <SymbolView
          name={{ ios: 'arrow.triangle.turn.up.right.circle.fill', android: 'directions', web: 'directions' }}
          size={15}
          tintColor={colors.success}
          fallback={null}
        />
      </Pressable>
    );
  }

  return (
    <Text variant="bodySmall" color={colors.warning} style={styles.body}>
      {view.gap === 'address_hidden'
        ? 'The address is hidden because this booking belongs to a linked venue.'
        : 'No address was recorded. Contact the client to confirm where to go.'}
    </Text>
  );
}

const styles = StyleSheet.create({
  callout: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // The address is the reason this callout exists, so it gets a full touch
    // target rather than the line height of its text.
    minHeight: minTouchTarget - spacing.md,
  },
  link: {
    flexShrink: 1,
    fontFamily: typography.label.fontFamily,
    textDecorationLine: 'underline',
  },
  body: {
    // Joining instructions are authored as free text and often multi-line.
    lineHeight: typography.bodySmall.lineHeight,
  },
  pressed: {
    opacity: 0.6,
  },
});
