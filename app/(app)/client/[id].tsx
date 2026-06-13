import { format, parseISO } from 'date-fns';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { CommunicationsSection } from '@/components/clients/CommunicationsSection';
import { ComplianceSection } from '@/components/clients/ComplianceSection';
import { CustomFieldsSection } from '@/components/clients/CustomFieldsSection';
import { DocumentsSection } from '@/components/clients/DocumentsSection';
import { GdprSection } from '@/components/clients/GdprSection';
import { GuestEditSheet, type GuestEditTarget } from '@/components/clients/GuestEditSheet';
import { HouseholdSection } from '@/components/clients/HouseholdSection';
import { MarketingPreferencesCard } from '@/components/clients/MarketingPreferencesCard';
import { MergeContactDetailSheet } from '@/components/clients/MergeContactDetailSheet';
import { GuestMessageSheet, type GuestMessageTarget } from '@/components/messaging/GuestMessageSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { QuickAction } from '@/components/ui/QuickAction';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { useGuestTimeline, useSendGuestMessage, useUpdateGuest } from '@/lib/queries/useGuestMutations';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { minTouchTarget, spacing } from '@/theme/index';
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

function HistoryRow({
  booking,
  onPress,
  divider,
}: {
  booking: GuestBookingHistoryRow;
  onPress: () => void;
  divider: boolean;
}) {
  const { colors } = useTheme();
  const party =
    typeof booking.party_size === 'number' && booking.party_size > 0
      ? ` · ${booking.party_size} guest${booking.party_size === 1 ? '' : 's'}`
      : '';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.historyRow,
        divider ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : null,
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
        </Text>
      </View>
      <StatusPill
        status={booking.status}
        isTableReservation={booking.booking_model === 'table_reservation'}
      />
    </Pressable>
  );
}

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
  const { featureFlags } = useVenueContext();
  const complianceEnabled = featureFlags?.resolved?.compliance_records_enabled === true;

  const updateGuest = useUpdateGuest(guestId ?? '');
  const sendMessage = useSendGuestMessage(guestId ?? '');

  const [editTarget, setEditTarget] = useState<GuestEditTarget | null>(null);
  const [messageTarget, setMessageTarget] = useState<GuestMessageTarget | null>(null);
  const [bookingDetailId, setBookingDetailId] = useState<string | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);

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

  const handleMarketingConsentChange = async (value: boolean) => {
    try {
      await updateGuest.mutateAsync({ marketing_consent: value });
      hapticSuccess();
    } catch {
      hapticWarning();
      toast.error('Could not update marketing consent.');
    }
  };

  const handleMarketingOptOutChange = async (value: boolean) => {
    try {
      await updateGuest.mutateAsync({ marketing_opt_out: value });
      hapticSuccess();
    } catch {
      hapticWarning();
      toast.error('Could not update opt-out setting.');
    }
  };

  return (
    <Screen padded={false} scroll={false}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={detailQuery.isRefetching}
            onRefresh={() => void detailQuery.refetch()}
            tintColor={colors.brand}
          />
        }>
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
            {guest.tags.length > 0 || guest.no_show_count > 0 ? (
              <View style={styles.tagRow}>
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
            ) : null}
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

        {/* New booking CTA */}
        <Button label="New booking for this client" fullWidth onPress={handleNewBookingForClient} />

        {/* Booking history */}
        <SectionHeader title="Booking history" />
        {booking_history.length === 0 ? (
          <EmptyState
            title="No bookings yet"
            message={
              stats.days_as_customer > 0
                ? `Client since ${stats.days_as_customer} day${stats.days_as_customer === 1 ? '' : 's'} ago.`
                : 'This client has no booking history.'
            }
          />
        ) : (
          <Card padded={false}>
            {booking_history.map((booking, index) => (
              <HistoryRow
                key={booking.id}
                booking={booking}
                divider={index < booking_history.length - 1}
                onPress={() => handleBookingPress(booking.id)}
              />
            ))}
          </Card>
        )}

        {/* Marketing preferences (inline toggles with instant save) */}
        <SectionHeader title="Record & preferences" />
        <MarketingPreferencesCard
          marketingConsent={guest.marketing_consent}
          marketingOptOut={guest.marketing_opt_out}
          marketingConsentAt={guest.marketing_consent_at}
          onConsentChange={(v) => void handleMarketingConsentChange(v)}
          onOptOutChange={(v) => void handleMarketingOptOutChange(v)}
          disabled={updateGuest.isPending}
        />

        {/* Custom client fields */}
        {custom_field_definitions.length > 0 ? (
          <CustomFieldsSection
            guestId={guestId}
            definitions={custom_field_definitions}
            currentValues={guest.custom_fields}
          />
        ) : null}

        {/* Household linking */}
        <HouseholdSection
          guestId={guestId}
          onNavigateToGuest={(linkedId) => router.push(`/client/${linkedId}` as Href)}
        />

        {/* Documents */}
        <DocumentsSection guestId={guestId} />

        {/* Compliance — per-guest records + audit trail (feature-flagged, read-only) */}
        {complianceEnabled ? <ComplianceSection guestId={guestId} /> : null}

        {/* Message history */}
        <CommunicationsSection communications={communications} />

        {/* Activity timeline */}
        {timelineEvents.length > 0 ? (
          <>
            <SectionHeader title="Activity" />
            <Card>
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
            </Card>
          </>
        ) : null}

        {/* Admin section — merge + GDPR (admin only) */}
        {isAdmin ? (
          <>
            <SectionHeader title="Admin" />
            <Button
              label="Merge duplicate"
              variant="secondary"
              fullWidth
              onPress={() => setMergeOpen(true)}
            />
            <GdprSection
              guestId={guestId}
              guestName={name}
              onErased={() => router.back()}
            />
          </>
        ) : null}
      </ScrollView>

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
    gap: spacing.base,
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
