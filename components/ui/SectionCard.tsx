import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { elevation as elevationTokens, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * SectionCard — a compound panel mirroring the web dashboard's
 * `components/ui/dashboard/SectionCard.tsx`: a rounded, bordered surface split
 * into an optional Header (eyebrow / title / description / right slot), a Body, an
 * optional Divider, and an optional Footer.
 *
 * Compose the slots:
 *   <SectionCard>
 *     <SectionCard.Header title="Hours" description="Weekly opening times" right={<Button …/>} />
 *     <SectionCard.Body>…</SectionCard.Body>
 *     <SectionCard.Footer>…</SectionCard.Footer>
 *   </SectionCard>
 *
 * It is additive — existing screens keep their hand-rolled cards; adopt this only
 * where a screen is already being touched (per the F4 note).
 */

type SectionCardRootProps = {
  children: ReactNode;
  /** Stronger shadow for primary panels (mirrors the web `elevated`). */
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
};

function SectionCardRoot({ children, elevated = false, style }: SectionCardRootProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        elevated ? elevationTokens.raised : elevationTokens.card,
        style,
      ]}>
      {children}
    </View>
  );
}

type SectionCardHeaderProps = {
  /** Small uppercase label above the title. */
  eyebrow?: string;
  title?: string;
  description?: ReactNode;
  /** Trailing slot (buttons, badges) aligned to the header's end. */
  right?: ReactNode;
};

function SectionCardHeader({ eyebrow, title, description, right }: SectionCardHeaderProps) {
  const { colors } = useTheme();
  if (!eyebrow && !title && !description && !right) return null;
  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <View style={styles.headerText}>
        {eyebrow ? (
          <Text variant="overline" tone="muted">
            {eyebrow}
          </Text>
        ) : null}
        {title ? (
          <Text variant="heading" style={eyebrow ? styles.titleSpaced : undefined}>
            {title}
          </Text>
        ) : null}
        {description ? (
          typeof description === 'string' ? (
            <Text variant="bodySmall" tone="secondary" style={styles.description}>
              {description}
            </Text>
          ) : (
            <View style={styles.description}>{description}</View>
          )
        ) : null}
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

function SectionCardBody({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.body, style]}>{children}</View>;
}

function SectionCardDivider() {
  const { colors } = useTheme();
  return <View accessibilityRole="none" style={[styles.divider, { backgroundColor: colors.border }]} />;
}

function SectionCardFooter({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }, style]}>
      {children}
    </View>
  );
}

export const SectionCard = Object.assign(SectionCardRoot, {
  Header: SectionCardHeader,
  Body: SectionCardBody,
  Divider: SectionCardDivider,
  Footer: SectionCardFooter,
});

const styles = StyleSheet.create({
  root: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  titleSpaced: {
    marginTop: spacing.xxs,
  },
  description: {
    marginTop: spacing.xs,
  },
  headerRight: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  body: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
