/**
 * Export your data (web `DataExportSection.tsx`, 2026-09-19): what to export (appointments,
 * clients or services), which dates (all time, a month, a year or custom), and which file type
 * (CSV, Excel or PDF). The card counts what the choice covers before anything is downloaded, and
 * a range with nothing in it says so instead of producing an empty file. The file comes from
 * `GET /api/venue/export` with every detail the venue holds, and lands in the OS share sheet.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Text } from '@/components/ui/Text';
import { getApiUrl, isBackendConfigured } from '@/lib/env';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { exportQuery, useExportCount, type ExportKind } from '@/lib/queries/useExportCount';
import { downloadAndShareFile } from '@/lib/share/share-binary-file';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

type ExportFormat = 'csv' | 'xlsx' | 'pdf';
type RangePreset = 'all' | 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'custom';

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_year', label: 'This year' },
  { id: 'last_year', label: 'Last year' },
  { id: 'custom', label: 'Custom dates' },
];

const FORMATS: { id: ExportFormat; label: string; hint: string; mime: string }[] = [
  { id: 'csv', label: 'CSV', hint: 'Opens in Excel, Numbers and Google Sheets, and imports into most other systems.', mime: 'text/csv' },
  {
    id: 'xlsx',
    label: 'Excel spreadsheet',
    hint: 'A formatted .xlsx workbook with money as numbers, ready to sort and filter.',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  { id: 'pdf', label: 'PDF', hint: 'For reading or printing. To move your data somewhere else, use CSV or Excel.', mime: 'application/pdf' },
];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


/** The dates a preset covers, on the local calendar, both ends included. Null means all time. */
export function presetRange(preset: RangePreset, today = new Date()): { from: string; to: string } | null {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case 'this_month':
      return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
    case 'last_month':
      return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case 'this_year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'last_year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    default:
      return null;
  }
}

export function DataExportCard({
  bookingWord = 'Booking',
  clientLabel = 'Guest',
  today,
}: {
  bookingWord?: string;
  clientLabel?: string;
  /** Today in the venue's timezone, to seed the custom range. */
  today: string;
}) {
  const accessToken = useAccessToken();
  const toast = useToast();
  const [kind, setKind] = useState<ExportKind>('bookings');
  const [preset, setPreset] = useState<RangePreset>('all');
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [downloading, setDownloading] = useState(false);

  const kinds: { id: ExportKind; label: string; hint: string; rangeHint: string }[] = [
    {
      id: 'bookings',
      label: `${bookingWord}s`,
      hint: `Every ${bookingWord.toLowerCase()} with its date and time, service, calendar and staff, ${clientLabel.toLowerCase()} details, price, payments and deposit, notes, and who booked or cancelled it.`,
      rangeHint: `${bookingWord}s are chosen by their ${bookingWord.toLowerCase()} date.`,
    },
    {
      id: 'contacts',
      label: `${clientLabel}s`,
      hint: `Every ${clientLabel.toLowerCase()} with their contact details and address, tags, marketing consent, notes, visit history and deposits paid, plus any custom fields you have added.`,
      rangeHint: `${clientLabel}s are chosen by the day they were added to your contacts.`,
    },
    {
      id: 'services',
      label: 'Services',
      hint: 'Every service with its category, duration, price and deposit, options, add-ons, which calendars offer it, booking rules and instructions.',
      rangeHint: 'Services are chosen by the day they were added.',
    },
  ];
  const kindMeta = kinds.find((k) => k.id === kind) ?? kinds[0]!;
  const customInvalid = preset === 'custom' && customFrom > customTo;
  const range = useMemo(() => {
    if (preset !== 'custom') return presetRange(preset);
    if (customFrom > customTo) return undefined;
    return { from: customFrom, to: customTo };
  }, [preset, customFrom, customTo]);
  const count = useExportCount(kind, range ?? null, range !== undefined);
  const noun = kindMeta.label.toLowerCase();
  const formatMeta = FORMATS.find((f) => f.id === format) ?? FORMATS[0]!;

  const countLine =
    range === undefined
      ? 'The From date must be on or before the To date.'
      : count.isLoading
        ? 'Counting...'
        : count.isError
          ? 'Could not count the records. You can still download.'
          : count.data === 0
            ? `No ${noun} ${range ? 'in these dates' : 'yet'}.`
            : `${count.data ?? 0} ${count.data === 1 ? noun.replace(/s$/, '') : noun} ${range ? 'in these dates' : 'in total'}.`;

  const download = async () => {
    if (range === undefined || !accessToken || !isBackendConfigured()) return;
    setDownloading(true);
    try {
      const when = range ? `${range.from}-to-${range.to}` : `all-time-${ymd(new Date())}`;
      const result = await downloadAndShareFile({
        url: `${getApiUrl()}/api/venue/export?${exportQuery(kind, range)}&format=${format}`,
        filename: `resneo-${noun.replace(/\s+/g, '-')}-${when}.${format}`,
        mimeType: formatMeta.mime,
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!result.ok) toast.error(result.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card style={styles.card}>
      <Text variant="label">Export your data</Text>
      <Text variant="bodySmall" tone="secondary">
        {`Take a copy of everything ResNeo holds for your venue: your ${bookingWord.toLowerCase()}s, your ${clientLabel.toLowerCase()}s and your services. Choose what to export, which dates, and the file type. Every file includes the full details, so you can move to another system or keep a backup at any time.`}
      </Text>

      <Text variant="overline" tone="muted">
        1. What to export
      </Text>
      <View style={styles.chips}>
        {kinds.map((k) => (
          <Chip key={k.id} label={k.label} selected={kind === k.id} onPress={() => setKind(k.id)} />
        ))}
      </View>
      <Text variant="caption" tone="muted">
        {kindMeta.hint}
      </Text>

      <Text variant="overline" tone="muted">
        2. Which dates
      </Text>
      <View style={styles.chips}>
        {PRESETS.map((p) => (
          <Chip key={p.id} label={p.label} selected={preset === p.id} onPress={() => setPreset(p.id)} />
        ))}
      </View>
      {preset === 'custom' ? (
        <View style={styles.custom}>
          <View style={styles.dateField}>
            <Text variant="label">From</Text>
            <DatePickerField value={customFrom} onChange={setCustomFrom} accessibilityLabel="From" />
          </View>
          <View style={styles.dateField}>
            <Text variant="label">To</Text>
            <DatePickerField value={customTo} onChange={setCustomTo} accessibilityLabel="To" />
          </View>
        </View>
      ) : null}
      <Text variant="caption" tone="muted">
        {`${kindMeta.rangeHint}${preset === 'all' ? ' All time gives you everything.' : ''}`}
      </Text>

      <Text variant="overline" tone="muted">
        3. File type
      </Text>
      <View style={styles.chips}>
        {FORMATS.map((f) => (
          <Chip key={f.id} label={f.label} selected={format === f.id} onPress={() => setFormat(f.id)} />
        ))}
      </View>
      <Text variant="caption" tone="muted">
        {formatMeta.hint}
      </Text>

      <Text variant="bodySmall" tone={customInvalid ? 'danger' : 'secondary'} accessibilityLiveRegion="polite">
        {countLine}
      </Text>
      <Button
        label={downloading ? 'Preparing your file...' : `Download ${noun} as ${formatMeta.label}`}
        disabled={range === undefined || downloading || count.data === 0}
        loading={downloading}
        onPress={() => void download()}
        fullWidth
      />
      <Text variant="caption" tone="muted">
        {"Files are built from your venue's data at the moment you tap. Times are shown in your venue's time zone. Admins only."}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  custom: {
    gap: spacing.sm,
  },
  dateField: {
    gap: spacing.xs,
  },
});
