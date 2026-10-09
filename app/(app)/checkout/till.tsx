import { Image } from 'expo-image';
import { type Href, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { money, Notice, posStyles, usePosT } from '@/components/pos/parts';
import { CloseTillSheet, MovementSheet, OpenTillSheet, TillReportView, TipsPaidOutSheet, type MoveKind } from '@/components/pos/TillSheets';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { businessDateLabel, isLeftOpen, movementKindLabel, movementSign, tillsInOrder } from '@/lib/pos/till-math';
import { timeOfDay } from '@/lib/retail/stock-words';
import { usePosEnabled } from '@/lib/queries/usePos';
import { useTillSession, useTillSessions } from '@/lib/queries/useTill';
import { useVenue } from '@/lib/queries/useVenue';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import type { PosTillMovement, PosTillSessionsResponse, PosTillState } from '@/types/pos';

/**
 * The till in the app (POS app step 3, plan P7-10; UX spec §7.1 to §7.5, §7.8, §13.5), reached from
 * the Till card on Checkout and from the `pos_cash_up_reminder` push (`?session=`). Only while the
 * venue counts cash in till sessions (`cash_management_enabled`); otherwise it says so and asks
 * nothing more.
 *
 * Every till, open ones first: closed (`session.closed.*`, "Open the till" with
 * `open_close_till`), open (`session.openSince`, paid in, paid out, safe drop and tips paid out with
 * `paid_in_out`, the X report, "Close the till"), or left open from an earlier day
 * (`session.leftOpen`). An open till lists what went in and out of the drawer, newest first, with
 * any receipt photo.
 */
export default function TillScreen() {
  const t = usePosT();
  const router = useRouter();
  const params = useLocalSearchParams<{ session?: string; venue?: string }>();
  const fromPush = typeof params.session === 'string' ? params.session : null;
  const venueParam = typeof params.venue === 'string' ? params.venue : null;
  const venue = useVenue();
  const posEnabled = usePosEnabled();
  const tills = useTillSessions();
  const header = <Stack.Screen options={{ headerShown: true, title: t('app.till.title') }} />;

  if (!posEnabled) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('till.off.title')} message={t('till.off.body', { venue: 'your venue' })} />
      </Screen>
    );
  }
  if (venueParam && venue.data?.id && venue.data.id !== venueParam) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('till.tab.till')} message={t('app.till.otherVenue')} />
      </Screen>
    );
  }
  if (tills.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <ListSkeleton />
      </Screen>
    );
  }
  if (tills.isError || !tills.data) {
    return (
      <Screen>
        {header}
        <ErrorState message={posErrorMessage(tills.error, t('session.error'))} onRetry={() => void tills.refetch()} />
      </Screen>
    );
  }
  const data = tills.data;
  if (!data.cash.enabled) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('till.tab.till')} message={t('app.till.notCounting')} />
      </Screen>
    );
  }
  const ordered = tillsInOrder(data.tills);
  // The push names a session that has been closed since: show its Z report.
  const closedFromPush = fromPush && !data.tills.some((x) => x.session?.id === fromPush) ? fromPush : null;

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={tills.isRefetching} onRefresh={() => void tills.refetch()} />}>
        {data.can.end_of_day ? (
          <Button label={t('app.till.eod.open')} variant="secondary" onPress={() => router.push('/checkout/end-of-day' as Href)} fullWidth />
        ) : null}
        {closedFromPush ? <ClosedSessionReport sessionId={closedFromPush} timeZone={data.timezone} /> : null}
        {ordered.map((till, i) => (
          <View key={till.id} style={posStyles.stack}>
            {i === 1 && ordered.length > 1 ? <Text variant="label">{t('session.otherTills')}</Text> : null}
            <TillCard till={till} data={data} />
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function ClosedSessionReport({ sessionId, timeZone }: { sessionId: string; timeZone: string }) {
  const detail = useTillSession(sessionId);
  if (!detail.data?.report) return null;
  return <TillReportView report={detail.data.report} timeZone={timeZone} />;
}

function TillCard({ till, data }: { till: PosTillState; data: PosTillSessionsResponse }) {
  const t = usePosT();
  const toast = useToast();
  const session = till.session;
  const detail = useTillSession(session?.id ?? null, { enabled: Boolean(session) });
  const [opening, setOpening] = useState(false);
  const [moving, setMoving] = useState<MoveKind | null>(null);
  const [tipsOut, setTipsOut] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showX, setShowX] = useState(false);
  const timeZone = data.timezone;
  const leftOpen = isLeftOpen(till, data.today);

  if (!session) {
    return (
      <Card>
        <View style={posStyles.stack}>
          <View style={posStyles.row}>
            <Text variant="subheading" style={styles.flex}>
              {t('session.closed.title', { till: till.name })}
            </Text>
            <Badge label={t('session.chip.closed')} />
          </View>
          <Text variant="bodySmall" tone="muted">
            {t('session.closed.body')}
          </Text>
          {data.can.open_close_till && till.is_active ? (
            <Button label={t('session.open')} onPress={() => setOpening(true)} fullWidth />
          ) : null}
        </View>
        <OpenTillSheet
          visible={opening}
          till={till}
          usualFloatPence={data.cash.default_float_pence}
          onClose={() => setOpening(false)}
          onOpened={(_detail, message) => {
            setOpening(false);
            toast.success(message);
          }}
        />
      </Card>
    );
  }

  const report = detail.data?.report ?? null;
  const movements = detail.data?.movements ?? [];
  return (
    <Card>
      <View style={posStyles.stack}>
        {leftOpen ? (
          <Notice tone="warning">{t('session.leftOpen', { till: till.name, date: businessDateLabel(session.business_date) })}</Notice>
        ) : null}
        <View style={posStyles.row}>
          <Text variant="subheading" style={styles.flex}>
            {till.name}
          </Text>
          <Badge label={t('session.chip.open')} tone="success" />
        </View>
        <Text variant="bodySmall" tone="muted">
          {t('session.openSince', {
            staffName: session.opened_by_name ?? 'your team',
            time: timeOfDay(session.opened_at, timeZone),
            amount: money(session.opening_float_pence),
          })}
        </Text>
        {data.can.paid_in_out ? (
          <View style={styles.actions}>
            <Button label={t('session.paidIn')} size="sm" variant="secondary" onPress={() => setMoving('paid_in')} />
            <Button label={t('session.paidOut')} size="sm" variant="secondary" onPress={() => setMoving('paid_out')} />
            <Button label={t('session.safeDrop')} size="sm" variant="secondary" onPress={() => setMoving('safe_drop')} />
            <Button label={t('session.tipsOut')} size="sm" variant="secondary" onPress={() => setTipsOut(true)} />
          </View>
        ) : null}
        <View style={styles.actions}>
          <Button label={t('session.xReport')} size="sm" variant="ghost" onPress={() => setShowX((v) => !v)} />
          {data.can.open_close_till ? <Button label={t('session.close')} size="sm" onPress={() => setClosing(true)} /> : null}
        </View>
        {showX ? (
          detail.isLoading ? (
            <Text tone="muted">{t('app.loading')}</Text>
          ) : report ? (
            <TillReportView report={report} timeZone={timeZone} canEmail={false} />
          ) : (
            <Notice tone="warning" action={{ label: t('common.tryAgain'), onPress: () => void detail.refetch() }}>
              {t('session.error')}
            </Notice>
          )
        ) : null}
        <Text variant="label">{t('app.till.moves')}</Text>
        {detail.isLoading ? (
          <Text tone="muted">{t('app.loading')}</Text>
        ) : detail.isError ? (
          <Notice tone="warning" action={{ label: t('common.tryAgain'), onPress: () => void detail.refetch() }}>
            {posErrorMessage(detail.error, t('session.error'))}
          </Notice>
        ) : movements.length === 0 ? (
          <Text variant="bodySmall" tone="muted">
            {t('app.till.moves.none')}
          </Text>
        ) : (
          movements.map((m) => <MovementRow key={m.id} movement={m} timeZone={timeZone} />)
        )}
      </View>
      <MovementSheet kind={moving} session={session} onClose={() => setMoving(null)} />
      <TipsPaidOutSheet visible={tipsOut} session={session} onClose={() => setTipsOut(false)} />
      <CloseTillSheet
        visible={closing}
        till={till}
        session={session}
        blindClose={data.cash.blind_close}
        canSeeExpected={data.can.see_expected_cash}
        expectedBeforePence={report?.expected_cash_pence ?? null}
        usualFloatPence={data.cash.default_float_pence}
        timeZone={timeZone}
        onClose={() => setClosing(false)}
      />
    </Card>
  );
}

function MovementRow({ movement, timeZone }: { movement: PosTillMovement; timeZone: string }) {
  const t = usePosT();
  const sign = movementSign(movement.kind);
  const detail = [movement.category_label, movement.note].filter(Boolean).join('. ');
  return (
    <View style={styles.move}>
      <View style={styles.flex}>
        <View style={posStyles.row}>
          <Text variant="bodyMedium" style={styles.flex}>
            {movementKindLabel(movement.kind, t)}
          </Text>
          <Text variant="bodyMedium">{money(sign * movement.amount_pence)}</Text>
        </View>
        <Text variant="caption" tone="muted">
          {t('app.till.moveBy', { time: timeOfDay(movement.occurred_at, timeZone), staffName: movement.staff_name ?? 'your team' })}
        </Text>
        {detail ? <Text variant="caption">{detail}</Text> : null}
      </View>
      {movement.photo_url ? (
        <Image source={{ uri: movement.photo_url }} style={styles.thumb} contentFit="cover" accessibilityLabel={t('app.till.photo.view')} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  move: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  thumb: { width: 44, height: 44, borderRadius: radius.sm },
});
