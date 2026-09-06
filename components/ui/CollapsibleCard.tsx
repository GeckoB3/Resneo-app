import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { layoutSafe, motionSafe, useReduceMotion } from '@/lib/motion';
import { motion, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type CollapsibleCardProps = {
  title: string;
  /** Muted text on the right of the header (e.g. a count or status). */
  summary?: string | null;
  /** Optional visual marker (e.g. a pill/badge) shown before the summary. */
  marker?: ReactNode;
  defaultExpanded?: boolean;
  /** Lazily render children only after the first expand. */
  lazy?: boolean;
  /**
   * Tween the card height when the body appears/disappears or its content
   * resizes (default true). Set false when the body holds inputs that grow on
   * focus — the height tween otherwise fights the keyboard/scroll and strands a
   * white gap on Android. The expand/collapse then snaps instead of sliding.
   */
  animateLayout?: boolean;
  /**
   * Controlled mode: the host owns the open state and answers `onToggle`. For
   * a section whose rows live outside the card (a virtualised list under the
   * header, as the contact screen's guest bookings), where the card can only
   * be the accordion's header. Omit both for the usual self-contained card.
   */
  expanded?: boolean;
  onToggle?: () => void;
  /** The body; `null` draws the header alone (the rows sit elsewhere). */
  children: ReactNode;
};

/**
 * A Card with a tap-to-expand header — the mobile equivalent of the web
 * booking-detail accordions. Children render collapsed by default; pass
 * `lazy` to defer mounting until first expand (e.g. query-backed sections).
 */
export function CollapsibleCard({
  title,
  summary,
  marker,
  defaultExpanded = false,
  lazy = false,
  animateLayout = true,
  expanded: controlledExpanded,
  onToggle,
  children,
}: CollapsibleCardProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const [ownExpanded, setOwnExpanded] = useState(defaultExpanded);
  const [hasExpanded, setHasExpanded] = useState(defaultExpanded);
  const expanded = controlledExpanded ?? ownExpanded;

  const toggle = () => {
    hapticSelect();
    if (controlledExpanded === undefined) setOwnExpanded((cur) => !cur);
    setHasExpanded(true);
    onToggle?.();
  };

  // Keep the body mounted once seen (for non-lazy sections, so toggling is
  // cheap) but only render it into layout when expanded — a gated
  // `LinearTransition` on the card content then tweens the height as the body
  // appears/disappears, and a gated `FadeIn` softens the body itself. Both
  // collapse to instant when reduce-motion is on. No body at all when there is
  // nothing to show, so a header-only card carries no empty gap.
  const showBody = children != null && children !== false && (expanded || (!lazy && hasExpanded));

  return (
    <Card>
      <Animated.View
        layout={
          animateLayout
            ? layoutSafe(LinearTransition.duration(motion.normal), reduceMotion)
            : undefined
        }>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ expanded }}
          onPress={toggle}
          style={({ pressed }) => [styles.header, { opacity: pressed ? 0.55 : 1 }]}>
          <Text variant="label">{title}</Text>
          <View style={styles.headerRight}>
            {marker ?? null}
            {summary ? (
              <Text variant="caption" tone="muted" numberOfLines={1} style={styles.summary}>
                {summary}
              </Text>
            ) : null}
            <SymbolView
              name={
                expanded
                  ? { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }
                  : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
              }
              tintColor={colors.textMuted}
              size={16}
            />
          </View>
        </Pressable>
        {showBody ? (
          <Animated.View
            entering={motionSafe(FadeIn.duration(motion.fast), reduceMotion)}
            style={[styles.body, !expanded && styles.bodyHidden]}>
            {children}
          </Animated.View>
        ) : null}
      </Animated.View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  summary: {
    flexShrink: 1,
  },
  body: {
    marginTop: spacing.sm,
  },
  bodyHidden: {
    display: 'none',
  },
});
