import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type CollapsibleCardProps = {
  title: string;
  /** Muted text on the right of the header (e.g. a count or status). */
  summary?: string | null;
  defaultExpanded?: boolean;
  /** Lazily render children only after the first expand. */
  lazy?: boolean;
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
  defaultExpanded = false,
  lazy = false,
  children,
}: CollapsibleCardProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [hasExpanded, setHasExpanded] = useState(defaultExpanded);

  const toggle = () => {
    hapticSelect();
    setExpanded((cur) => !cur);
    setHasExpanded(true);
  };

  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded }}
        onPress={toggle}
        style={({ pressed }) => [styles.header, { opacity: pressed ? 0.55 : 1 }]}>
        <Text variant="label">{title}</Text>
        <View style={styles.headerRight}>
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
      {expanded || (!lazy && hasExpanded) ? (
        <View style={[styles.body, !expanded && styles.bodyHidden]}>{children}</View>
      ) : null}
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
