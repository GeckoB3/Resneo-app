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

  it('ensureResultField reuses a staff-only select whose answers read as a pass and a fail', () => {
    let state = fieldBuilderReducer(emptyBuilderState, { type: 'addField', fieldType: 'select' });
    const id = state.fields[0]!.id;
    state = fieldBuilderReducer(state, { type: 'updateField', id, patch: { staff_only: true } });
    state = fieldBuilderReducer(state, { type: 'updateOption', id, index: 0, label: 'Passed' });
    state = fieldBuilderReducer(state, { type: 'addOption', id });
    state = fieldBuilderReducer(state, { type: 'updateOption', id, index: 1, label: 'Reaction' });
    state = fieldBuilderReducer(state, { type: 'ensureResultField' });
    expect(state.fields).toHaveLength(1);
    // A pass/fail result must be required.
    expect(state.fields[0]).toMatchObject({ required: true });
    expect(state.resultMapping).toEqual({ field: id, pass_values: ['passed'], fail_values: ['reaction'] });
  });

  it('ensureResultField leaves any other staff-only Dropdown alone and adds a fresh Result (web parity)', () => {
    const photoId = {
      id: 'f_photo_id',
      type: 'select' as const,
      label: 'Photo ID seen',
      required: false,
      staff_only: true,
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    };
    // Only a pass answer, no fail answer: not a result question either.
    const onlyPass = { ...photoId, id: 'f_half', options: [{ value: 'pass', label: 'Pass' }] };
    const state = fieldBuilderReducer(
      { ...emptyBuilderState, fields: [photoId, onlyPass] },
      { type: 'ensureResultField' },
    );
    expect(state.fields).toHaveLength(3);
    expect(state.fields[0]).toEqual(photoId);
    const added = state.fields[2]!;
    expect(added).toMatchObject({
      type: 'select',
      label: 'Result (staff decision)',
      required: true,
      staff_only: true,
    });
    expect(state.resultMapping).toEqual({ field: added.id, pass_values: ['pass'], fail_values: ['fail'] });
  });

  it('renaming an answer carries its Pass or Fail mark to the new value (web parity)', () => {
    const state = fieldBuilderReducer(emptyBuilderState, { type: 'ensureResultField' });
    const id = state.fields[0]!.id;
    const renamed = reduce(
      state,
      { type: 'updateOption', id, index: 0, label: 'No reaction' },
      { type: 'updateOption', id, index: 1, label: 'Reaction seen' },
    );
    const options = (renamed.fields[0] as { options: { value: string }[] }).options;
    expect(options.map((o) => o.value)).toEqual(['no_reaction', 'reaction_seen']);
    expect(renamed.resultMapping).toEqual({
      field: id,
      pass_values: ['no_reaction'],
      fail_values: ['reaction_seen'],
    });
  });

  it('renaming an answer on another question leaves the mapping alone', () => {
    let state = fieldBuilderReducer(emptyBuilderState, { type: 'ensureResultField' });
    state = fieldBuilderReducer(state, { type: 'addField', fieldType: 'select' });
    const other = state.fields[1]!.id;
    const mapping = state.resultMapping;
    state = fieldBuilderReducer(state, { type: 'updateOption', id: other, index: 0, label: 'Pass' });
    expect(state.resultMapping).toBe(mapping);
  });

  it('removing an answer drops it from Pass and Fail', () => {
    let state = fieldBuilderReducer(emptyBuilderState, { type: 'ensureResultField' });
    const id = state.fields[0]!.id;
    state = fieldBuilderReducer(state, { type: 'removeOption', id, index: 1 });
    expect(state.resultMapping).toEqual({ field: id, pass_values: ['pass'], fail_values: [] });
  });

  it('ensureFieldsForResultType adds a signature for Signed and a file upload for File upload (web parity)', () => {
    const signed = fieldBuilderReducer(emptyBuilderState, { type: 'ensureFieldsForResultType', resultType: 'signed' });
    expect(signed.fields).toEqual([
      expect.objectContaining({ type: 'signature', label: 'Client signature', required: true }),
    ]);
    expect(fieldBuilderReducer(signed, { type: 'ensureFieldsForResultType', resultType: 'signed' })).toBe(signed);
    const file = fieldBuilderReducer(signed, { type: 'ensureFieldsForResultType', resultType: 'file_uploaded' });
    expect(file.fields.map((f) => f.type)).toEqual(['signature', 'file']);
    // Switching to Completed removes nothing.
    expect(fieldBuilderReducer(file, { type: 'ensureFieldsForResultType', resultType: 'completed' })).toBe(file);
  });

  it("ensureFieldsForResultType wires a library patch test's own Result question", () => {
    const state = fieldBuilderReducer(
      {
        ...emptyBuilderState,
        fields: [
          {
            id: 'f_result',
            type: 'select',
            label: 'Result',
            required: false,
            staff_only: true,
            options: [
              { value: 'pass', label: 'Pass' },
              { value: 'fail', label: 'Fail' },
              { value: 'inconclusive', label: 'Inconclusive' },
            ],
          },
        ],
      },
      { type: 'ensureFieldsForResultType', resultType: 'pass_fail' },
    );
    expect(state.fields).toHaveLength(1);
    expect(state.fields[0]).toMatchObject({ required: true });
    expect(state.resultMapping).toEqual({
      field: 'f_result',
      pass_values: ['pass'],
      fail_values: ['fail', 'inconclusive'],
    });
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
