/**
 * Pure reducer + helpers for the mobile compliance form-field builder. Kept
 * dependency-free of React so it can be unit-tested in isolation (the editor
 * sheet drives it with `useReducer`). Mirrors the state transitions of the web
 * `ComplianceFormBuilder` (add from palette, edit label/required/staff_only,
 * reorder, delete, options editor, pass/fail result_mapping).
 */
import {
  type ComplianceField,
  type ComplianceFieldOption,
  type ComplianceFieldType,
  type ComplianceFormSchema,
  type ComplianceResultMapping,
  type ComplianceResultType,
} from '@/lib/compliance/form-schema';

// ─── id generation ──────────────────────────────────────────────────────────

let idCounter = 0;

/**
 * A short, stable field id matching `^[a-zA-Z0-9_]+$`. The web uses
 * `f_${Date.now()}_${n}`; we mirror that so authored schemas look identical.
 * Exported so tests can assert the shape.
 */
export function newFieldId(): string {
  idCounter += 1;
  return `f_${Date.now().toString(36)}_${idCounter}`;
}

/** Build a blank field of the given type with sensible defaults. */
export function blankField(type: ComplianceFieldType): ComplianceField {
  const base = { id: newFieldId(), label: 'New field', required: false, staff_only: false } as const;
  switch (type) {
    case 'select':
    case 'multiselect':
      return { ...base, type, options: [{ value: 'option_1', label: 'Option 1' }] };
    default:
      return { ...base, type } as ComplianceField;
  }
}

/** Derive a stable option `value` from its label (same slug rule as the web). */
export function optionValueFromLabel(label: string, index: number): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `option_${index + 1}`
  );
}

// ─── Builder state ────────────────────────────────────────────────────────────

export interface FieldBuilderState {
  fields: ComplianceField[];
  description: string;
  introMarkdown: string;
  resultMapping: ComplianceResultMapping | undefined;
}

export const emptyBuilderState: FieldBuilderState = {
  fields: [],
  description: '',
  introMarkdown: '',
  resultMapping: undefined,
};

export type FieldBuilderAction =
  | { type: 'hydrate'; state: FieldBuilderState }
  | { type: 'addField'; fieldType: ComplianceFieldType }
  | { type: 'updateField'; id: string; patch: Partial<ComplianceField> }
  | { type: 'removeField'; id: string }
  | { type: 'moveField'; id: string; direction: 'up' | 'down' }
  | { type: 'addOption'; id: string }
  | { type: 'updateOption'; id: string; index: number; label: string }
  | { type: 'removeOption'; id: string; index: number }
  | { type: 'setDescription'; value: string }
  | { type: 'setIntroMarkdown'; value: string }
  | { type: 'setResultMapping'; mapping: ComplianceResultMapping | undefined }
  | { type: 'ensureResultField' }
  /** Add the question a result type needs (web `ensureFieldsForResultType`, 2026-11-07). */
  | { type: 'ensureFieldsForResultType'; resultType: ComplianceResultType };

function hasOptions(
  field: ComplianceField,
): field is Extract<ComplianceField, { type: 'select' | 'multiselect' }> {
  return field.type === 'select' || field.type === 'multiselect';
}

function withOptions(
  fields: ComplianceField[],
  id: string,
  map: (options: ComplianceFieldOption[]) => ComplianceFieldOption[],
): ComplianceField[] {
  return fields.map((f) => {
    if (f.id !== id || !hasOptions(f)) return f;
    return { ...f, options: map(f.options) };
  });
}

/** The stored value of a question's answer at `index`, if it has one. */
function optionValueAt(fields: ComplianceField[], id: string, index: number): string | undefined {
  const field = fields.find((f) => f.id === id);
  return field && hasOptions(field) ? field.options[index]?.value : undefined;
}

/**
 * Rewrite the pass and fail answers of a mapping that points at question `fieldId` (a value mapped
 * to `undefined` is dropped). Any other mapping is returned unchanged.
 */
function mapMappedValues(
  mapping: ComplianceResultMapping | undefined,
  fieldId: string,
  map: (value: string) => string | undefined,
): ComplianceResultMapping | undefined {
  if (!mapping || mapping.field !== fieldId) return mapping;
  const rewrite = (values: string[]) =>
    values.map(map).filter((v): v is string => typeof v === 'string');
  const pass_values = rewrite(mapping.pass_values);
  const fail_values = rewrite(mapping.fail_values);
  const unchanged =
    pass_values.length === mapping.pass_values.length &&
    fail_values.length === mapping.fail_values.length &&
    pass_values.every((v, i) => v === mapping.pass_values[i]) &&
    fail_values.every((v, i) => v === mapping.fail_values[i]);
  return unchanged ? mapping : { ...mapping, pass_values, fail_values };
}

export function fieldBuilderReducer(
  state: FieldBuilderState,
  action: FieldBuilderAction,
): FieldBuilderState {
  switch (action.type) {
    case 'hydrate':
      return action.state;

    case 'addField':
      return { ...state, fields: [...state.fields, blankField(action.fieldType)] };

    case 'updateField':
      return {
        ...state,
        fields: state.fields.map((f) =>
          f.id === action.id ? ({ ...f, ...action.patch } as ComplianceField) : f,
        ),
      };

    case 'removeField': {
      const fields = state.fields.filter((f) => f.id !== action.id);
      // Clearing the field the result_mapping points at drops the mapping too.
      const resultMapping =
        state.resultMapping?.field === action.id ? undefined : state.resultMapping;
      return { ...state, fields, resultMapping };
    }

    case 'moveField': {
      const index = state.fields.findIndex((f) => f.id === action.id);
      if (index < 0) return state;
      const target = action.direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= state.fields.length) return state;
      const fields = [...state.fields];
      const [moved] = fields.splice(index, 1);
      fields.splice(target, 0, moved!);
      return { ...state, fields };
    }

    case 'addOption':
      return {
        ...state,
        fields: withOptions(state.fields, action.id, (options) => {
          // Pick the next free option_N so a freshly-added option can't collide with an
          // existing value before its label is edited (web builder guard, audit U8).
          const taken = new Set(options.map((o) => o.value));
          let n = options.length + 1;
          while (taken.has(`option_${n}`)) n += 1;
          return [...options, { value: `option_${n}`, label: `Option ${n}` }];
        }),
      };

    case 'updateOption': {
      const fields = withOptions(state.fields, action.id, (options) =>
        options.map((o, i) => {
          if (i !== action.index) return o;
          // Guard against two labels slugifying to the same value: a silent clash
          // would corrupt select validation and the pass/fail result mapping (audit U8).
          const base = optionValueFromLabel(action.label, i);
          const taken = new Set(options.filter((_, j) => j !== i).map((x) => x.value));
          let value = base;
          let n = 2;
          while (taken.has(value)) value = `${base}_${n++}`;
          return { value, label: action.label };
        }),
      );
      // Renaming an answer changes its stored value. Carry its Pass or Fail mark across, so a
      // pass/fail form never breaks on a rename (web parity, 2026-11-07).
      const from = optionValueAt(state.fields, action.id, action.index);
      const to = optionValueAt(fields, action.id, action.index);
      return {
        ...state,
        fields,
        resultMapping: mapMappedValues(state.resultMapping, action.id, (v) => (v === from ? to : v)),
      };
    }

    case 'removeOption': {
      const field = state.fields.find((f) => f.id === action.id);
      if (!field || !hasOptions(field) || field.options.length <= 1) return state;
      const removed = field.options[action.index]?.value;
      return {
        ...state,
        fields: withOptions(state.fields, action.id, (options) =>
          options.filter((_, i) => i !== action.index),
        ),
        // A removed answer no longer counts as a pass or a fail (as on the web).
        resultMapping: mapMappedValues(state.resultMapping, action.id, (v) =>
          v === removed ? undefined : v,
        ),
      };
    }

    case 'setDescription':
      return { ...state, description: action.value };

    case 'setIntroMarkdown':
      return { ...state, introMarkdown: action.value };

    case 'setResultMapping':
      return { ...state, resultMapping: action.mapping };

    case 'ensureResultField':
      return ensureFieldsForResultType(state, 'pass_fail');

    case 'ensureFieldsForResultType':
      return ensureFieldsForResultType(state, action.resultType);

    default:
      return state;
  }
}

const PASS_VALUE = /^pass(ed)?$/i;
const FAIL_VALUE = /^(fail(ed)?|inconclusive|reaction)$/i;

/** Pass and fail answers read from a result question's options, by value or label. */
function guessMapping(
  fieldId: string,
  options: readonly ComplianceFieldOption[],
): ComplianceResultMapping {
  const matches = (o: ComplianceFieldOption, re: RegExp) => re.test(o.value) || re.test(o.label);
  return {
    field: fieldId,
    pass_values: options.filter((o) => matches(o, PASS_VALUE)).map((o) => o.value),
    fail_values: options.filter((o) => matches(o, FAIL_VALUE)).map((o) => o.value),
  };
}

/**
 * The question a result type cannot do without, added when it is picked (mirrors the web
 * `src/lib/compliance/result-type-fields.ts`, owner 2026-11-07): a signature for Signed, a file
 * upload for File upload, and a staff-only result question wired to pass and fail for Pass / fail.
 * A staff-only Dropdown is reused as the result only when one of its answers reads as a pass and
 * one as a fail (a library patch test's own "Result"), made required, its answers mapped; any other
 * staff Dropdown, such as "Photo ID seen", is left alone and a fresh Result question is added. A
 * form that already has the question keeps it, and nothing is ever removed.
 */
export function ensureFieldsForResultType(
  state: FieldBuilderState,
  resultType: ComplianceResultType,
): FieldBuilderState {
  const { fields, resultMapping } = state;
  if (resultType === 'signed') {
    if (fields.some((f) => f.type === 'signature')) return state;
    const signature: ComplianceField = {
      id: newFieldId(),
      type: 'signature',
      label: 'Client signature',
      required: true,
      staff_only: false,
    };
    return { ...state, fields: [...fields, signature] };
  }
  if (resultType === 'file_uploaded') {
    if (fields.some((f) => f.type === 'file')) return state;
    const file: ComplianceField = {
      id: newFieldId(),
      type: 'file',
      label: 'Upload a file',
      required: true,
      staff_only: false,
    };
    return { ...state, fields: [...fields, file] };
  }
  if (resultType === 'pass_fail') {
    if (resultMapping && fields.some((f) => f.id === resultMapping.field)) return state;
    const existing = fields.find((f): f is Extract<ComplianceField, { type: 'select' }> => {
      if (f.type !== 'select' || !(f.staff_only ?? false)) return false;
      const guess = guessMapping(f.id, f.options);
      return guess.pass_values.length > 0 && guess.fail_values.length > 0;
    });
    if (existing) {
      return {
        ...state,
        fields: fields.map((f) => (f.id === existing.id ? ({ ...f, required: true } as ComplianceField) : f)),
        resultMapping: guessMapping(existing.id, existing.options),
      };
    }
    const resultField: ComplianceField = {
      id: newFieldId(),
      type: 'select',
      label: 'Result (staff decision)',
      required: true,
      staff_only: true,
      options: [
        { value: 'pass', label: 'Pass' },
        { value: 'fail', label: 'Fail' },
      ],
    };
    return {
      ...state,
      fields: [...fields, resultField],
      resultMapping: { field: resultField.id, pass_values: ['pass'], fail_values: ['fail'] },
    };
  }
  return state;
}

/**
 * Assemble the final `form_schema` document from builder state + the type's name
 * and result type. `result_mapping` is only carried for `pass_fail` types
 * (matches the web builder's `schema` memo).
 */
export function buildFormSchema(
  state: FieldBuilderState,
  name: string,
  resultType: string,
): ComplianceFormSchema {
  return {
    schema_version: '1.0',
    title: name.trim() || 'Untitled form',
    description: state.description.trim() || undefined,
    intro_markdown: state.introMarkdown.trim() || undefined,
    fields: state.fields,
    result_mapping: resultType === 'pass_fail' ? state.resultMapping : undefined,
  };
}
