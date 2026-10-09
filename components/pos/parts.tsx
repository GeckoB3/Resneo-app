import { useMemo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { formatPence } from '@/lib/format';
import { posCopyFor, type PosT } from '@/lib/pos/copy';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Small pieces every Checkout screen shares: the copy function with the venue's client word, money
 * text, a tall scrolling sheet, a row of choice chips and an error line.
 */

/** Checkout's words with this venue's word for its clients filled in. */
export function usePosT(): PosT {
  const { terminology } = useVenueContext();
  return useMemo(() => posCopyFor(terminology.client), [terminology.client]);
}

/** Pence as money text. Checkout works in pounds only in v1 (POS plan D12). */
export function money(pence: number): string {
  return formatPence(pence) ?? `£${(pence / 100).toFixed(2)}`;
}

/**
 * A Checkout sheet: tall, with its own scroll body so a long form can always be finished (the
 * `fill` + `flex: 1` rule in `sheet-scroll-contract.test.ts`).
 */
export function PosSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | null;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} fill maxHeight="92%">
      <View style={styles.sheetHeader}>
        <Text variant="heading">{title}</Text>
        {subtitle ? (
          <Text variant="bodySmall" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </Sheet>
  );
}

/** A wrapping row of single-choice chips. */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

export function ErrorLine({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
      {message}
    </Text>
  );
}

/** A label and an amount on one line. */
export function AmountRow({
  label,
  amount,
  strong,
  muted,
}: {
  label: string;
  amount: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.amountRow}>
      <Text variant={strong ? 'label' : 'bodySmall'} tone={muted ? 'muted' : 'default'} style={styles.amountLabel}>
        {label}
      </Text>
      <Text variant={strong ? 'label' : 'bodySmall'} tone={muted ? 'muted' : 'default'}>
        {amount}
      </Text>
    </View>
  );
}

/** A tinted notice block (stale sale, parked, card waiting). */
export function Notice({
  tone = 'info',
  children,
  action,
}: {
  tone?: 'info' | 'warning' | 'success';
  children: ReactNode;
  action?: { label: string; onPress: () => void; loading?: boolean };
}) {
  const { colors } = useTheme();
  const bg = tone === 'warning' ? colors.warningSurface : tone === 'success' ? colors.successSurface : colors.infoSurface;
  const border = tone === 'warning' ? colors.warning : tone === 'success' ? colors.success : colors.info;
  return (
    <View style={[styles.notice, { backgroundColor: bg, borderColor: border }]}>
      <Text variant="bodySmall">{children}</Text>
      {action ? (
        <Button label={action.label} size="sm" variant="secondary" loading={action.loading} onPress={action.onPress} />
      ) : null}
    </View>
  );
}

export const posStyles = StyleSheet.create({
  stack: { gap: spacing.md },
  buttons: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});

const styles = StyleSheet.create({
  sheetHeader: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs },
  scroll: { flex: 1 },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  amountLabel: { flex: 1 },
  notice: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
});
