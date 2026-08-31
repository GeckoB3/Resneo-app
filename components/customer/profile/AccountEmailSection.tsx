import { StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import {
  ACCOUNT_EMAIL_KEYS,
  BOOKING_EMAIL_NOTE,
  accountEmailDescription,
  accountEmailLabel,
  accountEmailPatch,
  readAccountEmailPreferences,
  type AccountEmailKey,
} from '@/lib/notifications/account-email-preferences';
import { useCustomerProfile, useUpdateCustomerProfile } from '@/lib/queries/useCustomerProfile';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/**
 * Email ResNeo sends about the account itself.
 *
 * This is what stands where the per-category booking matrix used to. That
 * matrix was withdrawn on both sides because nothing honoured it; these two
 * were never part of it and the web still has both, so removing them along with
 * it would have been throwing out the working controls with the broken ones.
 *
 * Each switch saves on its own. There is no Save button here because there is
 * nothing to batch: one switch is one field, and a customer who flicks it and
 * leaves the screen has said what they meant.
 */
export function AccountEmailSection() {
  const toast = useToast();
  const { data, isLoading } = useCustomerProfile();
  const update = useUpdateCustomerProfile();

  const prefs = readAccountEmailPreferences(data?.profile?.notification_preferences);

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        EMAIL FROM RESNEO
      </Text>

      {isLoading ? (
        <LoadingState message="Loading your preferences…" />
      ) : (
        <>
          {ACCOUNT_EMAIL_KEYS.map((key) => (
            <Row
              key={key}
              preferenceKey={key}
              value={prefs[key]}
              disabled={update.isPending}
              onChange={(next) =>
                update.mutate(
                  { notification_preferences: accountEmailPatch(key, next) },
                  { onError: () => toast.error('Could not save that. Please try again.') },
                )
              }
            />
          ))}

          {/*
            Says where the mail this does NOT govern comes from. Without it the
            screen offers three things a customer could read as "email
            settings" and nothing distinguishing them, which is how somebody
            switches off the wrong one and believes they are done.
          */}
          <Text variant="caption" tone="muted" style={styles.note}>
            {BOOKING_EMAIL_NOTE}
          </Text>
        </>
      )}
    </Card>
  );
}

type RowProps = {
  preferenceKey: AccountEmailKey;
  value: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
};

function Row({ preferenceKey, value, disabled, onChange }: RowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text variant="bodyMedium">{accountEmailLabel(preferenceKey)}</Text>
        <Text variant="caption" tone="muted">
          {accountEmailDescription(preferenceKey)}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        // Named for what it governs rather than "switch", which is all a screen
        // reader would otherwise get from a control sitting beside its label.
        accessibilityLabel={accountEmailLabel(preferenceKey)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.base,
    marginTop: spacing.base,
  },
  // The text takes the slack so a long description wraps instead of squeezing
  // the switch off the row.
  rowText: { flex: 1, gap: 2 },
  note: { marginTop: spacing.base },
});
