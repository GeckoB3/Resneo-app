import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import {
  isAuthGap,
  useImportSessions,
  type ImportSessionRow,
} from '@/lib/queries/useImportSessions';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type RecentImportsSectionProps = {
  /** Opens a web-dashboard path in the in-app browser (parent's `openWeb`). */
  onOpenWeb: (path: string) => void;
  /** The web Data-import hub path (`/dashboard/import`). */
  webImportPath: string;
};

/** Web-parity status pill colour, mirroring `ImportHub`'s status classes. */
function statusTone(session: ImportSessionRow): BadgeTone {
  if (session.undone_at) return 'danger';
  if (session.status === 'complete') return 'success';
  if (session.status === 'failed') return 'danger';
  if (['uploading', 'mapping', 'validating', 'ready', 'importing'].includes(session.status)) {
    return 'brand';
  }
  return 'neutral';
}

/** Human label for the status pill — "undone" wins, else the status with spaces. */
function statusLabel(session: ImportSessionRow): string {
  if (session.undone_at) return 'Undone';
  return session.status.replace(/_/g, ' ');
}

/** "12 Jun 2026, 14:30" — matches the web's en-GB date/time formatting. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** One import-session row card. */
function ImportSessionCard({
  session,
  onOpenWeb,
  sessionWebPath,
}: {
  session: ImportSessionRow;
  onOpenWeb: (path: string) => void;
  sessionWebPath: string;
}) {
  const { colors } = useTheme();
  const isComplete = session.status === 'complete' && !session.undone_at;
  const importedSummary = isComplete
    ? `${session.imported_clients ?? 0} clients, ${session.imported_bookings ?? 0} bookings`
    : null;
  const canUndo =
    isComplete && Boolean(session.undo_available_until) && !session.undone_at;

  return (
    <Card padded>
      <View style={styles.cardRow}>
        <View style={styles.cardInfo}>
          <Text variant="bodyMedium">{formatDateTime(session.created_at)}</Text>
          <View style={styles.metaRow}>
            <Badge label={statusLabel(session)} tone={statusTone(session)} />
            {importedSummary ? (
              <Text variant="caption" tone="secondary">
                {importedSummary}
              </Text>
            ) : null}
          </View>
          {canUndo ? (
            <Text variant="caption" color={colors.warning}>
              Undo available until {formatDateTime(session.undo_available_until as string)}
            </Text>
          ) : null}
        </View>
      </View>
      {canUndo ? (
        <Button
          label="Undo on the web"
          variant="secondary"
          size="sm"
          onPress={() => onOpenWeb(sessionWebPath)}
          style={styles.undoButton}
        />
      ) : null}
    </Card>
  );
}

/**
 * Read-only "Recent imports" list for the venue-profile Data-import area
 * (Domain 05, R7 — medium gap). Lists prior import sessions from
 * `GET /api/import/sessions` with status, imported counts and the 24-hour undo
 * window, mirroring the web `ImportHub`.
 *
 * Auth reality: the backend list/undo routes are cookie-only (no Bearer — see
 * `useImportSessions`), so from the app they answer 401/403. That is handled as
 * an EXPECTED state, not an error: we show a concise "manage on the web"
 * fallback. Undo is always a web link-out (the POST is cookie-only too). If the
 * route is later made Bearer-capable, this component lights up automatically.
 */
export function RecentImportsSection({ onOpenWeb, webImportPath }: RecentImportsSectionProps) {
  const query = useImportSessions();
  const sessions = query.data?.sessions ?? [];

  const openHub = useCallback(() => onOpenWeb(webImportPath), [onOpenWeb, webImportPath]);

  // Loading (first fetch only) — small inline spinner, not a full skeleton.
  if (query.isLoading) {
    return (
      <View style={styles.stateRow}>
        <ActivityIndicator />
        <Text variant="caption" tone="muted">
          Loading recent imports…
        </Text>
      </View>
    );
  }

  // Auth gap (401/403): the list isn't reachable with a Bearer token. Show the
  // read-only "manage on the web" note rather than a scary error — this is the
  // documented mobile limitation, not a failure the user can fix by retrying.
  if (query.isError && isAuthGap(query.error)) {
    return (
      <Text variant="caption" tone="muted">
        Your recent imports and the 24-hour undo are managed on the web dashboard.
      </Text>
    );
  }

  // Genuine fetch failure (network / 5xx) — offer a retry.
  if (query.isError) {
    return (
      <View style={styles.stateCol}>
        <Text variant="bodySmall" tone="danger">
          Could not load recent imports.
        </Text>
        <Button
          label="Try again"
          variant="secondary"
          size="sm"
          onPress={() => void query.refetch()}
        />
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <Text variant="caption" tone="muted">
        No imports yet. Start one with the button above.
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      <Text variant="label" tone="secondary">
        Recent imports
      </Text>
      {sessions.map((session) => (
        <ImportSessionCard
          key={session.id}
          session={session}
          onOpenWeb={onOpenWeb}
          // The web hub lists every session with its own Undo/Report controls.
          sessionWebPath={webImportPath}
        />
      ))}
      <Button label="Manage all imports on the web" variant="ghost" size="sm" onPress={openHub} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardInfo: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  undoButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stateCol: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
});
