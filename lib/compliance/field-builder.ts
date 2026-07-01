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
  | { type: 'ensureResultField' };

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
        fields: withOptions(state.fields, action.id, (options) => [
          ...options,
          {
            value: `option_${options.length + 1}`,
            label: `Option ${options.length + 1}`,
          },
        ]),
      };

    case 'updateOption':
      return {
        ...state,
        fields: withOptions(state.fields, action.id, (options) =>
          options.map((o, i) =>
            i === action.index
              ? { value: optionValueFromLabel(action.label, i), label: action.label }
              : o,
          ),
        ),
      };

    case 'removeOption':
      return {
        ...state,
        fields: withOptions(state.fields, action.id, (options) =>
          options.length > 1 ? options.filter((_, i) => i !== action.index) : options,
        ),
      };

    case 'setDescription':
      return { ...state, description: action.value };

    case 'setIntroMarkdown':
      return { ...state, introMarkdown: action.value };

    case 'setResultMapping':
      return { ...state, resultMapping: action.mapping };

    case 'ensureResultField': {
      // Mirror the web `handleResultTypeChange`: when a type becomes pass_fail, reuse
      // an existing staff-only select as the result field, otherwise auto-create one
      // with Pass/Fail options + a pre-filled mapping so a valid form exists at once.
      const existing = state.fields.find(
        (f): f is Extract<ComplianceField, { type: 'select' }> =>
          f.type === 'select' && (f.staff_only ?? false),
      );
      if (existing) {
        return state.resultMapping
          ? state
          : {
              ...state,
              resultMapping: { field: existing.id, pass_values: [], fail_values: [] },
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
        fields: [...state.fields, resultField],
        resultMapping: { field: resultField.id, pass_values: ['pass'], fail_values: ['fail'] },
      };
    }

    default:
      return state;
  }
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
