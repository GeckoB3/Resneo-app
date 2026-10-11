import { type Href, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProgressBar, SETUP_ICONS } from '@/components/pos/setup/parts';
import { TextLink } from '@/components/pos/switches/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { isPosEnabled } from '@/lib/pos/pos-enabled';
import { setupT, stepCardLabel } from '@/lib/pos/setup/copy';
import { cardLineHref, continueHref, openSteps, SETUP_WELCOME_HREF } from '@/lib/pos/setup/flow';
import { useHideSetupCard, usePosSetupStatus } from '@/lib/queries/usePosSetup';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * "Finish setting up Checkout" (design 6.6, drawn as B15 and C3; OB8: a card of its own, not rows
 * in "What's next"), on Today and at the top of Checkout settings, for admins while Checkout is on
 * and a step that applies is not done yet. Ticked off by real data, never by a button: the count
 * and the lines are the server's (`GET /api/venue/pos/setup-status`). Each line opens its screen
 * ("Take cards on your phone" opens "Get this phone ready"); "Continue" opens the first screen
 * neither done nor skipped; "Hide" is kept on the server for this admin (`pos_setup`), so the
 * web's card hides too. In Checkout settings, once the card is gone, "Run set-up again" stays.
 */
export function PosSetupCard({ place }: { place: 'today' | 'hub' }) {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const staffQuery = useStaffMe();
  const role = staffQuery.data?.staff?.role ?? venue?.current_user_role ?? null;
  const isAdmin = role === 'admin';
  const posOn = isPosEnabled(venue);
  const query = usePosSetupStatus({ enabled: isAdmin && posOn });
  const hide = useHideSetupCard();
  const status = query.data;

  if (!isAdmin || !posOn || !status) return null;

  if (!status.show_card) {
    if (place !== 'hub') return null;
    return (
      <View style={styles.again}>
        <TextLink label={setupT('setup.again')} onPress={() => router.push(SETUP_WELCOME_HREF as Href)} />
      </View>
    );
  }

  const lines = openSteps(status);
  const progress = setupT('setup.card.progress', { done: status.done, total: status.total });

  return (
    <Card style={{ borderColor: colors.accent }}>
      <View style={styles.stack}>
        <View style={styles.titleRow}>
          <Text variant="label" accessibilityRole="header" style={styles.flex}>
            {setupT('setup.card.title')}
          </Text>
          <Badge label={progress} tone="accent" />
        </View>
        <ProgressBar done={status.done} total={status.total} label={progress} />
        <View>
          {lines.map((step, i) => (
            <Pressable
              key={step.id}
              accessibilityRole="button"
              accessibilityLabel={stepCardLabel(step.id)}
              onPress={() => router.push(cardLineHref(step.id, status.answers) as Href)}
              style={({ pressed }) => [
                styles.line,
                i > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null,
                { opacity: pressed ? 0.6 : 1 },
              ]}>
              <SymbolView name={SETUP_ICONS[step.id]} tintColor={colors.accentPressed} size={18} />
              <Text variant="bodySmall" style={styles.flex}>
                {stepCardLabel(step.id)}
              </Text>
              {step.state === 'skipped' ? (
                <Text variant="caption" tone="muted">
                  {setupT('setup.card.skipped')}
                </Text>
              ) : null}
              <SymbolView name={SETUP_ICONS.chevron} tintColor={colors.textMuted} size={14} />
            </Pressable>
          ))}
        </View>
        <View style={styles.buttons}>
          <Button label={setupT('setup.card.continue')} size="sm" onPress={() => router.push(continueHref(status) as Href)} />
          <Button
            label={setupT('setup.card.hide')}
            size="sm"
            variant="ghost"
            loading={hide.isPending}
            onPress={() =>
              hide.mutate(undefined, {
                onSuccess: () => toast.info(setupT('app.setup.card.hidden')),
                onError: () => toast.error(setupT('setup.card.hideFailed')),
              })
            }
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.xs },
  again: { alignItems: 'flex-start' },
});
