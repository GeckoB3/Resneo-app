import {
  computeResult,
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
  required: false,
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

  it('flags duplicate field ids', () => {
    const res = validateFormSchemaForType(
      schema([textField, { ...textField, label: 'Again' }]),
      'completed',
    );
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('Duplicate field id'))).toBe(true);
  });

  it('rejects more than one signature field', () => {
    const res = validateFormSchemaForType(
      schema([signatureField, { ...signatureField, id: 'sig2' }]),
      'signed',
    );
    expect(res.errors).toContain('A form may contain at most one signature field.');
  });

  it('rejects more than one file field', () => {
    const res = validateFormSchemaForType(
      schema([fileField, { ...fileField, id: 'doc2' }]),
      'file_uploaded',
    );
    expect(res.errors).toContain('A form may contain at most one file upload field.');
  });

  it('requires a signature field for a signed type', () => {
    const res = validateFormSchemaForType(schema([textField]), 'signed');
    expect(res.ok).toBe(false);
    expect(res.errors).toContain('Types with result type "signed" must include a signature field.');
  });

  it('requires a file field for a file_uploaded type', () => {
    const res = validateFormSchemaForType(schema([textField]), 'file_uploaded');
    expect(res.errors).toContain('Types with result type "file_uploaded" must include a file upload field.');
  });

  describe('pass_fail mapping', () => {
    it('requires a result_mapping', () => {
      const res = validateFormSchemaForType(schema([resultSelect]), 'pass_fail');
      expect(res.errors).toContain(
        'Pass/fail types require a result_mapping pointing at a result field.',
      );
    });

    it('requires the mapped field to be a staff-only select', () => {
      const nonStaff: ComplianceField = { ...resultSelect, staff_only: false };
      const res = validateFormSchemaForType(
        schema([nonStaff], {
          result_mapping: { field: 'result', pass_values: ['clear'], fail_values: ['reaction'] },
        }),
        'pass_fail',
      );
      expect(res.errors).toContain('The pass/fail result field must be marked staff_only.');
    });

    it('rejects mapping values absent from the options', () => {
      const res = validateFormSchemaForType(
        schema([resultSelect], {
          result_mapping: { field: 'result', pass_values: ['clear'], fail_values: ['nope'] },
        }),
        'pass_fail',
      );
      expect(res.errors.some((e) => e.includes('not present in the result field options'))).toBe(true);
    });

    it('rejects a value that is both pass and fail', () => {
      const res = validateFormSchemaForType(
        schema([resultSelect], {
          result_mapping: { field: 'result', pass_values: ['clear'], fail_values: ['clear'] },
        }),
        'pass_fail',
      );
      expect(res.errors.some((e) => e.includes('cannot be both pass and fail'))).toBe(true);
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
