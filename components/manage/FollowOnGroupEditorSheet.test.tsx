/**
 * The follow-on group sheet (web `FollowOnGroupEditor`, follow-on plan 6.2): it refuses in the
 * web's words before sending anything, sends the group the routes take (offers in the order
 * clients see, a blank question as none), keeps a service off both lists, and warns when a
 * required group has nothing clients can book online.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react-native';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockCreate = jest.fn((group: unknown) => Promise.resolve({ group: { id: 'g-new', ...(group as object) } }));
const mockUpdate = jest.fn((args: { id: string; group: object }) => Promise.resolve({ group: { id: args.id, ...args.group } }));
const mockDelete = jest.fn(() => Promise.resolve({ success: true }));
jest.mock('@/lib/queries/useFollowOnGroups', () => ({
  useCreateFollowOnGroup: () => ({ mutateAsync: mockCreate, isPending: false }),
  useUpdateFollowOnGroup: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useDeleteFollowOnGroup: () => ({ mutateAsync: mockDelete, isPending: false }),
}));

import { FollowOnGroupEditorSheet } from '@/components/manage/FollowOnGroupEditorSheet';
import { ApiError } from '@/lib/api/client';
import type { FollowOnServiceOption } from '@/lib/follow-ons/service-options';
import type { FollowOnGroup } from '@/types/follow-on-groups';

const svc = (id: string, name: string, over: Partial<FollowOnServiceOption> = {}): FollowOnServiceOption => ({
  id,
  name,
  category: 'Colour',
  duration_minutes: 60,
  price_pence: 5000,
  from_price_pence: null,
  is_active: true,
  is_bookable_online: true,
  on_collective_page: false,
  ...over,
});
const SERVICES = [
  svc('foils', 'Full Head Foils'),
  svc('cut', 'Haircut', { category: 'Cuts', price_pence: 3000 }),
  svc('blow', 'Blow Dry', { category: 'Cuts', price_pence: 2500 }),
];

const GROUP: FollowOnGroup = {
  id: 'g-1',
  venue_id: 'v-1',
  name: 'Cut after colour',
  prompt_to_client: 'Would you like a cut after your colour?',
  selection_type: 'single',
  required: true,
  is_active: true,
  sort_order: 0,
  offered_service_ids: ['cut', 'blow'],
  trigger_service_ids: ['foils'],
  managed_by_collective_id: null,
};

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await fireEvent.press(el);
}
const tick = (picker: string, name: string) =>
  press(within(screen.getByTestId(picker)).getByRole('checkbox', { name }));

beforeEach(() => {
  mockCreate.mockClear();
  mockUpdate.mockClear();
  mockDelete.mockClear();
});
afterEach(cleanup);

describe('FollowOnGroupEditorSheet', () => {
  it('refuses a group with no name or nothing offered, in the web’s words, sending nothing', async () => {
    await render(<FollowOnGroupEditorSheet target={{ mode: 'create' }} services={SERVICES} onClose={jest.fn()} />);
    await press(screen.getByRole('button', { name: 'Create group' }));
    expect(screen.getByText('Give the group a name.')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Cut after colour'), 'Cut after colour');
    await press(screen.getByRole('button', { name: 'Create group' }));
    expect(screen.getByText('Choose at least one service to offer.')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('at a collective member, keeps services on the collective page off "Ask after" and says why', async () => {
    const services = SERVICES.map((s) => (s.id === 'foils' ? { ...s, on_collective_page: true } : s));
    await render(<FollowOnGroupEditorSheet target={{ mode: 'create' }} services={services} onClose={jest.fn()} />);
    const triggers = screen.getByTestId('follow-on-triggers');
    expect(within(triggers).getByRole('checkbox', { name: 'Full Head Foils' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(
      within(triggers).getByText(
        "Services offered above cannot be picked here. Nor can services on your collective page: they ask the host's questions only.",
      ),
    ).toBeTruthy();
  });

  it('creates the group with its offers in the order clients see and the service it started from', async () => {
    const onSaved = jest.fn();
    const onClose = jest.fn();
    await render(
      <FollowOnGroupEditorSheet
        target={{ mode: 'create', triggerServiceIds: ['foils'] }}
        services={SERVICES}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );
    await fireEvent.changeText(screen.getByPlaceholderText('Cut after colour'), '  Cut after colour ');
    await fireEvent.changeText(screen.getByPlaceholderText('Would you like to add one of these?'), '   ');
    await tick('follow-on-offered', 'Haircut');
    await tick('follow-on-offered', 'Blow Dry');
    // Blow Dry first, then Haircut.
    await press(screen.getByRole('button', { name: 'Move Blow Dry up' }));
    await fireEvent(screen.getByRole('switch', { name: 'Clients must choose one' }), 'valueChange', true);
    await press(screen.getByRole('radio', { name: 'Any number' }));
    await press(screen.getByRole('button', { name: 'Create group' }));

    expect(mockCreate).toHaveBeenCalledWith({
      name: 'Cut after colour',
      prompt_to_client: null,
      selection_type: 'multi',
      required: true,
      is_active: true,
      offered_service_ids: ['blow', 'cut'],
      trigger_service_ids: ['foils'],
    });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'g-new' }), 'create');
    expect(onClose).toHaveBeenCalled();
  });

  it('will not offer a service it is asked after', async () => {
    await render(
      <FollowOnGroupEditorSheet target={{ mode: 'create', triggerServiceIds: ['foils'] }} services={SERVICES} onClose={jest.fn()} />,
    );
    const foils = within(screen.getByTestId('follow-on-offered')).getByRole('checkbox', { name: 'Full Head Foils' });
    expect(foils.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(screen.getByText('Services ticked under “Ask after these services” cannot be offered here.')).toBeTruthy();
  });

  it('saves an edit to the same group and shows the server’s words when it refuses', async () => {
    mockUpdate.mockImplementationOnce(() =>
      Promise.reject(new ApiError('This follow-on question is set by Kim’s Salon for Studio Row. Ask Kim’s Salon to change it.', 409)),
    );
    const onClose = jest.fn();
    await render(<FollowOnGroupEditorSheet target={{ mode: 'edit', group: GROUP }} services={SERVICES} onClose={onClose} />);
    await fireEvent(screen.getByRole('switch', { name: 'Switched on (clients are asked this question)' }), 'valueChange', false);
    await press(screen.getByRole('button', { name: 'Save changes' }));
    expect(mockUpdate).toHaveBeenCalledWith({
      id: 'g-1',
      group: expect.objectContaining({ is_active: false, offered_service_ids: ['cut', 'blow'], trigger_service_ids: ['foils'] }),
    });
    expect(screen.getByText('This follow-on question is set by Kim’s Salon for Studio Row. Ask Kim’s Salon to change it.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks before deleting, in the web’s words', async () => {
    await render(<FollowOnGroupEditorSheet target={{ mode: 'edit', group: GROUP }} services={SERVICES} onClose={jest.fn()} />);
    await press(screen.getByRole('button', { name: 'Delete' }));
    expect(
      screen.getByText(
        'Delete "Cut after colour"? Clients will no longer be asked "Would you like a cut after your colour?". Bookings already made are not changed.',
      ),
    ).toBeTruthy();
    await press(screen.getByRole('button', { name: 'Delete group' }));
    expect(mockDelete).toHaveBeenCalledWith('g-1');
  });

  it('warns when a required group offers nothing clients can book online', async () => {
    const services = [SERVICES[0]!, svc('cut', 'Haircut', { is_bookable_online: false })];
    await render(
      <FollowOnGroupEditorSheet
        target={{ mode: 'edit', group: { ...GROUP, offered_service_ids: ['cut'] } }}
        services={services}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText('Clients will not see Haircut online.')).toBeTruthy();
    expect(screen.getByText('Clients will not be asked, because none of these services can be booked online.')).toBeTruthy();
  });
});
