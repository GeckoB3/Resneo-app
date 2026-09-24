import { StyleSheet, View } from 'react-native';

import { StatTile } from '@/components/ui/StatTile';
import { useTileBasis } from '@/lib/responsive';
import { spacing } from '@/theme/index';

import type { DashboardForecastDay, DashboardTodayStats } from '@/types/dashboard';

type KpiGridProps = {
  today: DashboardTodayStats;
  isAppointment: boolean;
  /**
   * The counts are appointments. On an appointments venue the server counts
   * appointments only (web QA A-2, 2026-09-23), so the captions say
   * "appointments". The "Other booking types" grid leaves this off: those are
   * classes, events and resources, so it keeps "bookings".
   */
  countsAppointments?: boolean;
  /** 7-day forecast — feeds the inline sparkline on the primary "Today" tile. */
  forecast?: DashboardForecastDay[];
};

export function KpiGrid({ today, isAppointment, countsAppointments = false, forecast }: KpiGridProps) {
  // Two across on a phone, four on a tablet: the same four numbers, rather
  // than two half-window tiles each holding one short line.
  const flexBasis = useTileBasis();
  const bookings = today.bookings;
  const confirmed = today.confirmed;
  const pending = today.pending;
  const seated = today.seated;

  // Clamp to 100 — a status-count race (confirmed > bookings) must never render
  // an impossible ">100% of bookings" caption.
  const attendancePct =
    bookings > 0 ? Math.min(100, Math.round((confirmed / bookings) * 100)) : null;

  // Sparkline series — appointments trend on bookings, dining on covers (web parity).
  const spark = (forecast ?? []).map((f) => (isAppointment ? f.bookings : f.covers));

  // "Today" / "Covers today" tile (primary — carries the trend sparkline).
  const todayValue = String(isAppointment ? bookings : today.covers);
  const todayCaption = isAppointment
    ? bookings > 0
      ? `${confirmed}/${bookings} confirmed`
      : undefined
    : bookings > 0
    ? `${bookings} booking${bookings !== 1 ? 's' : ''}`
    : undefined;

  // "Confirmed" tile
  const countNoun = countsAppointments ? 'appointments' : 'bookings';
  const confirmedValue = bookings > 0 ? `${confirmed}/${bookings}` : '—';
  const confirmedCaption =
    bookings > 0 && attendancePct != null ? `${attendancePct}% of ${countNoun}` : `No ${countNoun} today`;
  const confirmedExtra =
    pending > 0 || seated > 0
      ? [seated > 0 ? `${seated} seated` : '', pending > 0 ? `${pending} pending` : '']
          .filter(Boolean)
          .join(' · ')
      : undefined;

  const nextValue = today.next_booking ? today.next_booking.time : '—';
  const nextCaption = today.next_booking
    ? countsAppointments
      ? 'next appointment'
      : isAppointment
        ? 'next booking'
        : `party of ${today.next_booking.party_size}`
    : 'no upcoming';

  return (
    <View style={styles.grid}>
      <StatTile
        style={[styles.kpi, { flexBasis }]}
        label={isAppointment ? 'Today' : 'Covers today'}
        value={todayValue}
        caption={todayCaption}
        sparkline={spark.length >= 2 ? spark : undefined}
      />
      <StatTile
        style={[styles.kpi, { flexBasis }]}
        label="Confirmed"
        value={confirmedValue}
        caption={confirmedExtra ? `${confirmedCaption} · ${confirmedExtra}` : confirmedCaption}
      />
      {!isAppointment ? (
        <StatTile
          style={[styles.kpi, { flexBasis }]}
          label="Arriving soon"
          value={String(today.arriving_within_30_min)}
          caption="next 30 min"
        />
      ) : null}
      <StatTile style={[styles.kpi, { flexBasis }]} label="Next up" value={nextValue} caption={nextCaption} />
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
    minWidth: 140,
  },
});
