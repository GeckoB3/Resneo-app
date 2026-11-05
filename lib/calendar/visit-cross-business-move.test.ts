

import {
  crossBusinessMoveRefusal,
  GROUP_CROSS_BUSINESS_MOVE_REFUSAL,
  VISIT_CROSS_BUSINESS_MOVE_REFUSAL,
} from './visit-cross-business-move';

describe('crossBusinessMoveRefusal (split-visit plan 7.6, S24)', () => {
  it("refuses a visit's service dropped on another business's column", () => {
    expect(crossBusinessMoveRefusal({ group_booking_id: 'g-1' }, 'v-nails', 'v-studio')).toBe(VISIT_CROSS_BUSINESS_MOVE_REFUSAL);
  });

  it('refuses a person of a group booking in its own words', () => {
    expect(crossBusinessMoveRefusal({ group_booking_id: 'g-1', person_label: 'Guest 2' }, 'v-nails', 'v-studio')).toBe(
      GROUP_CROSS_BUSINESS_MOVE_REFUSAL,
    );
  });

  it('leaves a move within one business, or of a single booking, to the usual checks', () => {
    expect(crossBusinessMoveRefusal({ group_booking_id: 'g-1' }, 'v-nails', 'v-nails')).toBeNull();
    expect(crossBusinessMoveRefusal({ group_booking_id: null }, 'v-nails', 'v-studio')).toBeNull();
  });

  it("lets a visit's service cross to another business of the viewer's collective (web 2026-11-05)", () => {
    const collective = ['v-nails', 'v-studio'];
    expect(crossBusinessMoveRefusal({ group_booking_id: 'g-1' }, 'v-nails', 'v-studio', collective)).toBeNull();
    expect(crossBusinessMoveRefusal({ group_booking_id: 'g-1' }, 'v-nails', 'v-elsewhere', collective)).toBe(
      VISIT_CROSS_BUSINESS_MOVE_REFUSAL,
    );
    expect(crossBusinessMoveRefusal({ group_booking_id: 'g-1', person_label: 'Guest 2' }, 'v-nails', 'v-studio', collective)).toBe(
      GROUP_CROSS_BUSINESS_MOVE_REFUSAL,
    );
  });

  it('has no em-dash in either refusal', () => {
    expect(VISIT_CROSS_BUSINESS_MOVE_REFUSAL).not.toContain('—');
    expect(GROUP_CROSS_BUSINESS_MOVE_REFUSAL).not.toContain('—');
  });
});
