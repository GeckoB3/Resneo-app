import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { getApiUrl } from '@/lib/env';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useLinkedVenueAudit } from '@/lib/queries/useLinkedVenues';
import { buildAndShareCsv } from '@/lib/reports/csv-export';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
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

/**
 * Date-range presets (computed against "now"), mapped to an ISO `from` filter.
 * `custom` is the web-parity arbitrary From/To window (both bounds editable).
 */
const RANGE_OPTIONS: { value: string; label: string; days: number | null }[] = [
  { value: 'all', label: 'All time', days: null },
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: 'Last 90 days', days: 90 },
  { value: 'custom', label: 'Custom range', days: null },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  // YYYY-MM-DD (the audit `from` filter is a date boundary).
  return d.toISOString().slice(0, 10);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Map the selected range + custom bounds to the audit query's `from`/`to`
 * (both `YYYY-MM-DD` date boundaries, or `null` for an open bound). Presets set
 * only `from` (open-ended `to`); `custom` forwards both bounds, dropping an
 * inverted window (from > to) so a half-entered range never queries garbage.
 * Pure (no React) so it can be unit-tested.
 */
export function auditRangeToQuery(
  range: string,
  customFrom: string,
  customTo: string,
): { from: string | null; to: string | null } {
  if (range === 'custom') {
    const from = customFrom || null;
    const to = customTo || null;
    if (from && to && from > to) return { from: null, to: null };
    return { from, to };
  }
  const opt = RANGE_OPTIONS.find((r) => r.value === range);
  return { from: opt?.days != null ? isoDaysAgo(opt.days) : null, to: null };
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
 * Cross-venue audit log for a single link — a paginated card list (no table).
 * Mirrors the web `LinkedAccountAuditModal`: action / date (presets + a custom
 * From/To range) / acting-user filters, 50 per page, before→after summaries, and
 * a "Share audit (CSV)" export of the full filtered log (`?format=csv`).
 */
export function LinkAuditView({
  linkId,
  otherVenueName,
}: {
  linkId: string;
  otherVenueName: string;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const accessToken = useAccessToken();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<AuditActionType | ''>('');
  const [range, setRange] = useState('all');
  const [actingUserId, setActingUserId] = useState('');
  const [exporting, setExporting] = useState(false);
  // Custom-range bounds (only used while range === 'custom'). Seed a sensible
  // last-30-days window so the pickers open on a useful default.
  const [customFrom, setCustomFrom] = useState(() => isoDaysAgo(30));
  const [customTo, setCustomTo] = useState(() => isoToday());

  const { from, to } = useMemo(
    () => auditRangeToQuery(range, customFrom, customTo),
    [range, customFrom, customTo],
  );
  const customInverted = range === 'custom' && !!customFrom && !!customTo && customFrom > customTo;

  const query = useLinkedVenueAudit(linkId, {
    page,
    pageSize: PAGE_SIZE,
    action,
    from,
    to,
    actingUserId: actingUserId || null,
  });

  const data = query.data;
  const entries = data?.entries ?? [];
  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Resetting any filter returns to page 1.
  const resetPage = () => setPage(1);

  /**
   * Export the full filtered log (web parity: `?format=csv`, up to 10k rows,
   * server-throttled). The server already emits a complete CSV body, so we fetch
   * the text directly (apiFetch only parses JSON) and hand it to the shared
   * `buildAndShareCsv` helper as a pre-built body. Honours the same action / date
   * / user filters as the on-screen list (pagination is irrelevant to the export).
   */
  const handleExportCsv = async () => {
    if (!linkId || !accessToken || exporting) return;
    setExporting(true);
    try {
      const qs = new URLSearchParams({ format: 'csv' });
      if (action) qs.set('action', action);
      if (actingUserId) qs.set('actingUserId', actingUserId);
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await fetch(
        `${getApiUrl()}/api/venue/account-links/${linkId}/audit?${qs.toString()}`,
        { headers: { Accept: 'text/csv', Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        throw new Error(res.status === 429 ? 'Too many exports — try again in a few minutes.' : `Export failed (${res.status}).`);
      }
      const csv = await res.text();
      const result = await buildAndShareCsv(`linked-account-audit-${linkId}.csv`, [], csv);
      if (result.ok) {
        hapticSuccess();
      } else {
        hapticWarning();
        toast.error(result.message || 'Could not share the audit export.');
      }
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof Error ? e.message : 'Could not export the audit log.');
    } finally {
      setExporting(false);
    }
  };

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

      {range === 'custom' ? (
        <View style={styles.customRange}>
          <View style={styles.customField}>
            <Text variant="caption" tone="muted">
              From
            </Text>
            <DatePickerField
              value={customFrom}
              accessibilityLabel="Audit range start date"
              maximumDate={new Date()}
              onChange={(iso) => {
                setCustomFrom(iso);
                resetPage();
              }}
            />
          </View>
          <View style={styles.customField}>
            <Text variant="caption" tone="muted">
              To
            </Text>
            <DatePickerField
              value={customTo}
              accessibilityLabel="Audit range end date"
              maximumDate={new Date()}
              onChange={(iso) => {
                setCustomTo(iso);
                resetPage();
              }}
            />
          </View>
        </View>
      ) : null}
      {customInverted ? (
        <Text variant="caption" color={colors.danger}>
          The start date is after the end date — showing no results until you fix the range.
        </Text>
      ) : null}

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

      <View style={styles.entriesHead}>
        <SectionHeader title={total === 1 ? '1 entry' : `${total} entries`} />
        {total > 0 ? (
          <Button
            label="Share audit (CSV)"
            variant="secondary"
            size="sm"
            loading={exporting}
            onPress={() => void handleExportCsv()}
          />
        ) : null}
      </View>
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
  customRange: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  customField: {
    gap: spacing.xxs,
  },
  entriesHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
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
