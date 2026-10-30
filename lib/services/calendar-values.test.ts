/**
 * One calendar's own price and times (web `CollectiveCalendarValuesDialog`, 2026-10-28): which
 * fields each side sees, what a blank box means, what is sent, and how the host's
 * `flags_turned_on` is read back.
 */
import type { CollectiveCalendarGroup } from '@/lib/collective-area/model';

import {
  calendarValueDefaults,
  calendarValueFlags,
  calendarValuesPatch,
  calendarValuesTarget,
  calendarValuesText,
  fieldsTurnedOnBySaving,
  flagsTurnedOn,
  NO_CALENDAR_VALUE_FLAGS,
  orList,
  ownCalendarValuesTarget,
  parseCalendarValue,
  shownCalendarValueFields,
  standardValueText,
  type CalendarValues,
} from './calendar-values';

const NONE: CalendarValues = {
  custom_price_pence: null,
  custom_duration_minutes: null,
  custom_buffer_minutes: null,
  custom_deposit_pence: null,
};

const keys = (fields: { key: string }[]) => fields.map((f) => f.key);

describe('which fields the step shows', () => {
  it("shows a member admin only what the service lets calendars set", () => {
    const flags = { ...NO_CALENDAR_VALUE_FLAGS, price: true };
    expect(keys(shownCalendarValueFields('own', flags, null))).toEqual(['custom_price_pence']);
    expect(shownCalendarValueFields('own', NO_CALENDAR_VALUE_FLAGS, null)).toEqual([]);
  });

  it('shows the host price, length and buffer always, and deposit only when the service takes one', () => {
    const noDeposit = calendarValueDefaults({ duration_minutes: 30, price_pence: 2500, payment_requirement: 'none', deposit_pence: 500 });
    expect(keys(shownCalendarValueFields('host', NO_CALENDAR_VALUE_FLAGS, noDeposit))).toEqual([
      'custom_price_pence',
      'custom_duration_minutes',
      'custom_buffer_minutes',
    ]);
    const deposit = calendarValueDefaults({ duration_minutes: 30, payment_requirement: 'deposit', deposit_pence: 500 });
    expect(keys(shownCalendarValueFields('host', NO_CALENDAR_VALUE_FLAGS, deposit))).toContain('custom_deposit_pence');
    // A deposit the service already lets calendars set is shown either way.
    expect(keys(shownCalendarValueFields('host', { ...NO_CALENDAR_VALUE_FLAGS, deposit: true }, noDeposit))).toContain(
      'custom_deposit_pence',
    );
  });

  // CQ-12 (Rule B): each option sets its own price, length and buffer, so only a deposit is a calendar's own.
  it('leaves out price, length and buffer on a service with options, for the host and an admin alike', () => {
    const deposit = calendarValueDefaults({ duration_minutes: 30, payment_requirement: 'deposit', deposit_pence: 500 });
    const every = { price: true, duration: true, buffer: true, deposit: true };
    expect(keys(shownCalendarValueFields('host', NO_CALENDAR_VALUE_FLAGS, deposit, true))).toEqual(['custom_deposit_pence']);
    expect(keys(shownCalendarValueFields('own', every, null, true))).toEqual(['custom_deposit_pence']);
    expect(shownCalendarValueFields('host', NO_CALENDAR_VALUE_FLAGS, null, true)).toEqual([]);
  });

  it('names the settings a host save would turn on, in an "or" list', () => {
    const flags = { ...NO_CALENDAR_VALUE_FLAGS, price: true };
    const shown = shownCalendarValueFields('host', flags, null);
    const turnsOn = fieldsTurnedOnBySaving(shown, flags);
    expect(orList(turnsOn.map((f) => f.short))).toBe('length or buffer');
    expect(orList(['price', 'length', 'buffer'])).toBe('price, length or buffer');
    expect(orList(['price'])).toBe('price');
    expect(orList([])).toBe('');
  });
});

describe('reading the boxes', () => {
  it('reads a blank box as the standard, money as pence and minutes as whole minutes', () => {
    expect(parseCalendarValue('  ', 'custom_price_pence')).toEqual({ ok: true, value: null });
    expect(parseCalendarValue('12.5', 'custom_price_pence')).toEqual({ ok: true, value: 1250 });
    expect(parseCalendarValue('45', 'custom_duration_minutes')).toEqual({ ok: true, value: 45 });
    expect(parseCalendarValue('0', 'custom_buffer_minutes')).toEqual({ ok: true, value: 0 });
  });

  it('refuses what the server would: negative, not a number, or out of range', () => {
    expect(parseCalendarValue('-1', 'custom_price_pence').ok).toBe(false);
    expect(parseCalendarValue('ten', 'custom_price_pence').ok).toBe(false);
    expect(parseCalendarValue('4', 'custom_duration_minutes').ok).toBe(false);
    expect(parseCalendarValue('481', 'custom_duration_minutes').ok).toBe(false);
    expect(parseCalendarValue('121', 'custom_buffer_minutes').ok).toBe(false);
  });

  it('sends only what changed, null to go back to the standard', () => {
    const shown = shownCalendarValueFields('host', NO_CALENDAR_VALUE_FLAGS, null);
    const current = { ...NONE, custom_price_pence: 3000, custom_duration_minutes: 45 };
    const text = { ...calendarValuesText(current), custom_price_pence: '', custom_buffer_minutes: '10' };
    expect(calendarValuesPatch(shown, text, current)).toEqual({
      ok: true,
      values: { custom_price_pence: null, custom_buffer_minutes: 10 },
    });
    expect(calendarValuesPatch(shown, calendarValuesText(current), current)).toEqual({ ok: true, values: {} });
  });

  it('stops at the first field that is not a value, and names it', () => {
    const shown = shownCalendarValueFields('host', NO_CALENDAR_VALUE_FLAGS, null);
    const result = calendarValuesPatch(shown, { ...calendarValuesText(NONE), custom_duration_minutes: '2' }, NONE);
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.field.label).toBe('Length (minutes)');
  });

  it('seeds the boxes from the calendar, pounds with two places', () => {
    expect(calendarValuesText({ ...NONE, custom_price_pence: 8000, custom_buffer_minutes: 5 })).toEqual({
      custom_price_pence: '80.00',
      custom_duration_minutes: '',
      custom_buffer_minutes: '5',
      custom_deposit_pence: '',
    });
  });
});

describe('the standard a blank box means', () => {
  it('reads the service, a deposit only while the service takes one', () => {
    const defaults = calendarValueDefaults({
      duration_minutes: 30,
      buffer_minutes: 0,
      price_pence: 2500,
      deposit_pence: 1000,
      payment_requirement: 'card_hold',
    });
    expect(defaults).toEqual({ durationMinutes: 30, bufferMinutes: 0, pricePence: 2500, depositPence: null });
    expect(standardValueText('custom_price_pence', defaults, '£')).toBe('£25.00');
    expect(standardValueText('custom_duration_minutes', defaults, '£')).toBe('30 min');
    expect(standardValueText('custom_buffer_minutes', defaults, '£')).toBe('0 min');
    expect(standardValueText('custom_deposit_pence', defaults, '£')).toBeNull();
  });

  it('reads the flags off a service row', () => {
    expect(calendarValueFlags({ staff_may_customize_price: true, staff_may_customize_buffer: null })).toEqual({
      price: true,
      duration: false,
      buffer: false,
      deposit: false,
    });
    expect(calendarValueFlags(null)).toEqual(NO_CALENDAR_VALUE_FLAGS);
  });
});

describe('which calendar', () => {
  const groups: CollectiveCalendarGroup[] = [
    {
      venue_id: 'v-member',
      venue_name: 'Light 3',
      is_host: false,
      sync: { venues: 1, applied: 1, pending: [], failed: [] },
      calendars: [
        {
          id: 'cal-m',
          name: 'Mo',
          is_active: true,
          assigned: [
            {
              item_id: 'item-1',
              service_id: 'replica-1',
              values: { ...NONE, custom_price_pence: 4500 },
              last_changed: null,
            },
          ],
        },
        { id: 'cal-n', name: 'Nia', is_active: true, assigned: [] },
      ],
    },
  ];

  it("reads a member calendar's own values and the member's copy of the service", () => {
    expect(calendarValuesTarget(groups, 'item-1', 'v-member', 'cal-m')).toEqual({
      calendarId: 'cal-m',
      calendarName: 'Mo',
      venueName: 'Light 3',
      serviceId: 'replica-1',
      current: { ...NONE, custom_price_pence: 4500 },
    });
  });

  it('has nothing for a calendar that does not offer the service', () => {
    expect(calendarValuesTarget(groups, 'item-1', 'v-member', 'cal-n')).toBeNull();
    expect(calendarValuesTarget(groups, 'item-1', 'v-other', 'cal-m')).toBeNull();
  });

  it("reads one of the venue's own calendars from its link", () => {
    expect(
      ownCalendarValuesTarget({ id: 'cal-a', name: 'Amy' }, 's1', {
        practitioner_id: 'cal-a',
        service_id: 's1',
        custom_duration_minutes: 50,
      }),
    ).toEqual({
      calendarId: 'cal-a',
      calendarName: 'Amy',
      venueName: '',
      serviceId: 's1',
      current: { ...NONE, custom_duration_minutes: 50 },
    });
  });
});

it("reads the route's flags_turned_on back as the form's settings", () => {
  expect(flagsTurnedOn(['staff_may_customize_price', 'staff_may_customize_buffer', 'staff_may_customize_colour'])).toEqual([
    'price',
    'buffer',
  ]);
  expect(flagsTurnedOn(undefined)).toEqual([]);
});
