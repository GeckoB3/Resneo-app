/**
 * Choosing files for the Upload step: what the server accepts (the web's
 * `importFileExtensionAllowed` and `IMPORT_MAX_FILE_BYTES`), the type to send each part with,
 * the label words, and the two example files the web offers to download.
 */

/** The server's limit per file (20 MB). */
export const IMPORT_MAX_FILE_BYTES = 20 * 1024 * 1024;

const EXTENSION_TYPES: Record<string, string> = {
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.txt': 'text/plain',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
};

/** What the document picker offers (it filters by type, the server by extension). */
export const IMPORT_PICKER_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'text/tab-separated-values',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  // Android often labels a CSV as an octet stream; the extension check below decides.
  'application/octet-stream',
];

function extensionOf(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot >= 0 ? lower.slice(dot) : '';
}

export function importFileAllowed(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(EXTENSION_TYPES, extensionOf(name));
}

/** The part's type: what the picker said, unless that is missing or generic. */
export function importFileMimeType(name: string, pickerType?: string | null): string {
  if (pickerType && pickerType !== 'application/octet-stream') return pickerType;
  return EXTENSION_TYPES[extensionOf(name)] ?? 'text/csv';
}

export const KIND_LABELS: Record<string, string> = {
  clients: 'Client list',
  bookings: 'Booking history',
  staff: 'Staff list',
};

export const FILE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'unknown', label: 'Not sure' },
  { value: 'clients', label: 'Client list' },
  { value: 'bookings', label: 'Booking history' },
  { value: 'staff', label: 'Staff list' },
];

/** Continue unlocks once every file has a label and nothing is being reorganised. */
export function canContinueUpload(
  files: { file_type: string; reshape_status?: string | null }[],
  reshapingCount: number,
): boolean {
  const anyReshaping = reshapingCount > 0 || files.some((f) => f.reshape_status === 'pending');
  return files.length > 0 && files.every((f) => f.file_type !== 'unknown') && !anyReshaping;
}

const SAMPLE_ROWS = {
  clients: [
    ['First name', 'Last name', 'Email', 'Phone', 'Notes'],
    ['Sarah', 'Jones', 'sarah.jones@example.com', '07700 900123', 'Prefers afternoon appointments'],
    ['Michael', 'Okafor', 'michael.okafor@example.com', '07700 900456', 'Allergic to lavender oil'],
    ['Priya', 'Patel', 'priya.patel@example.com', '07700 900789', ''],
  ],
  bookings: [
    ['Date', 'Time', 'Client name', 'Email', 'Phone', 'Service', 'Staff', 'Price', 'Status'],
    ['2025-07-14', '10:00', 'Sarah Jones', 'sarah.jones@example.com', '07700 900123', 'Haircut', 'Emma', '35.00', 'Completed'],
    ['2025-07-14', '11:30', 'Michael Okafor', 'michael.okafor@example.com', '07700 900456', 'Beard trim', 'Daniel', '18.00', 'Completed'],
    ['2025-07-15', '09:15', 'Priya Patel', 'priya.patel@example.com', '07700 900789', 'Colour & cut', 'Emma', '90.00', 'Booked'],
  ],
} as const;

/** Quote a CSV cell when it holds a comma, quote or line break. */
function toCsvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The web's example file as CSV text, for the share sheet. */
export function sampleCsv(kind: 'clients' | 'bookings'): { filename: string; body: string } {
  return {
    filename: kind === 'clients' ? 'sample-clients.csv' : 'sample-bookings.csv',
    body: SAMPLE_ROWS[kind].map((row) => row.map(toCsvCell).join(',')).join('\r\n'),
  };
}
