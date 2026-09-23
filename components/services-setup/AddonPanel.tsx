import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { cleanPriceInput, parseMinutesInput, type ServiceDraft } from '@/lib/services-setup/drafts';
import type { SetupAddonGroup } from '@/lib/services-setup/setup-storage';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { TextLink } from './bits';

/**
 * "Offer it as an add-on" (web `AddonDialog.tsx`): an extra the AI found becomes an add-on
 * option clients can pick when they book the services ticked here. On the web it is a dialog
 * over the setup; the app cannot stack sheets on iOS, so it is a page inside the setup's sheet,
 * with its Cancel and "Add as an add-on" in the sheet's footer. `useAddonForm` holds the fields
 * so the footer can read them.
 */

/** A service an add-on can be offered with: one this setup added, or one the venue had. */
export interface AddonTargetService {
  id: string;
  name: string;
  heading: string;
}

export interface AddonFormValues {
  name: string;
  pricePence: number;
  minutes: number;
  serviceIds: string[];
  /** Join this setup's group for the heading, or start a new one with `groupName`. */
  joinGroupId: string | null;
  groupName: string;
}

const MAX_ADDON_MINUTES = 240;

interface AddonFormState {
  /** Which opening of the page these fields belong to: each opening starts afresh, as the web's dialog does. */
  key: string;
  name: string;
  price: string;
  minutes: string;
  joinExisting: boolean;
  groupName: string;
  selected: Set<string>;
}

function initialState(
  instanceKey: string,
  draft: ServiceDraft,
  services: AddonTargetService[],
  existingGroup: SetupAddonGroup | null,
): AddonFormState {
  const heading = draft.category.trim();
  const n = parseMinutesInput(draft.duration);
  const sameHeading = services.filter((s) => heading && s.heading.toLowerCase() === heading.toLowerCase()).map((s) => s.id);
  return {
    key: instanceKey,
    name: draft.name.trim(),
    price: draft.price,
    // A guessed length is usually wrong for an extra, which often adds no time at all.
    minutes: draft.durationEstimated || n === null ? '0' : String(Math.min(n, MAX_ADDON_MINUTES)),
    joinExisting: existingGroup !== null,
    groupName: heading ? `${heading} extras` : 'Extras',
    selected: new Set(existingGroup ? existingGroup.serviceIds.filter((id) => services.some((s) => s.id === id)) : sameHeading),
  };
}

export function useAddonForm(
  instanceKey: string,
  draft: ServiceDraft,
  services: AddonTargetService[],
  existingGroup: SetupAddonGroup | null,
) {
  const heading = draft.category.trim();
  const [stored, setState] = useState<AddonFormState>(() => initialState(instanceKey, draft, services, existingGroup));
  // Opened again (for this draft or another): start from the draft's values (React's "adjust state on a prop change").
  let state = stored;
  if (stored.key !== instanceKey) {
    state = initialState(instanceKey, draft, services, existingGroup);
    setState(state);
  }

  const priceText = cleanPriceInput(state.price);
  const minutesNumber = /^\d+$/.test(state.minutes.trim()) ? Number(state.minutes.trim()) : null;
  const problems: string[] = [];
  if (!state.name.trim()) problems.push('Give the add-on a name.');
  if (priceText === null || priceText === '') problems.push('Set the extra price. Use 0 if it is free.');
  if (minutesNumber === null || minutesNumber > MAX_ADDON_MINUTES) problems.push('Set the extra time, from 0 to 240 minutes.');
  if (state.selected.size === 0) problems.push('Tick at least one service it can be added to.');
  if (!state.joinExisting && !state.groupName.trim()) problems.push('Name the group of add-ons.');

  function values(): AddonFormValues | null {
    if (problems.length > 0) return null;
    return {
      name: state.name.trim().slice(0, 120),
      pricePence: Math.round(Number(priceText) * 100),
      minutes: minutesNumber!,
      serviceIds: [...state.selected],
      joinGroupId: state.joinExisting && existingGroup ? existingGroup.id : null,
      groupName: (state.joinExisting && existingGroup ? existingGroup.name : state.groupName.trim()).slice(0, 120),
    };
  }

  return {
    heading,
    name: state.name,
    setName: (name: string) => setState((s) => ({ ...s, name })),
    price: state.price,
    setPrice: (price: string) => setState((s) => ({ ...s, price })),
    minutes: state.minutes,
    setMinutes: (minutes: string) => setState((s) => ({ ...s, minutes })),
    joinExisting: state.joinExisting,
    setJoinExisting: (joinExisting: boolean) => setState((s) => ({ ...s, joinExisting })),
    groupName: state.groupName,
    setGroupName: (groupName: string) => setState((s) => ({ ...s, groupName })),
    selected: state.selected,
    setSelected: (update: (prev: Set<string>) => Set<string>) => setState((s) => ({ ...s, selected: update(s.selected) })),
    problems,
    values,
  };
}

export type AddonForm = ReturnType<typeof useAddonForm>;

export function AddonPanel({
  form,
  currencySymbol,
  services,
  existingGroup,
  waitingInHeading,
  error,
}: {
  form: AddonForm;
  currencySymbol: string;
  services: AddonTargetService[];
  /** The group this setup already made for the draft's heading, if any. */
  existingGroup: SetupAddonGroup | null;
  /** Services under the same heading still waiting to be added: not offerable until they exist. */
  waitingInHeading: string[];
  error: string | null;
}) {
  const { colors } = useTheme();
  const { heading } = form;

  const groups = useMemo(() => {
    const out: { heading: string; items: AddonTargetService[] }[] = [];
    for (const s of services) {
      const g = out.find((x) => x.heading.toLowerCase() === s.heading.toLowerCase());
      if (g) g.items.push(s);
      else out.push({ heading: s.heading, items: [s] });
    }
    // The extra's own heading first, the rest as they come, no heading last.
    return out.sort((a, b) => {
      const rank = (h: string) => (heading && h.toLowerCase() === heading.toLowerCase() ? 0 : h ? 1 : 2);
      return rank(a.heading) - rank(b.heading);
    });
  }, [services, heading]);

  function toggle(id: string) {
    form.setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <View style={styles.stack}>
      <View style={styles.stackXs}>
        <Text variant="subheading">Offer it as an add-on</Text>
        <Text variant="bodySmall" tone="secondary">
          Clients can add it when they book one of the services you tick.
        </Text>
      </View>

      <Input label="Add-on" value={form.name} maxLength={120} onChangeText={form.setName} />
      <View style={styles.pair}>
        <Input
          label="Extra price"
          containerStyle={styles.flex}
          keyboardType="decimal-pad"
          value={form.price}
          leftIcon={<Text tone="muted">{currencySymbol}</Text>}
          onChangeText={form.setPrice}
        />
        <Input
          label="Extra time"
          containerStyle={styles.flex}
          keyboardType="number-pad"
          value={form.minutes}
          rightSlot={<Text tone="muted">min</Text>}
          onChangeText={(v) => form.setMinutes(v.replace(/[^\d]/g, ''))}
        />
      </View>

      {existingGroup ? (
        <View style={styles.stackXs}>
          <Text variant="label" tone="secondary">
            Group
          </Text>
          <ChoiceRow
            selected={form.joinExisting}
            title={`Add it to your “${existingGroup.name}” add-ons (${existingGroup.addons.length} so far)`}
            onPress={() => form.setJoinExisting(true)}
          />
          <ChoiceRow selected={!form.joinExisting} title="Start a new group" onPress={() => form.setJoinExisting(false)} />
        </View>
      ) : null}
      {!existingGroup || !form.joinExisting ? (
        <Input
          label="Group name"
          helper="For you; clients are asked “Would you like to add any extras?”"
          value={form.groupName}
          maxLength={120}
          onChangeText={form.setGroupName}
        />
      ) : null}

      <View style={styles.stackXs}>
        <Text variant="label" tone="secondary">
          Offer it with
        </Text>
        {waitingInHeading.length > 0 ? (
          <Text variant="caption" tone="secondary">
            {`Not listed yet: ${waitingInHeading.slice(0, 3).join(', ')}${
              waitingInHeading.length > 3 ? ` and ${waitingInHeading.length - 3} more` : ''
            }. Add ${waitingInHeading.length === 1 ? 'it' : 'them'} first to offer this add-on with ${
              waitingInHeading.length === 1 ? 'it' : 'them'
            }.`}
          </Text>
        ) : null}
        {services.length === 0 ? (
          <Text variant="bodySmall" color={colors.warning}>
            Add the services it goes with first, then come back to this one.
          </Text>
        ) : (
          <View style={[styles.services, { borderColor: colors.border }]}>
            {groups.map((g) => {
              const allOn = g.items.every((s) => form.selected.has(s.id));
              return (
                <View key={g.heading || 'none'} style={styles.stackXs}>
                  <View style={styles.groupHead}>
                    <Text variant="overline" tone="muted" style={styles.flex}>
                      {g.heading || 'No heading'}
                    </Text>
                    <TextLink
                      label={allOn ? 'Untick all' : 'Tick all'}
                      small
                      accessibilityLabel={`${allOn ? 'Untick' : 'Tick'} all in ${g.heading || 'No heading'}`}
                      onPress={() =>
                        form.setSelected((prev) => {
                          const next = new Set(prev);
                          for (const s of g.items) {
                            if (allOn) next.delete(s.id);
                            else next.add(s.id);
                          }
                          return next;
                        })
                      }
                    />
                  </View>
                  {g.items.map((s) => (
                    <ChoiceRow key={s.id} kind="checkbox" selected={form.selected.has(s.id)} title={s.name} onPress={() => toggle(s.id)} />
                  ))}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {form.problems.length > 0 && services.length > 0 ? (
        <View style={styles.stackXs}>
          {form.problems.map((p) => (
            <Text key={p} variant="bodySmall" tone="secondary">
              {p}
            </Text>
          ))}
        </View>
      ) : null}
      {error ? (
        <View style={[styles.error, { backgroundColor: colors.dangerSurface }]}>
          <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  stackXs: {
    gap: spacing.xs,
  },
  pair: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  services: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.md,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  error: {
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
});
