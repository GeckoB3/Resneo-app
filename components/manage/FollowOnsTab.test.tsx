/**
 * The Follow-ons tab (web `FollowOnsLibraryView`, follow-on plan 6.1 and 6.4): each group with its
 * question and services; Edit for admins on the venue's own groups; a member's copies of its
 * collective host's groups read-only, with a banner and chip naming the host.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

import { FollowOnsTab } from '@/components/manage/FollowOnsTab';
import type { FollowOnServiceOption } from '@/lib/follow-ons/service-options';
import type { useFollowOnGroups } from '@/lib/queries/useFollowOnGroups';
import type { FollowOnGroup, FollowOnGroupsResponse } from '@/types/follow-on-groups';

const svc = (id: string, name: string, price: number | null = null): FollowOnServiceOption => ({
  id,
  name,
  category: null,
  duration_minutes: 30,
  price_pence: price,
  from_price_pence: null,
  is_active: true,
  is_bookable_online: true,
  on_collective_page: false,
});
const SERVICES = [svc('foils', 'Full Head Foils'), svc('cut', 'Haircut', 3000), svc('toner', 'Toner')];

const group = (id: string, name: string, managed: string | null, over: Partial<FollowOnGroup> = {}): FollowOnGroup => ({
  id,
  venue_id: 'v-1',
  name,
  prompt_to_client: null,
  selection_type: 'single',
  required: true,
  is_active: true,
  sort_order: 0,
  offered_service_ids: ['cut'],
  trigger_service_ids: ['foils'],
  managed_by_collective_id: managed,
  ...over,
});

function query(data: FollowOnGroupsResponse): ReturnType<typeof useFollowOnGroups> {
  return { data, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() } as never;
}

const HOST_AND_OWN: FollowOnGroupsResponse = {
  groups: [
    group('g-host', 'Cut after colour', 'c-1'),
    group('g-own', 'Toner after lightener', null, {
      required: false,
      selection_type: 'multi',
      is_active: false,
      prompt_to_client: 'Add a toner?',
      offered_service_ids: ['toner'],
      trigger_service_ids: [],
    }),
  ],
  managed_by: { 'c-1': { collective_name: 'Studio Row', host_name: 'Kim’s Salon' } },
};

const props = {
  services: SERVICES,
  onPressService: jest.fn(),
  onEdit: jest.fn(),
  onCreate: jest.fn(),
  onOpenAddons: jest.fn(),
};

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('FollowOnsTab', () => {
  it('shows the host’s groups read-only and the venue’s own with Edit', async () => {
    await render(<FollowOnsTab isAdmin query={query(HOST_AND_OWN)} {...props} />);
    expect(screen.getByText('Set by Kim’s Salon for the collective page.')).toBeTruthy();
    expect(screen.getByText(/Your clients on the Studio Row page are asked these questions/)).toBeTruthy();

    const [host, own] = screen.getAllByTestId('follow-on-group-card');
    expect(within(host!).getByText('Set by Kim’s Salon')).toBeTruthy();
    expect(within(host!).getByText('Clients must choose one')).toBeTruthy();
    expect(within(host!).getByText('Question: “Would you like to add one of these?”')).toBeTruthy();
    expect(within(host!).getByText('Haircut · £30.00')).toBeTruthy();
    expect(within(host!).queryByRole('button', { name: 'Edit' })).toBeNull();

    expect(within(own!).getByText('Pick any')).toBeTruthy();
    expect(within(own!).getByText('Switched off')).toBeTruthy();
    expect(within(own!).getByText('Not asked after any service yet.')).toBeTruthy();
    await fireEvent.press(within(own!).getByRole('button', { name: 'Edit' }));
    expect(props.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'g-own' }));
  });

  it('treats a copy as the venue’s own once the collective is no longer live', async () => {
    await render(<FollowOnsTab isAdmin query={query({ ...HOST_AND_OWN, managed_by: {} })} {...props} />);
    expect(screen.queryByText(/for the collective page/)).toBeNull();
    for (const card of screen.getAllByTestId('follow-on-group-card')) {
      expect(within(card).getByRole('button', { name: 'Edit' })).toBeTruthy();
    }
  });

  it('gives staff no buttons, and opens a service from its chip', async () => {
    await render(<FollowOnsTab isAdmin={false} query={query(HOST_AND_OWN)} {...props} />);
    expect(screen.queryByRole('button', { name: 'New follow-on group' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Open service Full Head Foils' })[0]!);
    expect(props.onPressService).toHaveBeenCalledWith('foils');
  });

  it('shows the web’s empty state', async () => {
    await render(<FollowOnsTab isAdmin query={query({ groups: [] })} {...props} />);
    expect(screen.getByText('No follow-on groups yet')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'New follow-on group' }));
    expect(props.onCreate).toHaveBeenCalled();
  });
});
