import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useUpdateBookingDetails,
  type UpdateBookingDetailsInput,
} from '@/lib/queries/useBookingMutations';
import { spacing } from '@/theme/index';

export type EditBookingTarget = {
  id: string;
  guestFirstName: string;
  guestLastName: string;
  guestPhone: string;
  guestEmail: string;
  specialRequests: string;
  dietaryNotes: string;
  occasion: string;
  internalNotes: string;
};

type EditBookingSheetProps = {
  target: EditBookingTarget | null;
  onClose: () => void;
};

/** Bottom-sheet to edit the guest's contact details and the booking's notes. */
export function EditBookingSheet({ target, onClose }: EditBookingSheetProps) {
  const mutation = useUpdateBookingDetails(target?.id ?? '');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [occasion, setOccasion] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [seededId, setSeededId] = useState<string | null>(null);

  // Seed from the booking when the sheet opens or the target booking changes.
  // useEffect avoids setState-during-render in Fabric/concurrent mode.
  useEffect(() => {
    if (!target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset seed when sheet closes
      setSeededId(null);
      return;
    }
    if (target.id === seededId) return;
    setSeededId(target.id);
    setFirstName(target.guestFirstName);
    setLastName(target.guestLastName);
    setPhone(target.guestPhone);
    setEmail(target.guestEmail);
    setSpecialRequests(target.specialRequests);
    setDietaryNotes(target.dietaryNotes);
    setOccasion(target.occasion);
    setInternalNotes(target.internalNotes);
    setError(null);
  }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function buildPayload(t: EditBookingTarget): UpdateBookingDetailsInput {
    const payload: UpdateBookingDetailsInput = {};
    const diff = (current: string, original: string): string | null | undefined =>
      current.trim() === original.trim() ? undefined : current.trim() || null;

    const f = diff(firstName, t.guestFirstName);
    if (f !== undefined) payload.guest_first_name = f;
    const l = diff(lastName, t.guestLastName);
    if (l !== undefined) payload.guest_last_name = l;
    const p = diff(phone, t.guestPhone);
    if (p !== undefined) payload.guest_phone = p;
    const e = diff(email, t.guestEmail);
    if (e !== undefined) payload.guest_email = e;
    const sr = diff(specialRequests, t.specialRequests);
    if (sr !== undefined) payload.special_requests = sr;
    const dn = diff(dietaryNotes, t.dietaryNotes);
    if (dn !== undefined) payload.dietary_notes = dn;
    const oc = diff(occasion, t.occasion);
    if (oc !== undefined) payload.occasion = oc;
    const inotes = diff(internalNotes, t.internalNotes);
    if (inotes !== undefined) payload.internal_notes = inotes;
    return payload;
  }

  const payload = target ? buildPayload(target) : {};
  const hasChanges = Object.keys(payload).length > 0;

  async function handleSave() {
    if (!target || !hasChanges) return;
    setError(null);
    try {
      await mutation.mutateAsync(payload);
      hapticSuccess();
      onClose();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save changes.');
    }
  }

  return (
    <Sheet visible={!!target} onClose={onClose} maxHeight="88%">
      {target && seededId === target.id ? (
        <View style={styles.body}>
              <Text variant="overline" tone="muted">
                Edit booking
              </Text>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollBody}
                keyboardShouldPersistTaps="handled">
                <Text variant="label" tone="secondary">
                  Guest
                </Text>
                <View style={styles.nameRow}>
                  <View style={styles.nameField}>
                    <Input label="First name" value={firstName} onChangeText={setFirstName} />
                  </View>
                  <View style={styles.nameField}>
                    <Input label="Last name" value={lastName} onChangeText={setLastName} />
                  </View>
                </View>
                <Input
                  label="Phone"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                />
                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text variant="label" tone="secondary" style={styles.sectionGap}>
                  Notes
                </Text>
                <Input
                  label="Special requests"
                  value={specialRequests}
                  onChangeText={setSpecialRequests}
                  multiline
                  style={styles.multiline}
                />
                <Input
                  label="Dietary notes"
                  value={dietaryNotes}
                  onChangeText={setDietaryNotes}
                  multiline
                  style={styles.multiline}
                />
                <Input label="Occasion" value={occasion} onChangeText={setOccasion} />
                <Input
                  label="Internal notes (staff only)"
                  value={internalNotes}
                  onChangeText={setInternalNotes}
                  multiline
                  style={styles.multiline}
                />

                {error ? (
                  <Text variant="bodySmall" tone="danger">
                    {error}
                  </Text>
                ) : null}
              </ScrollView>

              <View style={styles.actions}>
                <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.actionButton} />
                <Button
                  label="Save"
                  onPress={() => void handleSave()}
                  loading={mutation.isPending}
                  disabled={!hasChanges}
                  style={styles.actionButton}
                />
              </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollBody: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  nameField: {
    flex: 1,
  },
  sectionGap: {
    marginTop: spacing.sm,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
});
