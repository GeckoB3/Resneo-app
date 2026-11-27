import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { AddonsTab } from '@/components/services/manage/AddonsTab';

type Props = ComponentProps<typeof AddonsTab>;
type Query = Props['addonGroupsQuery'];

const group = {
  id: 'g1',
  name: 'Treatments',
  is_active: true,
  hidden_from_online: false,
  prompt_to_client: 'Add a treatment?',
  min_select: 0,
  max_select: null,
};
const archived = { ...group, id: 'g2', name: 'Old extras', is_active: false, prompt_to_client: null };

function query(extra: Record<string, unknown> = {}): Query {
  return {
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
    data: {
      groups: [group, archived],
      addons_by_group: {
        g1: [
          {
            id: 'a1',
            name: 'Olaplex',
            additional_price_pence: 1500,
            additional_duration_minutes: 10,
            is_active: true,
          },
        ],
        g2: [],
      },
      service_links: [{ addon_group_id: 'g1', service_item_id: 's1', appointment_service_id: null }],
    },
    ...extra,
  } as unknown as Query;
}

function props(extra: Partial<Props> = {}): Props {
  return {
    isAdmin: true,
    addonGroupsQuery: query(),
    includeInactive: false,
    setIncludeInactive: jest.fn(),
    serviceNameById: new Map([['s1', 'Cut and finish']]),
    onPressService: jest.fn(),
    onEdit: jest.fn(),
    onCreate: jest.fn(),
    ...extra,
  };
}

describe('AddonsTab', () => {
  it('lists the live groups, their options and the services using them', async () => {
    const p = props();
    await render(<AddonsTab {...p} />);
    expect(screen.getByText('Treatments')).toBeTruthy();
    expect(screen.queryByText('Old extras')).toBeNull();
    expect(screen.getByText(/Olaplex/)).toBeTruthy();
    expect(screen.getByText('Used by (1)')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open service Cut and finish'));
    expect(p.onPressService).toHaveBeenCalledWith('s1');
  });

  it('shows archived groups when asked', async () => {
    await render(<AddonsTab {...props({ includeInactive: true })} />);
    expect(screen.getByText('Old extras')).toBeTruthy();
    expect(screen.getByText('Archived')).toBeTruthy();
    expect(screen.getByText('Not linked to any services yet.')).toBeTruthy();
  });

  it('lets an admin create and edit a group', async () => {
    const p = props();
    await render(<AddonsTab {...p} />);
    await fireEvent.press(screen.getByText('New add-on group'));
    expect(p.onCreate).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Edit'));
    expect(p.onEdit).toHaveBeenCalledWith(expect.objectContaining({ mode: 'edit', group }));
  });

  it('gives staff the list without the admin buttons', async () => {
    await render(<AddonsTab {...props({ isAdmin: false })} />);
    expect(screen.queryByText('New add-on group')).toBeNull();
    expect(screen.queryByText('Edit')).toBeNull();
  });

  it('says when the groups could not load', async () => {
    await render(
      <AddonsTab {...props({ addonGroupsQuery: query({ isError: true, error: new Error('x'), data: undefined }) })} />,
    );
    expect(screen.getByText('Could not load add-on groups.')).toBeTruthy();
  });
});
