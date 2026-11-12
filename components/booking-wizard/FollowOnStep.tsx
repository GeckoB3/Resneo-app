import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { DEFAULT_FOLLOW_ON_QUESTION, FOLLOW_ON_VISIT_LIMIT, type FollowOnQuestion } from '@/lib/follow-ons/rules';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** What a card shows about a service. */
export interface FollowOnServiceCard {
  name: string;
  durationMinutes: number | null;
  priceLabel: string;
  description: string | null;
}

/** One question as the step draws it. */
export interface FollowOnStepSection {
  question: FollowOnQuestion;
  /** The services to show, in the venue's order: picked here, or still to choose. */
  options: string[];
  /** The service in the visit that raised it, for the second and later questions. */
  askedBecause: string | null;
}

type Props = {
  sections: FollowOnStepSection[];
  picks: Readonly<Record<string, readonly string[]>>;
  onToggle: (groupId: string, serviceId: string, single: boolean) => void;
  serviceCard: (serviceId: string) => FollowOnServiceCard;
  /** A choice that cannot be taken here, and why (staff-first: someone else does it). */
  optionState: (serviceId: string) => { disabled?: boolean; note?: string };
  /** The services already in the visit, for the line at the top. */
  visitLabel: string;
  /** Services in the visit with the picks so far. */
  visitCount: number;
  onContinue: () => void;
  onSkip: () => void;
};

/**
 * The follow-on step in the staff booking wizard (web follow-on plan 4.1 and 5): after the services
 * are ticked, the venue's question with a card for each service it offers. A pick joins the visit
 * as its own service. Staff can always skip, even a question clients must answer online. Mirrors
 * the web's `src/components/booking/FollowOnStep.tsx` in its staff form, words included.
 */
export function FollowOnStep({
  sections,
  picks,
  onToggle,
  serviceCard,
  optionState,
  visitLabel,
  visitCount,
  onContinue,
  onSkip,
}: Props) {
  const { colors } = useTheme();
  const visitFull = visitCount >= FOLLOW_ON_VISIT_LIMIT;
  const heading = sections[0]?.question.group.prompt ?? DEFAULT_FOLLOW_ON_QUESTION;

  const helperFor = (section: FollowOnStepSection): string | null => {
    const g = section.question.group;
    if (g.required) return 'Clients booking online must choose one. You can skip it.';
    if (g.selection_type === 'multi') return 'Pick as many as you like. Each is booked as its own appointment.';
    return null;
  };

  return (
    <View style={styles.container} testID="follow-on-step">
      {visitLabel ? (
        <View style={[styles.visitLine, { borderColor: colors.brandBorder, backgroundColor: colors.brandSubtle }]}>
          <Text variant="bodySmall" tone="secondary">
            {`✓ ${visitLabel}`}
          </Text>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {sections.map((section, index) => {
          const g = section.question.group;
          const single = g.selection_type === 'single';
          const groupPicks = new Set(picks[g.id] ?? []);
          const helper = helperFor(section);
          return (
            <View
              key={g.id}
              testID={`follow-on-question-${g.id}`}
              style={[styles.section, index > 0 ? [styles.laterSection, { borderTopColor: colors.border }] : null]}>
              {index === 0 ? (
                <Text variant="heading">{heading}</Text>
              ) : (
                <View style={styles.titleRow}>
                  <Text variant="label" style={styles.flexText}>
                    {g.prompt ?? DEFAULT_FOLLOW_ON_QUESTION}
                  </Text>
                  {!g.required ? (
                    <View style={[styles.pill, { backgroundColor: colors.surface }]}>
                      <Text variant="caption" tone="secondary">
                        Optional
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
              {index > 0 && section.askedBecause ? (
                <Text variant="caption" tone="muted">
                  {`Asked because you added a ${section.askedBecause}.`}
                </Text>
              ) : null}
              {helper ? (
                <Text variant="caption" tone="muted">
                  {helper}
                </Text>
              ) : null}
              {index === 0 && visitFull && sections.some((s) => (picks[s.question.group.id]?.length ?? 0) === 0) ? (
                <View
                  accessibilityRole="alert"
                  style={[styles.notice, { borderColor: colors.warning, backgroundColor: colors.warningSurface }]}>
                  <Text variant="bodySmall">
                    {`Your visit already has ${FOLLOW_ON_VISIT_LIMIT} services, the most we can book together. Go back to remove one.`}
                  </Text>
                </View>
              ) : null}
              {section.options.map((serviceId) => {
                const card = serviceCard(serviceId);
                const checked = groupPicks.has(serviceId);
                const state = optionState(serviceId);
                const disabled = !checked && (Boolean(state.disabled) || visitFull);
                const meta = [card.durationMinutes ? `${card.durationMinutes} min` : null, state.note ?? null]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Pressable
                    key={serviceId}
                    testID={`follow-on-option-${serviceId}`}
                    accessibilityRole={single ? 'radio' : 'checkbox'}
                    accessibilityState={{ checked, disabled }}
                    accessibilityLabel={card.name}
                    disabled={disabled}
                    onPress={() => {
                      hapticSelect();
                      onToggle(g.id, serviceId, single);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      {
                        backgroundColor: checked ? colors.surfaceRaised : colors.surface,
                        borderColor: checked ? colors.brand : colors.border,
                        opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
                      },
                    ]}>
                    <View
                      style={[
                        single ? styles.radio : styles.check,
                        {
                          borderColor: checked ? colors.brand : colors.borderStrong,
                          backgroundColor: checked ? colors.brand : 'transparent',
                        },
                      ]}>
                      {checked ? <Text style={[styles.checkMark, { color: colors.onBrand }]}>✓</Text> : null}
                    </View>
                    <View style={styles.flexText}>
                      <Text variant="bodyMedium">{card.name}</Text>
                      {meta ? (
                        <Text variant="caption" tone="muted">
                          {meta}
                        </Text>
                      ) : null}
                      {card.description ? (
                        <Text variant="caption" tone="muted" numberOfLines={2}>
                          {card.description}
                        </Text>
                      ) : null}
                    </View>
                    {card.priceLabel ? <Text variant="label">{card.priceLabel}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button label="Skip" variant="secondary" fullWidth onPress={onSkip} testID="follow-on-skip" />
        </View>
        <View style={styles.action}>
          <Button label="Continue" fullWidth onPress={onContinue} testID="follow-on-continue" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.md,
  },
  visitLine: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  scroll: {
    gap: spacing.lg,
    paddingBottom: spacing.base,
  },
  section: {
    gap: spacing.sm,
  },
  laterSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.base,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  notice: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    fontSize: 13,
    fontFamily: fonts.bold,
    lineHeight: 16,
  },
  flexText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
});
