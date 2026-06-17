import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Sheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { summariseGrant } from '@/lib/linked/grants';
import { useLinkedVenues } from '@/lib/queries/useLinkedVenues';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AccountLinkView } from '@/types/linked-venues';

/**
 * Lists the linked venues the caller can act on (accepted/suspended links that
 * grant calendar visibility) and switches the active owner-venue context to the
 * chosen one. Picking a venue sets `ownerVenueId` (persisted) and hands control
 * back to the caller (which typically navigates to the linked calendar). A
 * "Primary venue" row clears the context.
 */
export function LinkedVenueSwitcherSheet({
  visible,
  onClose,
  onPicked,
}: {
  visible: boolean;
  onClose: () => void;
  /** Fired after a venue (or primary) is selected, so the caller can navigate. */
  onPicked?: (venueId: string | null) => void;
}) {
  const { colors } = useTheme();
  const { ownerVenueId, setOwnerVenueId, clearOwnerVenue } = useLinkedVenueContext();
  const query = useLinkedVenues();

  // Accepted/suspended links where I have at least calendar visibility into the
  // other venue (iCan.calendar !== 'none') — the venues I can actually view.
  const accessible = useMemo<AccountLinkView[]>(() => {
    const links = query.data?.links ?? [];
    return links.filter(
      (l) =>
        (l.status === 'accepted' || l.status === 'suspended') && l.iCan.calendar !== 'none',
    );
  }, [query.data?.links]);

  const handlePick = (link: AccountLinkView) => {
    setOwnerVenueId(link.otherVenue.id, link.otherVenue.name);
    onPicked?.(link.otherVenue.id);
    onClose();
  };

  const handlePrimary = () => {
    clearOwnerVenue();
    onPicked?.(null);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Text variant="subheading">Switch venue</Text>
        <Text variant="bodySmall" tone="secondary">
          View and manage a linked venue’s calendar, or return to your own.
        </Text>

        {/* Primary venue (clears the linked context) */}
        <PressableScale
          haptic
          accessibilityRole="button"
          accessibilityLabel="Use primary venue"
          accessibilityState={{ selected: ownerVenueId === null }}
          onPress={handlePrimary}>
          <View
            style={[
              styles.row,
              {
                borderColor: ownerVenueId === null ? colors.brand : colors.border,
                backgroundColor: ownerVenueId === null ? colors.brandSubtle : colors.surface,
              },
            ]}>
            <View style={styles.rowBody}>
              <Text variant="bodyMedium">Your venue</Text>
              <Text variant="caption" tone="muted">
                Primary account
              </Text>
            </View>
            {ownerVenueId === null ? (
              <SymbolView
                name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                tintColor={colors.brand}
                size={16}
              />
            ) : null}
          </View>
        </PressableScale>

        {accessible.length === 0 ? (
          <EmptyState
            title="No linked calendars"
            message="When you’re linked to another venue with calendar access, it’ll appear here to switch into."
          />
        ) : (
          accessible.map((link) => {
            const active = ownerVenueId === link.otherVenue.id;
            return (
              <PressableScale
                key={link.id}
                haptic
                accessibilityRole="button"
                accessibilityLabel={link.otherVenue.name}
                accessibilityState={{ selected: active }}
                onPress={() => handlePick(link)}>
                <View
                  style={[
                    styles.row,
                    {
                      borderColor: active ? colors.brand : colors.border,
                      backgroundColor: active ? colors.brandSubtle : colors.surface,
                    },
                  ]}>
                  <View style={styles.rowBody}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {link.otherVenue.name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {summariseGrant(link.iCan)}
                    </Text>
                  </View>
                  {active ? (
                    <SymbolView
                      name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                      tintColor={colors.brand}
                      size={16}
                    />
                  ) : null}
                </View>
              </PressableScale>
            );
          })
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
