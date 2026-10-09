import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { usePosT } from '@/components/pos/parts';
import { SectionCard } from '@/components/ui/SectionCard';
import { Text } from '@/components/ui/Text';
import type { PosT } from '@/lib/pos/copy';
import { isLeftOpen } from '@/lib/pos/till-math';
import { timeOfDay } from '@/lib/retail/stock-words';
import { usePosEnabled } from '@/lib/queries/usePos';
import { useTillSessions } from '@/lib/queries/useTill';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosTillSessionsResponse, PosTillState } from '@/types/pos';

/**
 * The Today screen's "Till" card, as the web home's `TillHomeCard` (UX spec §2.2, §7.8; plan
 * P3-6): each till's state (`home.till.open` or `home.till.closed`), and `home.till.leftOpen` for
 * a session opened on an earlier trading day. Only while POS and "Count cash in till sessions"
 * (`cash_management_enabled`) are on; hidden when it cannot be loaded or there is no till to show.
 */

/** "Monday 5 October": the day a till was opened, in the venue's time zone (web `formatTillDate`). */
export function tillOpenedDate(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(d);
  } catch {
    return '';
  }
}

/** The tills the card lists: active ones, and any with a session still open (web filter). */
export function homeTills(data: Pick<PosTillSessionsResponse, 'tills'>): PosTillState[] {
  return data.tills.filter((x) => x.is_active || x.session);
}

/** One till's line on the card. */
export function tillHomeLine(till: PosTillState, data: Pick<PosTillSessionsResponse, 'today' | 'timezone'>, t: PosT): string {
  if (!till.session) return t('home.till.closed', { till: till.name });
  if (isLeftOpen(till, data.today)) {
    return t('home.till.leftOpen', { till: till.name, date: tillOpenedDate(till.session.opened_at, data.timezone) });
  }
  return t('home.till.open', { till: till.name, time: timeOfDay(till.session.opened_at, data.timezone) });
}

export function TillHomeCard() {
  const t = usePosT();
  const router = useRouter();
  const { colors } = useTheme();
  const posOn = usePosEnabled();
  const { data } = useTillSessions({ enabled: posOn });
  if (!posOn || !data?.cash.enabled) return null;
  const tills = homeTills(data);
  if (tills.length === 0) return null;
  const anyLeftOpen = tills.some((x) => isLeftOpen(x, data.today));
  const linkLabel = anyLeftOpen ? 'Close the till' : 'Open Checkout';

  return (
    <SectionCard elevated>
      <SectionCard.Header title="Till" />
      <SectionCard.Body style={styles.body}>
        {tills.map((x, i) => {
          const left = isLeftOpen(x, data.today);
          return (
            <View
              key={x.id}
              style={[styles.row, i > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
              <Text variant="bodySmall" color={left ? colors.warning : undefined} tone={left ? undefined : 'secondary'} style={left ? styles.leftOpen : undefined}>
                {tillHomeLine(x, data, t)}
              </Text>
            </View>
          );
        })}
      </SectionCard.Body>
      <SectionCard.Footer style={styles.footer}>
        <Pressable
          onPress={() => router.push('/checkout/till' as Href)}
          accessibilityRole="link"
          accessibilityLabel={linkLabel}
          hitSlop={8}>
          <Text variant="label" color={colors.brand}>
            {`${linkLabel} →`}
          </Text>
        </Pressable>
      </SectionCard.Footer>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingVertical: spacing.xs,
  },
  row: {
    paddingVertical: spacing.sm,
  },
  leftOpen: {
    fontWeight: '600',
  },
  footer: {
    alignItems: 'flex-end',
  },
});
