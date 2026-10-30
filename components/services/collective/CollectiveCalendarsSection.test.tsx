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
const mockRetryMutate = jest.fn();
let mockRetryPending: { isPending: boolean; variables?: string } = { isPending: false };
const mockRetryCollective: (string | null)[] = [];
jest.mock('@/lib/queries/useCollectiveArea', () => ({
  useCollectiveMembersPatch: () => ({}),
  useCollectiveRetry: (collectiveId: string | null) => {
    mockRetryCollective.push(collectiveId);
    return { mutate: mockRetryMutate, ...mockRetryPending };
  },
}));

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

beforeEach(() => {
  mockRetryMutate.mockClear();
  mockRetryCollective.length = 0;
  mockRetryPending = { isPending: false };
});

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

describe('a copy that is behind (CQ-02)', () => {
  const behind = (over: Partial<CollectiveCalendarGroup['sync']>): CollectiveCalendarGroup[] => [
    { ...groups[0]!, sync: { ...sync, ...over } },
    groups[1]!,
  ];
  const renderBehind = (list: CollectiveCalendarGroup[], collectiveId: string | null = 'col-1') =>
    render(
      <CollectiveCalendarsSection
        groups={list}
        itemId="item-1"
        collectiveId={collectiveId}
        collectiveName="Northside"
        currencySymbol="£"
        value={EMPTY_CALENDARS_DIFF}
        onChange={jest.fn()}
      />,
    );

  it('offers Update now beside a venue still updating, and says what it did', async () => {
    await renderBehind(behind({ pending: [{ venue_id: 'v-member', venue_name: 'Light 3' }] }));
    expect(mockRetryCollective.at(-1)).toBe('col-1');
    expect(screen.getByText('Updating at Light 3. Its calendars can take bookings for this again once it finishes.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Update now: Light 3' }));
    });
    expect(mockRetryMutate.mock.calls[0]?.[0]).toBe('v-member');
    await act(async () => {
      mockRetryMutate.mock.calls[0]?.[1]?.onSuccess?.({ collective_sync: { venues: 1, applied: 1, pending: [], failed: [] } });
    });
    expect(screen.getByText('Light 3 is up to date.')).toBeTruthy();
  });

  it('offers Retry now beside a venue that failed, and says when it did not go through', async () => {
    await renderBehind(
      behind({ failed: [{ venue_id: 'v-member', venue_name: 'Light 3', message: 'busy', code: 'busy' }] }),
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Retry now: Light 3' }));
    });
    await act(async () => {
      mockRetryMutate.mock.calls[0]?.[1]?.onError?.(new Error('offline'));
    });
    expect(screen.getByText('That did not go through. Please check your connection and try again.')).toBeTruthy();
  });

  it('offers nothing for a venue up to date', async () => {
    await renderBehind(groups);
    expect(screen.queryByRole('button', { name: /^(Update|Retry) now/ })).toBeNull();
  });

  it('offers nothing without a collective to retry through', async () => {
    await renderBehind(behind({ pending: [{ venue_id: 'v-member', venue_name: 'Light 3' }] }), null);
    expect(screen.queryByRole('button', { name: /^(Update|Retry) now/ })).toBeNull();
  });
});

describe('a service with options (CQ-12)', () => {
  it("leaves out a calendar's price, length and buffer, and keeps its deposit", async () => {
    const withValues: CollectiveCalendarGroup[] = [
      {
        ...groups[0]!,
        calendars: [
          {
            id: 'cal-m',
            name: 'Mo',
            is_active: true,
            assigned: [
              {
                item_id: 'item-1',
                service_id: 'replica-1',
                values: { ...values, custom_price_pence: 4500, custom_deposit_pence: 1000 },
                last_changed: null,
              },
            ],
          },
        ],
      },
    ];
    await render(
      <CollectiveCalendarsSection
        groups={withValues}
        itemId="item-1"
        collectiveName="Northside"
        currencySymbol="£"
        value={EMPTY_CALENDARS_DIFF}
        onChange={jest.fn()}
        hasOptions
      />,
    );
    expect(screen.queryByText(/Custom price/)).toBeNull();
    expect(screen.getByText('Custom deposit £10.00')).toBeTruthy();
  });
});

describe('a service being added to the page (CQ-05)', () => {
  const switchedOff: CollectiveCalendarGroup[] = [
    {
      ...groups[0]!,
      calendars: [...groups[0]!.calendars, { id: 'cal-x', name: 'Xan', is_active: false, assigned: [] }],
    },
    groups[1]!,
  ];
  const ref = (calendar_id: string, venue_id: string) => ({ calendar_id, venue_id });
  const renderNew = (value = EMPTY_CALENDARS_DIFF, onChange = jest.fn()) =>
    render(
      <CollectiveCalendarsSection
        mode="new"
        groups={switchedOff}
        itemId={null}
        collectiveName="Northside"
        currencySymbol="£"
        value={value}
        onChange={onChange}
      />,
    );

  it("lists active calendars only, the host's first, with nothing saved to compare", async () => {
    await renderNew();
    const venues = screen.getAllByText(/^(Bright Cuts \(you\)|Light 3)$/).map((n) => n.props.children);
    expect(venues).toEqual(['Bright Cuts (you)', 'Light 3']);
    expect(screen.queryByText('Xan')).toBeNull();
    expect(screen.queryByText(/Custom price/)).toBeNull();
    expect(screen.queryByText('Up to date')).toBeNull();
    expect(screen.queryByLabelText(/^Edit values/)).toBeNull();
  });

  it('holds the ticks as the whole set', async () => {
    const onChange = jest.fn();
    await renderNew({ add: [ref('cal-a', 'v-host')], remove: [] }, onChange);
    await act(async () => {
      fireEvent(screen.getByLabelText('Nia at Light 3'), 'valueChange', true);
    });
    expect(onChange).toHaveBeenCalledWith({ add: [ref('cal-a', 'v-host'), ref('cal-n', 'v-member')], remove: [] });
  });

  const all = () => screen.getByRole('checkbox', { name: 'All calendars at every venue' });
  const every = [ref('cal-a', 'v-host'), ref('cal-m', 'v-member'), ref('cal-n', 'v-member')];

  it('ticks them all with one tick', async () => {
    const onChange = jest.fn();
    await renderNew(EMPTY_CALENDARS_DIFF, onChange);
    expect(all().props.accessibilityState?.checked).toBe(false);
    await act(async () => {
      fireEvent.press(all());
    });
    expect(onChange).toHaveBeenLastCalledWith({ add: every, remove: [] });
  });

  it('reads as some when some are ticked', async () => {
    await renderNew({ add: [ref('cal-a', 'v-host')], remove: [] });
    expect(all().props.accessibilityState?.checked).toBe('mixed');
  });

  it('clears them all when all are ticked', async () => {
    const onChange = jest.fn();
    await renderNew({ add: every, remove: [] }, onChange);
    expect(all().props.accessibilityState?.checked).toBe(true);
    await act(async () => {
      fireEvent.press(all());
    });
    expect(onChange).toHaveBeenLastCalledWith({ add: [], remove: [] });
  });
});
