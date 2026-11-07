/**
 * Compliance form schema — the app-side port of the web's single source of
 * truth at `C:\Resneo/src/lib/compliance/form-schema.ts`. The versioned JSONB
 * document stored on `compliance_type_versions.form_schema`. v1 supports a flat
 * list of fields.
 *
 * The app uses this for:
 *   - the field-builder's editor save-time validation (`validateFormSchemaForType`)
 *   - deriving a record's `result` for a `pass_fail` type (`computeResult`)
 *   - the typed field/option/result-mapping shapes shared by the builder + capture sheet
 *
 * It deliberately mirrors the web's zod schema so a form authored in the app
 * round-trips through the same server-side `formSchemaSchema` validation. We keep
 * the zod parsing here too (`parseFormSchema`) so the builder can defend against a
 * malformed stored document when it hydrates an existing version for a new edit.
 */
import { z } from 'zod';

// ─── Field types ──────────────────────────────────────────────────────────────

export const COMPLIANCE_FIELD_TYPES = [
  'text',
  'textarea',
  'select',
  'multiselect',
  'date',
  'signature',
  'file',
] as const;
export type ComplianceFieldType = (typeof COMPLIANCE_FIELD_TYPES)[number];

export const COMPLIANCE_RESULT_TYPES = [
  'pass_fail',
  'signed',
  'completed',
  'file_uploaded',
] as const;
export type ComplianceResultType = (typeof COMPLIANCE_RESULT_TYPES)[number];

/** Field id: short, stable, used as the key in `compliance_records.responses`. */
const fieldIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_]+$/, 'Field id may only contain letters, numbers and underscores');

const optionSchema = z.object({
  value: z.string().min(1).max(200),
  label: z.string().min(1).max(300),
});
export type ComplianceFieldOption = z.infer<typeof optionSchema>;

const fieldBase = {
  id: fieldIdSchema,
  label: z.string().min(1).max(300),
  help_text: z.string().max(1000).optional(),
  required: z.boolean().optional().default(false),
  /** Hidden from the public form; only rendered/accepted in staff mode. */
  staff_only: z.boolean().optional().default(false),
};

const textFieldSchema = z.object({
  ...fieldBase,
  type: z.literal('text'),
  max_length: z.number().int().min(1).max(10_000).optional(),
  default_value: z.string().max(10_000).optional(),
});
const textareaFieldSchema = z.object({
  ...fieldBase,
  type: z.literal('textarea'),
  max_length: z.number().int().min(1).max(10_000).optional(),
  default_value: z.string().max(10_000).optional(),
});
const selectFieldSchema = z.object({
  ...fieldBase,
  type: z.literal('select'),
  options: z.array(optionSchema).min(1).max(100),
  default_value: z.string().max(200).optional(),
});
const multiselectFieldSchema = z.object({
  ...fieldBase,
  type: z.literal('multiselect'),
  options: z.array(optionSchema).min(1).max(100),
  default_value: z.array(z.string().max(200)).optional(),
});
const dateFieldSchema = z.object({
  ...fieldBase,
  type: z.literal('date'),
  /** `'today'` resolves to the submission date in the renderer; otherwise an ISO date. */
  default_value: z
    .union([z.literal('today'), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
    .optional(),
  /**
   * The date the record is really from (a patch test done days before it was written up): the
   * record's captured date, lead time and expiry count from this answer (web parity; the library
   * patch tests set it). The builder has no control for it, so an edit must carry it through.
   */
  sets_record_date: z.boolean().optional().default(false),
});
const signatureFieldSchema = z.object({
  ...fieldBase,
  type: z.literal('signature'),
});
const fileFieldSchema = z.object({
  ...fieldBase,
  type: z.literal('file'),
});

export const complianceFieldSchema = z.discriminatedUnion('type', [
  textFieldSchema,
  textareaFieldSchema,
  selectFieldSchema,
  multiselectFieldSchema,
  dateFieldSchema,
  signatureFieldSchema,
  fileFieldSchema,
]);
export type ComplianceField = z.infer<typeof complianceFieldSchema>;

// ─── result_mapping ───────────────────────────────────────────────────────────

const resultMappingSchema = z.object({
  field: fieldIdSchema,
  pass_values: z.array(z.string().min(1)).min(1),
  fail_values: z.array(z.string().min(1)).min(1),
});
export type ComplianceResultMapping = z.infer<typeof resultMappingSchema>;

// ─── Whole form schema ────────────────────────────────────────────────────────

export const formSchemaSchema = z.object({
  schema_version: z.literal('1.0').default('1.0'),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  intro_markdown: z.string().max(10_000).optional(),
  fields: z.array(complianceFieldSchema).min(1).max(100),
  result_mapping: resultMappingSchema.optional(),
});
export type ComplianceFormSchema = z.infer<typeof formSchemaSchema>;

/**
 * Parse an unknown value into a validated form schema. Each question keeps any key this port does
 * not know (zod would strip it), so a question setting the web adds later survives an edit and
 * save in the app rather than being silently dropped.
 */
export function parseFormSchema(
  raw: unknown,
): { ok: true; schema: ComplianceFormSchema } | { ok: false; error: string } {
  const parsed = formSchemaSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid form schema' };
  }
  const rawFields = (raw as { fields?: unknown }).fields;
  if (!Array.isArray(rawFields)) return { ok: true, schema: parsed.data };
  return {
    ok: true,
    schema: {
      ...parsed.data,
      // The parsed array keeps the raw order, so index i is the same question.
      fields: parsed.data.fields.map((field, i) => {
        const source: unknown = rawFields[i];
        return source && typeof source === 'object'
          ? ({ ...(source as Record<string, unknown>), ...field } as ComplianceField)
          : field;
      }),
    },
  };
}

// ─── Editor save-time validation (spec §7.4) ────────────────────────────────────

export interface FormSchemaValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Cross-field validation that depends on the type's `result_type`.
 * Returns all violations (not just the first) for a helpful editor experience, in plain words a
 * business owner can act on (web parity, 2026-11-07; same checks, same order, same messages as
 * the web `validateFormSchemaForType`). "No questions at all" is checked by the builder first.
 */
export function validateFormSchemaForType(
  schema: ComplianceFormSchema,
  resultType: ComplianceResultType,
): FormSchemaValidationResult {
  const errors: string[] = [];

  // Unique field ids (said once, however many clash).
  const seen = new Set<string>();
  let duplicateId = false;
  for (const f of schema.fields) {
    if (seen.has(f.id)) duplicateId = true;
    seen.add(f.id);
  }
  if (duplicateId) errors.push('Two questions share an id. Remove one and add it again.');

  // At most one signature field, at most one file field (v1 limitation).
  const signatureFields = schema.fields.filter((f) => f.type === 'signature');
  const fileFields = schema.fields.filter((f) => f.type === 'file');
  if (signatureFields.length > 1) errors.push('A form can have one Signature question.');
  if (fileFields.length > 1) errors.push('A form can have one File upload question.');

  // result_type-specific rules.
  if (resultType === 'pass_fail') {
    const mapping = schema.result_mapping;
    if (!mapping) {
      errors.push('Choose the question your team uses to record pass or fail.');
    } else {
      const mapped = schema.fields.find((f) => f.id === mapping.field);
      if (!mapped) {
        errors.push('The pass or fail question was removed. Add it back or pick another.');
      } else if (mapped.type !== 'select') {
        errors.push('The pass or fail question must be a Dropdown.');
      } else if (!mapped.staff_only) {
        errors.push('The pass or fail question must be marked Staff only.');
      } else if (!mapped.required) {
        // audit M7: an optional result field can be left blank, which would otherwise let a
        // record with no pass/fail decision satisfy a booking (see audit H4).
        errors.push('The pass or fail question must be marked Required.');
      } else {
        const optionValues = new Set(mapped.options.map((o) => o.value));
        const declared = [...mapping.pass_values, ...mapping.fail_values];
        const missing = declared.filter((v) => !optionValues.has(v));
        // No pass answer or no fail answer, or a marked answer no longer on the question: one message.
        if (
          mapping.pass_values.length === 0 ||
          mapping.fail_values.length === 0 ||
          missing.length > 0
        ) {
          errors.push('Mark at least one answer as Pass and one as Fail.');
        }
        const overlap = mapping.pass_values.filter((v) => mapping.fail_values.includes(v));
        if (overlap.length > 0) {
          errors.push(`An answer can't be both Pass and Fail: ${overlap.join(', ')}.`);
        }
      }
    }
  }

  if (resultType === 'signed' && signatureFields.length === 0) {
    errors.push('A signed form needs a Signature question.');
  }
  if (resultType === 'file_uploaded' && fileFields.length === 0) {
    errors.push('A file upload form needs a File upload question.');
  }

  return { ok: errors.length === 0, errors };
}

// ─── Capture payload shapes ─────────────────────────────────────────────────────

/** A drawn or typed signature answer (mirrors the web `SignatureResponse`). */
export interface SignatureResponse {
  method: 'drawn' | 'typed';
  /**
   * For typed signatures: the typed name. For drawn: a base64 PNG/JPEG data URL
   * (`data:image/png;base64,…`) the server validates and uploads pre-upload.
   */
  data?: string;
  /** Set server-side after a drawn signature is uploaded to the compliance-files bucket. */
  storage_path?: string;
  signed_at: string;
}

/**
 * An uploaded-file answer (mirrors the web `FileResponse`). `storage_path` is
 * REQUIRED and is produced by a server upload: the staff capture sheet uploads via
 * POST /api/venue/compliance/records/upload (useUploadComplianceRecordFile) and
 * stores the returned FileResponse. That venue route serves both staff and
 * hand-to-client capture (mirrors the web upload flow); the public code-scoped
 * form is the client's separate path.
 */
export interface FileResponse {
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
}

// ─── Result derivation (spec §4.4) ──────────────────────────────────────────────

export type ComplianceResultValue = 'pass' | 'fail' | 'inconclusive' | 'completed' | 'signed';

/**
 * Derive the record `result` from responses + the type's result semantics.
 * - pass_fail: uses result_mapping; a mapped value not in pass/fail lists → 'inconclusive';
 *   an absent result field (e.g. staff_only not yet filled) → null.
 * - signed: 'signed'; completed/file_uploaded: 'completed'.
 * Mirrors the web `computeResult`.
 */
export function computeResult(
  schema: ComplianceFormSchema,
  responses: Record<string, unknown>,
  resultType: ComplianceResultType,
): ComplianceResultValue | null {
  if (resultType === 'pass_fail') {
    const mapping = schema.result_mapping;
    if (!mapping) return null;
    const raw = responses[mapping.field];
    if (typeof raw !== 'string' || raw.length === 0) return null;
    if (mapping.pass_values.includes(raw)) return 'pass';
    if (mapping.fail_values.includes(raw)) return 'fail';
    return 'inconclusive';
  }
  if (resultType === 'signed') return 'signed';
  // completed | file_uploaded
  return 'completed';
}

/** Resolve a date field's `default_value` to a concrete value ('today' → ISO date). */
export function resolveDateDefault(defaultValue: string | undefined): string | undefined {
  if (!defaultValue) return undefined;
  return defaultValue === 'today' ? new Date().toISOString().slice(0, 10) : defaultValue;
}

/** A field shape loose enough to accept both the typed builder field and the
 *  app's `ComplianceFormField` (which carries `default_value?: string | string[]`). */
interface SeedableField {
  id: string;
  type: string;
  default_value?: string | string[];
}

/**
 * Seed an initial `responses` map from a form's `default_value`s, resolving the
 * date literal `'today'` to the current date (mirrors the web FormRenderer's
 * defaultValues). Fields without a default are omitted.
 */
export function seedDefaultResponses(fields: SeedableField[]): Record<string, unknown> {
  const seed: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.default_value == null) continue;
    if (f.type === 'date') {
      if (typeof f.default_value === 'string') {
        seed[f.id] = f.default_value === 'today' ? new Date().toISOString().slice(0, 10) : f.default_value;
      }
    } else if (f.type === 'multiselect') {
      if (Array.isArray(f.default_value)) seed[f.id] = f.default_value;
    } else if (typeof f.default_value === 'string') {
      seed[f.id] = f.default_value;
    }
  }
  return seed;
}
