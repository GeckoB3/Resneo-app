/**
 * Choose calendars for a page service, opened from Manage Collective (2026-10-29): the Services
 * screen's member sheet, fed with this venue's appointment calendars and the service's own links.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

const mockSheetProps: Record<string, unknown>[] = [];
jest.mock('@/components/services/collective/MemberServiceSheet', () => ({
  MemberServiceSheet: (props: Record<string, unknown>) => {
    mockSheetProps.push(props);
    return null;
  },
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: { feature_flags: { resolved: { compliance_records_enabled: true } } } }),
}));
let mockPractitioners: unknown[] | undefined = [];
const mockPractitionerOptions: unknown[] = [];
jest.mock('@/lib/queries/usePractitioners', () => ({
  usePractitioners: (options: unknown) => {
    mockPractitionerOptions.push(options);
    return { data: mockPractitioners ? { practitioners: mockPractitioners } : undefined };
  },
}));
const mockBlock = { role: 'replica', collective_id: 'col-1', collective_name: 'Northside', host_venue_name: 'Host Venue' };
jest.mock('@/lib/queries/useServicesManage', () => ({
  useManagedServices: () => ({
    data: {
      services: [
        { id: 's1', name: 'Balayage', collective: mockBlock },
        { id: 's2', name: 'Own cut', collective: null },
      ],
      practitioner_services: [
        { practitioner_id: 'cal-2', service_id: 's1', custom_price_pence: 9000 },
        { practitioner_id: 'cal-x', service_id: 's1' },
        { practitioner_id: 'cal-1', service_id: 's2' },
      ],
    },
  }),
}));

import { MemberCalendarsSheet } from './MemberCalendarsSheet';

beforeEach(() => {
  mockSheetProps.length = 0;
  mockPractitionerOptions.length = 0;
  mockPractitioners = [
    { id: 'cal-2', name: 'Chair 2', is_active: true, sort_order: 2 },
    { id: 'cal-1', name: 'Chair 1', is_active: true, sort_order: 1 },
    { id: 'cal-x', name: 'Gone', is_active: false, sort_order: 3 },
    { id: 'room', name: 'Room', is_active: true, sort_order: 4, calendar_type: 'resource' },
  ];
});

describe('MemberCalendarsSheet', () => {
  // CQ-06 (regression): the switched-off calendar was left out, so the sheet could not show it.
  it("gives the member sheet this venue's calendars, switched off ones too, and the service's own links", async () => {
    await render(<MemberCalendarsSheet serviceId="s1" currencySymbol="£" onClose={jest.fn()} />);
    const props = mockSheetProps.at(-1)!;
    expect(mockPractitionerOptions.at(-1)).toEqual({ includeInactive: true });
    expect(props.block).toBe(mockBlock);
    expect(props.calendars).toEqual([
      { id: 'cal-1', name: 'Chair 1', offers: false, is_active: true },
      { id: 'cal-2', name: 'Chair 2', offers: true, is_active: true },
      { id: 'cal-x', name: 'Gone', offers: true, is_active: false },
    ]);
    expect(props).not.toHaveProperty('expectedCalendarIds');
    expect(props.links).toEqual([
      { practitioner_id: 'cal-2', service_id: 's1', custom_price_pence: 9000 },
      { practitioner_id: 'cal-x', service_id: 's1' },
    ]);
    expect(props.canEditValues).toBe(true);
    expect(props.complianceEnabled).toBe(true);
  });

  it('waits for the calendars, and opens nothing for a service that is not on the page', async () => {
    mockPractitioners = undefined;
    await render(<MemberCalendarsSheet serviceId="s1" currencySymbol="£" onClose={jest.fn()} />);
    expect(mockSheetProps).toHaveLength(0);

    mockPractitioners = [];
    await render(<MemberCalendarsSheet serviceId="s2" currencySymbol="£" onClose={jest.fn()} />);
    expect(mockSheetProps).toHaveLength(0);
    expect(screen.toJSON()).toBeNull();
  });
});
