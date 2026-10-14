import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { splitsT } from '@/lib/commission/splits-copy';
import { splitMoney } from '@/lib/commission/splits-format';
import { useSplitPreview } from '@/lib/queries/useCommissionSplits';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { SplitPreviewParams } from '@/types/commission-splits';

/**
 * What a form will save, in words, before it saves (web `sum.*`): the sentence first, then what
 * follows from it, in one box that is read out as it changes.
 */
export function SummaryBox({ summary, children }: { summary: string; children?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      style={[styles.box, { backgroundColor: colors.infoSurface, borderColor: colors.info }]}>
      <Text variant="bodyMedium">{summary}</Text>
      {children}
    </View>
  );
}

/**
 * The worked example on last month's figures (web propose form, `form.example*`): what the terms
 * being written would have come to, the completed bookings and products behind it, and the note when
 * the paying business has no VAT set-up in ResNeo. Nothing shows until the server has answered for
 * the terms on screen; null params (no calendar yet, a rate that is not a number) ask nothing. With
 * `summary` (the propose form's `businessSummary`), the sentence leads the box and shows at once.
 */
export function SplitExample({
  params,
  business,
  currency,
  summary,
}: {
  params: SplitPreviewParams | null;
  /** The business that pays (the calendar's), for the VAT note. */
  business: string;
  /** Used only if the answer has no currency of its own. */
  currency?: string | null;
  summary?: string | null;
}) {
  const { colors } = useTheme();
  const preview = useSplitPreview(params);
  const data = params ? preview.data : undefined;
  const money = (pence: number) => splitMoney(pence, data?.currency || currency);
  const lines = data ? (
    <>
      <Text variant={summary ? 'bodySmall' : 'bodyMedium'}>{splitsT('form.example', { owed: money(data.owed_pence) })}</Text>
      <Text variant={summary ? 'caption' : 'bodySmall'} tone="secondary">
        {splitsT('form.example.detail', {
          services: money(data.services_pence),
          products: params?.products_rate_percent !== null ? splitsT('form.example.products', { products: money(data.products_pence) }) : '',
        })}
      </Text>
      {data.vat_note ? (
        <Text variant="caption" tone="muted">
          {splitsT('form.example.vat', { business })}
        </Text>
      ) : null}
    </>
  ) : null;
  if (summary) return <SummaryBox summary={summary}>{lines}</SummaryBox>;
  if (!lines) return null;
  return (
    <View
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      style={[styles.box, { backgroundColor: colors.infoSurface, borderColor: colors.info }]}>
      {lines}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xxs },
});
