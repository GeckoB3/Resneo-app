import { SymbolView } from 'expo-symbols';
import { memo, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import {
  draftCanBeAdded,
  draftIssues,
  draftSummary,
  existingSummary,
  type DraftIssueContext,
  type DraftOption,
  type ExistingServiceRef,
  type ServiceDraft,
} from '@/lib/services-setup/drafts';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { CalendarChips, IssueList, TextLink } from './bits';

/**
 * One service the AI found, on the review list (web `DraftServiceCard.tsx`): its summary and
 * notes; Edit for name, heading, length, price, options, description and who offers it; Add,
 * Skip, More settings, Make it an add-on; and, once added or skipped, Undo or Bring back.
 *
 * Memoised: a long list re-renders only the card being typed in. The wizard hands every card
 * the same `actions` object, keyed by draft.
 */

export interface DraftCardActions {
  change: (key: string, patch: Partial<ServiceDraft>) => void;
  add: (key: string) => void;
  skip: (key: string) => void;
  restore: (key: string) => void;
  undo: (key: string) => void;
  moreSettings: (key: string) => void;
  updateExisting: (key: string) => void;
  makeAddon: (key: string) => void;
}

export interface DraftServiceCardProps {
  draft: ServiceDraft;
  issueContext: DraftIssueContext;
  currencySymbol: string;
  /** Headings to suggest in the heading box: the venue's own plus the ones found. */
  headingSuggestions: string[];
  /** This card is saving (adding or undoing). */
  busy: boolean;
  /** Another save is running (for example "Add all"), so this card waits. */
  locked: boolean;
  calendars: { id: string; name: string }[];
  /** The calendars this service follows when it has no choice of its own. */
  inheritedCalendarIds: string[];
  /** The venue's service this one duplicates, when updating that one instead makes sense. */
  updatable: ExistingServiceRef | null;
  actions: DraftCardActions;
}

let optionSeq = 0;
function newOptionKey(draftKey: string): string {
  optionSeq += 1;
  return `${draftKey}-o${Date.now().toString(36)}${optionSeq.toString(36)}`;
}

const MAX_HEADING_SUGGESTIONS = 8;

function DraftServiceCardImpl({
  draft,
  issueContext,
  currencySymbol,
  headingSuggestions,
  busy,
  locked,
  calendars,
  inheritedCalendarIds,
  updatable,
  actions,
}: DraftServiceCardProps) {
  const { colors } = useTheme();
  const issues = useMemo(() => draftIssues(draft, issueContext), [draft, issueContext]);
  const needsFix = issues.some((i) => i.level === 'fix');
  const [editing, setEditing] = useState(needsFix);
  const canAdd = draftCanBeAdded(issues);
  const summary = draftSummary(draft, currencySymbol);
  const usesOptions = draft.options.length > 0;
  const key = draft.key;
  const onChange = (patch: Partial<ServiceDraft>) => actions.change(key, patch);

  function updateOption(optionKey: string, patch: Partial<DraftOption>) {
    onChange({ options: draft.options.map((o) => (o.key === optionKey ? { ...o, ...patch } : o)) });
  }

  // Headings that start with (or contain) what has been typed, for a one-tap pick.
  const headingMatches = useMemo(() => {
    const typed = draft.category.trim().toLowerCase();
    return headingSuggestions
      .filter((h) => h.toLowerCase() !== typed && (!typed || h.toLowerCase().includes(typed)))
      .slice(0, MAX_HEADING_SUGGESTIONS);
  }, [draft.category, headingSuggestions]);

  if (draft.status === 'added') {
    return (
      <View style={[styles.row, { borderColor: colors.success, backgroundColor: colors.successSurface }]}>
        <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} tintColor={colors.success} size={20} />
        <View style={styles.flex}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {draft.name}
          </Text>
          <Text variant="bodySmall" color={colors.success}>
            {`${
              draft.outcome?.kind === 'addon'
                ? 'Added as an add-on'
                : draft.outcome?.kind === 'updated'
                  ? 'Updated your existing service'
                  : 'Added'
            } · ${summary}`}
          </Text>
        </View>
        <Button label="Undo" variant="ghost" size="sm" onPress={() => actions.undo(key)} loading={busy} disabled={busy || locked} />
      </View>
    );
  }

  if (draft.status === 'skipped') {
    return (
      <View style={[styles.row, styles.skipped, { borderColor: colors.border, backgroundColor: colors.surfaceSunken }]}>
        <View style={styles.flex}>
          <Text variant="body" tone="muted" numberOfLines={1} style={styles.struck}>
            {draft.name || 'Unnamed service'}
          </Text>
          <Text variant="bodySmall" tone="muted">
            Skipped, it will not be added
          </Text>
        </View>
        <Button label="Bring back" variant="ghost" size="sm" onPress={() => actions.restore(key)} disabled={locked} />
      </View>
    );
  }

  return (
    <View
      style={[styles.card, { borderColor: needsFix ? colors.danger : colors.border, backgroundColor: colors.surfaceRaised }]}
      accessibilityLabel={draft.name || 'Unnamed service'}>
      <Text variant="bodyMedium">{draft.name.trim() || 'Unnamed service'}</Text>
      <Text variant="bodySmall" tone="secondary">
        {summary}
      </Text>
      {!editing && draft.description.trim() ? (
        <Text variant="bodySmall" tone="muted" numberOfLines={2}>
          {draft.description}
        </Text>
      ) : null}

      {editing ? (
        <View style={[styles.edit, { borderTopColor: colors.border }]}>
          <Input label="Service name" value={draft.name} maxLength={200} onChangeText={(v) => onChange({ name: v })} />
          <View style={styles.stackXs}>
            <Input
              label="Heading"
              optional
              value={draft.category}
              maxLength={80}
              placeholder="For example Colour"
              onChangeText={(v) => onChange({ category: v })}
            />
            {headingMatches.length > 0 ? (
              <View style={styles.chips}>
                {headingMatches.map((h) => (
                  <Chip key={h} label={h} onPress={() => onChange({ category: h })} />
                ))}
              </View>
            ) : null}
          </View>
          <Input
            label="How long it takes (minutes)"
            value={draft.duration}
            keyboardType="number-pad"
            onChangeText={(v) => onChange({ duration: v.replace(/[^\d]/g, ''), durationEstimated: false })}
          />
          {usesOptions ? (
            <Text variant="bodySmall" tone="muted">
              Prices are set on each option below.
            </Text>
          ) : (
            <Input
              label="Price (blank for no price)"
              value={draft.price}
              keyboardType="decimal-pad"
              leftIcon={<Text tone="muted">{currencySymbol}</Text>}
              onChangeText={(v) => onChange({ price: v, priceKind: 'fixed' })}
            />
          )}

          {usesOptions ? (
            <View style={[styles.options, { borderColor: colors.border }]}>
              <Text variant="label">Options clients choose between</Text>
              {draft.options.map((o, i) => (
                <View key={o.key} style={[styles.option, i > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
                  <Input
                    accessibilityLabel={`Option ${i + 1} name`}
                    placeholder="For example Long hair"
                    value={o.name}
                    maxLength={120}
                    onChangeText={(v) => updateOption(o.key, { name: v })}
                  />
                  <View style={styles.pair}>
                    <Input
                      containerStyle={styles.flex}
                      accessibilityLabel={`Option ${i + 1} length in minutes`}
                      value={o.duration}
                      keyboardType="number-pad"
                      rightSlot={<Text tone="muted">min</Text>}
                      onChangeText={(v) => updateOption(o.key, { duration: v.replace(/[^\d]/g, '') })}
                    />
                    <Input
                      containerStyle={styles.flex}
                      accessibilityLabel={`Option ${i + 1} price`}
                      value={o.price}
                      keyboardType="decimal-pad"
                      leftIcon={<Text tone="muted">{currencySymbol}</Text>}
                      onChangeText={(v) => updateOption(o.key, { price: v })}
                    />
                  </View>
                  <View style={styles.end}>
                    <TextLink
                      label="Remove"
                      accessibilityLabel={`Remove option ${o.name || i + 1}`}
                      onPress={() => onChange({ options: draft.options.filter((x) => x.key !== o.key) })}
                    />
                  </View>
                </View>
              ))}
              <Text variant="caption" tone="muted">
                Leave a length blank to use the service length above.
              </Text>
              <TextLink
                label="Add another option"
                onPress={() =>
                  onChange({
                    options: [...draft.options, { key: newOptionKey(key), name: '', duration: '', price: '', description: '' }],
                  })
                }
              />
            </View>
          ) : (
            <TextLink
              label="Add options, for example short, medium and long hair"
              onPress={() =>
                onChange({
                  options: [
                    { key: newOptionKey(key), name: '', duration: draft.duration, price: draft.price, description: '' },
                    { key: newOptionKey(key), name: '', duration: '', price: '', description: '' },
                  ],
                })
              }
            />
          )}

          <Input
            label="Description (optional, clients see this)"
            value={draft.description}
            maxLength={1000}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            style={styles.description}
            onChangeText={(v) => onChange({ description: v })}
          />

          {calendars.length > 1 ? (
            <View style={styles.stackXs}>
              <Text variant="label" tone="secondary">
                Who offers this service
              </Text>
              <CalendarChips
                calendars={calendars}
                selectedIds={draft.calendarIds ?? inheritedCalendarIds}
                onChange={(ids) => onChange({ calendarIds: ids })}
              />
              {draft.calendarIds !== null ? (
                <TextLink label="Same as its heading" small onPress={() => onChange({ calendarIds: null })} />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <IssueList issues={issues} />

      {updatable ? (
        <View style={[styles.updatable, { backgroundColor: colors.surfaceSunken }]}>
          <Text variant="bodySmall">
            {`Yours now: ${existingSummary(updatable, currencySymbol)}. Your list says ${summary}.`}
          </Text>
          <Button
            label="Update my existing service"
            variant="secondary"
            size="sm"
            onPress={() => actions.updateExisting(key)}
            loading={busy}
            disabled={locked || busy || !canAdd}
          />
        </View>
      ) : null}

      {draft.error ? (
        <View style={[styles.error, { backgroundColor: colors.dangerSurface }]}>
          <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
            {draft.error}
          </Text>
        </View>
      ) : null}

      <View style={styles.links}>
        <TextLink label="More settings" onPress={() => actions.moreSettings(key)} disabled={locked || busy || !canAdd} />
        {editing && !draft.looksLikeAddon ? (
          <TextLink label="Make it an add-on" onPress={() => actions.makeAddon(key)} disabled={locked || busy} />
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button label="Skip" variant="ghost" size="sm" onPress={() => actions.skip(key)} disabled={locked || busy} />
        <Button
          label={editing ? 'Done editing' : 'Edit'}
          variant="secondary"
          size="sm"
          onPress={() => setEditing((v) => !v)}
          disabled={locked || busy}
        />
        {draft.looksLikeAddon ? (
          <>
            <Button
              label="Add as a service"
              variant="secondary"
              size="sm"
              onPress={() => actions.add(key)}
              loading={busy}
              disabled={locked || busy || !canAdd}
            />
            <Button label="Make it an add-on" size="sm" onPress={() => actions.makeAddon(key)} disabled={locked || busy} />
          </>
        ) : (
          <Button
            label={updatable ? 'Add as a new service' : 'Add service'}
            size="sm"
            onPress={() => actions.add(key)}
            loading={busy}
            disabled={locked || busy || !canAdd}
          />
        )}
      </View>
    </View>
  );
}

export const DraftServiceCard = memo(DraftServiceCardImpl);

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  skipped: {
    borderStyle: 'dashed',
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  edit: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  stackXs: {
    gap: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  options: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  option: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  pair: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  end: {
    alignItems: 'flex-end',
  },
  description: {
    minHeight: 76,
  },
  updatable: {
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  error: {
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
