import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SearchBar } from '@/components/ui/SearchBar';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useAddToHousehold, useGuestHousehold } from '@/lib/queries/useGuestHousehold';
import { useGuests } from '@/lib/queries/useGuests';
import { useToast } from '@/providers/ToastProvider';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { GuestListItem } from '@/types/guest-list';

type HouseholdSectionProps = {
  guestId: string;
  onNavigateToGuest?: (guestId: string) => void;
};

function memberName(g: GuestListItem): string {
  const parts = [g.first_name, g.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unnamed guest';
}

/**
 * Card showing all households the guest belongs to, with a button to link
 * another guest into a shared household. Members are picked by NAME via the same
 * contact-search pattern the merge wizard uses — the old flow asked the user to
 * paste a raw UUID, which nobody has to hand.
 */
export function HouseholdSection({ guestId, onNavigateToGuest }: HouseholdSectionProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const householdQuery = useGuestHousehold(guestId);
  const linkMutation = useAddToHousehold(guestId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<GuestListItem | null>(null);

  const households = householdQuery.data?.households ?? [];

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => clearTimeout(t);
  }, [search]);

  // Search across all contacts (named + anonymous) when the picker is open.
  const searchQuery = useGuests({
    search: debouncedSearch,
    filter: 'all',
    page: 0,
    limit: 25,
  });

  const results: GuestListItem[] = useMemo(
    () => (searchQuery.data?.guests ?? []).filter((g) => g.id !== guestId),
    [searchQuery.data, guestId],
  );

  function resetPicker() {
    setSearch('');
    setDebouncedSearch('');
    setSelected(null);
  }

  function closeSheet() {
    setSheetOpen(false);
    resetPicker();
  }

  async function handleLink() {
    if (!selected) return;
    try {
      await linkMutation.mutateAsync(selected.id);
      hapticSuccess();
      toast.success(`${memberName(selected)} linked to this household.`);
      closeSheet();
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not link household member.');
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

      <Sheet visible={sheetOpen} onClose={closeSheet} maxHeight="88%">
        <View style={styles.sheetBody}>
          <Text variant="overline" tone="muted">
            Link household member
          </Text>
          <Text variant="bodySmall" tone="secondary">
            Search by name, email or phone to pick the contact to link.
          </Text>

          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="At least 2 characters…"
          />

          <View style={[styles.resultsList, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
            {searchQuery.isFetching ? (
              <View style={styles.centeredRow}>
                <ActivityIndicator color={colors.brand} />
                <Text variant="bodySmall" tone="muted">
                  Searching…
                </Text>
              </View>
            ) : debouncedSearch.length === 0 ? (
              <Text variant="bodySmall" tone="muted" style={styles.emptyHint}>
                Start typing to search contacts.
              </Text>
            ) : debouncedSearch.length < 2 ? (
              <Text variant="bodySmall" tone="muted" style={styles.emptyHint}>
                Type at least 2 characters.
              </Text>
            ) : results.length === 0 ? (
              <Text variant="bodySmall" tone="muted" style={styles.emptyHint}>
                No matches found.
              </Text>
            ) : (
              results.map((item) => {
                const isSelected = selected?.id === item.id;
                const sub = [item.email, item.phone].filter(Boolean).join(' · ') || 'No email or phone';
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setSelected(item)}
                    style={({ pressed }) => [
                      styles.searchRow,
                      {
                        borderBottomColor: colors.border,
                        backgroundColor: isSelected
                          ? colors.brandSubtle
                          : pressed
                            ? colors.surface
                            : colors.surfaceRaised,
                      },
                    ]}>
                    <Avatar name={memberName(item)} size={36} />
                    <View style={styles.flex1}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {memberName(item)}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {sub}
                      </Text>
                    </View>
                    {isSelected ? (
                      <Text variant="caption" tone="brand">
                        Selected
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </View>

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={closeSheet} />
            <Button
              label="Link"
              style={styles.flex1}
              loading={linkMutation.isPending}
              disabled={!selected}
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
  resultsList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyHint: {
    padding: spacing.base,
    textAlign: 'center',
  },
  centeredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.base,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
