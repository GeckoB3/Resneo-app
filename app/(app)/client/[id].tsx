import { format, parseISO } from 'date-fns';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
  type SectionListRenderItem,
} from 'react-native';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { CommunicationsSection } from '@/components/clients/CommunicationsSection';
import { ComplianceSection } from '@/components/clients/ComplianceSection';
import { CustomFieldsSection } from '@/components/clients/CustomFieldsSection';
import { DocumentsSection } from '@/components/clients/DocumentsSection';
import { GdprSection } from '@/components/clients/GdprSection';
import { GuestEditSheet, type GuestEditTarget } from '@/components/clients/GuestEditSheet';
import { GuestTagEditor } from '@/components/clients/GuestTagEditor';
import { HouseholdSection } from '@/components/clients/HouseholdSection';
import { MarketingPreferencesCard } from '@/components/clients/MarketingPreferencesCard';
import { MergeContactDetailSheet } from '@/components/clients/MergeContactDetailSheet';
import { GuestMessageSheet, type GuestMessageTarget } from '@/components/messaging/GuestMessageSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LiveDot } from '@/components/ui/LiveDot';
import { QuickAction } from '@/components/ui/QuickAction';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence } from '@/lib/format';
import { bookingSourceLabel } from '@/lib/booking/booking-source-label';
import { calendarDateInTimeZone } from '@/lib/dates/venue-dates';
import {
  bookingsOnFileLabel,
  formatCalendarDayShort,
  formatNextBookingSummary,
  formatRelativeVisitDate,
  visitCountLabel,
} from '@/lib/guests/contact-formatting';
import { guestBookingsSummary, splitGuestHistory } from '@/lib/guests/guest-history-sections';
import { marketingSummaryHint } from '@/lib/guests/marketing-permission';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { useGuestTimeline, useSendGuestMessage, useUpdateGuest } from '@/lib/queries/useGuestMutations';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  GuestBookingHistoryRow,
  GuestDetailProfile,
  GuestDetailStats,
} from '@/types/guest-detail';

function formatTimelineTime(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}

function formatBookingDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'EEE d MMM');
  } catch {
    return dateStr;
  }
}

function formatGuestName(guest: GuestDetailProfile): string {
  const parts = [guest.first_name, guest.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unnamed guest';
}

const formatCurrencyPence = (pence: number): string => formatPence(pence) ?? '—';

/** One column in the stats card — value over a muted caption label. */
function StatColumn({ label, value, divider }: { label: string; value: string; divider: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.statCol,
        divider ? { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border } : null,
      ]}>
      <Text variant="heading">{value}</Text>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * One booking-history row. Rows are virtualized in a FlatList, so the Card
 * chrome (surface, border, rounded corners) that used to wrap the whole list is
 * applied per-row here: side borders on every row, top/bottom borders + rounded
 * corners on the first/last, and a hairline divider between rows.
 */
function HistoryRow({
  booking,
  onPress,
  isFirst,
  isLast,
}: {
  booking: GuestBookingHistoryRow;
  onPress: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { colors } = useTheme();
  const party =
    typeof booking.party_size === 'number' && booking.party_size > 0
      ? ` · ${booking.party_size} guest${booking.party_size === 1 ? '' : 's'}`
      : '';
  // How it was made ("Online", "Phone", "Walk-in"), so the history reads at a glance (web #190).
  const sourceLabel = bookingSourceLabel(booking.source);
  const source = sourceLabel ? ` · ${sourceLabel}` : '';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.historyRow,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderLeftWidth: StyleSheet.hairlineWidth,
          borderRightWidth: StyleSheet.hairlineWidth,
          // Hairline on every row: a divider between rows and the card's bottom edge.
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        isFirst ? styles.historyRowFirst : null,
        isLast ? styles.historyRowLast : null,
        pressed ? styles.pressed : null,
      ]}>
      <View style={styles.historyTime}>
        <Text variant="label">{formatBookingDate(booking.booking_date)}</Text>
        {booking.booking_time ? (
          <Text variant="caption" tone="muted">
            {booking.booking_time.slice(0, 5)}
          </Text>
        ) : null}
      </View>
      <View style={styles.historyMain}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {booking.detail_label}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {booking.kind_label}
          {party}
          {source}
        </Text>
      </View>
      <StatusPill
        status={booking.status}
        isTableReservation={booking.booking_model === 'table_reservation'}
      />
    </Pressable>
  );
}

/**
 * What counts as a next visit — the web's `UPCOMING_BOOKING_STATUSES`
 * (`lib/guests/guest-contacts-list.ts`), the same set the directory row's
 * "next booking" is built from.
 */
const NEXT_VISIT_STATUSES: string[] = ['Pending', 'Booked', 'Confirmed', 'Seated'];

function statTiles(stats: GuestDetailStats): { label: string; value: string }[] {
  return [
    { label: 'Bookings', value: String(stats.total_bookings) },
    { label: 'No-shows', value: String(stats.no_shows) },
    { label: 'Cancelled', value: String(stats.cancellations) },
    {
      label: 'Deposits',
      value: stats.total_deposit_pence_paid > 0 ? formatCurrencyPence(stats.total_deposit_pence_paid) : '—',
    },
  ];
}

export default function ClientDetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const guestId = typeof id === 'string' ? id : undefined;
  const detailQuery = useGuestDetail(guestId);
  const timelineQuery = useGuestTimeline(guestId);
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  const { featureFlags, terminology, venue } = useVenueContext();
  const complianceEnabled = featureFlags?.resolved?.compliance_records_enabled === true;

  const updateGuest = useUpdateGuest(guestId ?? '');
  const sendMessage = useSendGuestMessage(guestId ?? '');

  // Realtime: keep THIS open profile fresh. The list screen subscribes venue-wide;
  // here we watch the same tables (a new/changed booking moves the contact's stats
  // and history; a guest edit changes the profile/tags) but scope the refresh work
  // to this screen's two queries instead of refetching the whole directory. The
  // hook adds a per-instance channel suffix, so this never collides with the list's
  // venue-wide channel when both happen to be mounted.
  const venueId = venue?.id;
  const venueFilter = venueId ? `venue_id=eq.${venueId}` : undefined;
  const liveState = useVenueLiveSync({
    venueId,
    subscriptions: [
      { table: 'bookings', filter: venueFilter },
      { table: 'guests', filter: venueFilter },
    ],
    onRefresh: useCallback(() => {
      void detailQuery.refetch();
      void timelineQuery.refetch();
    }, [detailQuery, timelineQuery]),
    enabled: Boolean(venueId && guestId),
  });

  const [editTarget, setEditTarget] = useState<GuestEditTarget | null>(null);
  const [messageTarget, setMessageTarget] = useState<GuestMessageTarget | null>(null);
  const [bookingDetailId, setBookingDetailId] = useState<string | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  /**
   * The "Guest bookings" accordion (web `GuestBookingsForGuestAccordion`):
   * closed on open, with the counts on its header, and the visits behind it
   * split into upcoming and previous. The rows are the list's sections rather
   * than the card's body so they stay virtualised.
   */
  const [bookingsOpen, setBookingsOpen] = useState(false);
  const historySections = useMemo(() => {
    const rows = detailQuery.data?.booking_history ?? [];
    return splitGuestHistory(rows, new Date(), venue?.timezone ?? 'Europe/London');
  }, [detailQuery.data?.booking_history, venue?.timezone]);
  const historyListSections = useMemo(
    () => [
      { title: 'Upcoming', data: historySections.upcoming },
      { title: 'Previous', data: historySections.previous },
    ],
    [historySections],
  );
  // The venue's calendar day, so a visit reads "Today"/"Tomorrow" by the
  // venue's clock rather than the phone's.
  const todayCalendar = useMemo(
    () => calendarDateInTimeZone(new Date(), venue?.timezone ?? 'Europe/London'),
    [venue?.timezone],
  );

  const handleBookingPress = useCallback((bookingId: string) => {
    setBookingDetailId(bookingId);
  }, []);

  const handleNewBookingForClient = useCallback(() => {
    if (!guestId) return;
    router.push({ pathname: '/booking/new', params: { guestId } } as never);
  }, [guestId, router]);

  const tiles = useMemo(
    () => (detailQuery.data ? statTiles(detailQuery.data.stats) : []),
    [detailQuery.data],
  );

  if (!guestId) {
    return (
      <Screen>
        <ErrorState message="Missing client id in the route." />
      </Screen>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <Screen padded={false}>
        <DetailSkeleton />
      </Screen>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    const message =
      detailQuery.error instanceof ApiError
        ? detailQuery.error.message
        : detailQuery.error?.message ?? 'Could not load this client.';
    return (
      <Screen>
        <ErrorState message={message} onRetry={() => void detailQuery.refetch()} />
      </Screen>
    );
  }

  const { guest, stats, booking_history, communications, custom_field_definitions } = detailQuery.data;
  const name = formatGuestName(guest);
  const phone = guest.phone?.trim() ?? '';
  const email = guest.email?.trim() ?? '';
  const canMessage = !!email || !!phone;
  const canCall = !!phone;
  const canEmail = !!email;
  const addressLines = [
    guest.address_line1,
    guest.address_line2,
    [guest.address_city, guest.address_postcode].filter(Boolean).join(' '),
  ]
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line));
  const timelineEvents = timelineQuery.data?.events ?? [];

  // One-line hint for the collapsed "Marketing preferences" card — the web's
  // marketingHint: opt-out wins, a recorded consent reads "Subscribed".
  const marketingSummary = marketingSummaryHint(guest);

  // Profile header figures — web ContactDetailPanel (~250-270): the visit-count
  // pill beside the name and the bookings-on-file line under it.
  const visitPill = visitCountLabel(guest.visit_count);
  const bookingsOnFile = bookingsOnFileLabel(stats.total_bookings, terminology.booking);

  // Last / Next visit tiles (web ~505-535). The next visit is the soonest
  // still-live booking in the history the route returned.
  const lastVisitDate = guest.last_visit_date ?? stats.last_visit_date ?? null;
  const lastVisitDay = formatCalendarDayShort(lastVisitDate, todayCalendar);
  const lastVisitRelative =
    lastVisitDate && lastVisitDay !== 'Today' && lastVisitDay !== 'Tomorrow'
      ? formatRelativeVisitDate(lastVisitDate)
      : null;
  const nextVisit = historySections.upcoming.find((row) =>
    NEXT_VISIT_STATUSES.includes(row.status),
  );
  const nextVisitLabel = nextVisit
    ? formatNextBookingSummary(nextVisit.booking_date, nextVisit.booking_time, todayCalendar)
    : null;

  const openEdit = () =>
    setEditTarget({
      id: guest.id,
      firstName: guest.first_name ?? '',
      lastName: guest.last_name ?? '',
      phone: guest.phone ?? '',
      email: guest.email ?? '',
      notes: guest.customer_profile_notes ?? '',
      tags: guest.tags.join(', '),
      marketingConsent: guest.marketing_consent,
      marketingOptOut: guest.marketing_opt_out,
      addressLine1: guest.address_line1 ?? '',
      addressLine2: guest.address_line2 ?? '',
      addressCity: guest.address_city ?? '',
      addressPostcode: guest.address_postcode ?? '',
    });

  const openMessage = () =>
    setMessageTarget({ id: guest.id, guestName: name, email: guest.email, phone: guest.phone });

  /** Open an external URL, surfacing a toast if the handler is unavailable. */
  const openLink = async (url: string, failure: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      toast.error(failure);
    }
  };

  const handleCall = () => {
    if (!phone) return;
    void openLink(`tel:${phone}`, 'Could not start a call.');
  };

  const handleEmail = () => {
    if (!email) return;
    void openLink(`mailto:${email}`, 'Could not open mail.');
  };

  // Recording a consent lifts a standing opt-out, and opting out withdraws
  // the consent (web 2026-09-10): the server does the same, and sending both
  // keeps the toggles right before the refetch lands.
  const handleMarketingConsentChange = async (value: boolean) => {
    try {
      await updateGuest.mutateAsync(
        value ? { marketing_consent: true, marketing_opt_out: false } : { marketing_consent: false },
      );
      hapticSuccess();
    } catch {
      hapticWarning();
      toast.error('Could not update marketing consent.');
    }
  };

  const handleMarketingOptOutChange = async (value: boolean) => {
    try {
      await updateGuest.mutateAsync(
        value ? { marketing_opt_out: true, marketing_consent: false } : { marketing_opt_out: false },
      );
      hapticSuccess();
    } catch {
      hapticWarning();
      toast.error('Could not update opt-out setting.');
    }
  };

  type HistorySection = SectionListData<GuestBookingHistoryRow, { title: string }>;
  const renderHistoryRow: SectionListRenderItem<GuestBookingHistoryRow, { title: string }> = ({
    item,
    index,
    section,
  }) => (
    <HistoryRow
      booking={item}
      isFirst={index === 0}
      isLast={index === section.data.length - 1}
      onPress={() => handleBookingPress(item.id)}
    />
  );
  const renderHistorySectionHeader = ({ section }: { section: HistorySection }) => (
    <Text variant="overline" tone="muted" style={styles.historySectionLabel}>
      {section.title}
    </Text>
  );
  // The web says "None" under an empty group rather than dropping it.
  const renderHistorySectionFooter = ({ section }: { section: HistorySection }) =>
    section.data.length === 0 ? (
      <Text variant="caption" tone="muted" style={styles.historySectionEmpty}>
        None
      </Text>
    ) : null;

  // Everything above the (virtualized) booking-history list. The booking rows
  // are the FlatList data; the profile chrome + section header ride along here.
  const listHeader = (
    <View style={styles.headerStack}>
      {/* Profile hero — identity, tags, and quick contact actions */}
      <Card>
          <View style={styles.profile}>
            <Avatar name={name} size={72} />
            <Text variant="title" numberOfLines={1} style={styles.profileName}>
              {name}
            </Text>
            {phone || email ? (
              <Text variant="bodySmall" tone="muted" numberOfLines={1} style={styles.profileContact}>
                {[phone, email].filter(Boolean).join('  ·  ')}
              </Text>
            ) : null}
            {/* "4 appointments on file", in the venue's word for a booking. */}
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {bookingsOnFile}
            </Text>
            <View style={styles.tagRow}>
              {/* Visit count, or "New" for a contact who has not been in yet. */}
              <Badge label={visitPill} tone="neutral" />
              {guest.no_show_count > 0 ? (
                <Badge
                  label={`${guest.no_show_count} no-show${guest.no_show_count === 1 ? '' : 's'}`}
                  tone="warning"
                />
              ) : null}
              {guest.tags.map((tag) => (
                <Badge key={tag} label={tag} tone="brand" />
              ))}
            </View>
            <View style={styles.quickRow}>
              {canCall ? (
                <QuickAction
                  icon={{ ios: 'phone.fill', android: 'call', web: 'call' }}
                  label="Call"
                  onPress={handleCall}
                />
              ) : null}
              {canMessage ? (
                <QuickAction
                  icon={{ ios: 'message.fill', android: 'chat', web: 'chat' }}
                  label="Message"
                  onPress={openMessage}
                />
              ) : null}
              {canEmail ? (
                <QuickAction
                  icon={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}
                  label="Email"
                  onPress={handleEmail}
                />
              ) : null}
              <QuickAction
                icon={{ ios: 'pencil', android: 'edit', web: 'edit' }}
                label="Edit"
                onPress={openEdit}
              />
            </View>
          </View>
        </Card>

        {/* Last / Next visit — the web's two profile tiles. */}
        <View style={styles.visitTiles}>
          <Card style={styles.visitTile}>
            <Text variant="overline" tone="muted">
              Last visit
            </Text>
            <Text variant="bodyMedium">{lastVisitDay}</Text>
            {lastVisitRelative ? (
              <Text variant="caption" tone="muted">
                {lastVisitRelative}
              </Text>
            ) : null}
          </Card>
          <Card style={styles.visitTile}>
            <Text variant="overline" tone="muted">
              Next visit
            </Text>
            <Text variant="bodyMedium" tone={nextVisitLabel ? 'brand' : 'muted'}>
              {nextVisitLabel ?? 'None scheduled'}
            </Text>
          </Card>
        </View>

        {/* Address — shown only when captured (client-address services). */}
        {addressLines.length > 0 ? (
          <Card>
            <Text variant="label">Address</Text>
            {addressLines.map((line, index) => (
              <Text key={index} variant="bodySmall" tone="secondary">
                {line}
              </Text>
            ))}
          </Card>
        ) : null}

        {/* Stats */}
        <Card padded={false}>
          <View style={styles.statsCard}>
            {tiles.map((t, i) => (
              <StatColumn key={t.label} label={t.label} value={t.value} divider={i > 0} />
            ))}
          </View>
        </Card>

        {/* Notes */}
        <Card>
          <Text variant="label">Notes</Text>
          {guest.customer_profile_notes ? (
            <Text variant="bodySmall" tone="secondary" style={styles.notesText}>
              {guest.customer_profile_notes}
            </Text>
          ) : (
            <Text variant="bodySmall" tone="muted" style={styles.notesText}>
              No notes — tap Edit to add
            </Text>
          )}
        </Card>

        {/* Inline tag editor — add/remove chips with a typeahead from venue tags */}
        <Card>
          <GuestTagEditor
            tags={guest.tags}
            onTagsChange={(next) => updateGuest.mutateAsync({ tags: next })}
            disabled={updateGuest.isPending}
          />
        </Card>

      {/* New booking CTA */}
      <Button label="New booking for this client" fullWidth onPress={handleNewBookingForClient} />

      {/* Guest bookings — the web's closed accordion, its counts on the header.
          Opening it renders the Upcoming / Previous sections below this header
          (the list's sections), so the rows stay virtualised. */}
      <CollapsibleCard
        title="Guest bookings"
        summary={booking_history.length === 0 ? 'No bookings yet' : guestBookingsSummary(historySections)}
        marker={<LiveDot state={liveState} />}
        expanded={bookingsOpen}
        onToggle={() => setBookingsOpen((open) => !open)}>
        {booking_history.length === 0 ? (
          <EmptyState
            title="No bookings yet"
            message={
              stats.days_as_customer > 0
                ? `Client since ${stats.days_as_customer} day${stats.days_as_customer === 1 ? '' : 's'} ago.`
                : 'This client has no booking history.'
            }
          />
        ) : null}
      </CollapsibleCard>
    </View>
  );

  // Everything below the booking-history list (rendered after the rows). The
  // secondary sections collapse into tap-to-expand cards (web accordion parity),
  // so a contact with history is no longer one very long unconditional scroll —
  // and the destructive Erase action is tucked inside the collapsed Admin card.
  const listFooter = (
    <View style={styles.footerStack}>
      <SectionHeader title="More details" />

      {/* Marketing preferences (inline toggles with instant save) */}
      <MarketingPreferencesCard
        marketingConsent={guest.marketing_consent}
        marketingOptOut={guest.marketing_opt_out}
        marketingConsentAt={guest.marketing_consent_at}
        onConsentChange={(v) => void handleMarketingConsentChange(v)}
        onOptOutChange={(v) => void handleMarketingOptOutChange(v)}
        disabled={updateGuest.isPending}
        collapsible
        summary={marketingSummary}
      />

      {/* Custom client fields */}
      {custom_field_definitions.length > 0 ? (
        <CustomFieldsSection
          guestId={guestId}
          definitions={custom_field_definitions}
          currentValues={guest.custom_fields}
          collapsible
        />
      ) : null}

      {/* Household linking */}
      <HouseholdSection
        guestId={guestId}
        onNavigateToGuest={(linkedId) => router.push(`/client/${linkedId}` as Href)}
        collapsible
      />

      {/* Records: the guest's documents and photos (web 2026-09-05); the booking
          detail shows the same card for the same person. */}
      <DocumentsSection guestId={guestId} collapsible />

      {/* Compliance — per-guest records + audit trail (feature-flagged, read-only) */}
      {complianceEnabled ? <ComplianceSection guestId={guestId} /> : null}

      {/* Message history — default-opens when there is history (web parity) */}
      <CommunicationsSection communications={communications} collapsible />

      {/* Activity timeline */}
      {timelineEvents.length > 0 ? (
        <CollapsibleCard
          title="Activity"
          summary={`${timelineEvents.length} event${timelineEvents.length === 1 ? '' : 's'}`}>
          {timelineEvents.map((event) => (
            <View key={event.id} style={styles.timelineRow}>
              <Text variant="bodySmall" numberOfLines={2}>
                {event.label}
              </Text>
              <Text variant="caption" tone="muted">
                {formatTimelineTime(event.occurred_at)}
              </Text>
            </View>
          ))}
        </CollapsibleCard>
      ) : null}

      {/* Admin section — merge + GDPR (admin only). Collapsed by default so the
          destructive "Erase data" is not an always-visible bottom-of-screen CTA. */}
      {isAdmin ? (
        <CollapsibleCard title="Admin" summary="Merge & data tools">
          <Button
            label="Merge duplicate"
            variant="secondary"
            fullWidth
            onPress={() => setMergeOpen(true)}
            style={styles.adminMergeButton}
          />
          <GdprSection
            guestId={guestId}
            guestName={name}
            onErased={() => router.back()}
            bare
          />
        </CollapsibleCard>
      ) : null}
    </View>
  );

  return (
    <Screen padded={false} scroll={false}>
      <SectionList
        // Closed: no sections at all, so the "More details" footer follows the
        // header straight away, as the web's closed accordion reads.
        sections={bookingsOpen && booking_history.length > 0 ? historyListSections : []}
        keyExtractor={(booking) => booking.id}
        renderItem={renderHistoryRow}
        renderSectionHeader={renderHistorySectionHeader}
        renderSectionFooter={renderHistorySectionFooter}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={styles.scrollContent}
        initialNumToRender={12}
        windowSize={11}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={detailQuery.isRefetching}
            onRefresh={() => void detailQuery.refetch()}
            tintColor={colors.brand}
          />
        }
      />

      <GuestEditSheet target={editTarget} onClose={() => setEditTarget(null)} />
      <GuestMessageSheet
        target={messageTarget}
        onSend={(input) => sendMessage.mutateAsync(input)}
        sending={sendMessage.isPending}
        onClose={() => setMessageTarget(null)}
      />

      {/* Booking detail drill-through — stays within contact context */}
      <BookingDetailSheet
        bookingId={bookingDetailId}
        onClose={() => setBookingDetailId(null)}
        onOpenFull={(bId) => {
          setBookingDetailId(null);
          router.push(`/booking/${bId}` as Href);
        }}
      />

      {/* Merge wizard — admin only */}
      {isAdmin ? (
        <MergeContactDetailSheet
          currentGuestId={guestId}
          currentGuest={guest}
          visible={mergeOpen}
          onClose={() => setMergeOpen(false)}
          onMerged={(survivorId) => {
            setMergeOpen(false);
            if (survivorId === guestId) {
              // We are already on the surviving contact — just refresh
              void detailQuery.refetch();
            } else {
              // Navigate to the other (surviving) contact
              router.replace(`/client/${survivorId}` as Href);
            }
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  // The list header/footer reproduce the old ScrollView's spacing.base gap
  // between stacked cards; the booking rows themselves stay flush (one card).
  headerStack: {
    gap: spacing.base,
  },
  footerStack: {
    gap: spacing.base,
    marginTop: spacing.base,
  },
  profile: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  profileName: {
    textAlign: 'center',
    maxWidth: '100%',
  },
  profileContact: {
    textAlign: 'center',
    maxWidth: '100%',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.base,
    marginTop: spacing.xs,
  },
  visitTiles: {
    flexDirection: 'row',
    gap: spacing.base,
  },
  visitTile: {
    flex: 1,
    gap: 2,
  },
  statsCard: {
    flexDirection: 'row',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.base,
    gap: spacing.xs,
  },
  timelineRow: {
    paddingVertical: spacing.sm,
    gap: 2,
  },
  adminMergeButton: {
    marginBottom: spacing.base,
  },
  notesText: {
    marginTop: spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  historySectionLabel: {
    // Gap from the accordion header (or the group above) to this group's label.
    marginTop: spacing.base,
  },
  historySectionEmpty: {
    marginTop: spacing.xs,
  },
  historyRowFirst: {
    // Gap from the group label above + the card's top edge.
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
  historyRowLast: {
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
  },
  pressed: {
    opacity: 0.7,
  },
  historyTime: {
    width: 84,
    gap: 2,
  },
  historyMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
