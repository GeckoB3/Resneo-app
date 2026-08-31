import { StyleSheet, View } from 'react-native';

import { AccountEmailSection } from '@/components/customer/profile/AccountEmailSection';
import { AccountSecuritySection } from '@/components/customer/profile/AccountSecuritySection';
import { LoginDestinationSection } from '@/components/customer/profile/LoginDestinationSection';
import { MarketingConsentSection } from '@/components/customer/profile/MarketingConsentSection';
import { PaymentHistorySection } from '@/components/customer/profile/PaymentHistorySection';
import { ProfileDetailsSection } from '@/components/customer/profile/ProfileDetailsSection';
import { SavedCardsSection } from '@/components/customer/profile/SavedCardsSection';
import { YourDataSection } from '@/components/customer/profile/YourDataSection';
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
        {/*
          No per-category "what we send you" switches here, deliberately.

          They shipped in C4 and were withdrawn on the web in a20a54ba for a
          reason that applies identically to this app: the matrix was consulted
          only in `communicationService.send`, and everything a customer would
          reach for it to stop (the reminders, a change, a cancellation, the
          post-visit email) goes out through `sendPolicyMessage` and never
          passed through it. All five switches this screen offered were in that
          bypassed set, so every one of them saved and changed nothing.

          A control that appears to work and does not is worse than no control,
          and worst of all about consent. What a venue sends about a booking is
          the venue's communication settings. Restoring this means moving the
          check into `sendPolicyMessage` FIRST, server-side.

          Per-venue marketing consent below is a different thing and does work.
        */}
        <AccountEmailSection />
        <MarketingConsentSection />
        <PaymentHistorySection />
        <SavedCardsSection />
        {/* Renders nothing unless the account also has a venue side. */}
        <LoginDestinationSection />
        <AccountSecuritySection />
        {/* Last, because closing the account is the most consequential thing
            here and should not sit above the settings people came for. */}
        <YourDataSection />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.base },
});
