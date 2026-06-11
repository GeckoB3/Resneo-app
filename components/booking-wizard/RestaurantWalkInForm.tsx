import { Pressable, StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useCreateWalkIn } from '@/lib/queries/useCreateWalkIn';
import { splitGuestName } from '@/lib/validation/walk-in-guest';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const QUICK_PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

type RestaurantWalkInFormProps = {
  onSuccess: (bookingId: string) => void;
};

/**
 * Quick walk-in form for restaurant / table venues.
 * Party size + optional guest details → POST /api/venue/bookings/walk-in (Phase 5B).
 */
export function RestaurantWalkInForm({ onSuccess }: RestaurantWalkInFormProps) {
  const { colors } = useTheme();
  const createWalkIn = useCreateWalkIn();

  const [partySize, setPartySize] = useState<number>(2);
  const [customParty, setCustomParty] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // Inline, not Alert.alert — Alert is a no-op on react-native-web.
  const [formError, setFormError] = useState<string | null>(null);

  const resolvedPartySize = customParty
    ? Number.parseInt(customParty, 10)
    : partySize;

  const partySizeInvalid =
    !Number.isFinite(resolvedPartySize) ||
    resolvedPartySize < 1 ||
    resolvedPartySize > 50;

  const handleSubmit = () => {
    setFormError(null);
    if (partySizeInvalid) {
      setFormError('Choose a party size between 1 and 50.');
      return;
    }

    const trimmedName = name.trim();
    const { first_name, last_name } = splitGuestName(trimmedName);
    const trimmedPhone = phone.trim();

    createWalkIn.mutate(
      {
        party_size: resolvedPartySize,
        ...(first_name ? { first_name } : {}),
        ...(last_name ? { last_name } : {}),
        ...(trimmedPhone ? { phone: trimmedPhone } : {}),
      },
      {
        onSuccess: (response) => {
          const bookingId = response.booking_id ?? response.id;
          if (!bookingId) {
            setFormError('Walk-in created, but it could not be opened automatically.');
            return;
          }
          onSuccess(bookingId);
        },
        onError: (error) => {
          setFormError(
            error instanceof ApiError ? error.message : 'Could not create walk-in.',
          );
        },
      },
    );
  };

  return (
    <View style={styles.container}>
      <Text variant="title">Walk-in</Text>
      <Text variant="bodySmall" tone="secondary">
        Seat a party now. The booking is created with status &ldquo;Seated&rdquo;.
      </Text>

      <Card style={styles.card}>
        <Text variant="label">Party size</Text>
        <View style={styles.partyGrid}>
          {QUICK_PARTY_SIZES.map((size) => {
            const isSelected = !customParty && size === partySize;
            return (
              <Pressable
                key={size}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  setPartySize(size);
                  setCustomParty('');
                }}
                style={({ pressed }) => [
                  styles.partyChip,
                  {
                    backgroundColor: isSelected ? colors.brand : colors.surface,
                    borderColor: isSelected ? colors.brand : colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                <Text
                  variant="heading"
                  color={isSelected ? colors.onBrand : colors.text}>
                  {size}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Input
          keyboardType="number-pad"
          label="Custom party size"
          onChangeText={(value) => setCustomParty(value.replace(/[^0-9]/g, ''))}
          placeholder="e.g. 12"
          value={customParty}
        />
      </Card>

      <Card style={styles.card}>
        <Text variant="label">
          Guest (optional)
        </Text>
        <Input
          autoCapitalize="words"
          autoComplete="name"
          label="Name"
          onChangeText={setName}
          placeholder="Walk-in"
          value={name}
        />
        <Input
          autoComplete="tel"
          keyboardType="phone-pad"
          label="Phone"
          onChangeText={setPhone}
          placeholder="Phone number"
          textContentType="telephoneNumber"
          value={phone}
        />
      </Card>

      {formError ? (
        <Text variant="bodySmall" tone="danger">
          {formError}
        </Text>
      ) : null}

      <Button
        label="Seat walk-in"
        loading={createWalkIn.isPending}
        onPress={handleSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.base,
  },
  card: {
    gap: spacing.sm,
  },
  partyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  partyChip: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
