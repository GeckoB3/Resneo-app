import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ErrorLine, Notice, PosSheet, usePosT } from '@/components/pos/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { reportsCopy, type ReportsCopyId } from '@/lib/pos/reports-copy';
import { useVoucherImport } from '@/lib/queries/usePosReports';
import {
  csvHeaderRow,
  formatMoneyExact,
  guessColumns,
  IMPORT_COLUMNS,
  IMPORT_MAX_BYTES,
  IMPORT_TEMPLATE,
  type ImportColumnKey,
} from '@/lib/reports/pos-report-format';
import { shareTextFile } from '@/lib/share/share-text-file';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { VoucherImportResult } from '@/types/pos-reports';

/**
 * Importing existing vouchers from a CSV (web `VoucherImportDialog.tsx`, UX spec §20.7), as steps
 * in a sheet: choose the file, match the columns, check every row (a dry run on the server), then
 * import. New ResNeo codes come back once, and are offered as a file once; they are never kept
 * after that, and the sheet will not close while they are still to be taken. Mounted only while
 * open, so each opening starts again from the first step.
 */

type Step = 'upload' | 'match' | 'check' | 'done';

async function readText(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return res.text();
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the legacy sub-path exports readAsStringAsync
  const FileSystem = require('expo-file-system/legacy') as any;
  return (await FileSystem.readAsStringAsync(uri)) as string;
}

export function VoucherImportSheet({ visible, currency, onClose }: { visible: boolean; currency: string; onClose: () => void }) {
  const t = usePosT();
  const { colors } = useTheme();
  const money = (p: number) => formatMoneyExact(p, currency);
  const run = useVoucherImport();
  const [step, setStep] = useState<Step>('upload');
  const [csv, setCsv] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columns, setColumns] = useState<Partial<Record<ImportColumnKey, string>>>({});
  const [newCodes, setNewCodes] = useState(false);
  const [checked, setChecked] = useState<VoucherImportResult | null>(null);
  const [result, setResult] = useState<VoucherImportResult | null>(null);
  const [codesTaken, setCodesTaken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;
      const asset = picked.assets?.[0];
      if (!asset) return;
      if ((asset.size ?? 0) > IMPORT_MAX_BYTES) {
        setError(reportsCopy('vimp.tooBig'));
        return;
      }
      const text = await readText(asset.uri);
      const head = csvHeaderRow(text);
      if (head.length === 0) {
        setError(reportsCopy('vimp.unreadable'));
        return;
      }
      setCsv(text);
      setHeaders(head);
      setColumns(guessColumns(head));
      setStep('match');
    } catch {
      setError(reportsCopy('vimp.unreadable'));
    }
  };

  const body = (dryRun: boolean, codes = newCodes) => ({
    csv: csv ?? '',
    dry_run: dryRun,
    new_codes: codes,
    columns: Object.fromEntries(Object.entries(columns).filter(([, v]) => Boolean(v))) as Record<string, string>,
  });

  const check = async (codes = newCodes) => {
    if (!csv || !columns.balance) return;
    setError(null);
    try {
      setChecked(await run.mutateAsync(body(true, codes)));
      setStep('check');
    } catch (e) {
      setError(posErrorMessage(e, t('common.networkError')));
    }
  };

  const commit = async () => {
    setError(null);
    try {
      setResult(await run.mutateAsync(body(false)));
      setCsv(null);
      setStep('done');
    } catch (e) {
      setError(posErrorMessage(e, t('common.networkError')));
    }
  };

  const takeCodes = async () => {
    if (!result || codesTaken) return;
    const lines = ['Row,Code,Ending', ...result.codes.map((c) => `${c.row},${c.code},${c.last4}`)];
    await shareTextFile({ filename: 'new-voucher-codes.csv', body: `${lines.join('\r\n')}\r\n`, mimeType: 'text/csv', uti: 'public.comma-separated-values-text' });
    // Once only: the codes leave this screen with the file.
    setResult({ ...result, codes: [] });
    setCodesTaken(true);
  };

  const close = () => {
    if (result?.codes.length && !codesTaken) {
      // Leaving without the codes would lose them; the button stays the way out.
      setError(reportsCopy('vimp.downloadCodes'));
      return;
    }
    onClose();
  };

  const footer =
    step === 'upload' ? (
      <Button label={t('common.cancel')} variant="ghost" onPress={close} fullWidth />
    ) : step === 'match' ? (
      <View style={styles.gap}>
        <Button label={reportsCopy('vimp.check')} loading={run.isPending} disabled={!columns.balance} onPress={() => void check()} fullWidth />
        <Button label={reportsCopy('vimp.back')} variant="ghost" onPress={() => setStep('upload')} fullWidth />
      </View>
    ) : step === 'check' ? (
      <View style={styles.gap}>
        <Button
          label={reportsCopy('vimp.commit')}
          loading={run.isPending}
          disabled={!checked || checked.summary.count === 0}
          onPress={() => void commit()}
          fullWidth
        />
        <Button label={reportsCopy('vimp.back')} variant="ghost" onPress={() => setStep('match')} fullWidth />
      </View>
    ) : (
      <Button label={reportsCopy('vadd.finish')} onPress={close} fullWidth />
    );

  return (
    <PosSheet visible={visible} onClose={close} title={reportsCopy('vimp.title')} footer={footer}>
      <ErrorLine message={error} />

      {step === 'upload' ? (
        <View style={styles.gap}>
          <Text variant="bodySmall">{reportsCopy('vimp.body')}</Text>
          <Button label={reportsCopy('vimp.choose')} variant="secondary" onPress={() => void pick()} fullWidth />
          <Button
            label={reportsCopy('vimp.template')}
            variant="ghost"
            onPress={() =>
              void shareTextFile({
                filename: 'gift-voucher-template.csv',
                body: IMPORT_TEMPLATE,
                mimeType: 'text/csv',
                uti: 'public.comma-separated-values-text',
              })
            }
          />
        </View>
      ) : null}

      {step === 'match'
        ? IMPORT_COLUMNS.map((c) => {
            const label = reportsCopy(`vimp.col.${c.key}` as ReportsCopyId);
            return (
              <View key={c.key} style={styles.gap}>
                <Text variant="label" tone="secondary">
                  {c.required ? label : reportsCopy('vimp.optional', { label })}
                </Text>
                <View style={styles.chips}>
                  <Chip
                    label={c.required ? reportsCopy('vimp.chooseColumn') : reportsCopy('vimp.notInFile')}
                    selected={!columns[c.key]}
                    onPress={() => setColumns((cur) => ({ ...cur, [c.key]: undefined }))}
                  />
                  {headers.map((h) => (
                    <Chip key={h} label={h} selected={columns[c.key] === h} onPress={() => setColumns((cur) => ({ ...cur, [c.key]: h }))} />
                  ))}
                </View>
              </View>
            );
          })
        : null}

      {step === 'check' && checked ? (
        <View style={styles.gap}>
          <Text variant="label">
            {reportsCopy('vimp.summary', {
              count: checked.summary.count,
              amount: money(checked.summary.amount_pence),
              problems: checked.summary.problems,
            })}
          </Text>
          <Chip
            label={reportsCopy('vimp.newCodes')}
            selected={newCodes}
            onPress={() => {
              if (run.isPending) return;
              const next = !newCodes;
              setNewCodes(next);
              void check(next);
            }}
          />
          <View style={[styles.rows, { borderColor: colors.border }]}>
            {checked.rows.map((r) => (
              <View key={r.row} style={[styles.row, { borderBottomColor: colors.border }]}>
                <Text variant="bodySmall" tone="secondary">
                  {reportsCopy('vimp.row', { row: r.row })}
                </Text>
                <View style={styles.rowRight}>
                  {r.status === 'new' ? <Text variant="bodySmall">{money(r.balance_pence)}</Text> : null}
                  <Badge
                    tone={r.status === 'new' ? 'success' : r.status === 'exists' ? 'neutral' : 'danger'}
                    label={
                      r.status === 'new'
                        ? reportsCopy('vimp.row.new')
                        : r.status === 'exists'
                          ? reportsCopy('vimp.row.exists')
                          : reportsCopy('vimp.row.error', { problem: r.problem ?? '' })
                    }
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {step === 'done' && result ? (
        <View style={styles.gap}>
          <Notice tone="success">
            {reportsCopy('vimp.done', { count: result.summary.count, amount: money(result.summary.amount_pence) })}
          </Notice>
          {result.codes.length ? <Button label={reportsCopy('vimp.downloadCodes')} onPress={() => void takeCodes()} fullWidth /> : null}
        </View>
      ) : null}
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  rows: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
});
