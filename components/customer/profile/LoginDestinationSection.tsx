import { StyleSheet } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { useCustomerProfile, useUpdateCustomerProfile } from '@/lib/queries/useCustomerProfile';
import type { LoginDestination } from '@/lib/queries/useCustomerProfile';
import { useRole } from '@/lib/queries/useRole';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/**
 * Where signing in takes an account that has both a venue side and a customer
 * side.
 *
 * **Only rendered for those accounts**, and that is the whole design of this
 * section rather than a detail of it. `useAppMode` consults this preference at
 * exactly one point: after it has established the person is not a confirmed
 * customer. Somebody who only ever books things is routed to their account
 * before this value is read, so the setting has no effect for them at all.
 * Showing it to them would be a switch that saves and changes nothing, which is
 * the precise fault that got the notification matrix withdrawn from this screen
 * a few sections up. One of those is enough.
 *
 * `role === 'staff'` is the test because it means the staff check came back with
 * a profile: this account has a venue side. It is the same fact the switcher on
 * the venue app uses, read from the same query.
 *
 * The value is shared with the website, not an app-local copy, so a change here
 * moves where the browser lands too.
 */
export function LoginDestinationSection() {
  const toast = useToast();
  const role = useRole();
  const { data } = useCustomerProfile();
  const update = useUpdateCustomerProfile();

  // Not for single-role accounts, and not while we are still finding out.
  if (role !== 'staff') return null;

  const value: LoginDestination = data?.profile?.default_login_destination ?? 'ask';

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        WHERE SIGNING IN TAKES YOU
      </Text>

      <Text variant="bodySmall" tone="secondary" style={styles.gap}>
        Your account works as both a customer and a team member. This is shared with the ResNeo
        website, so it decides where the browser lands too.
      </Text>

      <Segmented<LoginDestination>
        options={[
          { value: 'ask', label: 'Ask me' },
          { value: 'account', label: 'My bookings' },
          { value: 'dashboard', label: 'Venue dashboard' },
        ]}
        value={value}
        onChange={(next) =>
          update.mutate(
            { default_login_destination: next },
            { onError: () => toast.error('Could not save that. Please try again.') },
          )
        }
      />

      {/*
        Says what "Ask me" actually does HERE, because it is not what the word
        promises and not quite what the website does with it.

        The web renders a chooser page. This app has no chooser: it opens the
        venue dashboard and offers a switcher, which is a real difference in
        what happens to you. Leaving the option out would strand anybody who
        picked it on the website with nothing selected; describing it honestly
        costs one sentence.
      */}
      <Text variant="caption" tone="muted" style={styles.gap}>
        {value === 'ask'
          ? 'In the app, "Ask me" opens the venue dashboard with a switcher to your bookings. The website asks you outright.'
          : 'You can still switch between the two at any time.'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing.sm },
});
