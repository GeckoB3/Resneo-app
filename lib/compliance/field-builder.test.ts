import {
  blankField,
  buildFormSchema,
  emptyBuilderState,
  fieldBuilderReducer,
  newFieldId,
  optionValueFromLabel,
  type FieldBuilderState,
} from '@/lib/compliance/field-builder';

function reduce(state: FieldBuilderState, ...actions: Parameters<typeof fieldBuilderReducer>[1][]) {
  return actions.reduce((s, a) => fieldBuilderReducer(s, a), state);
}

describe('newFieldId / blankField', () => {
  it('generates ids matching the server field-id rule ^[a-zA-Z0-9_]+$', () => {
    for (let i = 0; i < 5; i++) {
      expect(newFieldId()).toMatch(/^[a-zA-Z0-9_]+$/);
    }
  });

  it('blank select/multiselect fields get a starter option', () => {
    const sel = blankField('select');
    expect(sel.type).toBe('select');
    expect('options' in sel && sel.options.length).toBe(1);
    const text = blankField('text');
    expect(text.type).toBe('text');
    expect('options' in text).toBe(false);
  });
});

describe('optionValueFromLabel', () => {
  it('slugifies the label', () => {
    expect(optionValueFromLabel('No reaction', 0)).toBe('no_reaction');
    expect(optionValueFromLabel('  Yes!  ', 1)).toBe('yes');
  });

  it('falls back to option_N for an empty slug', () => {
    expect(optionValueFromLabel('!!!', 2)).toBe('option_3');
  });
});

describe('fieldBuilderReducer', () => {
  it('adds a field from the palette', () => {
    const next = fieldBuilderReducer(emptyBuilderState, { type: 'addField', fieldType: 'text' });
    expect(next.fields).toHaveLength(1);
    expect(next.fields[0]!.type).toBe('text');
  });

  it('edits a field label / required / staff_only', () => {
    const added = fieldBuilderReducer(emptyBuilderState, { type: 'addField', fieldType: 'text' });
    const id = added.fields[0]!.id;
    const edited = reduce(
      added,
      { type: 'updateField', id, patch: { label: 'Full name' } },
      { type: 'updateField', id, patch: { required: true } },
      { type: 'updateField', id, patch: { staff_only: true } },
    );
    expect(edited.fields[0]).toMatchObject({ label: 'Full name', required: true, staff_only: true });
  });

  it('reorders fields up and down without going out of bounds', () => {
    let state = reduce(
      emptyBuilderState,
      { type: 'addField', fieldType: 'text' },
      { type: 'addField', fieldType: 'date' },
      { type: 'addField', fieldType: 'signature' },
    );
    const [a, b, c] = state.fields.map((f) => f.id);

    // Move the last one up → [a, c, b]
    state = fieldBuilderReducer(state, { type: 'moveField', id: c!, direction: 'up' });
    expect(state.fields.map((f) => f.id)).toEqual([a, c, b]);

    // Move the first one up → no-op (already top)
    state = fieldBuilderReducer(state, { type: 'moveField', id: a!, direction: 'up' });
    expect(state.fields.map((f) => f.id)).toEqual([a, c, b]);

    // Move the last one down → no-op (already bottom)
    state = fieldBuilderReducer(state, { type: 'moveField', id: b!, direction: 'down' });
    expect(state.fields.map((f) => f.id)).toEqual([a, c, b]);

    // Move the first down → [c, a, b]
    state = fieldBuilderReducer(state, { type: 'moveField', id: a!, direction: 'down' });
    expect(state.fields.map((f) => f.id)).toEqual([c, a, b]);
  });

  it('deletes a field and clears a result_mapping that points at it', () => {
    const added = fieldBuilderReducer(emptyBuilderState, { type: 'addField', fieldType: 'select' });
    const id = added.fields[0]!.id;
    const withMapping = fieldBuilderReducer(added, {
      type: 'setResultMapping',
      mapping: { field: id, pass_values: ['option_1'], fail_values: [] },
    });
    const removed = fieldBuilderReducer(withMapping, { type: 'removeField', id });
    expect(removed.fields).toHaveLength(0);
    expect(removed.resultMapping).toBeUndefined();
  });

  it('manages options: add / update (slug) / remove (never below 1)', () => {
    const added = fieldBuilderReducer(emptyBuilderState, { type: 'addField', fieldType: 'select' });
    const id = added.fields[0]!.id;

    let state = fieldBuilderReducer(added, { type: 'addOption', id });
    expect('options' in state.fields[0]! && state.fields[0]!.options).toHaveLength(2);

    state = fieldBuilderReducer(state, { type: 'updateOption', id, index: 0, label: 'No Reaction' });
    const opts0 = (state.fields[0] as { options: { value: string; label: string }[] }).options;
    expect(opts0[0]).toEqual({ value: 'no_reaction', label: 'No Reaction' });

    state = fieldBuilderReducer(state, { type: 'removeOption', id, index: 1 });
    expect((state.fields[0] as { options: unknown[] }).options).toHaveLength(1);

    // Removing the last remaining option is a no-op.
    state = fieldBuilderReducer(state, { type: 'removeOption', id, index: 0 });
    expect((state.fields[0] as { options: unknown[] }).options).toHaveLength(1);
  });

  it('addOption never reuses a value freed by a prior delete (audit U8)', () => {
    const added = fieldBuilderReducer(emptyBuilderState, { type: 'addField', fieldType: 'select' });
    const id = added.fields[0]!.id;
    // [option_1] -> add -> [option_1, option_2] -> delete option_1 -> [option_2] -> add
    let state = fieldBuilderReducer(added, { type: 'addOption', id });
    state = fieldBuilderReducer(state, { type: 'removeOption', id, index: 0 });
    state = fieldBuilderReducer(state, { type: 'addOption', id });
    const values = (state.fields[0] as { options: { value: string }[] }).options.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length); // all unique
    expect(values).toEqual(['option_2', 'option_3']);
  });

  it('updateOption disambiguates two labels that slugify to the same value (audit U8)', () => {
    let state = fieldBuilderReducer(emptyBuilderState, { type: 'addField', fieldType: 'select' });
    const id = state.fields[0]!.id;
    state = fieldBuilderReducer(state, { type: 'addOption', id }); // 2 options
    state = fieldBuilderReducer(state, { type: 'updateOption', id, index: 0, label: 'Yes' });
    state = fieldBuilderReducer(state, { type: 'updateOption', id, index: 1, label: 'Yes!' });
    const values = (state.fields[0] as { options: { value: string }[] }).options.map((o) => o.value);
    expect(values).toEqual(['yes', 'yes_2']); // second disambiguated, not a duplicate 'yes'
    expect(new Set(values).size).toBe(2);
  });

  it('sets description / intro markdown / result mapping', () => {
    const state = reduce(
      emptyBuilderState,
      { type: 'setDescription', value: 'desc' },
      { type: 'setIntroMarkdown', value: '**hi**' },
      { type: 'setResultMapping', mapping: { field: 'r', pass_values: ['a'], fail_values: ['b'] } },
    );
    expect(state.description).toBe('desc');
    expect(state.introMarkdown).toBe('**hi**');
    expect(state.resultMapping).toEqual({ field: 'r', pass_values: ['a'], fail_values: ['b'] });
  });

  it('ensureResultField creates a staff-only Pass/Fail select + mapping when none exists', () => {
    const state = fieldBuilderReducer(emptyBuilderState, { type: 'ensureResultField' });
    expect(state.fields).toHaveLength(1);
    const f = state.fields[0]!;
    expect(f.type).toBe('select');
    expect(f.staff_only).toBe(true);
    expect(f.required).toBe(true);
    expect(state.resultMapping).toEqual({
      field: f.id,
      pass_values: ['pass'],
      fail_values: ['fail'],
    });
  });

  it('ensureResultField reuses an existing staff-only select without adding a field', () => {
    let state = fieldBuilderReducer(emptyBuilderState, { type: 'addField', fieldType: 'select' });
    const id = state.fields[0]!.id;
    state = fieldBuilderReducer(state, { type: 'updateField', id, patch: { staff_only: true } });
    state = fieldBuilderReducer(state, { type: 'ensureResultField' });
    expect(state.fields).toHaveLength(1);
    expect(state.resultMapping).toEqual({ field: id, pass_values: [], fail_values: [] });
  });
});

describe('buildFormSchema', () => {
  it('assembles a schema, carrying result_mapping only for pass_fail', () => {
    const state = reduce(
      emptyBuilderState,
      { type: 'addField', fieldType: 'select' },
      { type: 'setDescription', value: 'hello' },
      { type: 'setResultMapping', mapping: { field: 'r', pass_values: ['a'], fail_values: ['b'] } },
    );

    const passFail = buildFormSchema(state, 'My form', 'pass_fail');
    expect(passFail.title).toBe('My form');
    expect(passFail.description).toBe('hello');
    expect(passFail.result_mapping).toBeDefined();

    const completed = buildFormSchema(state, 'My form', 'completed');
    expect(completed.result_mapping).toBeUndefined();
  });

  it('defaults the title when the name is blank', () => {
    const schema = buildFormSchema(emptyBuilderState, '   ', 'completed');
    expect(schema.title).toBe('Untitled form');
  });
});
