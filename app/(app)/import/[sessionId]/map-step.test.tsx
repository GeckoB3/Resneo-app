/**
 * Map step (web `MapStepClient` + `ImportMapDndView`): a file with no mappings is mapped
 * automatically on arrival (fill mode, once); the file's essentials gate Continue; a column's
 * field is chosen by tap, and taking a field another column holds asks first; Continue saves
 * one row per column and opens Review; notes for the AI are saved and every file is mapped again.
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

const mockApi = {
  getSession: jest.fn(),
  aiMapFile: jest.fn(),
  saveMappings: jest.fn(),
  patchSettings: jest.fn(),
};
jest.mock('@/lib/import/api', () => {
  const actual = jest.requireActual('@/lib/import/api');
  return { ...actual, useImportApi: () => mockApi };
});

import MapStepScreen from '@/app/(app)/import/[sessionId]/map';

const FILE = {
  id: 'f1',
  filename: 'clients.csv',
  file_type: 'clients',
  row_count: 2,
  column_count: 3,
  headers: ['Name', 'E-mail', 'Mobile'],
  sample_rows: [{ Name: 'Sarah Jones', 'E-mail': 'sarah@example.com', Mobile: '07700 900123' }],
};
let mockMappings: Record<string, unknown>[] = [];
let mockSettings: Record<string, unknown> = {};

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMappings = [];
  mockSettings = {};
  mockApi.getSession.mockImplementation(async () => ({
    session: { id: 's1', status: 'mapping', session_settings: mockSettings },
    files: [FILE],
    mappings: mockMappings,
    issues: [],
    booking_references: [],
  }));
  mockApi.saveMappings.mockResolvedValue({ ok: true });
  mockApi.patchSettings.mockResolvedValue({});
});

const ai = (source: string, target: string) => ({
  file_id: 'f1',
  source_column: source,
  target_field: target,
  action: 'map',
  ai_confidence: 'medium',
  ai_suggested: true,
});

describe('Map step', () => {
  it('maps an unmapped file automatically on arrival, once', async () => {
    mockApi.aiMapFile.mockImplementation(async () => {
      mockMappings = [ai('Name', 'full_name'), ai('E-mail', 'email')];
      mockSettings = { auto_mapped_file_ids: ['f1'] };
      return { ok: true };
    });
    await render(<MapStepScreen />);
    expect(mockApi.aiMapFile).toHaveBeenCalledTimes(1);
    expect(mockApi.aiMapFile).toHaveBeenCalledWith('s1', 'f1', 'fill');
    expect(screen.getByText(/We mapped your columns automatically/)).toBeTruthy();
    expect(screen.getByText('This file has everything it needs.')).toBeTruthy();
    expect(screen.getByText('Goes to Full Name')).toBeTruthy();
  });

  it('holds Continue until the file has a name, then saves one row per column', async () => {
    mockMappings = [ai('E-mail', 'email')];
    mockSettings = { auto_mapped_file_ids: ['f1'] };
    await render(<MapStepScreen />);
    // Already auto-mapped once: the owner's own choices are not mapped over again.
    expect(mockApi.aiMapFile).not.toHaveBeenCalled();
    expect(screen.getByText('Before you can continue, this file needs:')).toBeTruthy();
    await press(screen.getByText('Continue'));
    expect(mockApi.saveMappings).not.toHaveBeenCalled();

    // "Name" needs attention: choose Full Name for it.
    const chooseButtons = screen.getAllByText('Choose a field');
    await press(chooseButtons[0]!);
    expect(screen.getByText('Where does "Name" go?')).toBeTruthy();
    await press(screen.getByText('Full Name'));
    expect(screen.getByText('This file has everything it needs.')).toBeTruthy();

    await press(screen.getByText('Continue'));
    const [, rows] = mockApi.saveMappings.mock.calls[0] as [string, Record<string, unknown>[]];
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source_column: 'E-mail', target_field: 'email', action: 'map' }),
        expect.objectContaining({ source_column: 'Name', target_field: 'full_name', action: 'map', ai_confidence: 'high', ai_suggested: false }),
      ]),
    );
    expect(mockPush).toHaveBeenCalledWith('/import/s1/review');
  });

  it('asks before taking a field another column holds', async () => {
    mockMappings = [ai('Name', 'full_name'), ai('E-mail', 'email')];
    mockSettings = { auto_mapped_file_ids: ['f1'] };
    await render(<MapStepScreen />);
    // "Mobile" needs attention; send it to Email Address, which E-mail holds.
    await press(screen.getAllByText('Choose a field')[0]!);
    await press(screen.getByText('Email Address'));
    expect(screen.getByText('Replace this mapping?')).toBeTruthy();
    await press(screen.getByText('Replace'));
    await press(screen.getByText('Continue'));
    const [, rows] = mockApi.saveMappings.mock.calls[0] as [string, Record<string, unknown>[]];
    expect(rows.find((r) => r.source_column === 'Mobile')).toEqual(expect.objectContaining({ target_field: 'email' }));
    expect(rows.find((r) => r.source_column === 'E-mail')).toBeUndefined();
  });

  it('saves notes for the AI and maps every file again', async () => {
    mockMappings = [ai('Name', 'full_name')];
    mockSettings = { auto_mapped_file_ids: ['f1'], ai_instructions: 'Ref is our client ID' };
    mockApi.aiMapFile.mockResolvedValue({ ok: true });
    await render(<MapStepScreen />);
    expect(screen.getByDisplayValue('Ref is our client ID')).toBeTruthy();
    await press(screen.getByText('Save and map again'));
    expect(mockApi.patchSettings).toHaveBeenCalledWith('s1', { ai_instructions: 'Ref is our client ID' });
    expect(mockApi.aiMapFile).toHaveBeenCalledWith('s1', 'f1');
    expect(screen.getByText(/Columns mapped again using your notes/)).toBeTruthy();
  });
});
