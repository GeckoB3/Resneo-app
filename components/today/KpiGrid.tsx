import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';

import type { DashboardTodayStats } from '@/types/dashboard';

type KpiProps = {
  label: string;
  value: string;
  hint?: string;
  hint2?: string;
};

function Kpi({ label, value, hint, hint2 }: KpiProps) {
  return (
    <Card style={styles.kpi}>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="display" numberOfLines={1} style={styles.kpiValue}>
        {value}
      </Text>
      {hint ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
      {hint2 ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {hint2}
        </Text>
      ) : null}
    </Card>
  );
}

type KpiGridProps = {
  today: DashboardTodayStats;
  isAppointment: boolean;
};

export function KpiGrid({ today, isAppointment }: KpiGridProps) {

  const bookings = today.bookings;
  const confirmed = today.confirmed;
  const pending = today.pending;
  const seated = today.seated;

  const attendancePct =
    bookings > 0 ? Math.round((confirmed / bookings) * 100) : null;

  // "Today" tile
  const todayValue = String(isAppointment ? bookings : today.covers);
  const todayHint = isAppointment
    ? bookings > 0
      ? `${confirmed}/${bookings} confirmed`
      : undefined
    : bookings > 0
    ? `${bookings} booking${bookings !== 1 ? 's' : ''}`
    : undefined;

  // "Confirmed" tile
  const confirmedValue = bookings > 0 ? `${confirmed}/${bookings}` : '—';
  const confirmedHint =
    bookings > 0 && attendancePct != null
      ? `${attendancePct}% of bookings`
      : 'No bookings today';
  const confirmedHint2 =
    pending > 0 || seated > 0
      ? [
          seated > 0 ? `${seated} seated` : '',
          pending > 0 ? `${pending} pending` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : undefined;

  const nextLabel = today.next_booking ? today.next_booking.time : '—';
  const nextHint = today.next_booking
    ? isAppointment
      ? 'next appointment'
      : `party of ${today.next_booking.party_size}`
    : isAppointment
    ? 'no upcoming'
    : 'no upcoming';

  return (
    <View style={styles.grid}>
      <Kpi
        label={isAppointment ? 'Today' : 'Covers today'}
        value={todayValue}
        hint={todayHint}
      />
      <Kpi
        label={isAppointment ? 'Confirmed' : 'Confirmed'}
        value={confirmedValue}
        hint={confirmedHint}
        hint2={confirmedHint2}
      />
      {!isAppointment ? (
        <Kpi
          label="Arriving soon"
          value={String(today.arriving_within_30_min)}
          hint="next 30 min"
        />
      ) : null}
      <Kpi label="Next up" value={nextLabel} hint={nextHint} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kpi: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 140,
    gap: 2,
  },
  kpiValue: {
    fontVariant: ['tabular-nums'],
  },
});
