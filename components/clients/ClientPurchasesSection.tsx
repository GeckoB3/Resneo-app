import { StyleSheet, View } from 'react-native';

import { money, posStyles, usePosT } from '@/components/pos/parts';
import { Card } from '@/components/ui/Card';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Text } from '@/components/ui/Text';
import { useClientPurchases, usePosEnabled } from '@/lib/queries/usePos';
import { useVenue } from '@/lib/queries/useVenue';
import { spacing } from '@/theme/index';
import type { PosClientPurchase, PosClientSpend } from '@/types/pos';

/**
 * A client's spend and purchases on the client page the app already has (POS app step 4, plan
 * P7-14, P4-8; UX spec §4.3, §13.6), as the web's `ClientPurchases.tsx`: Lifetime spend and Average
 * spend from the money journal (every source, net of refunds; an empty value reads
 * `client.stats.none`, never a dash), and the products they bought, newest first, with the date,
 * option, quantity, price, where and who sold it.
 *
 * Only at venues with `pos_enabled`, from `GET /api/venue/guests/[guestId]/purchases`: the plan
 * put these on the guest GET the app already reads, and the web serves them from their own route.
 * `guests.total_spent_minor` keeps its meaning ("Deposits" in the stats above).
 */

export function lifetimeSpendText(spend: PosClientSpend | null | undefined, none: string): string {
  const pence = Number(spend?.lifetime_pence ?? 0);
  return pence > 0 ? money(pence) : none;
}

export function averageSpendText(spend: PosClientSpend | null | undefined, none: string): string {
  const avg = spend?.average_pence;
  return avg != null && Number(spend?.visits ?? 0) > 0 && Number(avg) > 0 ? money(Number(avg)) : none;
}

function purchaseDate(p: PosClientPurchase, timeZone: string): string {
  try {
    if (p.business_date) {
      return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${p.business_date}T12:00:00Z`),
      );
    }
    if (p.completed_at) {
      return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(p.completed_at));
    }
  } catch {
    // An unknown time zone: fall through to the raw date.
  }
  return p.business_date ?? '';
}

export function ClientPurchasesSection({ guestId }: { guestId: string }) {
  const t = usePosT();
  const posEnabled = usePosEnabled();
  const venue = useVenue();
  const q = useClientPurchases(guestId, { enabled: posEnabled });
  if (!posEnabled || q.isError) return null;
  const none = t('client.stats.none');
  const loading = q.isLoading || !q.data;
  const timeZone = venue.data?.timezone ?? 'Europe/London';
  return (
    <>
      <Card>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text variant="caption" tone="muted">
              {t('client.stats.spend')}
            </Text>
            <Text variant="label" tone={loading ? 'muted' : 'default'}>
              {loading ? '…' : lifetimeSpendText(q.data?.spend, none)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="caption" tone="muted">
              {t('client.stats.average')}
            </Text>
            <Text variant="label" tone={loading ? 'muted' : 'default'}>
              {loading ? '…' : averageSpendText(q.data?.spend, none)}
            </Text>
          </View>
        </View>
      </Card>
      <CollapsibleCard title={t('client.purchases.title')} lazy>
        {loading ? (
          <Text tone="muted">{t('app.loading')}</Text>
        ) : (q.data?.purchases ?? []).length === 0 ? (
          <Text tone="muted">{t('client.purchases.empty')}</Text>
        ) : (
          <View style={posStyles.stack}>
            {(q.data?.purchases ?? []).map((p) => (
              <View key={p.line_id} style={posStyles.row}>
                <View style={styles.flex}>
                  <Text variant="bodyMedium">
                    {p.name}
                    {p.option_name ? `, ${p.option_name}` : ''} × {Number(p.quantity)}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {[
                      purchaseDate(p, timeZone),
                      p.channel === 'online' ? t('client.purchases.where.online') : t('client.purchases.where.till'),
                      p.seller_name,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Text variant="bodyMedium">{money(Number(p.total_pence))}</Text>
              </View>
            ))}
          </View>
        )}
      </CollapsibleCard>
    </>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing.md },
  stat: { flex: 1, gap: spacing.xxs },
  flex: { flex: 1 },
});
