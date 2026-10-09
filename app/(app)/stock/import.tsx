import * as DocumentPicker from 'expo-document-picker';
import { type Href, Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceChips, ErrorLine, Notice, posStyles } from '@/components/pos/parts';
import { SwitchRow } from '@/components/retail/setup-parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { isTrackStockOn } from '@/lib/pos/pos-enabled';
import {
  guessImportColumns,
  IMPORT_FIELD_LABELS,
  IMPORT_MAX_BYTES,
  IMPORT_REQUIRED,
  importBody,
  importFields,
  importTemplateCsv,
  looksLikeCsv,
  readCsvHeaders,
  rowsNotSaved,
  type ImportField,
  type ImportResult,
  type ImportRow,
} from '@/lib/retail/product-import';
import { readPickedFileText } from '@/lib/retail/read-picked-file';
import { canRetail } from '@/lib/retail/stock-access';
import { useStockT } from '@/lib/retail/stock-setup-copy';
import { usePosBootstrap, usePosEnabled } from '@/lib/queries/usePos';
import { useImportProducts } from '@/lib/queries/useStockSetup';
import { shareTextFile } from '@/lib/share/share-text-file';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Importing products from a CSV in the app (UX spec §6.5), at `/stock/import`, as the web's
 * `ProductImport.tsx`, in four steps. 1 Choose a CSV (up to 5 MB, read on the phone; the template
 * goes to the share sheet). 2 Match each ResNeo field to a column of the file, or "Don't import";
 * the stock fields only with Track stock on. 3 Check: the server reads every row without writing
 * (`dry_run`) and says what would happen to each: new, already there (skipped) or the problem in
 * its own words. 4 Import: the same file for real, then `import.done`, with any row the save then
 * refused listed so none goes quietly. Needs `import_products`.
 */

type Step = 1 | 2 | 3 | 4;

export default function ImportProductsScreen() {
  const t = useStockT();
  const posEnabled = usePosEnabled();
  const boot = usePosBootstrap();
  const header = <Stack.Screen options={{ headerShown: true, title: t('import.title') }} />;

  if (!posEnabled) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('till.off.title')} message={t('till.off.body', { venue: 'your venue' })} />
      </Screen>
    );
  }
  if (boot.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <ListSkeleton />
      </Screen>
    );
  }
  if (!boot.data) {
    return (
      <Screen>
        {header}
        <ErrorState message={posErrorMessage(boot.error, t('common.networkError'))} onRetry={() => void boot.refetch()} />
      </Screen>
    );
  }
  if (!canRetail(boot.data, 'import_products')) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('import.title')} message={t('x.notAllowed')} />
      </Screen>
    );
  }
  return (
    <>
      {header}
      <ImportFlow trackStock={isTrackStockOn(boot.data)} />
    </>
  );
}

function ImportFlow({ trackStock }: { trackStock: boolean }) {
  const t = useStockT();
  const router = useRouter();
  const toast = useToast();
  const run = useImportProducts();
  const [step, setStep] = useState<Step>(1);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [columns, setColumns] = useState<Partial<Record<ImportField, string>>>({});
  const [checked, setChecked] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const fields = importFields(trackStock);
  const ready = IMPORT_REQUIRED.every((f) => Boolean(columns[f]));

  async function shareTemplate() {
    const res = await shareTextFile({
      filename: 'products-template.csv',
      body: importTemplateCsv(trackStock),
      mimeType: 'text/csv',
      uti: 'public.comma-separated-values-text',
      dialogTitle: t('import.template'),
    });
    if (!res.ok && res.reason !== 'web-download') toast.error(t('ss.templateFailed'));
  }

  async function chooseFile() {
    setError(null);
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch {
      setError(t('ss.import.readFailed'));
      return;
    }
    const asset = picked.canceled ? null : picked.assets?.[0];
    if (!asset?.uri) return;
    if (!looksLikeCsv(asset.name, asset.mimeType)) {
      setError(t('import.error.type'));
      return;
    }
    if ((asset.size ?? 0) > IMPORT_MAX_BYTES) {
      setError(t('import.error.size'));
      return;
    }
    setReading(true);
    let text: string;
    try {
      text = await readPickedFileText(asset.uri);
    } catch {
      setReading(false);
      setError(t('ss.import.readFailed'));
      return;
    }
    setReading(false);
    const { headers: head, rows } = readCsvHeaders(text);
    if (head.length === 0 || rows === 0) {
      setError(t('import.error.empty'));
      return;
    }
    setCsv(text);
    setFileName(asset.name ?? 'products.csv');
    setHeaders(head);
    setColumns(guessImportColumns(head, trackStock));
    setChecked(null);
    setResult(null);
    setStep(2);
  }

  async function check() {
    if (!csv || !ready) return;
    setError(null);
    try {
      const res = await run.mutateAsync(importBody(csv, columns, trackStock, true));
      setChecked(res);
      setProblemsOnly(false);
      setStep(3);
    } catch (e) {
      setError(posErrorMessage(e, t('common.networkError')));
    }
  }

  async function commit() {
    if (!csv) return;
    setError(null);
    setStep(4);
    try {
      setResult(await run.mutateAsync(importBody(csv, columns, trackStock, false)));
    } catch (e) {
      setError(posErrorMessage(e, t('common.networkError')));
      setStep(3);
    }
  }

  function startAgain() {
    setCsv(null);
    setHeaders([]);
    setColumns({});
    setChecked(null);
    setResult(null);
    setError(null);
    setStep(1);
  }

  const rowsShown = useMemo(() => (checked?.rows ?? []).filter((r) => !problemsOnly || r.status === 'error'), [checked, problemsOnly]);
  const notSaved = useMemo(() => rowsNotSaved(checked, result), [checked, result]);
  const newCount = checked?.summary.new ?? 0;

  return (
    <Screen scroll={false} padded={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="bodySmall" tone="muted">
          {t('import.step', { n: step })}
        </Text>
        <StepBar step={step} />
        {error ? <ErrorLine message={error} /> : null}

        {step === 1 ? (
          <Card>
            <View style={posStyles.stack}>
              <Text>{t('import.body')}</Text>
              <Button label={t('import.template')} variant="ghost" onPress={() => void shareTemplate()} />
              <Button label={t('x.import.choose')} loading={reading} onPress={() => void chooseFile()} fullWidth />
            </View>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card>
            <View style={posStyles.stack}>
              <Text variant="label">{t('ss.import.file', { name: fileName })}</Text>
              <Text variant="bodySmall" tone="muted">
                {t('ss.import.headers')}
              </Text>
              {fields.map((f) => (
                <View key={f} style={styles.field}>
                  <View style={posStyles.row}>
                    <Text variant="bodyMedium">{IMPORT_FIELD_LABELS[f]}</Text>
                    {IMPORT_REQUIRED.includes(f) ? <Badge label={t('import.required')} tone="brand" /> : null}
                  </View>
                  <ChoiceChips
                    options={[{ value: '', label: t('import.skipColumn') }, ...headers.map((h) => ({ value: h, label: h }))]}
                    value={columns[f] ?? ''}
                    onChange={(v) => setColumns((c) => ({ ...c, [f]: v || undefined }))}
                  />
                </View>
              ))}
              <Button label={t('x.import.next')} loading={run.isPending} disabled={!ready || run.isPending} onPress={() => void check()} fullWidth />
              <Button label={t('x.back')} variant="ghost" onPress={startAgain} fullWidth />
            </View>
          </Card>
        ) : null}

        {step === 3 && checked ? (
          <Card>
            <View style={posStyles.stack}>
              <Text variant="subheading">
                {t('import.summary', { new: checked.summary.new, skipped: checked.summary.skipped, problems: checked.summary.problems })}
              </Text>
              <SwitchRow label={t('import.filter.problems')} value={problemsOnly} onChange={setProblemsOnly} />
              {rowsShown.map((r) => (
                <RowResult key={r.row} r={r} />
              ))}
              {newCount === 0 ? (
                <Text variant="bodySmall" tone="muted">
                  {t('x.import.nothing')}
                </Text>
              ) : null}
              <Button label={t('import.commit', { count: newCount })} disabled={newCount === 0} onPress={() => void commit()} fullWidth />
              <Button label={t('x.back')} variant="ghost" onPress={() => setStep(2)} fullWidth />
            </View>
          </Card>
        ) : null}

        {step === 4 ? (
          <Card>
            {run.isPending || !result ? (
              <View style={posStyles.stack} accessibilityRole="progressbar" accessibilityLabel={t('import.title')}>
                <Text>{t('import.progress', { done: 0, count: newCount })}</Text>
                <ListSkeleton />
              </View>
            ) : (
              <View style={posStyles.stack}>
                <Notice tone="success">{t('import.done', { count: result.imported })}</Notice>
                {notSaved.length > 0 ? (
                  <Notice tone="warning">
                    {[
                      t('x.import.notSaved'),
                      ...notSaved.map(
                        (r) => `${t('x.import.row', { row: r.row })}: ${[r.name, r.option_name].filter(Boolean).join(', ')}. ${r.problem ?? ''}`,
                      ),
                    ].join('\n')}
                  </Notice>
                ) : null}
                <Button label={t('import.viewProducts')} onPress={() => router.replace('/stock' as Href)} fullWidth />
                <Button label={t('x.import.again')} variant="secondary" onPress={startAgain} fullWidth />
              </View>
            )}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function StepBar({ step }: { step: Step }) {
  const { colors } = useTheme();
  return (
    <View style={styles.steps}>
      {[1, 2, 3, 4].map((n) => (
        <View key={n} style={[styles.stepDot, { backgroundColor: n <= step ? colors.brand : colors.border }]} />
      ))}
    </View>
  );
}

function RowResult({ r }: { r: ImportRow }) {
  const t = useStockT();
  const name = [r.name, r.option_name].filter(Boolean).join(', ');
  return (
    <View style={styles.row}>
      <Text variant="bodySmall">
        <Text variant="bodySmall" tone="muted">
          {`${t('x.import.row', { row: r.row })} `}
        </Text>
        {name}
      </Text>
      {r.status === 'new' ? (
        <Badge label={t('import.row.new')} tone="success" />
      ) : r.status === 'exists' ? (
        <Badge label={r.problem ?? t('import.row.exists')} />
      ) : (
        <Text variant="bodySmall" tone="danger">
          {r.problem}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  field: { gap: spacing.xs },
  row: { gap: spacing.xs, alignItems: 'flex-start' },
  steps: { flexDirection: 'row', gap: spacing.xs },
  stepDot: { flex: 1, height: 6, borderRadius: radius.full },
});
