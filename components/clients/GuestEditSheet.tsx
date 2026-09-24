import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { marketingPermissionSummary } from '@/lib/guests/marketing-permission';
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

/** Longest value each contact field accepts (web GUEST_CONTACT_MAX_LENGTH, the API schema). */
export const GUEST_CONTACT_MAX_LENGTH = {
  first_name: 100,
  last_name: 100,
  email: 255,
  phone: 24,
} as const;

export type GuestFieldErrors = Partial<Record<string, string>>;

export type GuestSaveErrors = {
  /** Shown at the foot of the form: only for problems no field on the form can show. */
  form: string | null;
  /** Field key to message, shown under the matching input. */
  fields: GuestFieldErrors;
};

/**
 * Read a rejected contact create/edit into per-field messages (web QA FD-2, FD-10,
 * 2026-09-23). The API answers a 400 or a duplicate-email 409 with `error` (a
 * sentence) and `field_errors` (field key to message). Each field's message goes
 * under its input; `form` carries only what no input on this form can show: the
 * server's sentence when there are no field messages, or the messages for fields
 * the form does not have.
 */
export function readGuestSaveErrors(
  e: unknown,
  fallback: string,
  shownFields: readonly string[],
): GuestSaveErrors {
  if (!(e instanceof ApiError)) return { form: fallback, fields: {} };
  const body = (e.body && typeof e.body === 'object' ? e.body : {}) as { field_errors?: unknown };
  const raw = body.field_errors;
  const fields: GuestFieldErrors = {};
  const unshown: string[] = [];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value !== 'string' || value.trim() === '') continue;
      if (shownFields.includes(key)) fields[key] = value;
      else if (!unshown.includes(value)) unshown.push(value);
    }
  }
  if (Object.keys(fields).length === 0 && unshown.length === 0) {
    return { form: e.message || fallback, fields };
  }
  return { form: unshown.length > 0 ? unshown.join(' ') : null, fields };
}

/** The fields this sheet has an input for, by their API key. */
const EDIT_SHEET_FIELDS = [
  'first_name',
  'last_name',
  'phone',
  'email',
  'tags',
  'customer_profile_notes',
  'address_line1',
  'address_line2',
  'address_city',
  'address_postcode',
] as const;

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
      setFieldErrors({});
    }
  }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function buildPayload(t: GuestEditTarget): UpdateGuestInput & AddressUpdate {
    const payload: UpdateGuestInput & AddressUpdate = {};
    // Cleared fields send an EMPTY STRING, never null: the guest PATCH schema
    // types these as `.optional()` (not `.nullable()`) and documents "empty string
    // clears a field", so a null 400s the whole request — taking every other edit
    // made in the same sheet down with it.
    const diff = (cur: string, orig: string): string | undefined =>
      cur.trim() === orig.trim() ? undefined : cur.trim();

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
    setFieldErrors({});
    try {
      await mutation.mutateAsync(payload);
      hapticSuccess();
      onClose();
    } catch (e) {
      hapticWarning();
      // A duplicate email (409) or a field the server rejects (400) is shown under
      // its input; the foot of the form keeps only errors no field can show.
      const saveErrors = readGuestSaveErrors(e, 'Could not save changes.', EDIT_SHEET_FIELDS);
      setFieldErrors(saveErrors.fields);
      setError(saveErrors.form);
    }
  }

  return (
    <Sheet visible={!!target} onClose={onClose} maxHeight="88%" fill>
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
              label="Phone"
              value={phone}
              onChangeText={edited('phone', setPhone)}
              keyboardType="phone-pad"
              autoCapitalize="none"
              maxLength={GUEST_CONTACT_MAX_LENGTH.phone}
              error={fieldErrors.phone}
            />
            <Input
              label="Email"
              value={email}
              onChangeText={edited('email', setEmail)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={GUEST_CONTACT_MAX_LENGTH.email}
              error={fieldErrors.email}
            />
            <Input
              label="Tags (comma separated)"
              value={tags}
              onChangeText={edited('tags', setTags)}
              autoCapitalize="none"
              error={fieldErrors.tags}
            />
            <Input
              label="Notes"
              value={notes}
              onChangeText={edited('customer_profile_notes', setNotes)}
              multiline
              style={styles.multiline}
              error={fieldErrors.customer_profile_notes}
            />

            {/* Address (optional — for client-address services) */}
            <Input
              label="Address line 1"
              value={addressLine1}
              onChangeText={edited('address_line1', setAddressLine1)}
              autoCapitalize="words"
              error={fieldErrors.address_line1}
            />
            <Input
              label="Address line 2"
              value={addressLine2}
              onChangeText={edited('address_line2', setAddressLine2)}
              autoCapitalize="words"
              error={fieldErrors.address_line2}
            />
            <View style={styles.nameRow}>
              <View style={styles.nameField}>
                <Input
                  label="City / town"
                  value={addressCity}
                  onChangeText={edited('address_city', setAddressCity)}
                  autoCapitalize="words"
                  error={fieldErrors.address_city}
                />
              </View>
              <View style={styles.nameField}>
                <Input
                  label="Postcode"
                  value={addressPostcode}
                  onChangeText={edited('address_postcode', setAddressPostcode)}
                  autoCapitalize="characters"
                  error={fieldErrors.address_postcode}
                />
              </View>
            </View>

            {/* Marketing permission — one preference seen from two sides (web
                2026-09-10): a fresh consent lifts an opt-out, an opt-out
                withdraws the consent, so the pair never says both at once. */}
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text variant="bodyMedium">Opted out of marketing</Text>
                <Text variant="caption" tone="muted">
                  Has asked not to receive marketing
                </Text>
              </View>
              <Switch
                value={marketingOptOut}
                onValueChange={(value) => {
                  setMarketingOptOut(value);
                  if (value) setMarketingConsent(false);
                }}
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text variant="bodyMedium">Marketing consent given</Text>
                <Text variant="caption" tone="muted">
                  Explicitly opted in to marketing
                </Text>
              </View>
              <Switch
                value={marketingConsent}
                onValueChange={(value) => {
                  setMarketingConsent(value);
                  if (value) setMarketingOptOut(false);
                }}
              />
            </View>
            <Text variant="caption" tone={marketingConsent && !marketingOptOut ? 'success' : 'muted'}>
              {marketingPermissionSummary({
                marketing_consent: marketingConsent,
                marketing_opt_out: marketingOptOut,
              })}
            </Text>

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
  // `fill` + a flexing ScrollView: the form is longer than the sheet, and a
  // content-sized body can't scroll AND pushes the pinned Save/Cancel row off
  // the bottom — the form could be read but neither finished nor scrolled.
  // Same pattern the Event/Resource/ClassType and Modify editors were fixed for.
  // `fill` Sheets supply no horizontal padding (they delegate it to the child),
  // so the body has to carry the standard sheet inset itself.
  body: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  scroll: { flex: 1 },
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
