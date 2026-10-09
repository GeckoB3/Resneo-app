import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ImportBanner, importStyles } from '@/components/import/ImportParts';
import { ImportStepFrame } from '@/components/import/ImportStepFrame';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { importErrorMessage, useImportApi } from '@/lib/import/api';
import {
  canContinue,
  canResume,
  formatImportDateTime,
  importedCountsLine,
  importStepRoute,
  isComplete,
  statusLabel,
  statusTone,
} from '@/lib/import/session-status';
import { describeImportUndoKept } from '@/lib/import/undo-summary';
import {
  useDeleteImportSession,
  useImportSessions,
  useStartImportSession,
  useUndoImportSession,
  type ImportSessionRow,
} from '@/lib/queries/useImportSessions';
import { shareTextFile } from '@/lib/share/share-text-file';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Data import (web `/dashboard/import`, `ImportHub.tsx`): past imports with their status, what
 * each brought in, the 24-hour Undo, the report, Continue or Resume, Delete, and Start new
 * import. Admin only, as on the web.
 */
export default function ImportHubScreen() {
  return (
    <ImportStepFrame title="Data import">
      <ImportHub />
    </ImportStepFrame>
  );
}

type Pending = { kind: 'undo' | 'delete'; session: ImportSessionRow };

function ImportHub() {
  const router = useRouter();
  const toast = useToast();
  const api = useImportApi();
  const { terminology } = useVenueContext();
  const clientWord = terminology.client.trim().toLowerCase() || 'client';
  const sessions = useImportSessions();
  const start = useStartImportSession();
  const undo = useUndoImportSession();
  const remove = useDeleteImportSession();
  const [error, setError] = useState<string | null>(null);
  const [undoNotice, setUndoNotice] = useState<string[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);

  async function startNew() {
    setError(null);
    try {
      const created = await start.mutateAsync();
      if (created?.id) router.push(importStepRoute(created.id, 'upload'));
    } catch (e) {
      setError(importErrorMessage(e, 'The import could not be started. Please try again.'));
    }
  }

  async function runPending() {
    const p = pending;
    if (!p) return;
    setError(null);
    setUndoNotice(null);
    if (p.kind === 'undo') {
      try {
        const res = await undo.mutateAsync(p.session.id);
        setUndoNotice(['Import undone.', ...describeImportUndoKept(res?.undo_summary ?? null, clientWord)]);
      } catch (e) {
        setError(importErrorMessage(e, 'Undo could not finish. Please try again.'));
      }
    } else {
      try {
        await remove.mutateAsync(p.session.id);
      } catch (e) {
        setError(importErrorMessage(e, 'That import could not be removed. Please try again.'));
      }
    }
    setPending(null);
  }

  async function shareReport(id: string) {
    setSharingId(id);
    try {
      const csv = await api.reportCsv(id);
      const res = await shareTextFile({
        filename: `import-report-${id.slice(0, 8)}.csv`,
        body: csv,
        mimeType: 'text/csv',
        uti: 'public.comma-separated-values-text',
        dialogTitle: 'Import report',
      });
      if (!res.ok && res.reason !== 'web-download') toast.error('The report could not be shared. Please try again.');
    } catch (e) {
      toast.error(importErrorMessage(e, 'The report could not be loaded. Please try again.'));
    }
    setSharingId(null);
  }

  const list = sessions.data?.sessions ?? [];

  return (
    <View style={importStyles.stack}>
      <View style={importStyles.tight}>
        <Text variant="heading">Data import</Text>
        <Text variant="bodySmall" tone="secondary">
          Bring in your clients and bookings from your previous booking system. Upload its CSV or Excel export and we
          walk you through the rest.
        </Text>
      </View>
      <Button label="Start new import" onPress={() => void startNew()} loading={start.isPending} fullWidth />

      {error ? <ImportBanner tone="danger">{error}</ImportBanner> : null}
      {undoNotice && !error ? (
        <ImportBanner tone={undoNotice.length > 1 ? 'warning' : 'success'} title={undoNotice[0]}>
          {undoNotice.slice(1).map((line) => (
            <Text key={line} variant="bodySmall">
              {line}
            </Text>
          ))}
        </ImportBanner>
      ) : null}

      {sessions.isLoading ? (
        <ListSkeleton />
      ) : sessions.isError ? (
        <ErrorState
          message={importErrorMessage(sessions.error, 'Your imports could not be loaded.')}
          onRetry={() => void sessions.refetch()}
        />
      ) : list.length === 0 ? (
        <Card padded>
          <Text variant="bodySmall" tone="secondary">
            No imports yet. Start a new import to upload your files.
          </Text>
        </Card>
      ) : (
        list.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            clientWord={clientWord}
            clientLabel={terminology.client}
            sharing={sharingId === s.id}
            deleting={remove.isPending && pending?.session.id === s.id}
            onContinue={() => router.push(importStepRoute(s.id, 'upload'))}
            onResume={() => router.push(importStepRoute(s.id, 'importing'))}
            onReport={() => void shareReport(s.id)}
            onUndo={() => setPending({ kind: 'undo', session: s })}
            onDelete={() => setPending({ kind: 'delete', session: s })}
          />
        ))
      )}

      <ConfirmSheet
        visible={pending !== null}
        title={pending?.kind === 'undo' ? 'Undo this import?' : 'Remove this import from the list?'}
        message={
          pending?.kind === 'undo'
            ? `This takes out what the import added and puts back any ${clientWord}s it updated. A ${clientWord} who has bookings, forms or files that did not come from this import is kept, and you will be told who.`
            : `Its uploaded files are deleted. This does not remove ${clientWord}s or bookings it already added to your venue. Use Undo on a finished import if you need to take those out.`
        }
        confirmLabel={pending?.kind === 'undo' ? 'Undo import' : 'Remove'}
        destructive
        loading={undo.isPending || remove.isPending}
        onConfirm={() => void runPending()}
        onClose={() => {
          if (!undo.isPending && !remove.isPending) setPending(null);
        }}
      />
    </View>
  );
}

function SessionCard({
  session: s,
  clientWord,
  clientLabel,
  sharing,
  deleting,
  onContinue,
  onResume,
  onReport,
  onUndo,
  onDelete,
}: {
  session: ImportSessionRow;
  clientWord: string;
  clientLabel: string;
  sharing: boolean;
  deleting: boolean;
  onContinue: () => void;
  onResume: () => void;
  onReport: () => void;
  onUndo: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const complete = isComplete(s);
  const showCounts = complete && !s.undone_at && !s.undo_incomplete;
  const undoWindowOpen = complete && !s.undone_at && Boolean(s.undo_available_until);
  return (
    <Card padded testID={`import-session-${s.id}`}>
      <View style={importStyles.tight}>
        <Text variant="bodyMedium">{formatImportDateTime(s.created_at)}</Text>
        <View style={importStyles.row}>
          <Badge label={statusLabel(s)} tone={statusTone(s)} />
          {showCounts ? (
            <Text variant="caption" tone="secondary">
              {importedCountsLine(s, clientLabel)}
            </Text>
          ) : null}
        </View>
        {complete && !s.undone_at && s.undo_incomplete ? (
          <Text variant="caption" tone="danger">
            Undo did not finish, so part of this import has already been taken out. Press Undo again to finish it.
          </Text>
        ) : null}
        {describeImportUndoKept(s.undo_summary ?? null, clientWord).map((line) => (
          <Text key={line} variant="caption" tone="secondary">
            {line}
          </Text>
        ))}
        {undoWindowOpen ? (
          <Text variant="caption" color={colors.warning}>
            {`Undo available until ${formatImportDateTime(s.undo_available_until as string)}`}
          </Text>
        ) : null}
      </View>
      <View style={[importStyles.row, styles.actions]}>
        {canContinue(s) ? <Button label="Continue" size="sm" variant="secondary" onPress={onContinue} /> : null}
        {canResume(s) ? <Button label="Resume import" size="sm" onPress={onResume} /> : null}
        {complete ? <Button label="Report" size="sm" variant="secondary" loading={sharing} onPress={onReport} /> : null}
        {complete ? <Button label="Undo" size="sm" variant="secondary" onPress={onUndo} /> : null}
        <Button label="Delete" size="sm" variant="ghost" loading={deleting} onPress={onDelete} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { marginTop: spacing.md },
});
