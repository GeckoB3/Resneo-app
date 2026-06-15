import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useGuestTags } from '@/lib/queries/useGuestTags';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 30;
const MAX_SUGGESTIONS = 12;

type GuestTagEditorProps = {
  /** Current tags on the guest. */
  tags: string[];
  /** Persist the next tag set (e.g. `updateGuest.mutateAsync({ tags })`). */
  onTagsChange: (next: string[]) => Promise<unknown>;
  disabled?: boolean;
};

/**
 * Inline add/remove-chip tag editor for the contact detail — the mobile
 * analogue of the web `GuestTagEditor`. Tags normalise to lowercase/trimmed,
 * cap at {@link MAX_TAGS}, and dedupe case-insensitively. The add field offers
 * a typeahead drawn from the venue's existing tags (`/api/venue/guests/tags`).
 */
export function GuestTagEditor({ tags, onTagsChange, disabled = false }: GuestTagEditorProps) {
  const toast = useToast();
  const tagsQuery = useGuestTags();
  const venueTags = useMemo(() => tagsQuery.data?.tags ?? [], [tagsQuery.data?.tags]);

  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  const trimmedInput = input.trim().toLowerCase();
  const suggestions = useMemo(() => {
    const applied = new Set(tags.map((t) => t.toLowerCase()));
    const pool = venueTags.filter((t) => !applied.has(t.toLowerCase()));
    const matched = trimmedInput ? pool.filter((t) => t.toLowerCase().includes(trimmedInput)) : pool;
    return matched.slice(0, MAX_SUGGESTIONS);
  }, [venueTags, tags, trimmedInput]);

  async function commit(next: string[]) {
    setSaving(true);
    try {
      await onTagsChange(next);
      hapticSuccess();
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not save tags.');
    } finally {
      setSaving(false);
    }
  }

  async function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (!tag || tag.length > MAX_TAG_LENGTH) return;
    // Case-insensitive dedupe — never add a tag the guest already has.
    if (tags.some((t) => t.toLowerCase() === tag)) {
      setInput('');
      return;
    }
    if (tags.length >= MAX_TAGS) {
      toast.error(`Maximum ${MAX_TAGS} tags per contact.`);
      return;
    }
    setInput('');
    await commit([...tags, tag]);
  }

  async function removeTag(index: number) {
    await commit(tags.filter((_, i) => i !== index));
  }

  return (
    <View style={styles.root}>
      <Text variant="label">Tags</Text>

      {tags.length > 0 ? (
        <View style={styles.chipRow}>
          {tags.map((tag, index) => (
            <Chip
              key={`${tag}-${index}`}
              label={tag}
              selected
              onRemove={disabled || saving ? undefined : () => void removeTag(index)}
            />
          ))}
        </View>
      ) : (
        <Text variant="caption" tone="muted">
          No tags yet — add one below.
        </Text>
      )}

      {!disabled ? (
        <>
          <Input
            label="Add a tag"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => void addTag(input)}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
            returnKeyType="done"
            maxLength={MAX_TAG_LENGTH + 2}
            placeholder="e.g. vip"
          />
          {suggestions.length > 0 ? (
            <View style={styles.chipRow}>
              {suggestions.map((suggestion) => (
                <Chip
                  key={suggestion}
                  label={suggestion}
                  onPress={saving ? undefined : () => void addTag(suggestion)}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
