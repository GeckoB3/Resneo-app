import { followOnServiceOptions, servicesByCategory } from './service-options';
import type { ManagedService } from '@/types/services-manage';

const service = (over: Partial<ManagedService>): ManagedService =>
  ({ id: 's', name: 'S', duration_minutes: 30, buffer_minutes: 0, colour: '#000', ...over }) as ManagedService;

describe('followOnServiceOptions (web parity)', () => {
  it('names the heading, prices options from the lowest active one, and keeps switched-off services', () => {
    const [cut, colour] = followOnServiceOptions(
      [
        service({ id: 'cut', name: 'Haircut', category_id: 'c-1', price_pence: 3000 }),
        service({
          id: 'colour',
          name: 'Colour',
          is_active: false,
          is_bookable_online: false,
          variants: [
            { id: 'v1', price_pence: 9000 },
            { id: 'v2', price_pence: 5000, is_active: false },
            { id: 'v3', price_pence: 7000 },
          ] as never,
        }),
      ],
      [{ id: 'c-1', name: 'Cuts', sort_order: 0 }],
    );
    expect(cut).toMatchObject({ category: 'Cuts', price_pence: 3000, from_price_pence: null, is_active: true });
    expect(colour).toMatchObject({ category: null, from_price_pence: 7000, is_active: false, is_bookable_online: false });
  });
});

describe('servicesByCategory', () => {
  it('sorts headings and names, with services without one last under Other services', () => {
    const options = followOnServiceOptions(
      [
        service({ id: 'b', name: 'Blow Dry', category_id: 'c' }),
        service({ id: 'x', name: 'Extra' }),
        service({ id: 'a', name: 'A Cut', category_id: 'c' }),
        service({ id: 'f', name: 'Foils', category_id: 'col' }),
      ],
      [
        { id: 'c', name: 'Cuts', sort_order: 0 },
        { id: 'col', name: 'Colour', sort_order: 1 },
      ],
    );
    expect(servicesByCategory(options).map((g) => [g.category, g.services.map((s) => s.name)])).toEqual([
      ['Colour', ['Foils']],
      ['Cuts', ['A Cut', 'Blow Dry']],
      ['Other services', ['Extra']],
    ]);
  });
});
