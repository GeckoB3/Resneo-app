import { StyleSheet, View } from 'react-native';

import { AccountSecuritySection } from '@/components/customer/profile/AccountSecuritySection';
import { MarketingConsentSection } from '@/components/customer/profile/MarketingConsentSection';
import { NotificationPreferencesSection } from '@/components/customer/profile/NotificationPreferencesSection';
import { PaymentHistorySection } from '@/components/customer/profile/PaymentHistorySection';
import { ProfileDetailsSection } from '@/components/customer/profile/ProfileDetailsSection';
import { SavedCardsSection } from '@/components/customer/profile/SavedCardsSection';
import { Screen } from '@/components/ui/Screen';
import { spacing } from '@/theme/index';

/**
 * Everything about the customer rather than about a booking.
 *
 * One screen with sections, following the web's P1-3, which folded payment
 * methods and security into the profile page rather than giving each its own
 * route. The same reasoning holds harder on a phone: four more destinations for
 * things most people touch once would be four more places to look.
 *
 * Each section loads its own data, so one failing read leaves the others
 * standing, and a customer with no saved cards does not wait on Stripe to see
 * their own name.
 */
export default function CustomerProfileScreen() {
  return (
    <Screen scroll padded>
      <View style={styles.stack}>
        <ProfileDetailsSection />
        <NotificationPreferencesSection />
        <MarketingConsentSection />
        <PaymentHistorySection />
        <SavedCardsSection />
        <AccountSecuritySection />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.base },
});
