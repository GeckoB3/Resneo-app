/**
 * The Collective area's other tabs, as the web's (2026-09-17):
 *
 *   MemberServicesList  a member's services tab (web `MemberServicesList` in CollectiveAreaClient)
 *   VenuesPanel         the host's Venues tab (web `CollectiveVenuesPanel`)
 *   HistoryPanel        the History tab (web `CollectiveHistoryPanel`)
 */
import { useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { EndCollectiveCard, SyncBadge } from '@/components/collective-area/AreaPieces';
import { InviteVenueSheet } from '@/components/collective-area/InviteVenueSheet';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { areaCopy } from '@/lib/collective-area/copy';
import { invitedVenueStatus } from '@/lib/collective-area/invite-links';
import {
  groupStatus,
  hiddenPillVenue,
  type AreaService,
  type CollectiveCalendarGroup,
  type HistoryFilter,
} from '@/lib/collective-area/model';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import {
  shareHistoryCsv,
  useCollectiveHistory,
  useCollectiveMembersPatch,
  type HistoryQuery,
} from '@/lib/queries/useCollectiveArea';
import { useInviteCheck } from '@/lib/queries/useCollectiveLinks';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

// ---------------------------------------------------------------------------
// A member's services
// ---------------------------------------------------------------------------

export function MemberServicesList({
  services,
  hostName,
  collectiveName,
  onChooseCalendars,
}: {
  services: AreaService[];
  hostName: string;
  collectiveName: string;
  /**
   * A page service tapped: choose which of this venue's calendars offer it, on this screen (owner,
   * 2026-10-29; it used to send the member to the Services screen).
   */
  onChooseCalendars: (serviceId: string) => void;
}) {
  const { colors } = useTheme();
  const onPage = services.filter((s) => s.collective?.role === 'replica');
  const parked = services.filter((s) => s.collective?.role === 'parked');
  const retired = services.filter((s) => s.collective?.role === 'retired');
  /**
   * The parked services are also under Your services above, with their ticks, and the retired ones
   * need nothing doing: both start folded, count in the heading, so the list on the page is what a
   * member sees first (web 2026-10-28: a member scrolled past 31 rows to reach nothing).
   */
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const section = (
    id: string,
    title: string,
    caption: string,
    rows: AreaService[],
    badge: (s: AreaService) => React.ReactNode,
    folded = false,
  ) => {
    if (rows.length === 0) return null;
    const shown = !folded || open[id] === true;
    const heading = (
      <Text variant="label" style={styles.flex1}>
        {title} <Text variant="bodySmall" tone="muted">{`(${rows.length})`}</Text>
      </Text>
    );
    return (
      <View style={styles.section}>
        {folded ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: shown }}
            accessibilityLabel={`${title} (${rows.length})`}
            onPress={() => setOpen((prev) => ({ ...prev, [id]: !shown }))}
            style={styles.foldHead}
          >
            {heading}
            <SymbolView
              name={
                shown
                  ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }
                  : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }
              }
              tintColor={colors.textMuted}
              size={16}
            />
          </Pressable>
        ) : (
          heading
        )}
        {shown ? (
          <>
            <Text variant="caption" tone="secondary">
              {caption}
            </Text>
            <Card padded={false}>
              {rows.map((s, index) => {
                const rowStyle = [styles.memberRow, index > 0 ? [styles.rowDivider, { borderTopColor: colors.border }] : null];
                const content = (
                  <>
                    <Text variant="bodySmall" style={styles.flex1}>
                      {s.name}
                    </Text>
                    {badge(s)}
                  </>
                );
                // A service on the page: tap it to choose its calendars here.
                return s.collective?.role === 'replica' ? (
                  <Pressable
                    key={s.id}
                    accessibilityRole="button"
                    accessibilityLabel={areaCopy('ms.openService', { service: s.name })}
                    onPress={() => onChooseCalendars(s.id)}
                    style={({ pressed }) => [rowStyle, styles.tapRow, pressed ? { opacity: 0.6 } : null]}
                  >
                    {content}
                    <SymbolView
                      name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                      tintColor={colors.textMuted}
                      size={14}
                    />
                  </Pressable>
                ) : (
                  <View key={s.id} style={rowStyle}>
                    {content}
                  </View>
                );
              })}
            </Card>
          </>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.stack}>
      <Text variant="bodySmall" tone="secondary">
        Tap a service to choose which of your calendars offer it.
      </Text>
      {section(
        'on-page',
        areaCopy('svc.member.section.fromHostTitle', { host: hostName, collective: collectiveName }),
        areaCopy('svc.member.section.fromHostCaption', { host: hostName, collective: collectiveName }),
        onPage,
        (s) => {
          // Switched off by the host: on the page, but nobody can book it (web 2026-10-28).
          if (s.is_active === false) {
            return (
              <Text variant="caption" color={colors.warning} style={styles.switchedOffNote}>
                {areaCopy('svc.member.switchedOff', { host: hostName })}
              </Text>
            );
          }
          const block = s.collective!;
          const venue = block.status === 'hidden' ? hiddenPillVenue(block.hidden_reasons) : null;
          return (
            <SyncBadge status={block.status} label={venue ? areaCopy('svc.card.hiddenAt', { venue }) : null} />
          );
        },
      )}
      {section(
        'parked',
        areaCopy('svc.member.section.parkedTitle', { collective: collectiveName }),
        areaCopy('svc.member.section.parkedCaption', { collective: collectiveName, host: hostName }),
        parked,
        () => <Badge label={areaCopy('common.pill.parked')} />,
        true,
      )}
      {section(
        'retired',
        areaCopy('svc.member.section.retired', { host: hostName }),
        areaCopy('svc.member.section.retiredCaption', { host: hostName, collective: collectiveName }),
        retired,
        () => <Badge label={areaCopy('common.pill.retired')} />,
        true,
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The host's Venues tab
// ---------------------------------------------------------------------------

export interface VenueRow {
  venue_id: string;
  venue_name: string;
  status: 'active' | 'invited';
  is_host: boolean;
  also_runs: string | null;
}

type Ask = { venue: VenueRow; kind: 'remove' | 'cancel' | 'host' | 'cancel_move' } | null;

export function VenuesPanel({
  collectiveId,
  collectiveName,
  venues,
  groups,
  serviceModel,
  pendingHost,
  onShowHistory,
  onEnded,
}: {
  collectiveId: string;
  collectiveName: string;
  venues: VenueRow[];
  groups: CollectiveCalendarGroup[];
  serviceModel: string | undefined;
  pendingHost: { venueId: string; venueName: string; transferAt: string | null } | null;
  onShowHistory: (venueId: string) => void;
  onEnded: () => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const patch = useCollectiveMembersPatch(collectiveId);
  const [asking, setAsking] = useState<Ask>(null);
  const [error, setError] = useState<string | null>(null);
  /** Inviting any venue, in its own sheet here (web `CollectiveInvitePanel`, 2026-10-28). */
  const [inviting, setInviting] = useState(false);

  const ordered = [...venues].sort((a, b) =>
    a.is_host === b.is_host
      ? a.status === b.status
        ? a.venue_name.localeCompare(b.venue_name)
        : a.status === 'active'
          ? -1
          : 1
      : a.is_host
        ? -1
        : 1,
  );

  const run = (body: Record<string, unknown>) => {
    setError(null);
    patch.mutate(body, {
      onError: (err) => setError(err instanceof ApiError ? err.message : 'That did not go through. Please try again.'),
    });
  };

  const venue = asking?.venue.venue_name ?? '';
  const sheet = !asking
    ? null
    : asking.kind === 'cancel'
      ? {
          title: areaCopy('ov.venues.cancelTitle', { venue }),
          message: areaCopy('ov.venues.cancelMessage', { venue }),
          confirm: areaCopy('bp.members.cancelInvite'),
          destructive: true,
        }
      : asking.kind === 'host'
        ? {
            title: areaCopy('transfer.ask.title', { venue, collective: collectiveName }),
            message: areaCopy('transfer.ask.message', { venue, collective: collectiveName }),
            confirm: areaCopy('transfer.ask.confirm'),
            destructive: false,
          }
        : asking.kind === 'cancel_move'
          ? {
              title: areaCopy('transfer.cancel.title', { venue }),
              message: areaCopy('transfer.cancel.message', { venue, collective: collectiveName }),
              confirm: areaCopy('transfer.cancel'),
              destructive: true,
            }
          : {
              title: areaCopy('ov.venues.removeTitle', { venue, collective: collectiveName }),
              message: areaCopy('ov.venues.removeMessage', { venue, collective: collectiveName }),
              confirm: areaCopy('ov.venues.remove'),
              destructive: true,
            };

  return (
    <View style={styles.stack}>
      <View style={styles.rowBetween}>
        <Text variant="subheading">Venues</Text>
        <Button label={areaCopy('ov.venues.invite')} variant="secondary" size="sm" onPress={() => setInviting(true)} />
      </View>

      {error ? (
        <Text variant="bodySmall" tone="danger">
          {error}
        </Text>
      ) : null}

      {pendingHost ? (
        <View style={[styles.note, { backgroundColor: colors.brandSubtle, borderColor: colors.brand }]}>
          <Text variant="bodySmall">
            {pendingHost.transferAt
              ? areaCopy('transfer.pending.scheduled', {
                  venue: pendingHost.venueName,
                  collective: collectiveName,
                  date: new Date(pendingHost.transferAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }),
                })
              : areaCopy('transfer.pending.asked', { venue: pendingHost.venueName })}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={patch.isPending}
            onPress={() =>
              setAsking({
                venue: {
                  venue_id: pendingHost.venueId,
                  venue_name: pendingHost.venueName,
                  status: 'active',
                  is_host: false,
                  also_runs: null,
                },
                kind: 'cancel_move',
              })
            }
          >
            <Text variant="label" tone="brand">
              {areaCopy('transfer.cancel')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Card padded={false}>
        {ordered.map((row, index) => {
          const group = groups.find((g) => g.venue_id === row.venue_id) ?? null;
          return (
            <View key={row.venue_id} style={[styles.venueRow, index > 0 ? [styles.rowDivider, { borderTopColor: colors.border }] : null]}>
              <Text variant="bodyMedium">
                {row.venue_name}
                {row.status === 'invited' ? ` ${areaCopy('ov.venues.invited')}` : ''}
              </Text>
              <View style={styles.badges}>
                <Badge
                  label={row.is_host ? areaCopy('ov.venues.host') : areaCopy('ov.venues.member')}
                  tone={row.is_host ? 'brand' : 'neutral'}
                />
                {row.status === 'active' && group ? <SyncBadge status={groupStatus(group)} /> : null}
              </View>
              {row.status === 'invited' ? (
                <InvitedVenueStatus collectiveId={collectiveId} venueId={row.venue_id} venueName={row.venue_name} />
              ) : null}
              {row.also_runs ? (
                <Text variant="caption" tone="muted">
                  {areaCopy('bm.members.alsoRuns', { modelList: row.also_runs })}
                </Text>
              ) : null}
              <View style={styles.actions}>
                {row.status === 'active' ? (
                  <Button
                    label={areaCopy('bp.members.history')}
                    variant="ghost"
                    size="sm"
                    onPress={() => onShowHistory(row.venue_id)}
                  />
                ) : null}
                {!row.is_host && row.status === 'active' && serviceModel === 'replicas' && !pendingHost ? (
                  <Button
                    label={areaCopy('transfer.ask.button')}
                    variant="ghost"
                    size="sm"
                    disabled={patch.isPending}
                    onPress={() => setAsking({ venue: row, kind: 'host' })}
                  />
                ) : null}
                {!row.is_host && row.status === 'active' ? (
                  <Button
                    label={areaCopy('ov.venues.remove')}
                    variant="ghost"
                    size="sm"
                    disabled={patch.isPending}
                    customColors={{ background: 'transparent', text: colors.danger }}
                    onPress={() => setAsking({ venue: row, kind: 'remove' })}
                  />
                ) : null}
                {row.status === 'invited' ? (
                  <Button
                    label={areaCopy('bp.members.cancelInvite')}
                    variant="ghost"
                    size="sm"
                    disabled={patch.isPending}
                    onPress={() => setAsking({ venue: row, kind: 'cancel' })}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </Card>

      <EndCollectiveCard collectiveId={collectiveId} collectiveName={collectiveName} onEnded={onEnded} />

      <InviteVenueSheet
        visible={inviting}
        collectiveId={collectiveId}
        collectiveName={collectiveName}
        excludeVenueIds={venues.map((v) => v.venue_id)}
        onClose={() => setInviting(false)}
        onOpenLinked={() => {
          setInviting(false);
          router.push('/linked-venues' as Href);
        }}
      />

      <ConfirmSheet
        visible={asking !== null}
        title={sheet?.title ?? ''}
        message={sheet?.message}
        confirmLabel={sheet?.confirm}
        cancelLabel="Go back"
        destructive={sheet?.destructive ?? true}
        onClose={() => setAsking(null)}
        onConfirm={() => {
          const target = asking;
          setAsking(null);
          if (!target) return;
          if (target.kind === 'host') run({ action: 'offer_host', venueId: target.venue.venue_id });
          else if (target.kind === 'cancel_move') run({ action: 'cancel_host_transfer' });
          else run({ action: 'remove', venueId: target.venue.venue_id });
        }}
      />
    </View>
  );
}

/**
 * What an invited venue is waiting for (web `InvitedVenueStatus`, 2026-10-28): the venues whose
 * link with it has less than full access, or otherwise the venue itself (every other link is made
 * as it joins). Read from the same check the invite sheet uses, so the two never disagree; on a
 * failed read the row still says "(invited)".
 */
function InvitedVenueStatus({ collectiveId, venueId, venueName }: { collectiveId: string; venueId: string; venueName: string }) {
  const check = useInviteCheck(collectiveId, venueId);
  if (!check.data || !Array.isArray(check.data.links)) return null;
  return (
    <Text variant="caption" tone="secondary">
      {invitedVenueStatus(check.data, venueName)}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export function HistoryPanel({
  collectiveId,
  collectiveName,
  venues,
  initialVenueId,
}: {
  collectiveId: string;
  collectiveName: string;
  venues: { venue_id: string; venue_name: string }[];
  initialVenueId: string | null;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const accessToken = useAccessToken();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [venueId, setVenueId] = useState<string | null>(initialVenueId);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const q: HistoryQuery = { filter, venueId, from, to };
  const history = useCollectiveHistory(collectiveId, q);
  const events = history.data?.pages.flatMap((p) => p.events) ?? [];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <View style={styles.stack}>
      <Text variant="subheading">{areaCopy('history.title', { collective: collectiveName })}</Text>
      <Segmented<HistoryFilter>
        options={[
          { value: 'all', label: areaCopy('history.filter.all') },
          { value: 'services', label: areaCopy('history.filter.services') },
          { value: 'calendars', label: areaCopy('history.filter.calendars') },
          { value: 'members', label: areaCopy('history.filter.members') },
        ]}
        value={filter}
        onChange={setFilter}
        wrapLabels
      />
      {venues.length > 0 ? (
        <View style={styles.filterBlock}>
          <Text variant="caption" tone="secondary">
            {areaCopy('history.filter.venue')}
          </Text>
          <View style={styles.chipWrap}>
            <Chip label={areaCopy('history.filter.anyVenue')} selected={venueId === null} onPress={() => setVenueId(null)} />
            {venues.map((v) => (
              <Chip key={v.venue_id} label={v.venue_name} selected={venueId === v.venue_id} onPress={() => setVenueId(v.venue_id)} />
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.dates}>
        <DateFilter
          label={areaCopy('history.filter.from')}
          value={from}
          onChange={setFrom}
          initial={to ?? today}
          maximumDate={to ? new Date(`${to}T12:00:00`) : undefined}
        />
        <DateFilter
          label={areaCopy('history.filter.to')}
          value={to}
          onChange={setTo}
          initial={from && from > today ? from : today}
          minimumDate={from ? new Date(`${from}T12:00:00`) : undefined}
        />
      </View>
      <Button
        label={areaCopy('history.export')}
        variant="secondary"
        loading={downloading}
        onPress={async () => {
          if (!accessToken) return;
          setDownloading(true);
          try {
            await shareHistoryCsv(accessToken, collectiveId, collectiveName, q);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not download the history.');
          } finally {
            setDownloading(false);
          }
        }}
      />

      {history.isError ? (
        <Text variant="bodySmall" tone="danger">
          {history.error instanceof ApiError ? history.error.message : 'Could not load the history.'}
        </Text>
      ) : null}
      {!history.isLoading && !history.isError && events.length === 0 ? (
        <Text variant="bodySmall" tone="secondary">
          {areaCopy('history.empty')}
        </Text>
      ) : null}

      {events.length > 0 ? (
        <Card padded={false}>
          {events.map((event, index) => (
            <View
              key={event.id}
              style={[styles.historyRow, index > 0 ? [styles.rowDivider, { borderTopColor: colors.border }] : null]}
            >
              <Text variant="bodySmall">{event.sentence}</Text>
              <Text variant="caption" tone="muted">
                {formatWhen(event.at)}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {history.isLoading || history.isFetchingNextPage ? (
        <Text variant="bodySmall" tone="secondary">
          Loading...
        </Text>
      ) : history.hasNextPage ? (
        <Button label={areaCopy('history.more')} variant="secondary" onPress={() => void history.fetchNextPage()} />
      ) : null}
    </View>
  );
}

/** A date filter that is off until a date is chosen, so an unfiltered list never shows a date. */
function DateFilter({
  label,
  value,
  onChange,
  initial,
  minimumDate,
  maximumDate,
}: {
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
  initial: string;
  minimumDate?: Date;
  maximumDate?: Date;
}) {
  return (
    <View style={styles.dateFilter}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      {value ? (
        <>
          <DatePickerField
            value={value}
            onChange={onChange}
            accessibilityLabel={label}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
          />
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} onPress={() => onChange(null)}>
            <Text variant="caption" tone="brand">
              Clear
            </Text>
          </Pressable>
        </>
      ) : (
        <Button
          label="Choose a date"
          variant="secondary"
          size="sm"
          accessibilityLabel={`${label}: any date. Choose a date`}
          onPress={() => onChange(initial)}
        />
      )}
    </View>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  stack: { gap: spacing.md },
  section: { gap: spacing.xs },
  foldHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  tapRow: { minHeight: 44 },
  // A sentence where the sync badge would be: it wraps rather than squeezing the service's name.
  switchedOffNote: { flexShrink: 1, maxWidth: '55%', textAlign: 'right' },
  note: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  venueRow: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, gap: spacing.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs, marginLeft: -spacing.base },
  filterBlock: { gap: spacing.xs },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  dates: { flexDirection: 'row', gap: spacing.md },
  dateFilter: { flex: 1, gap: spacing.xxs },
  historyRow: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, gap: spacing.xxs },
});
