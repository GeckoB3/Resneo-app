import { render, screen } from '@testing-library/react-native';

import { AddonsStep } from '@/components/booking-wizard/AddonsStep';
import type { AppointmentCatalogAddonGroup } from '@/types/appointment-catalog';

const groups = [
  {
    group: {
      id: 'g1',
      name: 'Finishing touches',
      prompt_to_client: null,
      description: null,
      selection_type: 'multi',
      min_select: 0,
      max_select: null,
      sort_order: 0,
    },
    addons: [
      {
        id: 'a1',
        name: 'Deep condition',
        additional_price_pence: 1000,
        additional_duration_minutes: 10,
      },
    ],
    link_sort_order: 0,
  },
] as unknown as AppointmentCatalogAddonGroup[];

describe('AddonsStep', () => {
  it('names the service the extras belong to, so a visit of several services is clear', async () => {
    await render(
      <AddonsStep
        serviceName="Cut and Finish"
        groups={groups}
        value={[]}
        onChange={jest.fn()}
        onContinue={jest.fn()}
      />,
    );
    expect(screen.getByText('Add-ons')).toBeTruthy();
    expect(screen.getByText('Cut and Finish')).toBeTruthy();
  });

  it('shows just the heading when no service name is given', async () => {
    await render(<AddonsStep groups={groups} value={[]} onChange={jest.fn()} onContinue={jest.fn()} />);
    expect(screen.getByText('Add-ons')).toBeTruthy();
    expect(screen.queryByText('Cut and Finish')).toBeNull();
  });
});
