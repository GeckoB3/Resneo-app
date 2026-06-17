import type { LinkGrant } from '@/types/linked-venues';

import {
  applyCalendarVisibilityChange,
  classifyGrantChange,
  describeGrant,
  grantsEqual,
  isGrantCoherent,
  isIncreaseOnly,
  isLinkConfigurationValid,
  isReductionOnly,
  normaliseCalendarIds,
  normaliseGrant,
  summariseGrant,
} from './grants';

const NONE: LinkGrant = { calendar: 'none', pii: false, act: 'none' };
const TIME: LinkGrant = { calendar: 'time_only', pii: false, act: 'none' };
const FULL_VIEW: LinkGrant = { calendar: 'full_details', pii: false, act: 'none' };
const FULL_EDIT: LinkGrant = { calendar: 'full_details', pii: true, act: 'edit_existing' };
const FULL_ALL: LinkGrant = { calendar: 'full_details', pii: true, act: 'create_edit_cancel' };

describe('normaliseGrant — coherence clamping (§5.5)', () => {
  it('none clears pii/act/scope', () => {
    expect(normaliseGrant({ calendar: 'none', pii: true, act: 'create_edit_cancel', calendarIds: ['a'] })).toEqual({
      calendar: 'none',
      pii: false,
      act: 'none',
      calendarIds: null,
    });
  });

  it('time_only forces pii=false and act=none but keeps scope', () => {
    expect(normaliseGrant({ calendar: 'time_only', pii: true, act: 'edit_existing', calendarIds: ['b', 'a'] })).toEqual({
      calendar: 'time_only',
      pii: false,
      act: 'none',
      calendarIds: ['a', 'b'],
    });
  });

  it('full_details without pii clamps act to none', () => {
    expect(normaliseGrant({ calendar: 'full_details', pii: false, act: 'create_edit_cancel' })).toEqual({
      calendar: 'full_details',
      pii: false,
      act: 'none',
      calendarIds: null,
    });
  });

  it('full_details with pii keeps act', () => {
    expect(normaliseGrant(FULL_ALL)).toEqual({
      calendar: 'full_details',
      pii: true,
      act: 'create_edit_cancel',
      calendarIds: null,
    });
  });
});

describe('normaliseCalendarIds', () => {
  it('empty/null → null', () => {
    expect(normaliseCalendarIds(null)).toBeNull();
    expect(normaliseCalendarIds(undefined)).toBeNull();
    expect(normaliseCalendarIds([])).toBeNull();
  });
  it('sorts and de-duplicates', () => {
    expect(normaliseCalendarIds(['c', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });
});

describe('isGrantCoherent', () => {
  it('flags an incoherent grant', () => {
    expect(isGrantCoherent({ calendar: 'time_only', pii: true, act: 'edit_existing' })).toBe(false);
  });
  it('accepts a coherent grant', () => {
    expect(isGrantCoherent(FULL_EDIT)).toBe(true);
  });
});

describe('isLinkConfigurationValid — zero-way prevention', () => {
  it('rejects none/none', () => {
    expect(isLinkConfigurationValid(NONE, NONE)).toBe(false);
  });
  it('accepts when one direction grants access', () => {
    expect(isLinkConfigurationValid(NONE, TIME)).toBe(true);
  });
});

describe('grantsEqual', () => {
  it('treats incoherent and clamped equivalents as equal', () => {
    expect(grantsEqual({ calendar: 'none', pii: true, act: 'edit_existing' }, NONE)).toBe(true);
  });
  it('compares calendar scope after canonicalisation', () => {
    expect(
      grantsEqual(
        { calendar: 'time_only', pii: false, act: 'none', calendarIds: ['b', 'a'] },
        { calendar: 'time_only', pii: false, act: 'none', calendarIds: ['a', 'b'] },
      ),
    ).toBe(true);
    expect(
      grantsEqual(
        { calendar: 'time_only', pii: false, act: 'none', calendarIds: ['a'] },
        { calendar: 'time_only', pii: false, act: 'none', calendarIds: null },
      ),
    ).toBe(false);
  });
});

describe('isIncreaseOnly / isReductionOnly — ranks', () => {
  it('none → full_edit is an increase, not a reduction', () => {
    expect(isIncreaseOnly(NONE, FULL_EDIT)).toBe(true);
    expect(isReductionOnly(NONE, FULL_EDIT)).toBe(false);
  });
  it('full_all → time_only is a reduction, not an increase', () => {
    expect(isReductionOnly(FULL_ALL, TIME)).toBe(true);
    expect(isIncreaseOnly(FULL_ALL, TIME)).toBe(false);
  });
  it('identical grants are neither an increase', () => {
    expect(isIncreaseOnly(FULL_EDIT, FULL_EDIT)).toBe(false);
  });
  it('a mixed change (calendar up, act down) is neither pure increase nor reduction', () => {
    // time_only(view) → full_details but pii off (act stays none): calendar up only → increase
    expect(isIncreaseOnly(TIME, FULL_VIEW)).toBe(true);
    // full_all → full_view: calendar same, pii true→false, act down → reduction
    expect(isReductionOnly(FULL_ALL, FULL_VIEW)).toBe(true);
    expect(isIncreaseOnly(FULL_ALL, FULL_VIEW)).toBe(false);
  });
  it('widening calendar scope is an increase; narrowing is a reduction (§18)', () => {
    const scoped: LinkGrant = { calendar: 'full_details', pii: true, act: 'edit_existing', calendarIds: ['a'] };
    const all: LinkGrant = { calendar: 'full_details', pii: true, act: 'edit_existing', calendarIds: null };
    expect(isIncreaseOnly(scoped, all)).toBe(true);
    expect(isReductionOnly(all, scoped)).toBe(true);
  });
});

describe('applyCalendarVisibilityChange — §5.4 upgrade defaults', () => {
  it('upgrading none→full_details enables pii + edit', () => {
    expect(applyCalendarVisibilityChange(NONE, 'full_details')).toEqual({
      calendar: 'full_details',
      pii: true,
      act: 'edit_existing',
      calendarIds: null,
    });
  });
  it('downgrading full→time_only clamps', () => {
    expect(applyCalendarVisibilityChange(FULL_ALL, 'time_only')).toEqual({
      calendar: 'time_only',
      pii: false,
      act: 'none',
      calendarIds: null,
    });
  });
});

describe('describeGrant / summariseGrant copy', () => {
  it('describes a full edit grant', () => {
    expect(describeGrant(FULL_EDIT)).toEqual([
      'see the calendar in full detail',
      'see client contact details',
      'edit existing bookings',
    ]);
  });
  it('summarises time_only', () => {
    expect(summariseGrant(TIME)).toBe('Time blocks only');
  });
});

describe('classifyGrantChange — immediate vs deferred', () => {
  // current: I can fully manage them; they can fully manage me.
  const current = { iCan: FULL_ALL, theyCan: FULL_ALL };

  it('reducing only what I grant → reduce (immediate)', () => {
    const result = classifyGrantChange(current, { iCan: FULL_ALL, theyCan: FULL_EDIT });
    expect(result.action).toBe('reduce');
    expect(result.canApplyMineReduction).toBe(true);
    expect(result.needsNegotiation).toBe(false);
    expect(result.submitLabel).toBe('Reduce access now');
  });

  it('expanding only what I grant → grant (immediate)', () => {
    const start = { iCan: FULL_ALL, theyCan: FULL_EDIT };
    const result = classifyGrantChange(start, { iCan: FULL_ALL, theyCan: FULL_ALL });
    expect(result.action).toBe('grant');
    expect(result.canApplyMineIncrease).toBe(true);
    expect(result.submitLabel).toBe('Expand access now');
  });

  it('changing what they grant me → propose (negotiated)', () => {
    const result = classifyGrantChange(current, { iCan: FULL_EDIT, theyCan: FULL_ALL });
    expect(result.action).toBe('propose');
    expect(result.needsNegotiation).toBe(true);
    expect(result.submitLabel).toBe('Propose change');
  });

  it('changing both directions → propose', () => {
    const result = classifyGrantChange(current, { iCan: FULL_EDIT, theyCan: FULL_EDIT });
    expect(result.action).toBe('propose');
  });

  it('no change → none', () => {
    const result = classifyGrantChange(current, { iCan: FULL_ALL, theyCan: FULL_ALL });
    expect(result.action).toBe('none');
    expect(result.mineChanged).toBe(false);
    expect(result.theirsChanged).toBe(false);
  });
});
