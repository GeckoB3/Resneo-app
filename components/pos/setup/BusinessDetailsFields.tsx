import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  profileDraftFrom,
  profileErrors,
  profilePatch,
  receiptDraftFrom,
  receiptPatch,
  type ProfileDraft,
  type ReceiptDraft,
} from '@/lib/pos/setup/business';
import { setupT } from '@/lib/pos/setup/copy';
import { useUpdateVenue } from '@/lib/queries/useVenueSettings';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosCheckoutSettings } from '@/types/pos-settings';

type ProfileVenue = { name?: string | null; address?: string | null; email?: string | null; phone?: string | null };
type ReceiptSettings = Pick<PosCheckoutSettings, 'trading_name' | 'business_address' | 'public_contact_email' | 'public_contact_phone'>;

/**
 * OB5's business details, shared by W5 ("Your details for receipts") and Checkout settings'
 * Business details: the profile's name, address, email and phone, shown and edited here (saved to
 * the profile, which also changes the booking page), and an optional receipt-only value for each.
 *
 * `useBusinessDetailsDraft` holds the two drafts and works out what changed; `saveProfile` sends
 * the profile's part through `PATCH /api/venue`; the receipt-only part goes with the screen's
 * settings save (`receiptChanges`), so each screen saves its settings in one versioned PATCH.
 */
export function useBusinessDetailsDraft(venue: ProfileVenue | null | undefined, settings: ReceiptSettings) {
  const [profile, setProfile] = useState<ProfileDraft>(() => profileDraftFrom(venue));
  const [receipt, setReceipt] = useState<ReceiptDraft>(() => receiptDraftFrom(settings));
  const [showErrors, setShowErrors] = useState(false);
  const updateVenue = useUpdateVenue();

  const profileChanges = useMemo(() => profilePatch(profile, venue), [profile, venue]);
  const receiptChanges = useMemo(() => receiptPatch(receipt, settings), [receipt, settings]);
  const errors = profileErrors(profile);
  const dirty = Object.keys(profileChanges).length > 0 || Object.keys(receiptChanges).length > 0;

  /** Sends the profile's changes, if any. Answers the sentence to show when it was refused. */
  const saveProfile = useCallback(async (): Promise<string | null> => {
    if (Object.keys(profileChanges).length === 0) return null;
    if (errors.name || errors.email) {
      setShowErrors(true);
      return errors.name ? setupT('setup.biz.name.required') : setupT('app.setup.biz.emailInvalid');
    }
    try {
      await updateVenue.mutateAsync(profileChanges);
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : setupT('setup.error.save');
    }
  }, [errors.email, errors.name, profileChanges, updateVenue]);

  /** Start again from what is saved (after a save, or "Discard"). */
  const reset = useCallback(
    (nextVenue: ProfileVenue | null | undefined, nextSettings: ReceiptSettings) => {
      setProfile(profileDraftFrom(nextVenue));
      setReceipt(receiptDraftFrom(nextSettings));
      setShowErrors(false);
    },
    [],
  );

  return { profile, setProfile, receipt, setReceipt, profileChanges, receiptChanges, errors, showErrors, dirty, saveProfile, reset };
}

export type BusinessDetailsDraft = ReturnType<typeof useBusinessDetailsDraft>;

/**
 * The fields: the profile's four (with "This also changes your booking page."), then "Show
 * different details on receipts" with the receipt-only boxes under it. A team member who may change
 * Checkout settings but is not an admin sees the profile's values without editing them (the profile
 * is admins only), and can still set receipt-only values.
 */
export function BusinessDetailsFields({
  draft,
  canEditProfile,
  canEditReceipts,
}: {
  draft: BusinessDetailsDraft;
  canEditProfile: boolean;
  canEditReceipts: boolean;
}) {
  const { colors } = useTheme();
  const { profile, setProfile, receipt, setReceipt, errors, showErrors } = draft;
  const setP = (key: keyof ProfileDraft) => (text: string) => setProfile((p) => ({ ...p, [key]: text }));
  const setR = (key: Exclude<keyof ReceiptDraft, 'on'>) => (text: string) => setReceipt((r) => ({ ...r, [key]: text }));

  return (
    <View style={styles.stack}>
      <Input
        label={setupT('app.setup.biz.name')}
        value={profile.name}
        onChangeText={setP('name')}
        editable={canEditProfile}
        maxLength={120}
        autoComplete="organization"
        error={showErrors && errors.name ? setupT('setup.biz.name.required') : undefined}
      />
      <View style={styles.tight}>
        <Text variant="label" tone="secondary">
          {setupT('setup.biz.address')}
        </Text>
        <Input
          label={setupT('app.setup.biz.street')}
          value={profile.street}
          onChangeText={setP('street')}
          editable={canEditProfile}
          maxLength={160}
          autoComplete="street-address"
        />
        <Input label={setupT('app.setup.biz.town')} value={profile.town} onChangeText={setP('town')} editable={canEditProfile} maxLength={80} />
        <Input
          label={setupT('app.setup.biz.postcode')}
          value={profile.postcode}
          onChangeText={setP('postcode')}
          editable={canEditProfile}
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="postal-code"
        />
      </View>
      <Input
        label={setupT('setup.biz.email')}
        value={profile.email}
        onChangeText={setP('email')}
        editable={canEditProfile}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        maxLength={254}
        error={showErrors && errors.email ? setupT('app.setup.biz.emailInvalid') : undefined}
      />
      <Input
        label={setupT('setup.biz.phone')}
        value={profile.phone}
        onChangeText={setP('phone')}
        editable={canEditProfile}
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={30}
      />
      <Text variant="caption" tone="muted">
        {canEditProfile ? setupT('setup.biz.profileNote') : setupT('app.setup.biz.profileAdminOnly')}
      </Text>

      <View style={[styles.receipts, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text variant="bodyMedium">{setupT('app.setup.biz.receiptOnly')}</Text>
            <Text variant="caption" tone="muted">
              {setupT('app.setup.biz.receiptOnly.help')}
            </Text>
          </View>
          <Switch
            value={receipt.on}
            onValueChange={(on) => setReceipt((r) => ({ ...r, on }))}
            disabled={!canEditReceipts}
            accessibilityLabel={setupT('app.setup.biz.receiptOnly')}
            accessibilityState={{ checked: receipt.on, disabled: !canEditReceipts }}
          />
        </View>
        {receipt.on ? (
          <View style={styles.stack}>
            <Input
              label={setupT('app.setup.biz.receiptOnly.name')}
              value={receipt.name}
              onChangeText={setR('name')}
              editable={canEditReceipts}
              placeholder={profile.name || undefined}
              maxLength={160}
            />
            <Input label={setupT('app.setup.biz.receiptOnly.line1')} value={receipt.line1} onChangeText={setR('line1')} editable={canEditReceipts} maxLength={120} />
            <Input label={setupT('app.setup.biz.receiptOnly.line2')} value={receipt.line2} onChangeText={setR('line2')} editable={canEditReceipts} maxLength={120} />
            <Input label={setupT('app.setup.biz.receiptOnly.town')} value={receipt.town} onChangeText={setR('town')} editable={canEditReceipts} maxLength={80} />
            <Input
              label={setupT('app.setup.biz.receiptOnly.postcode')}
              value={receipt.postcode}
              onChangeText={setR('postcode')}
              editable={canEditReceipts}
              maxLength={12}
              autoCapitalize="characters"
            />
            <Input
              label={setupT('app.setup.biz.receiptOnly.email')}
              value={receipt.email}
              onChangeText={setR('email')}
              editable={canEditReceipts}
              keyboardType="email-address"
              autoCapitalize="none"
              maxLength={254}
              placeholder={profile.email || undefined}
            />
            <Input
              label={setupT('app.setup.biz.receiptOnly.phone')}
              value={receipt.phone}
              onChangeText={setR('phone')}
              editable={canEditReceipts}
              keyboardType="phone-pad"
              maxLength={30}
              placeholder={profile.phone || undefined}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  tight: { gap: spacing.sm },
  receipts: { gap: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0, gap: spacing.xxs },
});
