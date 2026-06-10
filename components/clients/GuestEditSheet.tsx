import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useUpdateGuest, type UpdateGuestInput } from '@/lib/queries/useGuestMutations';
import { spacing } from '@/theme/index';

export type GuestEditTarget = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
  /** Comma-joined tags. */
  tags: string;
  marketingConsent: boolean;
};

type GuestEditSheetProps = {
  target: GuestEditTarget | null;
  onClose: () => void;
};

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** Bottom-sheet to edit a guest's profile, tags, notes and marketing consent. */
export function GuestEditSheet({ target, onClose }: GuestEditSheetProps) {
  const mutation = useUpdateGuest(target?.id ?? '');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seededId, setSeededId] = useState<string | null>(null);

  if (target && target.id !== seededId) {
    setSeededId(target.id);
    setFirstName(target.firstName);
    setLastName(target.lastName);
    setPhone(target.phone);
    setEmail(target.email);
    setNotes(target.notes);
    setTags(target.tags);
    setMarketing(target.marketingConsent);
    setError(null);
  } else if (!target && seededId !== null) {
    setSeededId(null);
  }

  function buildPayload(t: GuestEditTarget): UpdateGuestInput {
    const payload: UpdateGuestInput = {};
    const diff = (cur: string, orig: string): string | null | undefined =>
      cur.trim() === orig.trim() ? undefined : cur.trim() || null;

    const f = diff(firstName, t.firstName);
    if (f !== undefined) payload.first_name = f;
    const l = diff(lastName, t.lastName);
    if (l !== undefined) payload.last_name = l;
    const p = diff(phone, t.phone);
    if (p !== undefined) payload.phone = p;
    const e = diff(email, t.email);
    if (e !== undefined) payload.email = e;
    const n = diff(notes, t.notes);
    if (n !== undefined) payload.customer_profile_notes = n;

    const nextTags = parseTags(tags);
    const origTags = parseTags(t.tags);
    if (nextTags.join('|') !== origTags.join('|')) payload.tags = nextTags;

    if (marketing !== t.marketingConsent) {
      payload.marketing_consent = marketing;
      payload.marketing_opt_out = !marketing;
    }
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
                Edit guest
              </Text>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollBody}
                keyboardShouldPersistTaps="handled">
                <View style={styles.nameRow}>
                  <View style={styles.nameField}>
                    <Input label="First name" value={firstName} onChangeText={setFirstName} />
                  </View>
                  <View style={styles.nameField}>
                    <Input label="Last name" value={lastName} onChangeText={setLastName} />
                  </View>
                </View>
                <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoCapitalize="none" />
                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Input label="Tags (comma separated)" value={tags} onChangeText={setTags} autoCapitalize="none" />
                <Input
                  label="Notes"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  style={styles.multiline}
                />
                <View style={styles.switchRow}>
                  <Text variant="bodyMedium">Marketing consent</Text>
                  <Switch value={marketing} onValueChange={setMarketing} />
                </View>

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
  body: { gap: spacing.md },
  scroll: { flexGrow: 0 },
  scrollBody: { gap: spacing.md, paddingBottom: spacing.sm },
  nameRow: { flexDirection: 'row', gap: spacing.md },
  nameField: { flex: 1 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  actions: { flexDirection: 'row', gap: spacing.md },
  actionButton: { flex: 1 },
});
