import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/ui/Sheet';
import { SearchBar } from '@/components/ui/SearchBar';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useVenueLookup, useVenueSearch } from '@/lib/queries/useLinkedVenues';
import { spacing, radius, minTouchTarget } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { VenueSearchResult } from '@/types/linked-venues';

const SEARCH_DEBOUNCE_MS = 300;

/** A venue the picker can return — name + slug, plus eligibility for the affordance. */
export interface PickedVenue {
  name: string;
  slug: string;
  eligible: boolean;
  reason: string | null;
}

function ResultRow({
  result,
  isFirst,
  onPress,
}: {
  result: VenueSearchResult;
  isFirst: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={result.name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.resultRow,
        { opacity: pressed ? 0.6 : 1 },
        !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
      ]}>
      <View style={styles.flex1}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {result.name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {`/${result.slug}`}
        </Text>
      </View>
      <Text variant="caption" color={result.eligible ? colors.success : colors.textMuted}>
        {result.eligible ? 'Available' : 'Unavailable'}
      </Text>
    </Pressable>
  );
}

/**
 * Venue search combobox (Send-request step 1). Type ≥2 chars to search by name
 * (also matches a pasted booking-page slug), pick from the eligible/ineligible
 * results, or paste a full slug to look it up directly. Returns a `PickedVenue`.
 */
export function VenuePickerSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (venue: PickedVenue) => void;
}) {
  const { colors } = useTheme();
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');

  // Reset the field each time the sheet opens (key-based reset on the
  // visible→true transition; bounded, so the cascading-render rule is suppressed
  // here as elsewhere in the app's sheets).
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInput('');
      setDebounced('');
    }
  }, [visible]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const search = useVenueSearch(debounced);
  // A slug is a single lowercase token with no spaces — when the user pastes one
  // and the name search comes back empty, offer a direct lookup confirm.
  const slugCandidate =
    debounced.length >= 2 && !/\s/.test(debounced) ? debounced.toLowerCase() : '';
  const noResults = search.isSuccess && (search.data?.results.length ?? 0) === 0;
  const lookup = useVenueLookup(noResults ? slugCandidate : '');

  const results = search.data?.results ?? [];
  const truncated = search.data?.truncated ?? false;
  const lookupVenue =
    lookup.data && lookup.data.found
      ? {
          name: lookup.data.name,
          slug: lookup.data.slug,
          eligible: lookup.data.eligible,
          reason: lookup.data.reason,
        }
      : null;

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="80%">
      <View style={styles.container}>
        <Text variant="subheading">Find a venue</Text>
        <Text variant="bodySmall" tone="secondary">
          Search by name, or paste the venue&apos;s booking-page address.
        </Text>

        <SearchBar
          value={input}
          onChangeText={setInput}
          placeholder="Venue name or booking-page address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {debounced.length > 0 && debounced.length < 2 ? (
          <Text variant="caption" tone="muted">
            Keep typing to search.
          </Text>
        ) : null}

        {search.isFetching ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={colors.brand} />
            <Text variant="caption" tone="muted">
              Searching…
            </Text>
          </View>
        ) : search.isError ? (
          <Text variant="caption" tone="danger">
            {search.error instanceof ApiError ? search.error.message : 'Could not search venues.'}
          </Text>
        ) : null}

        {results.length > 0 ? (
          <View style={[styles.results, { borderColor: colors.border }]}>
            {results.map((r, i) => (
              <ResultRow
                key={r.slug}
                result={r}
                isFirst={i === 0}
                onPress={() => onPick(r)}
              />
            ))}
            {truncated ? (
              <View style={[styles.truncated, { borderTopColor: colors.border }]}>
                <Text variant="caption" tone="muted">
                  {`Showing the first ${results.length}. Refine your search to narrow it down.`}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {noResults && !lookup.isFetching && !lookupVenue ? (
          <Text variant="bodySmall" tone="muted">
            No venues found. Check the name or ask them for their booking-page address.
          </Text>
        ) : null}

        {lookup.isFetching ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={colors.brand} />
            <Text variant="caption" tone="muted">
              Looking up that address…
            </Text>
          </View>
        ) : null}

        {lookupVenue ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={lookupVenue.name}
            onPress={() => onPick(lookupVenue)}
            style={({ pressed }) => [
              styles.lookupRow,
              { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}>
            <View style={styles.flex1}>
              <Text variant="bodyMedium" numberOfLines={1}>
                {lookupVenue.name}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {`/${lookupVenue.slug}`}
              </Text>
            </View>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              tintColor={colors.textMuted}
              size={14}
            />
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  results: {
    borderWidth: 1,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    minHeight: minTouchTarget,
  },
  truncated: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  lookupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    minHeight: minTouchTarget,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
