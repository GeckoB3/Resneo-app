import type { ProcessingBlockDraft } from '@/components/services/ProcessingTimeBlocksEditor';
import {
  CARD_HOLD_FEE_MODE_OPTIONS,
  DEFAULT_STAFF_MAY,
  PAYMENT_OPTIONS,
  processingFingerprint,
  STAFF_MAY_FIELDS,
} from '@/lib/services/service-form-options';

function draft(start: string, duration: string): ProcessingBlockDraft {
  return { start, duration } as ProcessingBlockDraft;
}

describe('processingFingerprint', () => {
  it('ignores the order the gaps were entered in', () => {
    expect(processingFingerprint([draft('30', '15'), draft('10', '5')])).toBe(
      processingFingerprint([draft('10', '5'), draft('30', '15')]),
    );
  });

  it('reads blank or broken numbers as zero', () => {
    expect(processingFingerprint([draft('', 'x')])).toBe('[[0,0]]');
  });

  it('tells a changed gap apart', () => {
    expect(processingFingerprint([draft('10', '5')])).not.toBe(processingFingerprint([draft('10', '10')]));
  });
});

describe('service form choices', () => {
  it('offers the four payment options', () => {
    expect(PAYMENT_OPTIONS.map((o) => o.value)).toEqual(['none', 'deposit', 'full_payment', 'card_hold']);
  });

  it('offers a fixed or percentage no-show fee', () => {
    expect(CARD_HOLD_FEE_MODE_OPTIONS.map((o) => o.value)).toEqual(['fixed', 'percent']);
  });

  it('lists a switch for every staff override, all off by default', () => {
    expect(STAFF_MAY_FIELDS.map((f) => f.key).sort()).toEqual(Object.keys(DEFAULT_STAFF_MAY).sort());
    expect(Object.values(DEFAULT_STAFF_MAY).every((v) => v === false)).toBe(true);
  });
});
