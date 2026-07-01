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

/** Parse an unknown value into a validated form schema. */
export function parseFormSchema(
  raw: unknown,
): { ok: true; schema: ComplianceFormSchema } | { ok: false; error: string } {
  const parsed = formSchemaSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid form schema' };
  }
  return { ok: true, schema: parsed.data };
}

// ─── Editor save-time validation (spec §7.4) ────────────────────────────────────

export interface FormSchemaValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Cross-field validation that depends on the type's `result_type`.
 * Returns all violations (not just the first) for a helpful editor experience.
 * Mirrors the web `validateFormSchemaForType` exactly.
 */
export function validateFormSchemaForType(
  schema: ComplianceFormSchema,
  resultType: ComplianceResultType,
): FormSchemaValidationResult {
  const errors: string[] = [];

  // Unique field ids.
  const seen = new Set<string>();
  for (const f of schema.fields) {
    if (seen.has(f.id)) errors.push(`Duplicate field id "${f.id}". Field ids must be unique.`);
    seen.add(f.id);
  }

  // At most one signature field, at most one file field (v1 limitation).
  const signatureFields = schema.fields.filter((f) => f.type === 'signature');
  const fileFields = schema.fields.filter((f) => f.type === 'file');
  if (signatureFields.length > 1) errors.push('A form may contain at most one signature field.');
  if (fileFields.length > 1) errors.push('A form may contain at most one file upload field.');

  // result_type-specific rules.
  if (resultType === 'pass_fail') {
    const mapping = schema.result_mapping;
    if (!mapping) {
      errors.push('Pass/fail types require a result_mapping pointing at a result field.');
    } else {
      const mapped = schema.fields.find((f) => f.id === mapping.field);
      if (!mapped) {
        errors.push(`result_mapping references unknown field "${mapping.field}".`);
      } else if (mapped.type !== 'select') {
        errors.push('The result field referenced by result_mapping must be a select field.');
      } else if (!mapped.staff_only) {
        errors.push('The pass/fail result field must be marked staff_only.');
      } else if (!mapped.required) {
        // audit M7: an optional result field can be left blank, which would otherwise let a
        // record with no pass/fail decision satisfy a booking (see audit H4).
        errors.push('The pass/fail result field must be marked required so a decision is always recorded.');
      } else {
        const optionValues = new Set(mapped.options.map((o) => o.value));
        const declared = [...mapping.pass_values, ...mapping.fail_values];
        const missing = declared.filter((v) => !optionValues.has(v));
        if (missing.length > 0) {
          errors.push(
            `result_mapping values not present in the result field options: ${missing.join(', ')}.`,
          );
        }
        const overlap = mapping.pass_values.filter((v) => mapping.fail_values.includes(v));
        if (overlap.length > 0) {
          errors.push(`A value cannot be both pass and fail: ${overlap.join(', ')}.`);
        }
      }
    }
  }

  if (resultType === 'signed' && signatureFields.length === 0) {
    errors.push('Types with result type "signed" must include a signature field.');
  }
  if (resultType === 'file_uploaded' && fileFields.length === 0) {
    errors.push('Types with result type "file_uploaded" must include a file upload field.');
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
