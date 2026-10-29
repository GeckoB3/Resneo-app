import { type Href, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { CheckoutGlyph } from '@/components/pos/switches/parts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { isPosEnabled, posOffer, posOfferDoor, posPromptDismissed } from '@/lib/pos/pos-enabled';
import { swT } from '@/lib/pos/switches/copy';
import { offerDoorOpen } from '@/lib/pos/switches/model';
import { offerScope, useOfferHidden } from '@/lib/pos/switches/offer-dismissal';
import { useHidePosOffer } from '@/lib/queries/useFeatureSwitches';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';

/** Where "See how it works" goes: the landing on the Checkout tile's page. */
export const CHECKOUT_LANDING_HREF = '/checkout';

/**
 * The Checkout offer on Today (POS Part 5, design section 12 and step 1, the web's Home card A1):
 * shown while the door is open (`feature_offers.pos_door`, the web's one rule: offered, the venue
 * has never made a sale, and this admin has not hidden it), so a venue that used Checkout and
 * switched it off is not pitched again. "See how it works" opens the landing; "Hide this" is kept
 * on the server for this person (the web's card and menu item go too) and the card goes at once.
 * Hidden from team members, from an older server's admins (no door), and once Checkout is on.
 */
export function CheckoutOfferCard() {
  const router = useRouter();
  const toast = useToast();
  const staffQuery = useStaffMe();
  const staff = staffQuery.data?.staff;
  const { venue } = useVenueContext();
  const isAdmin = staff?.role === 'admin';
  // Only an admin can be offered Checkout, so only an admin's "Hide this" is kept here.
  const scope = isAdmin ? offerScope(venue?.id, staff?.id) : null;
  const hiddenHere = useOfferHidden(scope);
  const hide = useHidePosOffer(scope);

  const visible = offerDoorOpen({
    isAdmin,
    posEnabled: isPosEnabled(venue),
    offer: posOffer(venue),
    door: posOfferDoor(venue),
    dismissed: posPromptDismissed(venue, 'pos_offer'),
    hiddenHere,
  });
  if (!visible) return null;

  return (
    <Card>
      <View style={styles.row}>
        <CheckoutGlyph size={44} />
        <View style={styles.body}>
          <Text variant="label" accessibilityRole="header">
            {swT('app.sw.title')}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {swT('app.sw.body')}
          </Text>
          <View style={styles.buttons}>
            <Button label={swT('sw.offer.see')} size="sm" onPress={() => router.push(CHECKOUT_LANDING_HREF as Href)} />
            <Button
              label={swT('sw.offer.hide')}
              size="sm"
              variant="ghost"
              loading={hide.isPending}
              onPress={() =>
                hide.mutate(undefined, {
                  onSuccess: () => toast.info(swT('app.sw.offer.hidden')),
                  onError: () => toast.error(swT('sw.offer.hideFailed')),
                })
              }
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  body: { flex: 1, minWidth: 0, gap: spacing.xs },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.xs },
});
