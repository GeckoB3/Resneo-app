import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ChoiceChips, PosSheet } from '@/components/pos/parts';
import { CheckRow, FieldBlock, MessageBox } from '@/components/pos/settings-more/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { posFetch } from '@/lib/pos/api';
import { settingsErrorMessage, settingsMorePaths } from '@/lib/pos/settings-more/api';
import { vchT } from '@/lib/pos/settings-more/vouchers-copy';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { usePosGate } from '@/lib/queries/usePos';
import { shareTextFile } from '@/lib/share/share-text-file';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import {
  guessColumns,
  IMPORT_COLUMNS,
  importBody,
  importTemplateCsv,
  MAX_IMPORT_BYTES,
  moneyExact,
  newCodesCsv,
  readCsvHeaders,
  type ImportColumnKey,
  type ImportResult,
} from './voucher-settings-logic';

/** A large file can take a while to check and import: longer than the usual 15 seconds. */
const IMPORT_TIMEOUT_MS = 120_000;
const CSV_TYPES = ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain', 'application/vnd.ms-excel'];
/** The chip value for "Not in the file" (a header is never empty, so this can't clash). */
const NONE = '';

/** Reads a picked file as text: `expo-file-system`'s `File`, else the legacy reader. */
export async function readPickedText(uri: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module, loaded when used
    const { File } = require('expo-file-system') as { File?: new (uri: string) => { text(): Promise<string> } };
    if (typeof File === 'function') return await new File(uri).text();
  } catch {
    // Fall through to the legacy reader.
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module, loaded when used
  const legacy = require('expo-file-system/legacy') as { readAsStringAsync: (uri: string) => Promise<string> };
  return legacy.readAsStringAsync(uri);
}

/**
 * Importing existing vouchers from a CSV (UX spec §20.7, web `VoucherImportDialog`), as a stepper
 * in a sheet: pick the file, match the columns, check every row (a dry run on the server), then
 * import. New ResNeo codes come back once and are offered once, as a CSV through the share sheet;
 * the sheet won't close until they have been taken. `POST /api/venue/pos/vouchers/import`, which
 * needs `manage_vouchers` (admins have it); the server checks it.
 */
export function VoucherImportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { accessToken } = usePosGate();
  const [step, setStep] = useState<'upload' | 'match' | 'check' | 'done'>('upload');
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columns, setColumns] = useState<Partial<Record<ImportColumnKey, string>>>({});
  const [newCodes, setNewCodes] = useState(false);
  const [checked, setChecked] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [codesTaken, setCodesTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({
        type: CSV_TYPES,
        multiple: false,
        // Android: the picker's own content:// link, which carries a read grant (as the services
        // set-up sheet does); iOS: a copy in the cache.
        copyToCacheDirectory: Platform.OS !== 'android',
      });
    } catch {
      setError(vchT('app.imp.pickError'));
      return;
    }
    const asset = picked.canceled ? null : picked.assets?.[0];
    if (!asset) return;
    if ((asset.size ?? 0) > MAX_IMPORT_BYTES) {
      setError(vchT('web.imp.tooBig'));
      return;
    }
    let text: string;
    try {
      text = await readPickedText(asset.uri);
    } catch {
      setError(vchT('web.imp.unreadable'));
      return;
    }
    if (text.length > MAX_IMPORT_BYTES) {
      setError(vchT('web.imp.tooBig'));
      return;
    }
    const head = readCsvHeaders(text);
    if (head.length === 0) {
      setError(vchT('web.imp.unreadable'));
      return;
    }
    setCsv(text);
    setFileName(asset.name ?? null);
    setHeaders(head);
    setColumns(guessColumns(head));
    setChecked(null);
    setStep('match');
  };

  const shareTemplate = async () => {
    const res = await shareTextFile({
      filename: 'gift-voucher-template.csv',
      body: importTemplateCsv(),
      mimeType: 'text/csv',
      uti: 'public.comma-separated-values-text',
      dialogTitle: vchT('vimp.template'),
    });
    if (!res.ok) setError(vchT('app.imp.shareError'));
  };

  const send = (dryRun: boolean, codes: boolean) =>
    posFetch<ImportResult>(settingsMorePaths.voucherImport, {
      accessToken: accessToken!,
      method: 'POST',
      body: importBody(csv!, columns, dryRun, codes),
      timeoutMs: IMPORT_TIMEOUT_MS,
    });

  const check = async (codes = newCodes) => {
    if (!csv || !columns.balance || !accessToken) return;
    setBusy(true);
    setError(null);
    try {
      setChecked(await send(true, codes));
      setStep('check');
    } catch (e) {
      setError(settingsErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!csv || !accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await send(false, newCodes);
      setResult(res);
      setCsv(null);
      setStep('done');
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.pos.all(), 'stored-value', keyScope(accessToken)] });
    } catch (e) {
      setError(settingsErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const takeCodes = async () => {
    if (!result || codesTaken || result.codes.length === 0) return;
    setError(null);
    const res = await shareTextFile({
      filename: 'new-voucher-codes.csv',
      body: newCodesCsv(result.codes),
      mimeType: 'text/csv',
      uti: 'public.comma-separated-values-text',
      dialogTitle: vchT('vimp.downloadCodes'),
    });
    if (!res.ok) {
      // Nothing left the screen, so the codes stay for another try.
      setError(vchT('app.imp.shareError'));
      return;
    }
    // Once only: the codes leave this screen with the file.
    setResult({ ...result, codes: [] });
    setCodesTaken(true);
  };

  const close = () => {
    if (result?.codes.length && !codesTaken) {
      // Leaving without the codes would lose them; the button stays the way out.
      setError(vchT('vimp.downloadCodes'));
      return;
    }
    onClose();
  };

  const footer =
    step === 'upload' ? (
      <Button label={vchT('web.cancel')} variant="secondary" onPress={close} fullWidth />
    ) : step === 'match' ? (
      <View style={styles.buttons}>
        <Button label={vchT('web.imp.check')} onPress={() => void check()} loading={busy} disabled={!columns.balance} fullWidth />
        <Button label={vchT('web.imp.back')} variant="secondary" onPress={() => setStep('upload')} disabled={busy} fullWidth />
      </View>
    ) : step === 'check' ? (
      <View style={styles.buttons}>
        <Button
          label={vchT('vimp.commit')}
          onPress={() => void commit()}
          loading={busy}
          disabled={!checked || checked.summary.count === 0}
          fullWidth
        />
        <Button label={vchT('web.imp.back')} variant="secondary" onPress={() => setStep('match')} disabled={busy} fullWidth />
      </View>
    ) : (
      <Button label={vchT('web.done')} onPress={close} fullWidth />
    );

  return (
    <PosSheet visible={visible} onClose={close} title={vchT('vimp.title')} footer={footer}>
      <View style={styles.stack}>
        {error ? (
          <MessageBox tone="danger" role="alert">
            {error}
          </MessageBox>
        ) : null}

        {step === 'upload' ? (
          <View style={styles.stack}>
            <Text variant="bodySmall">{vchT('vimp.body')}</Text>
            <FieldBlock label={vchT('web.imp.file')}>
              <Button label={vchT('app.imp.pick')} variant="secondary" onPress={() => void pick()} fullWidth />
            </FieldBlock>
            <Button label={vchT('vimp.template')} variant="ghost" onPress={() => void shareTemplate()} />
          </View>
        ) : null}

        {step === 'match' ? (
          <View style={styles.stack}>
            {fileName ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {fileName}
              </Text>
            ) : null}
            {IMPORT_COLUMNS.map((c) => {
              const label = vchT(c.labelId);
              const options = [
                ...(c.required ? [] : [{ value: NONE, label: vchT('web.imp.notInFile') }]),
                ...headers.map((h) => ({ value: h, label: h })),
              ];
              return (
                <FieldBlock
                  key={c.key}
                  label={c.required ? label : vchT('web.imp.optional', { label })}
                  help={c.required && !columns[c.key] ? vchT('web.imp.chooseColumn') : null}>
                  <ChoiceChips
                    options={options}
                    value={columns[c.key] ?? NONE}
                    onChange={(v) => setColumns((cur) => ({ ...cur, [c.key]: v || undefined }))}
                  />
                </FieldBlock>
              );
            })}
          </View>
        ) : null}

        {step === 'check' && checked ? (
          <View style={styles.stack}>
            <Text variant="bodyMedium">
              {vchT('vimp.summary', {
                count: checked.summary.count,
                amount: moneyExact(checked.summary.amount_pence),
                problems: checked.summary.problems,
              })}
            </Text>
            <CheckRow
              label={vchT('vimp.newCodes')}
              checked={newCodes}
              disabled={busy}
              onChange={(v) => {
                setNewCodes(v);
                void check(v);
              }}
            />
            <View style={[styles.rows, { borderColor: colors.border }]}>
              {checked.rows.map((r) => (
                <View key={r.row} style={[styles.row, { borderBottomColor: colors.border }]}>
                  <Text variant="bodySmall" tone="secondary">
                    {vchT('web.imp.row', { row: r.row })}
                  </Text>
                  <View style={styles.rowRight}>
                    {r.status === 'new' ? <Text variant="bodySmall">{moneyExact(r.balance_pence)}</Text> : null}
                    <Badge
                      tone={r.status === 'new' ? 'success' : r.status === 'exists' ? 'neutral' : 'danger'}
                      label={
                        r.status === 'new'
                          ? vchT('vimp.row.new')
                          : r.status === 'exists'
                            ? vchT('vimp.row.exists')
                            : vchT('vimp.row.error', { problem: r.problem ?? '' })
                      }
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {step === 'done' && result ? (
          <View style={styles.stack} accessibilityLiveRegion="polite">
            <MessageBox tone="success" role="status">
              {vchT('vimp.done', { count: result.summary.count, amount: moneyExact(result.summary.amount_pence) })}
            </MessageBox>
            {result.codes.length ? <Button label={vchT('vimp.downloadCodes')} onPress={() => void takeCodes()} fullWidth /> : null}
          </View>
        ) : null}
      </View>
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  buttons: { gap: spacing.sm },
  rows: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
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
