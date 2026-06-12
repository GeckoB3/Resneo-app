import { useEffect, useState } from 'react';
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
  /** Explicit opt-out (tracked independently of consent). */
  marketingOptOut: boolean;
  /** Contact address (client-address services). */
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressPostcode: string;
};

/**
 * The PATCH /api/venue/guests/[guestId] endpoint accepts these address fields,
 * but the shared `UpdateGuestInput` (lib/queries/useGuestMutations.ts) doesn't
 * yet declare them — extend it locally until that type is widened.
 */
type AddressUpdate = {
  address_line1?: string | null;
  address_line2?: string | null;
  address_city?: string | null;
  address_postcode?: string | null;
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
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [marketingOptOut, setMarketingOptOut] = useState(false);
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressPostcode, setAddressPostcode] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Seed form values when a new target is opened. Using useEffect avoids
  // the render-time setState anti-pattern that caused double-renders.
  useEffect(() => {
    if (target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when target.id changes
      setFirstName(target.firstName);
      setLastName(target.lastName);
      setPhone(target.phone);
      setEmail(target.email);
      setNotes(target.notes);
      setTags(target.tags);
      setMarketingConsent(target.marketingConsent);
      setMarketingOptOut(target.marketingOptOut);
      setAddressLine1(target.addressLine1);
      setAddressLine2(target.addressLine2);
      setAddressCity(target.addressCity);
      setAddressPostcode(target.addressPostcode);
      setError(null);
    }
  }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function buildPayload(t: GuestEditTarget): UpdateGuestInput & AddressUpdate {
    const payload: UpdateGuestInput & AddressUpdate = {};
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

    const a1 = diff(addressLine1, t.addressLine1);
    if (a1 !== undefined) payload.address_line1 = a1;
    const a2 = diff(addressLine2, t.addressLine2);
    if (a2 !== undefined) payload.address_line2 = a2;
    const ac = diff(addressCity, t.addressCity);
    if (ac !== undefined) payload.address_city = ac;
    const ap = diff(addressPostcode, t.addressPostcode);
    if (ap !== undefined) payload.address_postcode = ap;

    const nextTags = parseTags(tags);
    const origTags = parseTags(t.tags);
    if (nextTags.join('|') !== origTags.join('|')) payload.tags = nextTags;

    // Track consent and opt-out independently — never conflate them.
    if (marketingConsent !== t.marketingConsent) {
      payload.marketing_consent = marketingConsent;
    }
    if (marketingOptOut !== t.marketingOptOut) {
      payload.marketing_opt_out = marketingOptOut;
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
      {target ? (
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
                <Input label="First name" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
              </View>
              <View style={styles.nameField}>
                <Input label="Last name" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
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
            <Input
              label="Tags (comma separated)"
              value={tags}
              onChangeText={setTags}
              autoCapitalize="none"
            />
            <Input
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              multiline
              style={styles.multiline}
            />

            {/* Address (optional — for client-address services) */}
            <Input
              label="Address line 1"
              value={addressLine1}
              onChangeText={setAddressLine1}
              autoCapitalize="words"
            />
            <Input
              label="Address line 2"
              value={addressLine2}
              onChangeText={setAddressLine2}
              autoCapitalize="words"
            />
            <View style={styles.nameRow}>
              <View style={styles.nameField}>
                <Input
                  label="City / town"
                  value={addressCity}
                  onChangeText={setAddressCity}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.nameField}>
                <Input
                  label="Postcode"
                  value={addressPostcode}
                  onChangeText={setAddressPostcode}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            {/* Marketing consent — two independent toggles */}
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text variant="bodyMedium">Marketing consent</Text>
                <Text variant="caption" tone="muted">
                  Explicitly opted in to marketing
                </Text>
              </View>
              <Switch value={marketingConsent} onValueChange={setMarketingConsent} />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text variant="bodyMedium">Opted out</Text>
                <Text variant="caption" tone="muted">
                  Has asked not to be contacted
                </Text>
              </View>
              <Switch value={marketingOptOut} onValueChange={setMarketingOptOut} />
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
    gap: spacing.md,
  },
  switchLabel: {
    flex: 1,
    gap: 2,
  },
  actions: { flexDirection: 'row', gap: spacing.md },
  actionButton: { flex: 1 },
});
