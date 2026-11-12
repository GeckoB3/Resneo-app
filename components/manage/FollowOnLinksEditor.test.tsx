/**
 * The service form's Follow-on services card (web `FollowOnGroupsSection`, follow-on plan 6.3):
 * untouched it reports nothing, so a save leaves the links alone; a change reports the whole list;
 * a group offering this service, or the host's copy, cannot be picked; the host's copy shows no
 * Edit or Remove.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react-native';

import { FollowOnLinksEditor, linkedFollowOnIds } from '@/components/manage/FollowOnLinksEditor';
import type { FollowOnServiceOption } from '@/lib/follow-ons/service-options';
import type { FollowOnGroup } from '@/types/follow-on-groups';

const svc = (id: string, name: string): FollowOnServiceOption => ({
  id,
  name,
  category: null,
  duration_minutes: 30,
  price_pence: null,
  from_price_pence: null,
  is_active: true,
  is_bookable_online: true,
  on_collective_page: false,
});
const SERVICES = [svc('foils', 'Full Head Foils'), svc('cut', 'Haircut'), svc('toner', 'Toner'), svc('roots', 'Root Tint')];

const group = (id: string, name: string, over: Partial<FollowOnGroup> = {}): FollowOnGroup => ({
  id,
  venue_id: 'v-1',
  name,
  prompt_to_client: null,
  selection_type: 'single',
  required: false,
  is_active: true,
  sort_order: 0,
  offered_service_ids: ['cut'],
  trigger_service_ids: [],
  managed_by_collective_id: null,
  ...over,
});

const GROUPS = [
  group('g-cut', 'Cut after colour', { trigger_service_ids: ['foils'], required: true }),
  group('g-toner', 'Toner', { offered_service_ids: ['toner'] }),
  // Offers Foils, so it cannot be asked after Foils (R10).
  group('g-colour', 'Colour after cut', { offered_service_ids: ['foils'], trigger_service_ids: ['cut'] }),
  group('g-host', 'Host’s question', { managed_by_collective_id: 'c-1', offered_service_ids: ['roots'] }),
];

const handlers = { onCreateGroup: jest.fn(), onEditGroup: jest.fn() };
afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('linkedFollowOnIds', () => {
  it('is the form’s choice once made, else what is saved for the service', () => {
    expect(linkedFollowOnIds(null, 'foils', GROUPS)).toEqual(['g-cut']);
    expect(linkedFollowOnIds(['g-toner'], 'foils', GROUPS)).toEqual(['g-toner']);
    expect(linkedFollowOnIds(null, null, GROUPS)).toEqual([]);
  });
});

describe('FollowOnLinksEditor', () => {
  it('lists the saved group, and its other direction, without reporting a change', async () => {
    const onChange = jest.fn();
    await render(
      <FollowOnLinksEditor serviceId="foils" value={null} onChange={onChange} groups={GROUPS} services={SERVICES} {...handlers} />,
    );
    expect(screen.getByText('Cut after colour')).toBeTruthy();
    expect(screen.getByText('Clients must choose one')).toBeTruthy();
    expect(screen.getByText('After booking this, clients are asked: “Would you like to add one of these?”')).toBeTruthy();
    expect(screen.getByText('Offers: Haircut')).toBeTruthy();
    expect(screen.getByText('Offered after: Haircut (Colour after cut)')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds an existing group, offering only the ones this service may ask about', async () => {
    const onChange = jest.fn();
    await render(
      <FollowOnLinksEditor serviceId="foils" value={null} onChange={onChange} groups={GROUPS} services={SERVICES} {...handlers} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Use existing group' }));
    expect(screen.queryByRole('button', { name: 'Use Colour after cut' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use Host’s question' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Use Toner' }));
    expect(onChange).toHaveBeenCalledWith(['g-cut', 'g-toner']);
  });

  it('removes a group and opens one for editing', async () => {
    const onChange = jest.fn();
    await render(
      <FollowOnLinksEditor serviceId="foils" value={null} onChange={onChange} groups={GROUPS} services={SERVICES} {...handlers} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Edit group' }));
    expect(handlers.onEditGroup).toHaveBeenCalledWith(expect.objectContaining({ id: 'g-cut' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from this service' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('shows the host’s copy on its service with no Edit or Remove', async () => {
    const hostCopy = group('g-host', 'Host’s question', { managed_by_collective_id: 'c-1', trigger_service_ids: ['roots'] });
    await render(
      <FollowOnLinksEditor serviceId="roots" value={null} onChange={jest.fn()} groups={[hostCopy]} services={SERVICES} {...handlers} />,
    );
    const card = screen.getByTestId('follow-on-links');
    expect(within(card).getByText('Host’s question')).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Edit group' })).toBeNull();
    expect(within(card).queryByRole('button', { name: 'Remove from this service' })).toBeNull();
  });

  it('says so when the service asks about nothing', async () => {
    await render(
      <FollowOnLinksEditor serviceId={null} value={null} onChange={jest.fn()} groups={[]} services={SERVICES} {...handlers} />,
    );
    expect(screen.getByText('Clients are not asked about other services after this one.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '+ New group' }));
    expect(handlers.onCreateGroup).toHaveBeenCalled();
  });
});
