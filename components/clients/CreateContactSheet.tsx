import { useState } from 'react';
import { View, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import {
  GUEST_CONTACT_MAX_LENGTH,
  readGuestSaveErrors,
  type GuestFieldErrors,
} from '@/components/clients/GuestEditSheet';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useCreateGuest } from '@/lib/queries/useCreateGuest';
import { spacing } from '@/theme/index';

/** The fields this sheet has an input for, by their API key. */
const CREATE_SHEET_FIELDS = ['first_name', 'last_name', 'email', 'phone'] as const;

type CreateContactSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Called after successful creation with the new guest's id. */
  onCreated: (guestId: string) => void;
  clientNoun?: string;
};

/**
 * Bottom-sheet to create a new contact (POST /api/venue/guests).
 * Server deduplicates by email then phone, so saving someone who already
 * exists returns their existing record instead of a duplicate.
 */
export function CreateContactSheet({
  visible,
  onClose,
  onCreated,
  clientNoun = 'client',
}: CreateContactSheetProps) {
  const mutation = useCreateGuest();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<GuestFieldErrors>({});

  /** An edit clears that field's message from the last rejected save. */
  function edited(key: string, setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setFieldErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    };
  }

  const hasIdentity =
    firstName.trim() !== '' ||
    lastName.trim() !== '' ||
    email.trim() !== '' ||
    phone.trim() !== '';

  const hasReachableDetail = email.trim() !== '' || phone.trim() !== '';

  function resetForm() {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setError(null);
    setFieldErrors({});
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSave() {
    if (!hasIdentity || mutation.isPending) return;
    setError(null);
    setFieldErrors({});
    try {
      const result = await mutation.mutateAsync({
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      hapticSuccess();
      resetForm();
      onCreated(result.guest.id);
    } catch (e) {
      hapticWarning();
      // Each field's message sits under its input (web QA FD-10); the foot of the
      // form keeps only errors no field can show.
      const saveErrors = readGuestSaveErrors(e, `Could not create ${clientNoun}.`, CREATE_SHEET_FIELDS);
      setFieldErrors(saveErrors.fields);
      setError(saveErrors.form);
    }
  }

  return (
    <Sheet visible={visible} onClose={handleClose} maxHeight="88%">
      <View style={styles.body}>
        <Text variant="subheading">New {clientNoun}</Text>
        <Text variant="bodySmall" tone="secondary">
          Add a {clientNoun} without creating a booking. If the email or phone already exists, their
          existing record opens instead.
        </Text>

        <View style={styles.nameRow}>
          <View style={styles.nameField}>
            <Input
              label="First name"
              value={firstName}
              onChangeText={edited('first_name', setFirstName)}
              autoCapitalize="words"
              maxLength={GUEST_CONTACT_MAX_LENGTH.first_name}
              error={fieldErrors.first_name}
            />
          </View>
          <View style={styles.nameField}>
            <Input
              label="Last name"
              value={lastName}
              onChangeText={edited('last_name', setLastName)}
              autoCapitalize="words"
              maxLength={GUEST_CONTACT_MAX_LENGTH.last_name}
              error={fieldErrors.last_name}
            />
          </View>
        </View>

        <Input
          label="Email"
          value={email}
          onChangeText={edited('email', setEmail)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={GUEST_CONTACT_MAX_LENGTH.email}
          placeholder="name@example.com"
          error={fieldErrors.email}
        />
        <Input
          label="Phone"
          value={phone}
          onChangeText={edited('phone', setPhone)}
          keyboardType="phone-pad"
          maxLength={GUEST_CONTACT_MAX_LENGTH.phone}
          placeholder="07911 123456"
          error={fieldErrors.phone}
        />

        {hasIdentity && !hasReachableDetail ? (
          <Text variant="caption" tone="muted">
            Without an email or phone this {clientNoun} is listed under &ldquo;All identified guests&rdquo;
            rather than the default &ldquo;Saved contact details&rdquo; view.
          </Text>
        ) : null}

        {error ? (
          <Text variant="bodySmall" tone="danger">
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            label="Cancel"
            variant="secondary"
            style={styles.flex1}
            onPress={handleClose}
            disabled={mutation.isPending}
          />
          <Button
            label={mutation.isPending ? 'Saving…' : `Add ${clientNoun}`}
            style={styles.flex1}
            loading={mutation.isPending}
            disabled={!hasIdentity}
            onPress={() => void handleSave()}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  nameField: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
});
