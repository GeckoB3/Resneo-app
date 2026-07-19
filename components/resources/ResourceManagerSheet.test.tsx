/**
 * Resources domain (R7 polish) tests.
 *
 *  - `reorderResourceSortOrders` — the pure dense-reindex mapping that backs the
 *    up/down reorder buttons (PATCH `sort_order` as a dense 0..n-1 sequence).
 *  - A render test that the per-field `HelpTooltip` in `ResourceEditorSheet`
 *    opens to reveal the ported web help copy.
 *
 * jest hoists mock factories above imports, so every variable a factory closes
 * over is prefixed `mock*` (the only out-of-scope names jest permits).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { reorderResourceSortOrders } from '@/components/resources/ResourceManagerSheet';

// --- Pure reorder mapping ----------------------------------------------------

describe('reorderResourceSortOrders', () => {
  const list = [
    { id: 'a', sort_order: 0 },
    { id: 'b', sort_order: 1 },
    { id: 'c', sort_order: 2 },
  ];

  it('moves an item down and re-indexes the swapped pair densely', () => {
    // a↓ → [b, a, c]; only the two swapped rows change index.
    expect(reorderResourceSortOrders(list, 'a', 1)).toEqual([
      { id: 'b', sort_order: 0 },
      { id: 'a', sort_order: 1 },
    ]);
  });

  it('moves an item up and re-indexes the swapped pair densely', () => {
    // c↑ → [a, c, b]; rows b and c change index.
    expect(reorderResourceSortOrders(list, 'c', -1)).toEqual([
      { id: 'c', sort_order: 1 },
      { id: 'b', sort_order: 2 },
    ]);
  });

  it('returns no patches at the boundaries (first up / last down)', () => {
    expect(reorderResourceSortOrders(list, 'a', -1)).toEqual([]);
    expect(reorderResourceSortOrders(list, 'c', 1)).toEqual([]);
  });

  it('returns no patches for an unknown id', () => {
    expect(reorderResourceSortOrders(list, 'zzz', 1)).toEqual([]);
  });

  it('densely re-indexes a sparse/gappy sort_order list', () => {
    // Stored orders are gappy (0, 5, 9). Moving the middle item up makes EVERY
    // row land on a new dense index, so all three are patched to 0..n-1.
    const sparse = [
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 5 },
      { id: 'c', sort_order: 9 },
    ];
    expect(reorderResourceSortOrders(sparse, 'b', -1)).toEqual([
      { id: 'b', sort_order: 0 },
      { id: 'a', sort_order: 1 },
      { id: 'c', sort_order: 2 },
    ]);
  });

  it('treats a missing sort_order as not-yet-dense and patches it', () => {
    const undef = [{ id: 'a' }, { id: 'b' }];
    // a↓ → b lands at 0, a at 1; both differ from their (undefined) stored order.
    expect(reorderResourceSortOrders(undef, 'a', 1)).toEqual([
      { id: 'b', sort_order: 0 },
      { id: 'a', sort_order: 1 },
    ]);
  });
});

// --- HelpTooltip render (ResourceEditorSheet) --------------------------------

// expo-symbols renders the IconButton / HelpTooltip glyphs — stub to a host element.
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// Render Sheet children inline when visible (avoids gesture-handler/Modal). Both
// the editor and the HelpTooltip use this Sheet — the tooltip's body therefore
// only appears once its own `visible` flips true (i.e. after the (i) is pressed).
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

// The weekly-hours + exceptions editors pull in the native datetimepicker /
// month-grid; stub them to trivial host elements so the editor renders.
jest.mock('@/components/resources/ResourceWeekHoursEditor', () => {
  const actual = jest.requireActual('@/components/resources/ResourceWeekHoursEditor');
  return { ...actual, ResourceWeekHoursEditor: () => null };
});
jest.mock('@/components/resources/ResourceExceptionsEditor', () => {
  const actual = jest.requireActual('@/components/resources/ResourceExceptionsEditor');
  return { ...actual, ResourceExceptionsEditor: () => null };
});

jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: { current_user_role: 'admin' } }),
}));
jest.mock('@/lib/queries/useResourcesManage', () => ({
  useCreateResource: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateResource: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/usePractitioners', () => ({
  useCreateHostCalendar: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/useSetupStatus', () => ({
  useSetupStatus: () => ({ data: { stripe_connected: true } }),
}));
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useFeatureFlags: () => ({ data: { resolved: { card_hold_deposits: true } } }),
}));

import { ResourceEditorSheet } from '@/components/resources/ResourceEditorSheet';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

describe('ResourceEditorSheet help tooltips', () => {
  it('opens the start-time-step tooltip to reveal the ported help copy', async () => {
    await render(
      <ResourceEditorSheet target={{ mode: 'create' }} hostCalendars={[]} onClose={jest.fn()} />,
    );

    // The longer help text is hidden until the (i) is tapped.
    expect(screen.queryByText(/start times move forward in steps/i)).toBeNull();

    await press(() => screen.getByLabelText('Help: start times every (mins)'));

    // The popover now shows the ported RESOURCE_SLOT_INTERVAL_HELP copy.
    expect(screen.getByText(/start times move forward in steps/i)).toBeTruthy();
  });
});
