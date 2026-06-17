import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { BulkActionBar } from '@/components/ui/BulkActionBar';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useToast } from '@/providers/ToastProvider';
import { hapticSelect, hapticWarning } from '@/lib/haptics';
import { useBulkAddTag } from '@/lib/queries/useContactsBulk';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingListRow } from '@/types/booking-list';

type BookingBulkBarProps = {
  /** The set of currently selected booking rows. */
  selected: BookingListRow[];
  /** True when every selectable booking row is selected. */
  allSelected: boolean;
  /** Toggle select-all / deselect-all for the visible booking rows. */
  onToggleSelectAll: () => void;
  /** Called when the user dismisses selection mode. */
  onClear: () => void;
  /** Called after a message sheet is requested so the parent can open a per-booking sheet. */
  onMessageSelected: (bookings: BookingListRow[]) => void;
  /** Reports the bar's bottom-inset clearance so the list can pad clear of it. */
  onHeightChange?: (clearance: number) => void;
};

type SubSheet = 'tag' | 'message' | null;

/**
 * Floating bulk-action tray that appears when at least one booking is selected.
 * Matches the web's fixed tray with 'Add tag' and 'Message' actions.
 *
 * - Tag is a POST /api/venue/contacts/bulk (reuses useBulkAddTag).
 * - Message delegates up to the parent via onMessageSelected so it can open
 *   a per-booking compose sheet for each selected booking.
 */
export function BookingBulkBar({
  selected,
  allSelected,
  onToggleSelectAll,
  onClear,
  onMessageSelected,
  onHeightChange,
}: BookingBulkBarProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const [subSheet, setSubSheet] = useState<SubSheet>(null);
  const [tagInput, setTagInput] = useState('');

  const bulkAddTag = useBulkAddTag();

  if (selected.length === 0) return null;

  const guestIds = [...new Set(selected.map((b) => b.guest_id).filter(Boolean))] as string[];

  function openTagSheet() {
    hapticSelect();
    setTagInput('');
    setSubSheet('tag');
  }

  function openMessageSheet() {
    hapticSelect();
    setSubSheet(null);
    onMessageSelected(selected);
  }

  async function submitTag() {
    const tag = tagInput.trim();
    if (!tag) return;
    if (guestIds.length === 0) {
      toast.error('Selected bookings have no linked guest contacts.');
      return;
    }
    try {
      await bulkAddTag.mutateAsync({ guest_ids: guestIds, tag });
      setSubSheet(null);
      toast.success(`"${tag}" added to ${guestIds.length} contact${guestIds.length === 1 ? '' : 's'}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add tag.';
      toast.error(msg);
    }
  }

  return (
    <>
      <BulkActionBar
        count={selected.length}
        allSelected={allSelected}
        onToggleSelectAll={onToggleSelectAll}
        onClear={onClear}
        onHeightChange={onHeightChange}>
        <Button
          label="Tag"
          variant="secondary"
          size="sm"
          onPress={openTagSheet}
          leftIcon={
            <SymbolView
              name={{ ios: 'tag', android: 'label', web: 'label' }}
              tintColor={colors.text}
              size={14}
            />
          }
        />
        <Button
          label="Message"
          variant="secondary"
          size="sm"
          onPress={openMessageSheet}
          leftIcon={
            <SymbolView
              name={{ ios: 'message', android: 'chat_bubble', web: 'chat' }}
              tintColor={colors.text}
              size={14}
            />
          }
        />
      </BulkActionBar>

      {/* Add tag sub-sheet */}
      <Sheet visible={subSheet === 'tag'} onClose={() => setSubSheet(null)}>
        <Text variant="subheading">Add tag</Text>
        <Text variant="bodySmall" tone="muted">
          Tag will be added to {guestIds.length} contact{guestIds.length === 1 ? '' : 's'} linked to the selected bookings.
        </Text>
        <View
          style={[styles.tagInputWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <TextInput
            accessibilityLabel="Tag name"
            placeholder="Enter tag name"
            placeholderTextColor={colors.textMuted}
            value={tagInput}
            onChangeText={setTagInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => void submitTag()}
            style={[styles.tagInput, { color: colors.text }]}
          />
        </View>
        <Button
          label={bulkAddTag.isPending ? 'Adding…' : 'Add tag'}
          variant="primary"
          fullWidth
          loading={bulkAddTag.isPending}
          disabled={!tagInput.trim() || bulkAddTag.isPending}
          onPress={() => void submitTag()}
        />
        <Button
          label="Cancel"
          variant="ghost"
          fullWidth
          onPress={() => {
            hapticWarning();
            setSubSheet(null);
          }}
        />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  tagInputWrap: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  tagInput: {
    fontFamily: fonts.regular,
    fontSize: 16,
    minHeight: 36,
  },
});
