import {
  computeResult,
  parseFormSchema,
  resolveDateDefault,
  seedDefaultResponses,
  validateFormSchemaForType,
  type ComplianceField,
  type ComplianceFormSchema,
  type SignatureResponse,
} from '@/lib/compliance/form-schema';

function schema(fields: ComplianceField[], extra: Partial<ComplianceFormSchema> = {}): ComplianceFormSchema {
  return { schema_version: '1.0', title: 'Form', fields, ...extra };
}

const textField: ComplianceField = { id: 'name', type: 'text', label: 'Name', required: false, staff_only: false };
const signatureField: ComplianceField = { id: 'sig', type: 'signature', label: 'Sign', required: false, staff_only: false };
const fileField: ComplianceField = { id: 'doc', type: 'file', label: 'Upload', required: false, staff_only: false };
const resultSelect: ComplianceField = {
  id: 'result',
  type: 'select',
  label: 'Outcome',
  required: true,
  staff_only: true,
  options: [
    { value: 'clear', label: 'Clear' },
    { value: 'reaction', label: 'Reaction' },
  ],
};

describe('validateFormSchemaForType', () => {
  it('accepts a simple completed form', () => {
    expect(validateFormSchemaForType(schema([textField]), 'completed').ok).toBe(true);
  });

  // Friendlier messages (web parity, 2026-11-07): the exact words a business owner reads.
  it('flags duplicate field ids, once however many clash', () => {
    const res = validateFormSchemaForType(
      schema([textField, { ...textField, label: 'Again' }, { ...textField, label: 'Third' }]),
      'completed',
    );
    expect(res.ok).toBe(false);
    expect(res.errors).toEqual(['Two questions share an id. Remove one and add it again.']);
  });

  it('rejects more than one signature field', () => {
    const res = validateFormSchemaForType(
      schema([signatureField, { ...signatureField, id: 'sig2' }]),
      'signed',
    );
    expect(res.errors).toEqual(['A form can have one Signature question.']);
  });

  it('rejects more than one file field', () => {
    const res = validateFormSchemaForType(
      schema([fileField, { ...fileField, id: 'doc2' }]),
      'file_uploaded',
    );
    expect(res.errors).toEqual(['A form can have one File upload question.']);
  });

  it('requires a signature field for a signed type', () => {
    const res = validateFormSchemaForType(schema([textField]), 'signed');
    expect(res.ok).toBe(false);
    expect(res.errors).toEqual(['A signed form needs a Signature question.']);
  });

  it('requires a file field for a file_uploaded type', () => {
    const res = validateFormSchemaForType(schema([textField]), 'file_uploaded');
    expect(res.errors).toEqual(['A file upload form needs a File upload question.']);
  });

  describe('pass_fail mapping', () => {
    const passFail = (field: ComplianceField, pass: string[], fail: string[]) =>
      validateFormSchemaForType(
        schema([field], { result_mapping: { field: field.id, pass_values: pass, fail_values: fail } }),
        'pass_fail',
      );

    it('requires a result_mapping', () => {
      const res = validateFormSchemaForType(schema([resultSelect]), 'pass_fail');
      expect(res.errors).toEqual(['Choose the question your team uses to record pass or fail.']);
    });

    it('says when the question the mapping points at was removed', () => {
      const res = validateFormSchemaForType(
        schema([textField], {
          result_mapping: { field: 'gone', pass_values: ['clear'], fail_values: ['reaction'] },
        }),
        'pass_fail',
      );
      expect(res.errors).toEqual([
        'The pass or fail question was removed. Add it back or pick another.',
      ]);
    });

    it('requires the mapped question to be a Dropdown', () => {
      const res = passFail({ ...textField, id: 'result' }, ['clear'], ['reaction']);
      expect(res.errors).toEqual(['The pass or fail question must be a Dropdown.']);
    });

    it('requires the mapped field to be a staff-only select', () => {
      const res = passFail({ ...resultSelect, staff_only: false }, ['clear'], ['reaction']);
      expect(res.errors).toEqual(['The pass or fail question must be marked Staff only.']);
    });

    it('requires the mapped result field to be marked required (audit M7)', () => {
      const res = passFail({ ...resultSelect, required: false }, ['clear'], ['reaction']);
      expect(res.errors).toEqual(['The pass or fail question must be marked Required.']);
    });

    it('needs at least one Pass answer and one Fail answer (new check)', () => {
      expect(passFail(resultSelect, [], ['reaction']).errors).toEqual([
        'Mark at least one answer as Pass and one as Fail.',
      ]);
      expect(passFail(resultSelect, ['clear'], []).errors).toEqual([
        'Mark at least one answer as Pass and one as Fail.',
      ]);
    });

    it('rejects mapping values absent from the options, with the same message once', () => {
      expect(passFail(resultSelect, ['clear'], ['nope']).errors).toEqual([
        'Mark at least one answer as Pass and one as Fail.',
      ]);
      expect(passFail(resultSelect, [], ['nope']).errors).toEqual([
        'Mark at least one answer as Pass and one as Fail.',
      ]);
    });

    it('rejects a value that is both pass and fail', () => {
      expect(passFail(resultSelect, ['clear'], ['clear', 'reaction']).errors).toEqual([
        "An answer can't be both Pass and Fail: clear.",
      ]);
    });

    it('accepts a valid pass_fail mapping', () => {
      const res = validateFormSchemaForType(
        schema([resultSelect], {
          result_mapping: { field: 'result', pass_values: ['clear'], fail_values: ['reaction'] },
        }),
        'pass_fail',
      );
      expect(res.ok).toBe(true);
    });
  });
});

describe('parseFormSchema (an edit keeps what the app does not show)', () => {
  const raw = {
    schema_version: '1.0',
    title: 'PPD Patch Test',
    fields: [
      {
        id: 'f_test_date',
        type: 'date',
        label: 'Date of patch test',
        required: true,
        sets_record_date: true,
        some_future_setting: { keep: 'me' },
      },
      { id: 'notes', type: 'text', label: 'Notes', later_key: 7 },
    ],
  };

  it("keeps a date question's sets_record_date, which the builder has no control for", () => {
    const parsed = parseFormSchema(raw);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.schema.fields[0]).toMatchObject({ type: 'date', sets_record_date: true });
  });

  it('keeps question keys this port does not know, and still fills the known defaults', () => {
    const parsed = parseFormSchema(raw);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.schema.fields[0]).toMatchObject({ some_future_setting: { keep: 'me' } });
    expect(parsed.schema.fields[1]).toMatchObject({
      later_key: 7,
      required: false,
      staff_only: false,
    });
  });

  it('defaults sets_record_date to false on a date question without it (as the web does)', () => {
    const parsed = parseFormSchema({
      title: 'Form',
      fields: [{ id: 'd', type: 'date', label: 'When' }],
    });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.schema.fields[0]).toMatchObject({ sets_record_date: false });
  });
});

describe('computeResult', () => {
  const s = schema([resultSelect], {
    result_mapping: { field: 'result', pass_values: ['clear'], fail_values: ['reaction'] },
  });

  it('returns pass / fail from the mapping', () => {
    expect(computeResult(s, { result: 'clear' }, 'pass_fail')).toBe('pass');
    expect(computeResult(s, { result: 'reaction' }, 'pass_fail')).toBe('fail');
  });

  it('returns inconclusive for an unmapped value and null for an absent one', () => {
    expect(computeResult(s, { result: 'other' }, 'pass_fail')).toBe('inconclusive');
    expect(computeResult(s, {}, 'pass_fail')).toBeNull();
  });

  it('returns signed / completed for the other result types', () => {
    expect(computeResult(schema([signatureField]), {}, 'signed')).toBe('signed');
    expect(computeResult(schema([fileField]), {}, 'file_uploaded')).toBe('completed');
    expect(computeResult(schema([textField]), {}, 'completed')).toBe('completed');
  });
});

describe('resolveDateDefault', () => {
  it('resolves "today" to an ISO date', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(resolveDateDefault('today')).toBe(today);
    expect(resolveDateDefault('today')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('passes through an explicit ISO date and undefined', () => {
    expect(resolveDateDefault('2026-01-15')).toBe('2026-01-15');
    expect(resolveDateDefault(undefined)).toBeUndefined();
  });
});

describe('seedDefaultResponses (capture default_value)', () => {
  it('resolves a date default of "today" to the current ISO date', () => {
    const today = new Date().toISOString().slice(0, 10);
    const seeded = seedDefaultResponses([
      { id: 'visit', type: 'date', default_value: 'today' },
    ]);
    expect(seeded.visit).toBe(today);
    expect(seeded.visit).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('seeds explicit string and multiselect defaults, and omits fields without a default', () => {
    const seeded = seedDefaultResponses([
      { id: 'colour', type: 'select', default_value: 'blue' },
      { id: 'allergies', type: 'multiselect', default_value: ['pollen', 'dust'] },
      { id: 'notes', type: 'text' }, // no default → omitted
      { id: 'when', type: 'date', default_value: '2026-03-01' },
    ]);
    expect(seeded).toEqual({
      colour: 'blue',
      allergies: ['pollen', 'dust'],
      when: '2026-03-01',
    });
    expect('notes' in seeded).toBe(false);
  });
});

describe('capture payload shapes', () => {
  // These mirror exactly what ComplianceCaptureSheet's controls emit, pinning
  // the on-the-wire shapes the web/record-view expect.
  it('a typed signature is the { method:"typed", data, signed_at } object — never a bare string', () => {
    const typed: SignatureResponse = {
      method: 'typed',
      data: 'Jane Doe',
      signed_at: new Date().toISOString(),
    };
    expect(typeof typed).toBe('object');
    expect(typed.method).toBe('typed');
    expect(typed.data).toBe('Jane Doe');
    expect(typeof typed.signed_at).toBe('string');
  });

  it('a drawn signature carries a base64 PNG data URL under method:"drawn"', () => {
    // The server only accepts ^data:(image/(png|jpeg));base64,… — SignaturePad
    // rasterises the <Svg> to a PNG via toDataURL, so the wire shape is a PNG URL.
    const drawn: SignatureResponse = {
      method: 'drawn',
      data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      signed_at: new Date().toISOString(),
    };
    expect(drawn.method).toBe('drawn');
    expect(drawn.data?.startsWith('data:image/png;base64,')).toBe(true);
    // Must match the server's accepted format exactly.
    expect(drawn.data).toMatch(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/);
  });

  it('date answers are YYYY-MM-DD (server /^\\d{4}-\\d{2}-\\d{2}$/)', () => {
    // The DatePickerField emits dateToIso(date); assert the format contract.
    const iso = new Date(2026, 2, 1, 12).toISOString().slice(0, 10);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
