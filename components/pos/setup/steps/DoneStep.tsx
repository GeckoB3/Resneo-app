import { type Href, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SETUP_ICONS, SetupSection, StatusLine } from '@/components/pos/setup/parts';
import { SetupFrame, useSetupNav, type SetupData } from '@/components/pos/setup/SetupFrame';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { setupT, stepCardLabel } from '@/lib/pos/setup/copy';
import { cardLineHref, openSteps } from '@/lib/pos/setup/flow';
import { summaryLines } from '@/lib/pos/setup/summary';
import { useSaveSetupProgress } from '@/lib/queries/usePosSetup';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** Checkout home, where "New sale" and "Ready to pay" are (`app/(app)/checkout/index.tsx`). */
export const CHECKOUT_HOME = { href: '/checkout', routeName: 'checkout/index' } as const;

/**
 * W12, "Checkout is ready" (design 6.3, drawn as B14): what is set up, what is still to do (each
 * line opens its screen), and plainly where a first real sale starts, because "Ready to pay" only
 * fills once someone marks a client Arrived. Reaching it stamps set-up as finished, once. "Open
 * Checkout" and "Done" both leave set-up; the card on Today keeps whatever is still to do.
 */
export function DoneStep({ data }: { data: SetupData }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { leave } = useSetupNav('done');
  const saveProgress = useSaveSetupProgress();
  const stamped = useRef(false);

  useEffect(() => {
    if (data.status.finished_at || stamped.current) return;
    stamped.current = true;
    void saveProgress({ finished: true });
  }, [data.status.finished_at, saveProgress]);

  const done = summaryLines(data.status, data.status.answers, data.settings.settings.tip_allocation_rule);
  const todo = openSteps(data.status);
  const team = data.status.steps.find((s) => s.id === 'team')?.applies === true;

  return (
    <SetupFrame
      screen="done"
      data={data}
      title={setupT('setup.done.title')}
      showCount={false}
      footer={
        <View style={styles.buttons}>
          <Button label={setupT('setup.done.open')} size="lg" fullWidth onPress={() => leave(CHECKOUT_HOME)} />
          <Button label={setupT('app.setup.done.close')} variant="ghost" fullWidth onPress={() => leave()} />
        </View>
      }>
      {done.length > 0 ? (
        <View style={styles.stack}>
          <Text variant="label">{setupT('setup.done.summary')}</Text>
          {done.map((line) => (
            <StatusLine key={line} tone="done">
              {line}
            </StatusLine>
          ))}
        </View>
      ) : null}

      {todo.length > 0 ? (
        <View style={styles.stack}>
          <Text variant="label">{setupT('setup.done.todo')}</Text>
          {todo.map((step) => (
            <Pressable
              key={step.id}
              accessibilityRole="button"
              accessibilityLabel={stepCardLabel(step.id)}
              onPress={() => router.push(cardLineHref(step.id, data.status.answers) as Href)}
              style={({ pressed }) => [styles.todo, { opacity: pressed ? 0.6 : 1 }]}>
              <SymbolView name={SETUP_ICONS[step.id]} tintColor={colors.accentPressed} size={18} />
              <Text variant="bodySmall" style={styles.flex}>
                {stepCardLabel(step.id)}
              </Text>
              <SymbolView name={SETUP_ICONS.chevron} tintColor={colors.textMuted} size={14} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <SetupSection title={setupT('setup.done.first.title')}>
        <Text variant="bodySmall">{setupT('setup.done.first.booking')}</Text>
        <Text variant="bodySmall">{setupT('app.setup.done.first.queue')}</Text>
        <Text variant="bodySmall">{setupT('setup.done.first.walkIn')}</Text>
      </SetupSection>

      {team ? (
        <Text variant="bodySmall" tone="secondary">
          {setupT('setup.done.team')}
        </Text>
      ) : null}
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  buttons: { gap: spacing.sm },
  todo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  flex: { flex: 1, minWidth: 0 },
});
