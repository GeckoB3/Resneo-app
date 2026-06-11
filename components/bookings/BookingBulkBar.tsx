import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticError, hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useBulkAddTag } from '@/lib/queries/useContactsBulk';
import { elevation, fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingListRow } from '@/types/booking-list';

type BookingBulkBarProps = {
  /** The set of currently selected booking rows. */
  selected: BookingListRow[];
  /** Called when the user dismisses selection mode. */
  onClear: () => void;
  /** Called after a message sheet is requested so the parent can open a per-booking sheet. */
  onMessageSelected: (bookings: BookingListRow[]) => void;
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
export function BookingBulkBar({ selected, onClear, onMessageSelected }: BookingBulkBarProps) {
  const { colors } = useTheme();
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
      Alert.alert('No contacts', 'Selected bookings have no linked guest contacts.');
      return;
    }
    try {
      await bulkAddTag.mutateAsync({ guest_ids: guestIds, tag });
      hapticSuccess();
      setSubSheet(null);
      Alert.alert('Tag added', `"${tag}" added to ${guestIds.length} contact${guestIds.length === 1 ? '' : 's'}.`);
    } catch (err) {
      hapticError();
      const msg = err instanceof Error ? err.message : 'Could not add tag.';
      Alert.alert('Error', msg);
    }
  }

  return (
    <>
      <SafeAreaView
        edges={['bottom']}
        style={[styles.trayWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        pointerEvents="box-none">
        <View style={[styles.tray, elevation.raised]}>
          {/* Count + clear */}
          <Pressable
            onPress={() => {
              hapticSelect();
              onClear();
            }}
            hitSlop={8}
            accessibilityLabel="Clear selection"
            style={({ pressed }) => [styles.clearBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <SymbolView
              name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
              tintColor={colors.textSecondary}
              size={18}
            />
            <Text variant="label" tone="secondary">
              {selected.length} selected
            </Text>
          </Pressable>

          <View style={styles.actions}>
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
          </View>
        </View>
      </SafeAreaView>

      {/* Add tag sub-sheet */}
      <Sheet visible={subSheet === 'tag'} onClose={() => setSubSheet(null)}>
        <Text variant="subheading">Add tag</Text>
        <Text variant="bodySmall" tone="muted">
          Tag will be added to {guestIds.length} contact{guestIds.length === 1 ? '' : 's'} linked to the selected bookings.
        </Text>
        <View
          style={[styles.tagInputWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <TextInput
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
  trayWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tray: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
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
