import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useAddToHousehold, useGuestHousehold } from '@/lib/queries/useGuestHousehold';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type HouseholdSectionProps = {
  guestId: string;
  onNavigateToGuest?: (guestId: string) => void;
};

/**
 * Card showing all households the guest belongs to,
 * with a button to link another guest into a shared household.
 */
export function HouseholdSection({ guestId, onNavigateToGuest }: HouseholdSectionProps) {
  const { colors } = useTheme();
  const householdQuery = useGuestHousehold(guestId);
  const linkMutation = useAddToHousehold(guestId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [otherId, setOtherId] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const households = householdQuery.data?.households ?? [];

  async function handleLink() {
    const trimmed = otherId.trim();
    if (!trimmed) return;
    setLinkError(null);
    try {
      await linkMutation.mutateAsync(trimmed);
      hapticSuccess();
      setOtherId('');
      setSheetOpen(false);
    } catch (e) {
      hapticWarning();
      setLinkError(e instanceof ApiError ? e.message : 'Could not link household member.');
    }
  }

  return (
    <>
      <Card>
        <View style={styles.cardHeader}>
          <Text variant="label">Household</Text>
          <Button
            label="Link member"
            variant="ghost"
            size="sm"
            onPress={() => setSheetOpen(true)}
          />
        </View>

        {householdQuery.isLoading ? (
          <Text variant="caption" tone="muted">
            Loading…
          </Text>
        ) : households.length === 0 ? (
          <Text variant="bodySmall" tone="muted" style={styles.emptyText}>
            Not linked to a household yet. Tap &ldquo;Link member&rdquo; to connect this contact with another.
          </Text>
        ) : (
          households.map((h) => (
            <View key={h.id} style={[styles.householdBlock, { borderColor: colors.border }]}>
              {h.name ? (
                <Text variant="caption" tone="secondary" style={styles.householdName}>
                  {h.name}
                </Text>
              ) : null}
              {h.members.map((m) => (
                <Pressable
                  key={m.guest_id}
                  style={styles.memberRow}
                  onPress={() => onNavigateToGuest?.(m.guest_id)}
                  accessibilityRole="button">
                  <Avatar name={m.name ?? 'Guest'} size={32} />
                  <View style={styles.memberText}>
                    <Text variant="bodySmall">{m.name ?? 'Unnamed'}</Text>
                    {m.is_primary ? (
                      <Text variant="caption" tone="brand">
                        Primary
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ))
        )}
      </Card>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <View style={styles.sheetBody}>
          <Text variant="overline" tone="muted">
            Link household member
          </Text>
          <Text variant="bodySmall" tone="secondary">
            Enter another contact&apos;s UUID (from their profile URL or the admin panel).
          </Text>
          <Input
            label="Other guest UUID"
            value={otherId}
            onChangeText={setOtherId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
          {linkError ? (
            <Text variant="bodySmall" tone="danger">
              {linkError}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              onPress={() => {
                setSheetOpen(false);
                setOtherId('');
                setLinkError(null);
              }}
            />
            <Button
              label="Link"
              style={styles.flex1}
              loading={linkMutation.isPending}
              disabled={!otherId.trim()}
              onPress={() => void handleLink()}
            />
          </View>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  emptyText: {
    marginTop: spacing.xs,
  },
  householdBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  householdName: {
    marginBottom: spacing.xs,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  memberText: {
    flex: 1,
    gap: 1,
  },
  sheetBody: {
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
});
