import { StyleSheet, View } from 'react-native';

import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { joinSummaryCounts, type JoinDraft } from '@/lib/linked/join-choices';
import { setupCopy } from '@/lib/linked/setup-copy';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { JoinPreview } from '@/types/collectives';

/**
 * The steps an invited venue walks through before joining a shared-services collective (web
 * `JoinCollectiveDialog.tsx`: `JoinMeansStep`, `JoinServicesStep`, `JoinFormsStep`,
 * `JoinSummaryList`). Shared by the review sheet (a link request with an invitation riding on
 * it) and the join sheet (an invitation on its own), so both read the same words.
 */

export function JoinMeansStep({ preview, host, collective }: { preview: JoinPreview; host: string; collective: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="bodyMedium">{setupCopy('join.step.means')}</Text>
      {(['1', '2', '3', '4', '5', '6', '7'] as const).map((n) => (
        <Text key={n} variant="bodySmall" tone="secondary">
          {`• ${setupCopy(`join.means.${n}` as 'join.means.1', { host, collective })}`}
        </Text>
      ))}
      {preview.other_models ? (
        <Text variant="caption" color={colors.warning}>
          {setupCopy('bm.join.otherModels', { modelList: preview.other_models, collective })}
        </Text>
      ) : null}
      {preview.warnings.no_stripe_paid_services > 0 ? (
        <Text variant="caption" color={colors.warning}>
          {setupCopy('join.warn.noStripe', { count: preview.warnings.no_stripe_paid_services })}
        </Text>
      ) : null}
      {preview.warnings.form_services > 0 && preview.warnings.forms_off ? (
        <Text variant="caption" color={colors.warning}>
          {setupCopy('join.warn.formsOn', { collective })}
        </Text>
      ) : null}
    </View>
  );
}

export function JoinServicesStep({
  preview,
  draft,
  onChange,
  host,
  collective,
}: {
  preview: JoinPreview;
  draft: JoinDraft;
  onChange: (next: JoinDraft) => void;
  host: string;
  collective: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="bodyMedium">{setupCopy('join.step.services')}</Text>
      {preview.same_name.length > 0 ? (
        <View style={styles.group}>
          <Text variant="label">{setupCopy('join.services.sameName.heading')}</Text>
          <Text variant="caption" tone="secondary">
            {setupCopy('join.services.sameName.help', { host })}
          </Text>
          {preview.same_name.map((pair) => {
            const useMine = draft.sameName[pair.item_id] === 'use_mine';
            return (
              <View key={pair.item_id} style={[styles.card, { borderColor: colors.border }]}>
                <Text variant="bodyMedium">{pair.name}</Text>
                <ChoiceRow
                  selected={useMine}
                  title={setupCopy('join.services.useMine', { service: pair.name })}
                  summary={useMine ? setupCopy('join.services.useMine.note', { service: pair.name, host }) : null}
                  onPress={() => onChange({ ...draft, sameName: { ...draft.sameName, [pair.item_id]: 'use_mine' } })}
                />
                <ChoiceRow
                  selected={!useMine}
                  title={setupCopy('join.services.addNew', { host })}
                  onPress={() => onChange({ ...draft, sameName: { ...draft.sameName, [pair.item_id]: 'add_new' } })}
                />
                {useMine && pair.my_options.length > 0 ? (
                  <View style={styles.group}>
                    <Text variant="label">{setupCopy('join.map.heading')}</Text>
                    {pair.my_options.map((mine) => (
                      <View key={mine.id} style={styles.group}>
                        <Text variant="caption" tone="secondary">
                          {`${setupCopy('join.map.yours')}: ${mine.name}. ${setupCopy('join.map.theirs', { host })}:`}
                        </Text>
                        <View style={styles.chips}>
                          <Chip
                            label={setupCopy('join.map.keepOld')}
                            selected={(draft.optionMap[mine.id] ?? null) === null}
                            onPress={() => onChange({ ...draft, optionMap: { ...draft.optionMap, [mine.id]: null } })}
                          />
                          {pair.host_options.map((h) => (
                            <Chip
                              key={h.id}
                              label={h.name}
                              selected={draft.optionMap[mine.id] === h.id}
                              onPress={() => onChange({ ...draft, optionMap: { ...draft.optionMap, [mine.id]: h.id } })}
                            />
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={styles.group}>
        <Text variant="label">{setupCopy('join.services.own.heading')}</Text>
        <Text variant="caption" tone="secondary">
          {setupCopy('join.services.own.help', { host, collective })}
        </Text>
        {preview.own_services.length === 0 ? (
          <Text variant="bodySmall" tone="muted">
            {setupCopy('join.services.none')}
          </Text>
        ) : (
          preview.own_services.map((service) => (
            <View key={service.id} style={styles.group}>
              <Text variant="bodySmall">{service.name}</Text>
              <View style={styles.chips}>
                <Chip
                  label={setupCopy('join.services.park')}
                  selected={(draft.own[service.id] ?? 'park') === 'park'}
                  onPress={() => onChange({ ...draft, own: { ...draft.own, [service.id]: 'park' } })}
                />
                <Chip
                  label={setupCopy('join.services.ask', { host, collective })}
                  selected={draft.own[service.id] === 'ask'}
                  onPress={() => onChange({ ...draft, own: { ...draft.own, [service.id]: 'ask' } })}
                />
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

export function JoinFormsStep({
  preview,
  draft,
  onChange,
  host,
}: {
  preview: JoinPreview;
  draft: JoinDraft;
  onChange: (next: JoinDraft) => void;
  host: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="bodyMedium">{setupCopy('join.step.forms')}</Text>
      <Text variant="caption" tone="secondary">
        {setupCopy('join.forms.note', { host })}
      </Text>
      {preview.forms.map((form) => (
        <View key={form.host_type_id} style={[styles.card, { borderColor: colors.border }]}>
          <Text variant="bodyMedium">{form.name}</Text>
          <ChoiceRow
            selected={draft.forms[form.host_type_id] === 'use_existing'}
            title={setupCopy('join.forms.useExisting', { form: form.name })}
            onPress={() => onChange({ ...draft, forms: { ...draft.forms, [form.host_type_id]: 'use_existing' } })}
          />
          <ChoiceRow
            selected={draft.forms[form.host_type_id] === 'use_theirs'}
            title={setupCopy('join.forms.useTheirs', { host })}
            onPress={() => onChange({ ...draft, forms: { ...draft.forms, [form.host_type_id]: 'use_theirs' } })}
          />
        </View>
      ))}
    </View>
  );
}

/** The summary lines on the check step: how many services are set up, used, parked and asked for. */
export function JoinSummaryList({
  preview,
  draft,
  host,
  collective,
}: {
  preview: JoinPreview;
  draft: JoinDraft;
  host: string;
  collective: string;
}) {
  const { useMine, park, ask } = joinSummaryCounts(draft);
  const lines = [
    preview.services_to_set_up > 0 ? setupCopy('join.summary.setup', { count: preview.services_to_set_up, host }) : null,
    useMine > 0 ? setupCopy('join.summary.useMine', { count: useMine, host }) : null,
    park > 0 ? setupCopy('join.summary.park', { count: park, collective }) : null,
    ask > 0 ? setupCopy('join.summary.ask', { count: ask, host }) : null,
  ].filter((l): l is string => Boolean(l));
  return (
    <View style={styles.group}>
      {lines.map((line) => (
        <Text key={line} variant="bodySmall" tone="secondary">
          {`• ${line}`}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  group: {
    gap: spacing.xs,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
