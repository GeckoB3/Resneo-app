/**
 * Review step (web `ReviewStepClient`): each column's use, file by file; a custom field's name
 * and type, a split's parts and a status column's value map are each saved with
 * `PUT mappings/[id]`; Continue opens Services and staff.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ sessionId: 's1' }),
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: { current_user_role: 'admin', currency: 'GBP' },
    isLoading: false,
    terminology: { client: 'Client', booking: 'Appointment', staff: 'Staff' },
  }),
}));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockApi = { getSession: jest.fn(), updateMapping: jest.fn() };
jest.mock('@/lib/import/api', () => {
  const actual = jest.requireActual('@/lib/import/api');
  return { ...actual, useImportApi: () => mockApi };
});

import ReviewStepScreen from '@/app/(app)/import/[sessionId]/review';

const FILE = {
  id: 'f1',
  filename: 'bookings.csv',
  file_type: 'bookings',
  row_count: 2,
  column_count: 4,
  headers: ['Status', 'Allergies', 'Client'],
  sample_rows: [{ Status: 'CXL', Allergies: 'Nuts', Client: 'Sarah Jones' }],
};
const MAPPINGS = [
  { id: 'm1', file_id: 'f1', source_column: 'Status', target_field: 'status', action: 'map', value_map: { CXL: 'Cancelled' } },
  { id: 'm2', file_id: 'f1', source_column: 'Allergies', target_field: null, action: 'custom', custom_field_name: 'Allergies', custom_field_type: 'text' },
  {
    id: 'm3',
    file_id: 'f1',
    source_column: 'Client',
    target_field: null,
    action: 'split',
    split_config: { separator: ' ', parts: [{ field: 'guest_first_name' }, { field: 'guest_last_name' }] },
  },
];

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

async function typeText(el: Parameters<typeof fireEvent.changeText>[0], text: string) {
  await act(async () => {
    fireEvent.changeText(el, text);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.getSession.mockResolvedValue({ session: { id: 's1', status: 'mapping' }, files: [FILE], mappings: MAPPINGS, issues: [], booking_references: [] });
  mockApi.updateMapping.mockResolvedValue({ ok: true });
});

describe('Review step', () => {
  it('shows how each column is used', async () => {
    await render(<ReviewStepScreen />);
    expect(screen.getByText('Goes to Booking Status')).toBeTruthy();
    expect(screen.getByText('How your "Status" values map to booking status')).toBeTruthy();
    expect(screen.getByText('"CXL" becomes')).toBeTruthy();
    expect(screen.getByText('Kept on the client profile as a custom field.')).toBeTruthy();
    expect(screen.getByText(/split into several client fields: Guest First Name \+ Guest Surname/)).toBeTruthy();
  });

  it("saves a custom field's name and type", async () => {
    await render(<ReviewStepScreen />);
    await typeText(screen.getByDisplayValue('Allergies'), 'Allergy notes');
    await press(screen.getByText('Yes or no'));
    await press(screen.getByText('Save'));
    expect(mockApi.updateMapping).toHaveBeenCalledWith('s1', 'm2', {
      action: 'custom',
      custom_field_name: 'Allergy notes',
      custom_field_type: 'boolean',
      user_overridden: true,
    });
  });

  it('adds a value to the value map and saves it', async () => {
    await render(<ReviewStepScreen />);
    await typeText(screen.getByPlaceholderText('Value in your file'), 'NS');
    await press(screen.getAllByText('Choose a value')[0]!);
    await press(screen.getByText('No-Show'));
    await press(screen.getByText('Add'));
    await press(screen.getByText('Save value mapping'));
    expect(mockApi.updateMapping).toHaveBeenCalledWith('s1', 'm1', { value_map: { CXL: 'Cancelled', NS: 'No-Show' } });
  });

  it('edits and saves a split', async () => {
    await render(<ReviewStepScreen />);
    await press(screen.getByText('Edit split'));
    await typeText(screen.getByLabelText('Separator'), ',');
    await press(screen.getByText('Save split'));
    expect(mockApi.updateMapping).toHaveBeenCalledWith('s1', 'm3', {
      action: 'split',
      split_config: { separator: ',', parts: [{ field: 'guest_first_name' }, { field: 'guest_last_name' }] },
      user_overridden: true,
    });
  });

  it('continues to Services and staff', async () => {
    await render(<ReviewStepScreen />);
    await press(screen.getByText('Continue'));
    expect(mockPush).toHaveBeenCalledWith('/import/s1/references');
  });
});
