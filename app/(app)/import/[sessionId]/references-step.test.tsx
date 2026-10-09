/**
 * Services and staff step (web `ReferencesStepClient`): the booking file is read once, the AI
 * suggests matches, and each item is matched, added as new or skipped; all suggestions can be
 * accepted at once; a venue with few services is offered to create them all from the bookings;
 * Continue waits until everything is settled.
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
    venue: { current_user_role: 'admin', currency: 'EUR' },
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
  extractReferences: jest.fn(),
  aiMapReferences: jest.fn(),
  referenceCatalog: jest.fn(),
  referenceDefaults: jest.fn(),
  resolveReference: jest.fn(),
  bulkReferences: jest.fn(),
  confirmTableUnassigned: jest.fn(),
};
jest.mock('@/lib/import/api', () => {
  const actual = jest.requireActual('@/lib/import/api');
  return { ...actual, useImportApi: () => mockApi };
});

import ReferencesStepScreen from '@/app/(app)/import/[sessionId]/references';

type Ref = { id: string; reference_type: string; raw_value: string; is_resolved: boolean; booking_count?: number; ai_suggested_entity_id?: string | null; ai_suggested_entity_name?: string | null; ai_confidence?: string | null };
let mockRefs: Ref[] = [];
let mockResolved = false;

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolved = false;
  mockRefs = [
    { id: 'r1', reference_type: 'service', raw_value: 'Haircut', is_resolved: false, booking_count: 4, ai_suggested_entity_id: 'svc-1', ai_suggested_entity_name: 'Cut', ai_confidence: 'high' },
    { id: 'r2', reference_type: 'service', raw_value: 'Fringe trim', is_resolved: false, booking_count: 2 },
    { id: 'r3', reference_type: 'staff', raw_value: 'Emma', is_resolved: false, booking_count: 6, ai_suggested_entity_id: 'cal-1', ai_suggested_entity_name: 'Emma B', ai_confidence: 'medium' },
  ];
  mockApi.extractReferences.mockResolvedValue({ ok: true, referencesResolved: false, futureRowCount: 12, insertedBookingRowCount: 12 });
  mockApi.getSession.mockImplementation(async () => ({
    session: { id: 's1', status: 'mapping', references_resolved: mockResolved },
    files: [{ id: 'f1', file_type: 'bookings' }],
    mappings: [],
    issues: [],
    booking_references: mockRefs,
  }));
  mockApi.aiMapReferences.mockResolvedValue({ ok: true });
  mockApi.referenceCatalog.mockResolvedValue({
    bookingModel: 'unified_scheduling',
    serviceItems: [{ id: 'svc-1', name: 'Cut' }, { id: 'svc-2', name: 'Colour' }, { id: 'svc-3', name: 'Blow dry' }, { id: 'svc-4', name: 'Perm' }],
    calendars: [{ id: 'cal-1', name: 'Emma B' }],
    practitioners: [],
    appointmentServices: [],
  });
  mockApi.referenceDefaults.mockResolvedValue({ suggestions: [{ reference_id: 'r2', suggested_duration_minutes: 15, suggested_price_pence: 800, sample_count: 2 }] });
  mockApi.resolveReference.mockImplementation(async (_s: string, id: string) => {
    mockRefs = mockRefs.map((r) => (r.id === id ? { ...r, is_resolved: true } : r));
    mockResolved = mockRefs.every((r) => r.is_resolved);
    return { ok: true };
  });
});

describe('Services and staff step', () => {
  it('reads the file once, asks the AI for matches, and holds Continue until all are settled', async () => {
    await render(<ReferencesStepScreen />);
    expect(mockApi.extractReferences).toHaveBeenCalledTimes(1);
    expect(mockApi.aiMapReferences).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Future booking rows: 12')).toBeTruthy();
    expect(screen.getByText(/Suggested match: Cut \(high\)/)).toBeTruthy();
    await press(screen.getByText('Continue to Validate'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('matches one to its suggestion', async () => {
    await render(<ReferencesStepScreen />);
    await press(screen.getAllByText('Match')[0]!);
    expect(mockApi.resolveReference).toHaveBeenCalledWith('s1', 'r1', {
      resolution_action: 'map',
      resolved_entity_id: 'svc-1',
      resolved_entity_type: 'service_item',
    });
  });

  it('adds one as a new service with the suggested length and price, in the venue currency', async () => {
    await render(<ReferencesStepScreen />);
    await press(screen.getAllByText('Add as new service')[1]!);
    expect(screen.getByText('Price (€)')).toBeTruthy();
    expect(screen.getByDisplayValue('15')).toBeTruthy();
    expect(screen.getByDisplayValue('8.00')).toBeTruthy();
    const creates = screen.getAllByText('Add as new service');
    await press(creates[creates.length - 1]!);
    expect(mockApi.resolveReference).toHaveBeenCalledWith('s1', 'r2', {
      resolution_action: 'create',
      create_label: 'Fringe trim',
      create_duration_minutes: 15,
      create_price_pence: 800,
    });
  });

  it('accepts every suggestion at once, then skips the last and continues', async () => {
    await render(<ReferencesStepScreen />);
    await press(screen.getByText('Accept all 2 suggestions'));
    expect(mockApi.resolveReference).toHaveBeenCalledTimes(2);
    // Staff are settled, so the Services tab shows the one left.
    await press(screen.getByText('Skip'));
    expect(mockApi.resolveReference).toHaveBeenLastCalledWith('s1', 'r2', { resolution_action: 'skip' });
    expect(screen.getByText('Everything is matched up')).toBeTruthy();
    await press(screen.getByText('Continue to Validate'));
    expect(mockPush).toHaveBeenCalledWith('/import/s1/validate');
  });

  it('offers to create every service from the bookings for a venue with few services', async () => {
    mockRefs = ['A', 'B', 'C'].map((n, i) => ({ id: `n${i}`, reference_type: 'service', raw_value: n, is_resolved: false }));
    mockApi.referenceCatalog.mockResolvedValue({ bookingModel: 'unified_scheduling', serviceItems: [], calendars: [], practitioners: [], appointmentServices: [] });
    mockApi.bulkReferences.mockResolvedValue({ ok: true, created: 3, errors: [] });
    await render(<ReferencesStepScreen />);
    expect(screen.getByText('We found 3 services in your bookings')).toBeTruthy();
    await press(screen.getByText('Create 3 new services from your bookings'));
    await press(screen.getByText('Create 3 services'));
    const [, ops] = mockApi.bulkReferences.mock.calls[0] as [string, Record<string, unknown>[]];
    expect(ops).toHaveLength(3);
    expect(ops[0]).toEqual({ reference_id: 'n0', action: 'create', resolved_entity_type: 'service_item', create_label: 'A', create_duration_minutes: 60, create_price_pence: null });
    expect(screen.getByText('Created 3 services')).toBeTruthy();
  });
});
