/**
 * Wire shapes of the data import routes (`/api/import/sessions/**` on the web), as the
 * dashboard's import steps read them. Every field the app does not need is left out; the
 * server sends more.
 */

export type ImportFileType = 'clients' | 'bookings' | 'staff' | 'unknown';

export type SplitConfig = { separator?: string; parts?: { field: string }[] } | null;

export interface ImportFile {
  id: string;
  filename: string;
  file_type: string;
  row_count: number | null;
  column_count: number | null;
  headers: string[] | null;
  sample_rows: Record<string, string>[] | null;
  reshape_status?: string | null;
  reshaped?: boolean | null;
  reshape_notes?: string[] | null;
}

export interface MappingRow {
  id?: string;
  file_id: string;
  source_column: string;
  target_field: string | null;
  action: string;
  custom_field_name?: string | null;
  custom_field_type?: string | null;
  split_config?: SplitConfig;
  value_map?: Record<string, string> | null;
  ai_suggested?: boolean;
  ai_confidence?: string | null;
  ai_reasoning?: string | null;
  user_overridden?: boolean;
}

export interface ValidationIssue {
  id: string;
  file_id: string;
  row_number: number;
  severity: string;
  issue_type: string;
  message: string;
  user_decision: string | null;
}

export interface BookingReference {
  id: string;
  file_id?: string;
  reference_type: string;
  raw_value: string;
  booking_count?: number;
  is_resolved: boolean;
  ai_suggested_entity_id?: string | null;
  ai_suggested_entity_name?: string | null;
  ai_confidence?: string | null;
  resolution_action?: string | null;
}

export interface ValidationSummary {
  total_data_rows?: number;
  rows_with_blocking_errors?: number;
  rows_ready?: number;
  rows_with_existing_client_warning?: number;
  error_issue_count?: number;
  warning_issue_count?: number;
  staff_files_skipped?: number;
  booking_defaults_blocked?: boolean;
  repeated_booking_rows?: number;
  overlapping_appointments?: number;
}

export interface SessionRecord {
  id: string;
  status: string;
  has_booking_file?: boolean | null;
  references_resolved?: boolean | null;
  ai_mapping_used?: boolean | null;
  validation_job_id?: string | null;
  validation_job_status?: string | null;
  validation_job_error?: string | null;
  session_settings?: (Record<string, unknown> & {
    ai_instructions?: string | null;
    validation_summary?: ValidationSummary;
    send_import_reminders?: boolean;
  }) | null;
}

/** `GET /api/import/sessions/[id]`. */
export interface SessionDetail {
  session: SessionRecord;
  files: ImportFile[];
  mappings: MappingRow[];
  issues: ValidationIssue[];
  booking_references: BookingReference[];
}

export interface KindDetection {
  file_id: string;
  filename: string;
  detected_kind: string;
  confidence: string;
  applied: boolean;
  reason: string;
}

export interface UploadResult {
  files?: ImportFile[];
  warnings?: string[];
  kind_detections?: KindDetection[];
}

export interface ReshapePreview {
  original?: string[][];
  headers: string[];
  rows: string[][];
  total_rows: number;
}

export interface ReshapeResult {
  ok?: boolean;
  status?: string;
  message?: string;
  notes?: string[];
  preview?: ReshapePreview;
}

export interface ExtractResult {
  ok?: boolean;
  referencesResolved?: boolean;
  futureRowCount?: number;
  extractedReferenceCount?: number;
  insertedBookingRowCount?: number;
  staffReferenceCount?: number;
  requiresTableConfirmation?: boolean;
  bookingModel?: string;
  mode?: string;
}

export interface CatalogEntity {
  id: string;
  name: string;
}

export interface ReferenceCatalog {
  bookingModel: string;
  serviceItems: CatalogEntity[];
  calendars: CatalogEntity[];
  practitioners: CatalogEntity[];
  appointmentServices: CatalogEntity[];
  eventSessions?: CatalogEntity[];
  classInstances?: CatalogEntity[];
  resourceCalendars?: CatalogEntity[];
}

export interface ReferenceDefault {
  reference_id: string;
  suggested_duration_minutes: number | null;
  suggested_price_pence: number | null;
  sample_count: number;
}

export interface BulkCreateResult {
  ok?: boolean;
  created?: number;
  errors?: { reference_id: string; error: string }[];
}

export interface ValidationJob {
  validation_job_id: string | null;
  validation_job_status: string | null;
  validation_job_error: string | null;
  status: string;
  validation_rows_processed: number;
  validation_rows_total: number;
  percent: number;
}

export interface ImportPlan {
  headline?: string;
  narrative?: string;
}

export interface ImportProgress {
  status: string;
  started_at?: string | null;
  percent: number;
  progress_processed: number;
  progress_total: number;
  imported_clients: number;
  imported_bookings: number;
  skipped_rows: number;
  updated_existing?: number;
  error_message?: string | null;
  repeated_rows_skipped?: number;
  overlapping_appointments?: number;
}

export interface ExecuteResult {
  ok?: boolean;
  done?: boolean;
  started?: boolean;
  alreadyStarted?: boolean;
  alreadyComplete?: boolean;
}

export interface QaReport {
  checked: number;
  matched: number;
  mismatches: unknown[];
  summary: string;
}

export interface RowPreview {
  headers?: string[];
  values?: Record<string, string>;
}
