import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { ImportBanner, ProgressBar, importStyles } from '@/components/import/ImportParts';
import { ImportStepFrame } from '@/components/import/ImportStepFrame';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { importErrorCode, importErrorMessage, useImportApi } from '@/lib/import/api';
import { elapsedLabel, etaLabel, notStartedStep, POLL_FAILURE_THRESHOLD } from '@/lib/import/progress';
import { IMPORT_HUB_ROUTE, importStepRoute } from '@/lib/import/session-status';
import type { ImportProgress, QaReport } from '@/lib/import/types';
import { shareTextFile } from '@/lib/share/share-text-file';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';

/**
 * Step 6, Import (web `ImportingStepClient`). Carries on an import that "Approve and start
 * import" began: it posts one batch at a time while a once-a-second check moves the bar, then
 * shows what came in, a spot check, the report and a way to the clients list. It never starts
 * an import; opened on one that was not approved, it says so and points back.
 */
export default function ImportingStepScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <ImportStepFrame title="Import" sessionId={sessionId} step="importing">
      <ImportingStep sessionId={String(sessionId)} />
    </ImportStepFrame>
  );
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function ImportingStep({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const toast = useToast();
  const api = useImportApi();
  const { terminology } = useVenueContext();
  const clientLabel = terminology.client;
  const startMs = useRef<number | null>(null);
  /** When the run started (the server's `started_at`, or our first batch), for the clock. */
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [notStarted, setNotStarted] = useState(false);
  const [pollFailures, setPollFailures] = useState(0);
  const [pollError, setPollError] = useState<string | null>(null);
  const [qa, setQa] = useState<QaReport | null>(null);
  const [sharing, setSharing] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const qaRequested = useRef(false);

  // The clock ticks while the import runs, for the elapsed time and time left.
  useEffect(() => {
    if (progress?.status !== 'importing' && !executing) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [progress?.status, executing]);

  // The spot check runs once the import completes (advisory).
  useEffect(() => {
    if (progress?.status !== 'complete' || qaRequested.current) return;
    qaRequested.current = true;
    void api
      .qa(sessionId)
      .then((j) => {
        if (j.report) setQa(j.report);
      })
      .catch(() => {});
  }, [progress?.status, api, sessionId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stopPolling = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const pollOnce = async (): Promise<ImportProgress> => {
      const data = await api.progress(sessionId);
      if (cancelled) return data;
      setPollFailures(0);
      setPollError(null);
      if (startMs.current === null && data.status === 'importing' && data.started_at) {
        const t = Date.parse(data.started_at);
        if (!Number.isNaN(t)) {
          startMs.current = t;
          setStartedAt(t);
        }
      }
      setProgress(data);
      if (data.status === 'complete' || data.status === 'failed') stopPolling();
      return data;
    };

    void (async () => {
      setError(null);
      setNotStarted(false);
      try {
        timer = setInterval(() => {
          void pollOnce().catch((e: unknown) => {
            if (cancelled) return;
            setPollFailures((n) => {
              const next = n + 1;
              if (next >= POLL_FAILURE_THRESHOLD) {
                setPollError(importErrorMessage(e, 'The progress could not be loaded. Check you are still signed in.'));
              }
              return next;
            });
          });
        }, 1000);

        const first = await pollOnce();
        if (cancelled || first.status === 'complete' || first.status === 'failed') return;
        if (first.status !== 'importing') {
          stopPolling();
          setNotStarted(true);
          return;
        }

        let driving = true;
        while (driving && !cancelled) {
          if (startMs.current === null) {
            startMs.current = Date.now();
            setStartedAt(startMs.current);
          }
          setExecuting(true);
          let done = false;
          try {
            const body = await api.executeBatch(sessionId);
            done = body.done === true;
          } catch (e) {
            const code = importErrorCode(e);
            if (code === 'IMPORT_NOT_APPROVED' || code === 'IMPORT_NOT_READY') {
              stopPolling();
              if (!cancelled) setNotStarted(true);
              return;
            }
            throw e;
          } finally {
            if (!cancelled) setExecuting(false);
          }
          await pollOnce();
          if (done) {
            for (let spins = 0; !cancelled && spins < 400; spins += 1) {
              const d = await pollOnce();
              if (d.status === 'complete' || d.status === 'failed') break;
              await new Promise((r) => setTimeout(r, 200));
            }
            driving = false;
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            importErrorMessage(
              e,
              'The import request did not finish. The server may still be working: wait a minute, then check again.',
            ),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [api, sessionId, runKey]);

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

  const pct = progress?.percent ?? 0;
  const elapsed = now ? elapsedLabel(progress, startedAt, now) : null;
  const eta = now ? etaLabel(progress, startedAt, now) : null;
  const stage = (() => {
    if (error) return null;
    if (pollError) return 'Could not refresh the progress';
    if (progress?.status === 'complete') return 'Finished';
    if (progress?.status === 'failed') return 'Stopped';
    if (executing) return 'Importing a batch on the server…';
    if (progress?.status === 'importing') return 'Import in progress…';
    if (!progress) return 'Loading the import…';
    return null;
  })();
  const back = notStartedStep(progress?.status);

  return (
    <View style={importStyles.stack}>
      <View style={importStyles.tight}>
        <Text variant="heading">Importing</Text>
        <Text variant="bodySmall" tone="secondary">
          Large imports run in batches. You can leave this screen: progress is saved, and opening this step again picks
          it up.
        </Text>
      </View>

      {error ? (
        <ImportBanner tone="danger" action={{ label: 'Check again', onPress: () => setRunKey((k) => k + 1) }}>
          {error}
        </ImportBanner>
      ) : null}

      {pollError && !error ? (
        <ImportBanner
          tone="warning"
          title="Progress updates have paused."
          action={{ label: 'Check again', onPress: () => setRunKey((k) => k + 1) }}>
          {`${pollError}${pollFailures > 0 ? ` (${pollFailures} failed checks)` : ''}`}
        </ImportBanner>
      ) : null}

      {notStarted && !error ? (
        <Card padded>
          {progress?.status === 'undone' ? (
            <View style={importStyles.stack}>
              <Text variant="subheading">This import was undone</Text>
              <Text variant="bodySmall" tone="secondary">
                What it added has been taken out again. Start a new import if you want to bring the file in again.
              </Text>
              <Button label="Back to imports" variant="secondary" onPress={() => router.replace(IMPORT_HUB_ROUTE)} />
            </View>
          ) : (
            <View style={importStyles.stack}>
              <Text variant="subheading">This import has not started yet</Text>
              <Text variant="bodySmall" tone="secondary">
                Nothing has been added to your venue. An import only starts when you press Review and approve on the
                Validate step, then Approve and start import.
              </Text>
              <Button label={back.label} onPress={() => router.replace(importStepRoute(sessionId, back.step))} />
            </View>
          )}
        </Card>
      ) : null}

      {!error && !notStarted ? (
        <Card padded>
          <View style={importStyles.stack}>
            <View style={importStyles.between}>
              <Text variant="label">Progress</Text>
              {stage ? (
                <Text variant="caption" tone="brand" accessibilityLiveRegion="polite">
                  {stage}
                </Text>
              ) : null}
            </View>
            <ProgressBar percent={pct} label="Import progress" />
            <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
              {`${progress?.progress_processed ?? 0} of ${progress?.progress_total ?? 0} rows, ${pct}%${elapsed ? `. Elapsed ${elapsed}` : ''}${eta ? `. ${eta} left` : ''}`}
            </Text>
            {progress?.status === 'importing' && executing && (progress.progress_processed ?? 0) === 0 && (progress.progress_total ?? 0) > 0 ? (
              <Text variant="caption" tone="muted">
                The row count moves after each batch on the server, often within the first minute on a large file.
              </Text>
            ) : null}

            {progress?.status === 'complete' ? (
              <View style={importStyles.stack}>
                <Text variant="subheading" tone="success">
                  Import complete
                </Text>
                <Text variant="bodySmall">
                  {`${capitalize(clientLabel)}s brought in: ${progress.imported_clients ?? 0}${
                    progress.updated_existing ? ` (${progress.updated_existing} existing updated)` : ''
                  }`}
                </Text>
                <Text variant="bodySmall">{`Bookings: ${progress.imported_bookings ?? 0}. Skipped rows: ${progress.skipped_rows ?? 0}`}</Text>
                {(progress.repeated_rows_skipped ?? 0) > 0 ? (
                  <Text variant="caption" tone="secondary">
                    {progress.repeated_rows_skipped === 1
                      ? '1 of the skipped rows was an exact repeat of an earlier row in your file, so that appointment was not brought in twice.'
                      : `${progress.repeated_rows_skipped} of the skipped rows were exact repeats of earlier rows in your file, so those appointments were not brought in twice.`}
                  </Text>
                ) : null}
                {(progress.overlapping_appointments ?? 0) > 0 ? (
                  <ImportBanner tone="warning">
                    {`${progress.overlapping_appointments === 1 ? '1 upcoming appointment overlaps' : `${progress.overlapping_appointments} upcoming appointments overlap`} another on the same calendar. They were imported as your file had them. The import report lists each one, so you can move them in your calendar.`}
                  </ImportBanner>
                ) : null}
                {qa && qa.checked > 0 ? (
                  <ImportBanner tone={qa.mismatches.length === 0 ? 'success' : 'warning'}>{qa.summary}</ImportBanner>
                ) : null}
                <Button label="Share the import report" variant="secondary" loading={sharing} onPress={() => void shareReport()} />
                <Button label={`See your ${clientLabel.toLowerCase()}s`} onPress={() => router.replace('/clients' as Href)} />
                <Button label="Back to imports" variant="ghost" onPress={() => router.replace(IMPORT_HUB_ROUTE)} />
              </View>
            ) : null}

            {progress?.status === 'failed' ? (
              <View style={importStyles.stack}>
                <Text variant="subheading" tone="danger">
                  Import failed
                </Text>
                <Text variant="bodySmall" tone="secondary">
                  {progress.error_message?.trim() || 'No details came back. Check your imports or try again.'}
                </Text>
                <Button label="Back to imports" variant="secondary" onPress={() => router.replace(IMPORT_HUB_ROUTE)} />
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}
    </View>
  );
}
