/**
 * The host's service form, calendars at every venue (web `CollectiveCalendarsSection`, 2026-10-28):
 * the host's venue first, a switch per calendar held as a diff with "Not saved yet", and "Edit
 * values" only on a calendar that offers the service now.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { CollectiveCalendarGroup } from '@/lib/collective-area/model';
import { EMPTY_CALENDARS_DIFF } from '@/lib/services/collective-calendars';

// The collective area's pieces pull in hooks this suite never calls.
jest.mock('@/lib/queries/useCollectives', () => ({ useDissolveCollective: () => ({}) }));
jest.mock('@/lib/queries/useCollectiveArea', () => ({ useCollectiveMembersPatch: () => ({}) }));

import { CollectiveCalendarsSection } from './CollectiveCalendarsSection';

const values = { custom_price_pence: null, custom_duration_minutes: null, custom_buffer_minutes: null, custom_deposit_pence: null };
const sync = { venues: 2, applied: 2, pending: [], failed: [] };

const groups: CollectiveCalendarGroup[] = [
  {
    venue_id: 'v-member',
    venue_name: 'Light 3',
    is_host: false,
    sync,
    calendars: [
      {
        id: 'cal-m',
        name: 'Mo',
        is_active: true,
        assigned: [{ item_id: 'item-1', service_id: 'replica-1', values: { ...values, custom_price_pence: 4500 }, last_changed: null }],
      },
      { id: 'cal-n', name: 'Nia', is_active: true, assigned: [] },
    ],
  },
  {
    venue_id: 'v-host',
    venue_name: 'Bright Cuts',
    is_host: true,
    sync,
    calendars: [{ id: 'cal-a', name: 'Amy', is_active: true, assigned: [{ item_id: 'item-1', service_id: 's1', values, last_changed: null }] }],
  },
];

describe('CollectiveCalendarsSection', () => {
  it("lists the host's venue first, with what each calendar charges differently", async () => {
    await render(
      <CollectiveCalendarsSection
        groups={groups}
        itemId="item-1"
        collectiveName="Northside"
        currencySymbol="£"
        value={EMPTY_CALENDARS_DIFF}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Tick the calendars that should offer this service, at any venue in Northside.')).toBeTruthy();
    const venues = screen.getAllByText(/^(Bright Cuts \(you\)|Light 3)$/).map((n) => n.props.children);
    expect(venues).toEqual(['Bright Cuts (you)', 'Light 3']);
    expect(screen.getByText('Custom price £45.00')).toBeTruthy();
    expect(screen.getByLabelText('Mo at Light 3').props.value).toBe(true);
    expect(screen.getByLabelText('Nia at Light 3').props.value).toBe(false);
  });

  it('holds a tick at another venue as a diff, and shows it is not saved yet', async () => {
    const onChange = jest.fn();
    const { rerender } = await render(
      <CollectiveCalendarsSection
        groups={groups}
        itemId="item-1"
        collectiveName="Northside"
        currencySymbol="£"
        value={EMPTY_CALENDARS_DIFF}
        onChange={onChange}
      />,
    );
    await act(async () => {
      fireEvent(screen.getByLabelText('Nia at Light 3'), 'valueChange', true);
    });
    expect(onChange).toHaveBeenLastCalledWith({ add: [{ calendar_id: 'cal-n', venue_id: 'v-member' }], remove: [] });
    await act(async () => {
      fireEvent(screen.getByLabelText('Amy at Bright Cuts'), 'valueChange', false);
    });
    expect(onChange).toHaveBeenLastCalledWith({ add: [], remove: [{ calendar_id: 'cal-a', venue_id: 'v-host' }] });

    await rerender(
      <CollectiveCalendarsSection
        groups={groups}
        itemId="item-1"
        collectiveName="Northside"
        currencySymbol="£"
        value={{ add: [{ calendar_id: 'cal-n', venue_id: 'v-member' }], remove: [{ calendar_id: 'cal-a', venue_id: 'v-host' }] }}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText('Nia at Light 3').props.value).toBe(true);
    expect(screen.getByText('Not saved yet')).toBeTruthy();
    expect(screen.getByText('Not saved yet: will stop offering')).toBeTruthy();
  });

  it('offers Edit values on every calendar that offers it now, at any venue', async () => {
    const onEditValues = jest.fn();
    await render(
      <CollectiveCalendarsSection
        groups={groups}
        itemId="item-1"
        collectiveName="Northside"
        currencySymbol="£"
        value={EMPTY_CALENDARS_DIFF}
        onChange={jest.fn()}
        onEditValues={onEditValues}
      />,
    );
    expect(screen.getAllByLabelText(/^Edit values for/)).toHaveLength(2);
    expect(screen.queryByLabelText('Edit values for Nia')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Edit values for Mo'));
    });
    expect(onEditValues).toHaveBeenCalledWith('v-member', 'cal-m');
  });

  it("says where guests cannot book it, from the service's hidden reasons", async () => {
    await render(
      <CollectiveCalendarsSection
        groups={groups}
        itemId="item-1"
        collectiveName="Northside"
        currencySymbol="£"
        value={EMPTY_CALENDARS_DIFF}
        onChange={jest.fn()}
        hiddenReasons={[{ venue_id: 'v-member', venue_name: 'Light 3', reason: 'payments' }]}
      />,
    );
    expect(
      screen.getByText(
        'Light 3 cannot take card payments yet, so guests cannot book its calendars for this service online. Its team can still book it.',
      ),
    ).toBeTruthy();
  });
});
