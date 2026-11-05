/**
 * The Collective area's other tabs, as the web's (2026-09-17):
 *
 *   VenuesPanel         the host's Venues tab (web `CollectiveVenuesPanel`)
 *   HistoryPanel        the History tab (web `CollectiveHistoryPanel`)
 */
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CollectiveNameSheet, EndCollectiveCard, SyncBadge } from '@/components/collective-area/AreaPieces';
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
// The host's Venues tab
// ---------------------------------------------------------------------------

export interface VenueRow {
  venue_id: string;
  venue_name: string;
  status: 'active' | 'invited';
  is_host: boolean;
  also_runs: string | null;
  /** Its subscription has lapsed, so the page leaves its calendars out until it is put right (web 2026-11-04). */
  lapsed?: boolean;
  /** Its own name, as clients see it (web 2026-11-05). Absent from older servers: the row reads `venue_name`. */
  own_name?: string;
  /** The name staff in the collective call it by, or null. */
  name_in_collective?: string | null;
  /** Another active business here has its own name, so staff need a way to tell them apart. */
  shares_name?: boolean;
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
  /** The business whose name in the collective the host is choosing (web 2026-11-05). */
  const [naming, setNaming] = useState<VenueRow | null>(null);
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
          // Its own name, then what staff call it when that differs (web 2026-11-05).
          const title = row.own_name ?? row.venue_name;
          const canName = row.own_name !== undefined && (row.shares_name === true || Boolean(row.name_in_collective));
          return (
            <View key={row.venue_id} style={[styles.venueRow, index > 0 ? [styles.rowDivider, { borderTopColor: colors.border }] : null]}>
              <Text variant="bodyMedium">
                {/* Only the host sees this tab, so the host row is the viewer's own venue (web CQ-07). */}
                {row.is_host ? areaCopy('svc.cal.venueYou', { venue: title }) : title}
                {row.status === 'invited' ? ` ${areaCopy('ov.venues.invited')}` : ''}
              </Text>
              <View style={styles.badges}>
                <Badge
                  label={row.is_host ? areaCopy('ov.venues.host') : areaCopy('ov.venues.member')}
                  tone={row.is_host ? 'brand' : 'neutral'}
                />
                {row.status === 'active' && row.lapsed ? <Badge label={areaCopy('ov.venues.lapsed')} tone="warning" /> : null}
                {row.status === 'active' && group ? <SyncBadge status={groupStatus(group)} /> : null}
              </View>
              {row.status === 'invited' ? (
                <InvitedVenueStatus collectiveId={collectiveId} venueId={row.venue_id} venueName={row.venue_name} />
              ) : null}
              {row.name_in_collective ? (
                <Text variant="caption" tone="secondary">
                  {areaCopy('names.knownAs', { collective: collectiveName, name: row.name_in_collective })}
                </Text>
              ) : row.shares_name && row.status === 'active' && !row.is_host ? (
                // The host's own row reads its bare name here, which is not what other businesses see.
                <Text variant="caption" tone="secondary">
                  {areaCopy('names.shared', { label: row.venue_name })}
                </Text>
              ) : null}
              {row.also_runs ? (
                <Text variant="caption" tone="muted">
                  {areaCopy('bm.members.alsoRuns', { modelList: row.also_runs })}
                </Text>
              ) : null}
              <View style={styles.actions}>
                {canName ? (
                  <Button
                    label={row.name_in_collective ? areaCopy('names.change') : areaCopy('names.set')}
                    variant="ghost"
                    size="sm"
                    disabled={patch.isPending}
                    onPress={() => setNaming(row)}
                  />
                ) : null}
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

      <CollectiveNameSheet
        visible={naming !== null}
        onClose={() => setNaming(null)}
        collectiveId={collectiveId}
        collectiveName={collectiveName}
        venueId={naming?.venue_id ?? ''}
        venueName={naming?.own_name ?? naming?.venue_name ?? ''}
        current={naming?.name_in_collective ?? null}
      />

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
