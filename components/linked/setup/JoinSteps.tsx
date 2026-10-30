import { StyleSheet, View } from 'react-native';

import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { allOwnAsked, joinOffersFormsSwitch, joinSummaryCounts, withAllOwn, type JoinDraft } from '@/lib/linked/join-choices';
import { checklistLinks, joinLinkStateWords } from '@/lib/linked/join-links';
import { setupCopy } from '@/lib/linked/setup-copy';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { JoinPreview, LinkNeed } from '@/types/collectives';

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
      <JoinLinksDisclosure links={preview.links} collective={collective} />
    </View>
  );
}

/**
 * Step 1 of every join (CQ-08; web `JoinLinksDisclosure`, 2026-10-29): joining links the venue with
 * every venue in the collective, at full access both ways, and those links stay after it leaves. Each
 * venue is named, host first, with where the link stands, then what each venue's team can do, and
 * that the links last. Shown whatever state the links are in, so a venue already linked with everyone
 * still reads what it is agreeing to. Used by the join sheet and the review sheet's means step.
 */
export function JoinLinksDisclosure({ links, collective }: { links: LinkNeed[] | undefined; collective: string }) {
  const { colors } = useTheme();
  const heading = setupCopy('join.links.heading');
  const venues = [...(links ?? [])].sort((a, b) => Number(b.is_host) - Number(a.is_host));
  return (
    <View
      accessibilityLabel={heading}
      testID="join-links-disclosure"
      style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.brandSubtle }]}>
      <Text variant="label">{heading}</Text>
      {venues.map((need) => (
        <View key={need.venue_id} style={styles.group}>
          <Text variant="bodySmall" style={styles.strong}>
            {need.venue_name}
          </Text>
          <Text variant="caption" tone="secondary">
            {joinLinkStateWords(need.state)}
          </Text>
        </View>
      ))}
      <Text variant="bodySmall">{setupCopy('join.links.intro', { collective })}</Text>
      {(['join.links.can.see', 'join.links.can.book', 'join.links.can.reports'] as const).map((id) => (
        <Text key={id} variant="bodySmall">
          {`• ${setupCopy(id)}`}
        </Text>
      ))}
      <Text variant="bodySmall">{setupCopy('join.links.same')}</Text>
      <Text variant="bodySmall" style={styles.strong}>
        {setupCopy('join.links.lasts', { collective })}
      </Text>
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
          // A tick box each, ticked by default: ticked ones are suggested to the host, who can add
          // them all at once; unticked ones are parked (web 2026-10-27). One "all" box above them.
          <View style={styles.group}>
            {preview.own_services.length > 1 ? (
              <ChoiceRow
                kind="checkbox"
                selected={allOwnAsked(preview, draft)}
                title={setupCopy('join.services.askAll', { host })}
                onPress={() => onChange(withAllOwn(preview, draft, !allOwnAsked(preview, draft)))}
              />
            ) : null}
            {preview.own_services.map((service) => {
              const ask = draft.own[service.id] === 'ask';
              return (
                <ChoiceRow
                  key={service.id}
                  kind="checkbox"
                  selected={ask}
                  title={service.name}
                  accessibilityLabel={setupCopy('join.services.askOne', { host, service: service.name })}
                  onPress={() => onChange({ ...draft, own: { ...draft.own, [service.id]: ask ? 'park' : 'ask' } })}
                />
              );
            })}
          </View>
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

/**
 * Where this venue's link with each venue in the collective stands (web `JoinLinksChecklist`,
 * 2026-10-28). Joining makes every missing link and accepts every waiting request in the same step,
 * so a row is either already linked or linked as the venue joins: nothing to press. The one
 * exception is a link already in force with less than full access, which somebody chose: it says
 * so, with "Change it in Linked Accounts".
 */
export function JoinLinksChecklist({
  links,
  collective,
  exceptLinkId,
  onOpenLinked,
}: {
  links: LinkNeed[] | undefined;
  collective: string;
  /** The request under review alongside, which that sheet describes itself. */
  exceptLinkId?: string;
  /** Linked venues, where a link without full access is changed; absent, the row only says so. */
  onOpenLinked?: () => void;
}) {
  const { colors } = useTheme();
  const shown = checklistLinks(links, exceptLinkId);
  if (shown.length === 0) return null;

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text variant="label">{setupCopy('join.links.heading')}</Text>
      <Text variant="caption" tone="secondary">
        {setupCopy('join.links.help', { collective })}
      </Text>
      {shown.map((need) => (
        <View key={need.venue_id} style={styles.linkRow}>
          <Text variant="bodySmall" color={need.state === 'not_full' ? colors.warning : colors.success}>
            {need.state === 'not_full' ? '•' : '✓'}
          </Text>
          <View style={[styles.group, styles.flex1]}>
            <Text variant="label">{need.venue_name}</Text>
            <Text variant="caption" tone="secondary">
              {joinLinkStateWords(need.state)}
            </Text>
            {need.state === 'not_full' && onOpenLinked ? (
              <Button
                label={setupCopy('join.links.openLinked')}
                variant="ghost"
                size="sm"
                style={styles.start}
                onPress={onOpenLinked}
              />
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/** The tick on the last step that turns the venue's forms on as it joins (web `JoinFormsSwitch`). */
export function JoinFormsSwitch({
  preview,
  draft,
  onChange,
}: {
  preview: JoinPreview;
  draft: JoinDraft;
  onChange: (next: JoinDraft) => void;
}) {
  if (!joinOffersFormsSwitch(preview)) return null;
  const count = preview.warnings.form_services;
  return (
    <ChoiceRow
      kind="checkbox"
      selected={draft.turnOnForms}
      title={setupCopy('join.formsSwitch.label')}
      summary={setupCopy(count === 1 ? 'join.formsSwitch.helpOne' : 'join.formsSwitch.help', { count })}
      onPress={() => onChange({ ...draft, turnOnForms: !draft.turnOnForms })}
    />
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
  linkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
  start: {
    alignSelf: 'flex-start',
  },
  strong: {
    fontWeight: '600',
  },
});
