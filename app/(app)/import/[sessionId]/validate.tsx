import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ImportBanner, ProgressBar, TickRow, importStyles } from '@/components/import/ImportParts';
import { ImportStepFrame } from '@/components/import/ImportStepFrame';
import { RowPreviewSheet } from '@/components/import/RowPreviewSheet';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { importErrorMessage, useImportApi } from '@/lib/import/api';
import { IMPORT_HUB_ROUTE, importStepRoute } from '@/lib/import/session-status';
import type { SessionDetail, ValidationIssue, ValidationSummary } from '@/lib/import/types';
import {
  bookingDefaultsBlocking,
  canApproveImport,
  DATE_FORMAT_OPTIONS,
  decisionLabel,
  decisionsForIssue,
  groupIssues,
  issueCounts,
  issueTypeLabel,
  isSyntheticReferenceIssue,
  plural,
  unresolvedExistingClients,
  type DateFormatChoice,
  type IssueDecision,
} from '@/lib/import/validate-step';
import { shareTextFile } from '@/lib/share/share-text-file';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Step 5, Validate (web `ValidateStepClient`). Every row is checked on the server in the
 * background (progress shown; safe to leave). Then: the plan in plain words, what is ready and
 * what is not, the issues by type with a decision where one is needed, the date format question,
 * the reminders choice, the report, and Review and approve, the one action that starts the import.
 * Opened on an import that has already run, it shows what was found and changes nothing.
 */
export default function ValidateStepScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <ImportStepFrame title="Validate" sessionId={sessionId} step="validate">
      <ValidateStep sessionId={String(sessionId)} />
    </ImportStepFrame>
  );
}

const POLL_MS = 900;

function ValidateStep({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const toast = useToast();
  const api = useImportApi();
  const { colors } = useTheme();
  const { terminology } = useVenueContext();
  const clientLabel = terminology.client;
  const clientPluralLower = `${clientLabel}s`.toLowerCase();

  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [filesById, setFilesById] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [scan, setScan] = useState<{ processed: number; total: number; percent: number } | null>(null);
  const [dateChoice, setDateChoice] = useState<DateFormatChoice | null>(null);
  const [preview, setPreview] = useState<{ fileId: string; row: number; filename: string } | null>(null);
  const [patchingId, setPatchingId] = useState<string | null>(null);
  const [hasBookingFile, setHasBookingFile] = useState(false);
  const [sendReminders, setSendReminders] = useState(false);
  const [savingReminders, setSavingReminders] = useState(false);
  const [plan, setPlan] = useState<{ headline: string; narrative: string } | null>(null);
  const [showApprove, setShowApprove] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [startedStatus, setStartedStatus] = useState<'importing' | 'complete' | 'undone' | null>(null);
  const [sharing, setSharing] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const alive = useRef(true);

  const clearPoll = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const applyLoaded = useCallback((data: SessionDetail) => {
    const list = data.issues ?? [];
    setIssues(list);
    setSummary(data.session?.session_settings?.validation_summary ?? null);
    setHasBookingFile(Boolean(data.session?.has_booking_file));
    setSendReminders(data.session?.session_settings?.send_import_reminders === true);
    const map: Record<string, string> = {};
    for (const f of data.files ?? []) map[f.id] = f.filename;
    setFilesById(map);
  }, []);

  const loadPlan = useCallback(async () => {
    try {
      const j = await api.plan(sessionId);
      if (alive.current && j.headline && j.narrative) setPlan({ headline: j.headline, narrative: j.narrative });
    } catch {
      // The plan is a summary; never block on it.
    }
  }, [api, sessionId]);

  const waitForValidation = useCallback(async () => {
    setPolling(true);
    setJobError(null);
    setScan(null);

    const pollOnce = async (): Promise<boolean> => {
      const lite = await api.validationJob(sessionId);
      if (!alive.current) return true;
      setScan({ processed: lite.validation_rows_processed, total: lite.validation_rows_total, percent: lite.percent });
      const st = lite.validation_job_status;
      if (st === 'failed' || st === 'complete') {
        clearPoll();
        const data = await api.getSession(sessionId);
        if (!alive.current) return true;
        applyLoaded(data);
        setPolling(false);
        setLoading(false);
        setScan(null);
        if (st === 'failed') setJobError(lite.validation_job_error ?? 'The check did not finish.');
        else void loadPlan();
        return true;
      }
      return false;
    };

    if (await pollOnce()) return;
    clearPoll();
    pollTimer.current = setInterval(() => {
      void pollOnce().catch((e: unknown) => {
        clearPoll();
        if (!alive.current) return;
        setPolling(false);
        setLoading(false);
        setScan(null);
        setError(importErrorMessage(e, 'The check could not be followed. Please try again.'));
      });
    }, POLL_MS);
  }, [api, sessionId, applyLoaded, clearPoll, loadPlan]);

  useEffect(() => {
    alive.current = true;
    void (async () => {
      setLoading(true);
      setError(null);
      setJobError(null);
      try {
        const data = await api.getSession(sessionId);
        if (!alive.current) return;
        const st = data.session?.validation_job_status;
        const status = data.session?.status;
        if (status === 'importing' || status === 'complete' || status === 'undone') {
          setStartedStatus(status);
          applyLoaded(data);
          setLoading(false);
          return;
        }
        if (st === 'queued' || st === 'running') {
          applyLoaded({ ...data, issues: [] });
          await waitForValidation();
          return;
        }
        if (st === 'failed') {
          setJobError(data.session?.validation_job_error ?? 'The check did not finish.');
          applyLoaded(data);
          setLoading(false);
          return;
        }
        if (st === 'complete' && status === 'ready') {
          applyLoaded(data);
          setLoading(false);
          void loadPlan();
          return;
        }
        await api.startValidation(sessionId);
        await waitForValidation();
      } catch (e) {
        if (alive.current) {
          setError(importErrorMessage(e, 'The check could not start. Please try again.'));
          setLoading(false);
        }
      }
    })();
    return () => {
      alive.current = false;
      clearPoll();
    };
  }, [api, sessionId, applyLoaded, waitForValidation, clearPoll, loadPlan]);

  async function runValidation(dateFormat?: DateFormatChoice) {
    setLoading(true);
    setError(null);
    setJobError(null);
    setScan(null);
    clearPoll();
    try {
      await api.startValidation(sessionId, dateFormat ? { ambiguous_date_format: dateFormat } : undefined);
      setIssues([]);
      setSummary(null);
      await waitForValidation();
    } catch (e) {
      setError(importErrorMessage(e, 'The check could not start. Please try again.'));
      setLoading(false);
      setPolling(false);
    }
  }

  async function refreshIssues() {
    try {
      applyLoaded(await api.getSession(sessionId));
    } catch (e) {
      setError(importErrorMessage(e, 'This import could not be loaded.'));
    }
  }

  async function decideAll(issueType: string, decision: IssueDecision) {
    try {
      await api.decideIssueType(sessionId, issueType, decision);
    } catch (e) {
      setError(importErrorMessage(e, 'That choice could not be saved. Please try again.'));
      return;
    }
    await refreshIssues();
  }

  async function decideOne(issueId: string, decision: IssueDecision) {
    setPatchingId(issueId);
    try {
      await api.decideIssue(sessionId, issueId, decision);
      await refreshIssues();
    } catch (e) {
      setError(importErrorMessage(e, 'That choice could not be saved. Please try again.'));
    }
    setPatchingId(null);
  }

  async function toggleReminders(enabled: boolean) {
    setSendReminders(enabled);
    setSavingReminders(true);
    try {
      await api.patchSettings(sessionId, { send_import_reminders: enabled });
    } catch (e) {
      setSendReminders(!enabled);
      setError(importErrorMessage(e, 'Your reminder choice could not be saved. Please try again.'));
    }
    setSavingReminders(false);
  }

  async function approveAndStart() {
    setApproving(true);
    setApproveError(null);
    try {
      await api.approve(sessionId);
      setShowApprove(false);
      router.push(importStepRoute(sessionId, 'importing'));
    } catch (e) {
      setApproveError(importErrorMessage(e, 'The import could not be started. Please try again.'));
    }
    setApproving(false);
  }

  async function shareReport() {
    setSharing(true);
    try {
      const csv = await api.reportCsv(sessionId);
      const res = await shareTextFile({
        filename: `import-report-${sessionId.slice(0, 8)}.csv`,
        body: csv,
        mimeType: 'text/csv',
        uti: 'public.comma-separated-values-text',
        dialogTitle: 'Import report',
      });
      if (!res.ok && res.reason !== 'web-download') toast.error('The report could not be shared. Please try again.');
    } catch (e) {
      toast.error(importErrorMessage(e, 'The report could not be loaded. Please try again.'));
    }
    setSharing(false);
  }

  const grouped = useMemo(() => groupIssues(issues), [issues]);
  const counts = useMemo(() => (issues.length ? issueCounts(issues) : null), [issues]);
  const busy = loading || polling;
  const totalRows = summary?.total_data_rows ?? null;
  const rowsReady = summary?.rows_ready ?? null;
  const blockingRows = summary?.rows_with_blocking_errors ?? null;
  const existingRows = summary?.rows_with_existing_client_warning ?? null;
  const staffSkipped = summary?.staff_files_skipped ?? 0;
  const repeatedRows = summary?.repeated_booking_rows ?? 0;
  const overlapping = summary?.overlapping_appointments ?? 0;
  const undecided = unresolvedExistingClients(issues);
  const defaultsBlocking = bookingDefaultsBlocking(issues);
  const canProceed = canApproveImport({ jobError, busy, started: startedStatus !== null, issues });
  const warningCount = counts?.warningCount ?? summary?.warning_issue_count ?? 0;
  const errorCount = counts?.errorCount ?? summary?.error_issue_count ?? 0;

  return (
    <View style={importStyles.stack}>
      <View style={importStyles.tight}>
        <Text variant="heading">Validate</Text>
        <Text variant="bodySmall" tone="secondary">
          We check your rows for missing details, duplicates and dates that could be read two ways. Large files are
          checked in the background, and your progress is saved, so you can leave and come back.
        </Text>
      </View>

      {!busy && plan ? (
        <ImportBanner tone="info" title={plan.headline}>
          {plan.narrative}
        </ImportBanner>
      ) : null}
      {error ? <ImportBanner tone="danger">{error}</ImportBanner> : null}

      {startedStatus ? (
        <ImportBanner
          tone="info"
          title={
            startedStatus === 'importing'
              ? 'This import is running'
              : startedStatus === 'complete'
                ? 'This import has finished'
                : 'This import was undone'
          }
          action={
            startedStatus === 'undone'
              ? { label: 'Back to imports', onPress: () => router.replace(IMPORT_HUB_ROUTE) }
              : {
                  label: startedStatus === 'importing' ? 'See its progress' : 'See the result',
                  onPress: () => router.replace(importStepRoute(sessionId, 'importing')),
                }
          }>
          This is what the check found. It cannot be run again or changed now.
        </ImportBanner>
      ) : null}

      {jobError ? (
        <ImportBanner tone="danger" action={{ label: 'Check again', onPress: () => void runValidation() }}>
          {jobError}
        </ImportBanner>
      ) : null}

      {busy ? (
        <Card padded>
          <View style={importStyles.stack}>
            <View style={importStyles.row}>
              <ActivityIndicator color={colors.brand} />
              <Text variant="bodySmall">{polling ? 'Checking your rows on the server…' : 'Starting the check…'}</Text>
            </View>
            {polling && scan && scan.total > 0 ? (
              <>
                <ProgressBar percent={scan.percent} label="Checking progress" />
                <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
                  {`${scan.processed.toLocaleString()} of ${scan.total.toLocaleString()} rows (${scan.percent}%)`}
                </Text>
              </>
            ) : null}
            {polling && (!scan || scan.total === 0) ? (
              <Text variant="caption" tone="muted">
                Getting ready to check your rows…
              </Text>
            ) : null}
            {polling ? (
              <Text variant="caption" tone="muted">
                Your progress is saved. You can leave and come back.
              </Text>
            ) : null}
          </View>
        </Card>
      ) : null}

      {!busy && summary && totalRows !== null ? (
        <Card padded>
          <View style={importStyles.tight}>
            <Text variant="subheading">Check complete</Text>
            <Text variant="bodySmall">
              {`✓ ${rowsReady ?? 0} of ${totalRows} rows ready to import${
                blockingRows ? ` (${blockingRows} ${plural(blockingRows, 'row has', 'rows have')} problems that stop ${plural(blockingRows, 'it', 'them')})` : ''
              }`}
            </Text>
            <Text variant="bodySmall">
              {`⚠ ${warningCount} ${plural(warningCount, 'warning', 'warnings')}${
                existingRows ? `. ${existingRows} ${plural(existingRows, 'row may match an existing', 'rows may match existing')} ${plural(existingRows, clientLabel.toLowerCase(), clientPluralLower)}` : ''
              }`}
            </Text>
            <Text variant="bodySmall">
              {`✗ ${errorCount} ${plural(errorCount, 'error', 'errors')} (those rows are left out unless you choose Import anyway where it is offered)`}
            </Text>
            {staffSkipped > 0 ? (
              <Text variant="caption" tone="muted">
                {`${staffSkipped} staff ${plural(staffSkipped, 'list was', 'lists were')} used for matching only, not imported as rows.`}
              </Text>
            ) : null}
          </View>
        </Card>
      ) : null}

      {!busy && !summary && counts ? (
        <Card padded>
          <View style={importStyles.tight}>
            <Text variant="subheading">Summary</Text>
            <Text variant="bodySmall" tone="danger">{`Errors: ${counts.errorCount}`}</Text>
            <Text variant="bodySmall" color={colors.warning}>{`Warnings: ${counts.warningCount}`}</Text>
          </View>
        </Card>
      ) : null}

      {!busy && !startedStatus && issues.some((i) => i.issue_type === 'date_format_ambiguous') ? (
        <ImportBanner tone="warning" title="Some dates could be read two ways">
          <Text variant="bodySmall">Choose how to read dates like 03/04/2025.</Text>
          <View style={importStyles.row}>
            {DATE_FORMAT_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} selected={dateChoice === o.value} onPress={() => setDateChoice(o.value)} />
            ))}
          </View>
          <Button
            label="Apply and check again"
            size="sm"
            disabled={!dateChoice}
            onPress={() => {
              if (dateChoice) void runValidation(dateChoice);
            }}
            style={styles.start}
          />
        </ImportBanner>
      ) : null}

      {!busy && !startedStatus && issues.some((i) => i.issue_type === 'existing_client') ? (
        <View style={importStyles.row}>
          <Button label={`Update all existing ${clientPluralLower}`} size="sm" onPress={() => void decideAll('existing_client', 'update_existing')} />
          <Button label="Skip all duplicates" size="sm" variant="secondary" onPress={() => void decideAll('existing_client', 'skip')} />
        </View>
      ) : null}

      {!busy && !startedStatus && issues.some((i) => i.issue_type === 'email_invalid') ? (
        <View style={importStyles.tight}>
          <Text variant="caption" tone="secondary">
            Email addresses that look wrong:
          </Text>
          <View style={importStyles.row}>
            <Button label="Import them all without the email" size="sm" onPress={() => void decideAll('email_invalid', 'import_anyway')} />
            <Button label="Skip all these rows" size="sm" variant="secondary" onPress={() => void decideAll('email_invalid', 'skip')} />
          </View>
        </View>
      ) : null}

      {!busy && issues.length > 0 ? (
        <View style={importStyles.stack}>
          <Text variant="label">Issues by type</Text>
          {grouped.map(([issueType, list]) => (
            <Card key={issueType} padded testID={`import-issues-${issueType}`}>
              <View style={importStyles.tight}>
                <Text variant="label">{issueTypeLabel(issueType, clientLabel)}</Text>
                <Text variant="caption" tone="muted">{`${list.length} ${plural(list.length, 'issue', 'issues')}`}</Text>
              </View>
              <ScrollView style={styles.issueList} nestedScrollEnabled>
                {list.map((i) => {
                  const file = filesById[i.file_id];
                  const synthetic = isSyntheticReferenceIssue(i);
                  const decisions = decisionsForIssue(i.issue_type);
                  return (
                    <View key={i.id} style={[styles.issue, { borderTopColor: colors.border }]}>
                      <Text variant="bodySmall" tone={i.severity === 'error' ? 'danger' : 'default'}>
                        {synthetic ? `${file ? `${file}: ` : ''}${i.message}` : `Row ${i.row_number}${file ? `, ${file}` : ''}: ${i.message}`}
                      </Text>
                      <View style={importStyles.row}>
                        {i.user_decision ? <Badge label={decisionLabel(i.user_decision)} /> : null}
                        {!synthetic ? (
                          <Button
                            label="View row"
                            size="sm"
                            variant="ghost"
                            onPress={() => setPreview({ fileId: i.file_id, row: i.row_number, filename: file ?? 'File' })}
                          />
                        ) : null}
                        {decisions.map((d) => (
                          <Chip
                            key={d}
                            label={decisionLabel(d)}
                            selected={i.user_decision === d}
                            onPress={() => {
                              if (patchingId !== i.id && !startedStatus && i.user_decision !== d) void decideOne(i.id, d);
                            }}
                          />
                        ))}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </Card>
          ))}
        </View>
      ) : null}

      {!busy && defaultsBlocking ? (
        <ImportBanner tone="danger" title="Your venue is not ready for a booking import yet">
          {'Resolve the "Venue setup needed" issue above (set up the venue, then check again) before you start the import.'}
        </ImportBanner>
      ) : null}

      {!busy && !startedStatus && undecided > 0 ? (
        <ImportBanner
          tone="warning"
          title={`Decide what to do with ${undecided} existing-${clientLabel.toLowerCase()} ${plural(undecided, 'match', 'matches')}`}>
          Choose Update existing or Skip row for each, or use the buttons above for all of them. The import cannot start
          while any are undecided.
        </ImportBanner>
      ) : null}

      {!busy && !startedStatus && (repeatedRows > 0 || overlapping > 0) ? (
        <ImportBanner tone="warning" title="Check these before you approve">
          {repeatedRows > 0 ? (
            <Text variant="bodySmall">
              {repeatedRows === 1
                ? '• 1 row is an exact repeat of an earlier row in your file. It will be skipped, so that appointment is not brought in twice.'
                : `• ${repeatedRows} rows are exact repeats of earlier rows in your file. They will be skipped, so those appointments are not brought in twice.`}
            </Text>
          ) : null}
          {overlapping > 0 ? (
            <Text variant="bodySmall">
              {`• ${overlapping === 1 ? '1 upcoming appointment overlaps' : `${overlapping} upcoming appointments overlap`} another on the same calendar. They will still be imported exactly as your file has them. The list above names each one, so you can fix your file first or move them in your calendar afterwards.`}
            </Text>
          ) : null}
        </ImportBanner>
      ) : null}

      {!busy && !startedStatus && rowsReady !== null && totalRows !== null ? (
        <ImportBanner tone="info" title="Ready to import">
          {`Up to ${rowsReady} of ${totalRows} rows can be brought in. Rows with problems that stop them are left out, unless you chose Import anyway for an email.`}
        </ImportBanner>
      ) : null}

      {!busy && !startedStatus && hasBookingFile ? (
        <Card padded>
          <TickRow
            label="Send upcoming reminders for imported bookings"
            help={`Off unless you tick it. Booking confirmations are not sent again for imported bookings, but the reminders your Communications settings schedule (for example 24 hours and 2 hours before) will go out for future bookings whose send time is still ahead. Reminders whose time has already passed are not sent. Only tick this if you want your imported ${clientPluralLower} contacted.${savingReminders ? ' Saving…' : ''}`}
            checked={sendReminders}
            disabled={savingReminders}
            onChange={(next) => void toggleReminders(next)}
          />
        </Card>
      ) : null}

      <View style={importStyles.between}>
        <Button label="Back" variant="secondary" onPress={() => router.replace(importStepRoute(sessionId, 'references'))} />
        <Button label="Share report" variant="secondary" loading={sharing} disabled={busy || sharing} onPress={() => void shareReport()} />
      </View>
      <Button label="Review and approve" disabled={!canProceed} onPress={() => setShowApprove(true)} fullWidth />

      <Sheet visible={showApprove} onClose={() => !approving && setShowApprove(false)} fill maxHeight="88%">
        <View style={styles.sheetHeader}>
          <Text variant="heading">Review and approve</Text>
          <Text variant="bodySmall" tone="muted">
            This is the last step before anything is added to your venue.
          </Text>
        </View>
        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody}>
          {plan ? (
            <ImportBanner tone="info" title={plan.headline}>
              {plan.narrative}
            </ImportBanner>
          ) : null}
          <Text variant="label">What happens when you approve:</Text>
          {rowsReady != null ? <Text variant="bodySmall">{`✓ ${rowsReady} ${plural(rowsReady, 'row', 'rows')} ready to import.`}</Text> : null}
          {existingRows ? (
            <Text variant="bodySmall">{`↻ ${existingRows} match existing ${clientPluralLower}, handled as you chose above.`}</Text>
          ) : null}
          {blockingRows ? (
            <Text variant="bodySmall">{`⚠ ${blockingRows} ${plural(blockingRows, 'row', 'rows')} with problems that are not settled will be left out.`}</Text>
          ) : null}
          {repeatedRows > 0 ? (
            <Text variant="bodySmall">{`⚠ ${repeatedRows} repeated ${plural(repeatedRows, 'row', 'rows')} will be skipped, so no appointment comes in twice.`}</Text>
          ) : null}
          {overlapping > 0 ? (
            <Text variant="bodySmall">
              {`⚠ ${overlapping} upcoming ${overlapping === 1 ? 'appointment overlaps' : 'appointments overlap'} another on the same calendar. They will be imported as they are.`}
            </Text>
          ) : null}
          {staffSkipped > 0 ? (
            <Text variant="bodySmall">{`• ${staffSkipped} staff ${plural(staffSkipped, 'file', 'files')} used for matching only (not imported as bookings).`}</Text>
          ) : null}
          <Text variant="caption" tone="secondary">
            {`This creates real ${clientPluralLower} and bookings in your venue. You can undo the whole import for 24 hours afterwards.`}
          </Text>
          {approveError ? <ImportBanner tone="danger">{approveError}</ImportBanner> : null}
        </ScrollView>
        <View style={styles.sheetFooter}>
          <Button label="Not yet" variant="secondary" disabled={approving} onPress={() => setShowApprove(false)} style={styles.flex} />
          <Button
            label={approving ? 'Starting…' : 'Approve and start import'}
            loading={approving}
            disabled={approving || !canProceed}
            onPress={() => void approveAndStart()}
            style={styles.flex}
          />
        </View>
      </Sheet>

      <RowPreviewSheet api={api} sessionId={sessionId} target={preview} onClose={() => setPreview(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: 'flex-start' },
  issueList: { maxHeight: 320, marginTop: spacing.sm },
  issue: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm, gap: spacing.xs },
  sheetHeader: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs },
  sheetScroll: { flex: 1 },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  sheetFooter: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  flex: { flex: 1 },
});
