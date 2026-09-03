/**
 * Service categories on the staff picker (R23-3). The catalog now carries each
 * service's category and the venue's headings; the picker must list services
 * under those headings in booking-page order, keep a venue with no categories
 * on the flat list it always had, and — in the collapsible layout — start every
 * category closed except the one holding the service already chosen.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

import {
  buildPickerLines,
  dedupeCatalogServices,
  ServicePickerStep,
} from '@/components/booking-wizard/ServicePickerStep';
import type { AppointmentCatalogResponse } from '@/types/appointment-catalog';

const hair = { id: 'c-hair', name: 'Hair', sort_order: 0 };
const nails = { id: 'c-nails', name: 'Nails', sort_order: 1 };

const service = (
  id: string,
  name: string,
  sort_order: number,
  category: typeof hair | null,
  description: string | null = null,
) => ({
  id,
  name,
  duration_minutes: 30,
  buffer_minutes: 0,
  price_pence: 2000,
  deposit_pence: null,
  sort_order,
  category,
  description,
});

const categorised = {
  categories: [hair, nails],
  practitioners: [
    {
      id: 'prac_1',
      name: 'Alex',
      services: [
        service('kit', 'Aftercare kit', 0, null),
        service('mani', 'Manicure', 0, nails),
        service('colour', 'Colour', 1, hair),
        service('cut', 'Cut', 0, hair, 'Wash, cut and finish'),
      ],
    },
  ],
} as unknown as AppointmentCatalogResponse;

const flat = {
  practitioners: [
    {
      id: 'prac_1',
      name: 'Alex',
      services: [service('b', 'Beta', 1, null), service('a', 'Alpha', 0, null)],
    },
  ],
} as unknown as AppointmentCatalogResponse;

const baseProps = { isLoading: false, isError: false, onSelect: jest.fn() };

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

describe('dedupeCatalogServices ordering', () => {
  it('orders by category position, then the venue drag order, uncategorised last', () => {
    expect(dedupeCatalogServices(categorised).map((r) => r.option.serviceId)).toEqual([
      'cut',
      'colour',
      'mani',
      'kit',
    ]);
  });

  it('follows the venue drag order, not the alphabet, when nothing is categorised', () => {
    expect(dedupeCatalogServices(flat).map((r) => r.option.serviceId)).toEqual(['a', 'b']);
  });
});

describe('buildPickerLines', () => {
  const rows = dedupeCatalogServices(categorised);

  it('is the flat list when no service has a category', () => {
    const lines = buildPickerLines(dedupeCatalogServices(flat), {
      layout: 'sections',
      search: '',
      openCategoryIds: new Set(),
    });
    expect(lines.map((l) => l.kind)).toEqual(['service', 'service']);
  });

  it('puts a heading before each group in sections mode, Other services last', () => {
    const lines = buildPickerLines(rows, { layout: 'sections', search: '', openCategoryIds: new Set() });
    expect(lines.map((l) => (l.kind === 'heading' ? `#${l.name}` : l.row.option.serviceId))).toEqual([
      '#Hair',
      'cut',
      'colour',
      '#Nails',
      'mani',
      '#Other services',
      'kit',
    ]);
  });

  it('hides the services of a closed category in accordion mode', () => {
    const lines = buildPickerLines(rows, {
      layout: 'accordion',
      search: '',
      openCategoryIds: new Set(['c-nails']),
    });
    expect(lines.map((l) => (l.kind === 'heading' ? `#${l.name}` : l.row.option.serviceId))).toEqual([
      '#Hair',
      '#Nails',
      'mani',
      '#Other services',
    ]);
  });

  it('shows search matches flat, each naming its category, whatever the layout', () => {
    const lines = buildPickerLines(rows, {
      layout: 'accordion',
      search: 'nails',
      openCategoryIds: new Set(),
    });
    expect(lines).toEqual([
      expect.objectContaining({ kind: 'service', key: 'mani', categoryName: 'Nails' }),
    ]);
    const byDescription = buildPickerLines(rows, {
      layout: 'sections',
      search: 'wash',
      openCategoryIds: new Set(),
    });
    expect(byDescription.map((l) => l.key)).toEqual(['cut']);
  });
});

describe('ServicePickerStep with categories', () => {
  it('renders the headings and lets a service under one be chosen', async () => {
    const onSelect = jest.fn();
    await render(<ServicePickerStep {...baseProps} catalog={categorised} onSelect={onSelect} />);
    expect(screen.getByText('Hair')).toBeTruthy();
    expect(screen.getByText('Nails')).toBeTruthy();
    expect(screen.getByText('Other services')).toBeTruthy();
    await press(() => screen.getByText('Manicure'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ serviceId: 'mani' }), null);
  });

  it('starts every collapsible category closed, except the one holding the chosen service', async () => {
    await render(
      <ServicePickerStep
        {...baseProps}
        catalog={categorised}
        layout="accordion"
        selectedServiceId="mani"
      />,
    );
    expect(screen.getByText('Manicure')).toBeTruthy();
    expect(screen.queryByText('Cut')).toBeNull();
    await press(() => screen.getByLabelText('Hair, 2 services'));
    expect(screen.getByText('Cut')).toBeTruthy();
  });

  it('draws no headings for a venue without categories', async () => {
    await render(<ServicePickerStep {...baseProps} catalog={flat} />);
    expect(screen.queryByText('Other services')).toBeNull();
    expect(screen.getByText('Alpha')).toBeTruthy();
  });
});
