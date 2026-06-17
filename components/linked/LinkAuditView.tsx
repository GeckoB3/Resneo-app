import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useLinkedVenueAudit } from '@/lib/queries/useLinkedVenues';
import { spacing } from '@/theme/index';
import type { AccountLinkAuditEntry, AuditActionType } from '@/types/linked-venues';

const PAGE_SIZE = 50;

const ACTION_OPTIONS: { value: AuditActionType | ''; label: string }[] = [
  { value: '', label: 'All actions' },
  { value: 'viewed_calendar', label: 'Viewed calendar' },
  { value: 'viewed_booking', label: 'Viewed booking' },
  { value: 'created_booking', label: 'Created booking' },
  { value: 'edited_booking', label: 'Edited booking' },
  { value: 'cancelled_booking', label: 'Cancelled booking' },
  { value: 'deleted_booking', label: 'Deleted booking' },
];

/** Date-range presets (computed against "now"), mapped to an ISO `from` filter. */
const RANGE_OPTIONS: { value: string; label: string; days: number | null }[] = [
  { value: 'all', label: 'All time', days: null },
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: 'Last 90 days', days: 90 },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  // YYYY-MM-DD (the audit `from` filter is a date boundary).
  return d.toISOString().slice(0, 10);
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Human before→after summary for the same fields the web audit modal shows. */
function diffSummary(entry: AccountLinkAuditEntry): string | null {
  if (!entry.beforeState || !entry.afterState) return null;
  const keys = ['booking_date', 'booking_time', 'status', 'practitioner_id', 'appointment_service_id'];
  const changes: string[] = [];
  for (const k of keys) {
    const before = entry.beforeState[k];
    const after = entry.afterState[k];
    if (before !== after) {
      changes.push(`${k.replace(/_/g, ' ')}: ${String(before ?? '—')} → ${String(after ?? '—')}`);
    }
  }
  return changes.length > 0 ? changes.join('; ') : null;
}

function AuditEntryCard({ entry }: { entry: AccountLinkAuditEntry }) {
  const diff = diffSummary(entry);
  const detail = diff ?? entry.resourceType ?? null;
  return (
    <Card>
      <View style={styles.entryHead}>
        <Text variant="label" style={styles.flex1}>
          {entry.actionLabel}
        </Text>
        <Text variant="caption" tone="muted">
          {formatTimestamp(entry.createdAt)}
        </Text>
      </View>
      <Text variant="caption" tone="secondary" style={styles.entryLine}>
        {`By ${entry.actingVenue}${entry.actingUser ? ` · ${entry.actingUser}` : ''}`}
      </Text>
      {detail ? (
        <Text variant="caption" tone="muted" style={styles.entryLine}>
          {detail}
        </Text>
      ) : null}
    </Card>
  );
}

/**
 * Cross-venue audit log for a single link — a paginated card list (no table, no
 * CSV; mobile is view-only, §11). Mirrors the web `LinkedAccountAuditModal`:
 * action / date / acting-user filters, 50 per page, before→after summaries.
 */
export function LinkAuditView({
  linkId,
  otherVenueName,
}: {
  linkId: string;
  otherVenueName: string;
}) {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<AuditActionType | ''>('');
  const [range, setRange] = useState('all');
  const [actingUserId, setActingUserId] = useState('');

  const from = useMemo(() => {
    const opt = RANGE_OPTIONS.find((r) => r.value === range);
    return opt?.days != null ? isoDaysAgo(opt.days) : null;
  }, [range]);

  const query = useLinkedVenueAudit(linkId, {
    page,
    pageSize: PAGE_SIZE,
    action,
    from,
    actingUserId: actingUserId || null,
  });

  const data = query.data;
  const entries = data?.entries ?? [];
  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Resetting any filter returns to page 1.
  const resetPage = () => setPage(1);

  const header = (
    <View style={styles.header}>
      <Text variant="bodySmall" tone="secondary">
        {`Every cross-venue action on the link with ${otherVenueName}. Visible to both venues and retained after the link ends.`}
      </Text>

      <SectionHeader title="Action" />
      <View style={styles.chipRow}>
        {ACTION_OPTIONS.map((o) => (
          <Chip
            key={o.value || 'all'}
            label={o.label}
            selected={action === o.value}
            onPress={() => {
              setAction(o.value);
              resetPage();
            }}
          />
        ))}
      </View>

      <SectionHeader title="Date range" />
      <View style={styles.chipRow}>
        {RANGE_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={range === o.value}
            onPress={() => {
              setRange(o.value);
              resetPage();
            }}
          />
        ))}
      </View>

      {users.length > 0 ? (
        <>
          <SectionHeader title="User" />
          <View style={styles.chipRow}>
            <Chip
              label="All users"
              selected={actingUserId === ''}
              onPress={() => {
                setActingUserId('');
                resetPage();
              }}
            />
            {users.map((u) => (
              <Chip
                key={u.id}
                label={u.name}
                selected={actingUserId === u.id}
                onPress={() => {
                  setActingUserId(u.id);
                  resetPage();
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      <SectionHeader title={total === 1 ? '1 entry' : `${total} entries`} />
    </View>
  );

  if (query.isLoading) {
    return (
      <View style={styles.body}>
        {header}
        <DetailSkeleton />
      </View>
    );
  }

  if (query.isError) {
    return (
      <View style={styles.body}>
        {header}
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : 'Failed to load audit log.'}
          onRetry={() => void query.refetch()}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={entries}
      keyExtractor={(e) => e.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => <AuditEntryCard entry={item} />}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      ListEmptyComponent={
        <EmptyState
          title="No activity yet"
          message="No activity recorded for this link yet."
        />
      }
      ListFooterComponent={
        total > PAGE_SIZE ? (
          <View style={styles.pager}>
            <Button
              label="Previous"
              variant="secondary"
              disabled={page <= 1 || query.isFetching}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
            />
            <Text variant="caption" tone="muted">
              {`Page ${page} of ${totalPages}`}
            </Text>
            <Button
              label="Next"
              variant="secondary"
              disabled={page >= totalPages || query.isFetching}
              onPress={() => setPage((p) => p + 1)}
            />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  header: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sep: {
    height: spacing.sm,
  },
  entryHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  entryLine: {
    marginTop: spacing.xs,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.md,
  },
});
