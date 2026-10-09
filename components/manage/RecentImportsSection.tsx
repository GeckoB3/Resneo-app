import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { importErrorMessage } from '@/lib/import/api';
import {
  formatImportDateTime,
  importedCountsLine,
  statusLabel,
  statusTone,
} from '@/lib/import/session-status';
import { describeImportUndoKept } from '@/lib/import/undo-summary';
import {
  isAuthGap,
  useImportSessions,
  useUndoImportSession,
  type ImportSessionRow,
} from '@/lib/queries/useImportSessions';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type RecentImportsSectionProps = {
  /** Opens the in-app Data import hub (`/import`). */
  onOpenHub: () => void;
};

/** How many recent imports this section lists; the hub lists them all. */
const SHOWN = 3;

/** One import-session row card. */
function ImportSessionCard({
  session,
  clientLabel,
  onUndo,
}: {
  session: ImportSessionRow;
  clientLabel: string;
  onUndo: () => void;
}) {
  const { colors } = useTheme();
  const isComplete = session.status === 'complete' && !session.undone_at;
  const canUndo = isComplete && Boolean(session.undo_available_until);

  return (
    <Card padded>
      <View style={styles.cardInfo}>
        <Text variant="bodyMedium">{formatImportDateTime(session.created_at)}</Text>
        <View style={styles.metaRow}>
          <Badge label={statusLabel(session)} tone={statusTone(session)} />
          {isComplete && !session.undo_incomplete ? (
            <Text variant="caption" tone="secondary">
              {importedCountsLine(session, clientLabel)}
            </Text>
          ) : null}
        </View>
        {canUndo ? (
          <Text variant="caption" color={colors.warning}>
            {`Undo available until ${formatImportDateTime(session.undo_available_until as string)}`}
          </Text>
        ) : null}
      </View>
      {canUndo ? (
        <Button label="Undo" variant="secondary" size="sm" onPress={onUndo} style={styles.undoButton} />
      ) : null}
    </Card>
  );
}

/**
 * "Recent imports" under the venue-profile Data import area: the last few imports with their
 * status, what each brought in and the 24-hour Undo (run here, after a confirm), and a link to
 * the in-app Data import hub for everything else. `GET /api/import/sessions` and the undo POST
 * take the app's Bearer token and are admin only.
 */
export function RecentImportsSection({ onOpenHub }: RecentImportsSectionProps) {
  const query = useImportSessions();
  const undo = useUndoImportSession();
  const { terminology } = useVenueContext();
  const clientWord = terminology.client.trim().toLowerCase() || 'client';
  const [confirming, setConfirming] = useState<ImportSessionRow | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; lines: string[] } | null>(null);
  const sessions = query.data?.sessions ?? [];

  async function runUndo() {
    const target = confirming;
    if (!target) return;
    setNotice(null);
    try {
      const res = await undo.mutateAsync(target.id);
      setNotice({ tone: 'success', lines: ['Import undone.', ...describeImportUndoKept(res?.undo_summary ?? null, clientWord)] });
    } catch (e) {
      setNotice({ tone: 'danger', lines: [importErrorMessage(e, 'Undo could not finish. Please try again.')] });
    }
    setConfirming(null);
  }

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

  // 403: not an admin (the routes are admin only). Nothing to retry.
  if (query.isError && isAuthGap(query.error)) {
    return (
      <Text variant="caption" tone="muted">
        Only an admin can see and undo imports.
      </Text>
    );
  }

  if (query.isError) {
    return (
      <View style={styles.stateCol}>
        <Text variant="bodySmall" tone="danger">
          Could not load recent imports.
        </Text>
        <Button label="Try again" variant="secondary" size="sm" onPress={() => void query.refetch()} />
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {sessions.length === 0 ? (
        <Text variant="caption" tone="muted">
          No imports yet. Start one with the button above.
        </Text>
      ) : (
        <>
          <Text variant="label" tone="secondary">
            Recent imports
          </Text>
          {notice ? (
            <View style={styles.notice}>
              {notice.lines.map((line, i) => (
                <Text key={line} variant={i === 0 ? 'label' : 'caption'} tone={notice.tone === 'danger' ? 'danger' : 'secondary'}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
          {sessions.slice(0, SHOWN).map((session) => (
            <ImportSessionCard
              key={session.id}
              session={session}
              clientLabel={terminology.client}
              onUndo={() => setConfirming(session)}
            />
          ))}
          <Button label="See all imports" variant="ghost" size="sm" onPress={onOpenHub} />
        </>
      )}
      <ConfirmSheet
        visible={confirming !== null}
        title="Undo this import?"
        message={`This takes out what the import added and puts back any ${clientWord}s it updated. A ${clientWord} who has bookings, forms or files that did not come from this import is kept, and you will be told who.`}
        confirmLabel="Undo import"
        loading={undo.isPending}
        onConfirm={() => void runUndo()}
        onClose={() => {
          if (!undo.isPending) setConfirming(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  cardInfo: {
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
  notice: {
    gap: spacing.xxs,
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
