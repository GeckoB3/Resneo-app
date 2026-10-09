/**
 * Per-file required-mapping checks for the Map step. Port of the web's
 * `src/lib/import/map-requirements.ts`, with the same rules (no stricter than the importer):
 * split parts count as mapped fields, a combined date and time column mapped to Booking Date
 * also gives the time, and a booking only needs some way to identify the client.
 */

export type RequirementMapping = {
  file_id: string;
  source_column: string;
  target_field: string | null;
  action: string;
  split_config?: { separator?: string; parts?: { field: string }[] } | null;
};

export type RequirementFile = {
  id: string;
  filename: string;
  file_type: string;
  sample_rows?: Record<string, string>[] | null;
};

export type RequirementItem = {
  key: string;
  label: string;
  satisfied: boolean;
  /** What to do when not satisfied. */
  hint: string | null;
};

export type FileRequirements = {
  fileId: string;
  filename: string;
  fileType: string;
  satisfied: boolean;
  items: RequirementItem[];
};

export const DATETIME_VALUE_RE = /^(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})[T ]\d{1,2}[:.]\d{2}/;

/** Every field key a file's mappings produce, split parts included. */
export function effectiveMappedFields(fileId: string, mappings: RequirementMapping[]): Set<string> {
  const out = new Set<string>();
  for (const m of mappings) {
    if (m.file_id !== fileId) continue;
    if (m.action === 'map' && m.target_field) out.add(m.target_field);
    if (m.action === 'split' && m.split_config?.parts) {
      for (const p of m.split_config.parts) if (p.field) out.add(p.field);
    }
  }
  return out;
}

function bookingDateColumnHasTime(file: RequirementFile, mappings: RequirementMapping[]): boolean {
  const dateMapping = mappings.find(
    (m) => m.file_id === file.id && m.action === 'map' && m.target_field === 'booking_date',
  );
  if (!dateMapping) return false;
  return (file.sample_rows ?? []).some((row) =>
    DATETIME_VALUE_RE.test((row[dateMapping.source_column] ?? '').trim()),
  );
}

export function computeFileRequirements(
  file: RequirementFile,
  mappings: RequirementMapping[],
  clientLabel = 'Client',
): FileRequirements {
  const mapped = effectiveMappedFields(file.id, mappings);
  const items: RequirementItem[] = [];
  const lcLabel = clientLabel.toLowerCase();

  if (file.file_type === 'clients' || file.file_type === 'unknown') {
    const hasName =
      mapped.has('first_name') || mapped.has('last_name') || mapped.has('full_name');
    items.push({
      key: 'client_name',
      label: `${clientLabel} name`,
      satisfied: hasName,
      hint: hasName
        ? null
        : 'Map a name column. A single combined column (like "Sarah Jones") can go straight to Full Name, and we split it into first and last name for you. Or split the column yourself.',
    });
  }

  if (file.file_type === 'bookings') {
    const dateHasTime = bookingDateColumnHasTime(file, mappings);
    const hasDate = mapped.has('booking_date');
    const hasTime = mapped.has('booking_time') || dateHasTime;
    items.push({
      key: 'booking_date',
      label: 'Booking date',
      satisfied: hasDate,
      hint: hasDate
        ? null
        : 'Map the column with the appointment or booking date. A combined date and time column can go to Booking Date directly.',
    });
    items.push({
      key: 'booking_time',
      label: 'Booking time',
      satisfied: hasTime,
      hint: hasTime
        ? dateHasTime && !mapped.has('booking_time')
          ? 'The time is taken from your combined date and time column automatically.'
          : null
        : 'Map a time column, or map a combined date and time column to Booking Date and we take the time from it.',
    });
    const hasIdentity = [
      'client_email',
      'client_phone',
      'client_external_id',
      'guest_full_name',
      'guest_first_name',
      'guest_last_name',
    ].some((k) => mapped.has(k));
    items.push({
      key: 'booking_identity',
      label: `${clientLabel} identity (email, phone, ID, or name)`,
      satisfied: hasIdentity,
      hint: hasIdentity
        ? null
        : `Map at least one way to tell who each booking is for: ${lcLabel} email, phone, an ID from your old system, or a name column. A name on its own works: we match exact names and add new ${lcLabel}s when we need to.`,
    });
  }

  if (file.file_type === 'staff') {
    const hasStaffName =
      mapped.has('staff_name') || mapped.has('staff_first_name') || mapped.has('staff_last_name');
    items.push({
      key: 'staff_name',
      label: 'Staff member name',
      satisfied: hasStaffName,
      hint: hasStaffName
        ? null
        : "Map the column holding each staff member's name (a combined full name column is fine).",
    });
  }

  return {
    fileId: file.id,
    filename: file.filename,
    fileType: file.file_type,
    satisfied: items.every((i) => i.satisfied),
    items,
  };
}

export function computeAllFileRequirements(
  files: RequirementFile[],
  mappings: RequirementMapping[],
  clientLabel = 'Client',
): FileRequirements[] {
  return files.map((f) => computeFileRequirements(f, mappings, clientLabel));
}
