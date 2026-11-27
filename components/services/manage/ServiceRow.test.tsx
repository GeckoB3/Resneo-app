import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { ServiceRow } from '@/components/services/manage/ServiceRow';
import type { ManagedService } from '@/types/services-manage';

const service = {
  id: 's1',
  name: 'Cut and finish',
  description: 'A wash, cut and blow dry.',
  duration_minutes: 45,
  buffer_minutes: 10,
  price_pence: 4500,
  deposit_pence: 1000,
  payment_requirement: 'deposit',
  colour: '#3B82F6',
  is_active: true,
  variants: [],
  addon_groups: [],
} as unknown as ManagedService;

type Props = ComponentProps<typeof ServiceRow>;

function props(extra: Partial<Props> = {}): Props {
  return {
    service,
    expanded: false,
    isAdmin: true,
    canManage: true,
    offerCalendars: [],
    canOverride: false,
    togglingKey: null,
    onToggle: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    onToggleCalendar: jest.fn(),
    onOverride: jest.fn(),
    ...extra,
  };
}

describe('ServiceRow', () => {
  it('shows the name, price and length, and expands on a tap', async () => {
    const p = props();
    await render(<ServiceRow {...p} />);
    expect(screen.getByText('Cut and finish')).toBeTruthy();
    expect(screen.queryByText('Edit')).toBeNull();
    await fireEvent.press(screen.getByText('Cut and finish'));
    expect(p.onToggle).toHaveBeenCalledWith('s1');
  });

  it('opens with the details and the admin actions', async () => {
    const p = props({ expanded: true, onMoveDown: jest.fn() });
    await render(<ServiceRow {...p} />);
    expect(screen.getByText('A wash, cut and blow dry.')).toBeTruthy();
    expect(screen.getByText('Buffer 10 min')).toBeTruthy();
    await fireEvent.press(screen.getByText('Edit'));
    expect(p.onEdit).toHaveBeenCalledWith(service);
    await fireEvent.press(screen.getByText('Delete service'));
    expect(p.onDelete).toHaveBeenCalledWith(service);
    await fireEvent.press(screen.getByText('Move down'));
    expect(p.onMoveDown).toHaveBeenCalled();
  });

  it('gives a staff member their calendar switches and their own settings', async () => {
    const p = props({
      expanded: true,
      isAdmin: false,
      canManage: false,
      canOverride: true,
      offerCalendars: [{ id: 'cal-1', name: 'Alex', enabled: false }],
    });
    await render(<ServiceRow {...p} />);
    expect(screen.queryByText('Edit')).toBeNull();
    await fireEvent(screen.getByLabelText('Offer Cut and finish on Alex'), 'valueChange', true);
    expect(p.onToggleCalendar).toHaveBeenCalledWith('s1', 'cal-1', true);
    await fireEvent.press(screen.getByText('Edit your settings'));
    expect(p.onOverride).toHaveBeenCalledWith(service);
  });

  it('reads a card hold as its no-show fee', async () => {
    await render(
      <ServiceRow
        {...props({
          expanded: true,
          service: { ...service, payment_requirement: 'card_hold' } as ManagedService,
        })}
      />,
    );
    expect(screen.getByText(/Card hold: .*10\.00 no-show fee/)).toBeTruthy();
  });
});
