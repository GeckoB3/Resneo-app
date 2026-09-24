import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { SearchBar } from '@/components/ui/SearchBar';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useAddToHousehold,
  useGuestHousehold,
  useUnlinkFromHousehold,
  type HouseholdMember,
} from '@/lib/queries/useGuestHousehold';
import { useGuests } from '@/lib/queries/useGuests';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { GuestListItem } from '@/types/guest-list';

type HouseholdSectionProps = {
  guestId: string;
  onNavigateToGuest?: (guestId: string) => void;
  /** Render inside a tap-to-expand CollapsibleCard instead of a plain Card. */
  collapsible?: boolean;
  defaultExpanded?: boolean;
};

function memberName(g: GuestListItem): string {
  const parts = [g.first_name, g.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unnamed guest';
}

/**
 * The confirm copy for unlinking a member, as the web words it (QA FD-9). Taking
 * this contact itself out reads as leaving the household.
 */
export function unlinkConfirmCopy(
  member: HouseholdMember,
  guestId: string,
  clientLower: string,
): { title: string; message: string } {
  if (member.guest_id === guestId) {
    return {
      title: 'Leave the household?',
      message: `This ${clientLower} will no longer be linked to anyone in the household. Their bookings and details stay as they are.`,
    };
  }
  const name = member.name?.trim() || `this ${clientLower}`;
  return {
    title: `Unlink ${name}?`,
    message: `${name} will no longer be linked to this household. Their bookings and details stay as they are.`,
  };
}

/**
 * Card showing all households the guest belongs to, with a button to link
 * another guest into a shared household. Members are picked by NAME via the same
 * contact-search pattern the merge wizard uses — the old flow asked the user to
 * paste a raw UUID, which nobody has to hand.
 *
 * Web QA FD-9 (2026-09-23): every member row has Unlink, after a confirm worded as
 * the web's; this contact's own row is marked "(this client)" and its Unlink takes
 * the contact out of the household. People already in the household are left out
 * of the search.
 */
export function HouseholdSection({
  guestId,
  onNavigateToGuest,
  collapsible = false,
  defaultExpanded = false,
}: HouseholdSectionProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const householdQuery = useGuestHousehold(guestId);
  const linkMutation = useAddToHousehold(guestId);
  const unlinkMutation = useUnlinkFromHousehold(guestId);
  const { terminology } = useVenueContext();
  const clientLower = terminology.client.toLowerCase();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<HouseholdMember | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<GuestListItem | null>(null);

  const households = useMemo(() => householdQuery.data?.households ?? [], [householdQuery.data]);

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

  // People already in one of this contact's households are not offered again (QA FD-9).
  const linkedIds = useMemo(
    () => new Set(households.flatMap((h) => h.members.map((m) => m.guest_id))),
    [households],
  );
  const matches: GuestListItem[] = useMemo(
    () => (searchQuery.data?.guests ?? []).filter((g) => g.id !== guestId),
    [searchQuery.data, guestId],
  );
  const results: GuestListItem[] = useMemo(
    () => matches.filter((g) => !linkedIds.has(g.id)),
    [matches, linkedIds],
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

  async function handleUnlink() {
    const member = unlinkTarget;
    if (!member) return;
    const isSelf = member.guest_id === guestId;
    const name = member.name?.trim() || `this ${clientLower}`;
    try {
      await unlinkMutation.mutateAsync(member.guest_id);
      hapticSuccess();
      toast.success(isSelf ? 'Removed from the household.' : `${name} is no longer in the household.`);
      setUnlinkTarget(null);
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not unlink them. Please try again.');
    }
  }

  const unlinkCopy = unlinkTarget ? unlinkConfirmCopy(unlinkTarget, guestId, clientLower) : null;

  const memberCount = households.reduce((sum, h) => sum + h.members.length, 0);
  const summary = householdQuery.isLoading
    ? null
    : households.length === 0
      ? 'Not linked'
      : `${memberCount} member${memberCount === 1 ? '' : 's'}`;

  const list =
    householdQuery.isLoading ? (
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
          {h.members.map((m) => {
            const isSelf = m.guest_id === guestId;
            return (
              <View key={m.guest_id} style={styles.memberRow}>
                <Pressable
                  style={styles.memberMain}
                  // This contact's own row has nowhere else to go.
                  disabled={isSelf}
                  onPress={() => onNavigateToGuest?.(m.guest_id)}
                  accessibilityRole="button">
                  <Avatar name={m.name ?? 'Guest'} size={32} />
                  <View style={styles.memberText}>
                    <Text variant="bodySmall" numberOfLines={1}>
                      {m.name ?? 'Unnamed'}
                      {isSelf ? (
                        <Text variant="bodySmall" tone="muted">
                          {` (this ${clientLower})`}
                        </Text>
                      ) : null}
                    </Text>
                    {m.is_primary ? (
                      <Text variant="caption" tone="brand">
                        Primary
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
                <Button
                  label="Unlink"
                  variant="ghost"
                  size="sm"
                  disabled={unlinkMutation.isPending}
                  customColors={{ background: 'transparent', text: colors.danger }}
                  accessibilityLabel={
                    isSelf
                      ? `Take this ${clientLower} out of the household`
                      : `Unlink ${m.name?.trim() || `this ${clientLower}`}`
                  }
                  onPress={() => setUnlinkTarget(m)}
                />
              </View>
            );
          })}
        </View>
      ))
    );

  return (
    <>
      {collapsible ? (
        <CollapsibleCard title="Household" summary={summary} defaultExpanded={defaultExpanded}>
          {list}
          <Button
            label="Link member"
            variant="secondary"
            size="sm"
            onPress={() => setSheetOpen(true)}
            style={styles.linkButton}
          />
        </CollapsibleCard>
      ) : (
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
          {list}
        </Card>
      )}

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
            ) : matches.length === 0 ? (
              <Text variant="bodySmall" tone="muted" style={styles.emptyHint}>
                No matches found.
              </Text>
            ) : results.length === 0 ? (
              <Text variant="bodySmall" tone="muted" style={styles.emptyHint}>
                Everyone who matches is already in this household.
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

      <ConfirmSheet
        visible={unlinkTarget !== null}
        title={unlinkCopy?.title ?? ''}
        message={unlinkCopy?.message}
        confirmLabel="Unlink"
        destructive
        loading={unlinkMutation.isPending}
        onConfirm={() => void handleUnlink()}
        onClose={() => {
          if (!unlinkMutation.isPending) setUnlinkTarget(null);
        }}
      />
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
  linkButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
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
  },
  memberMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  memberText: {
    flex: 1,
    minWidth: 0,
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
