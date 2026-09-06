/**
 * The linked compliance card opens closed, like the own-venue card it stands
 * in for on a partner's booking, with the same collapsed wording and the
 * needs-action marker on its header.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const mockQuery = jest.fn();
jest.mock('@/lib/queries/useBookingCompliance', () => ({
  useLinkedBookingCompliance: () => mockQuery(),
}));

import { LinkedComplianceSection } from '@/components/linked/LinkedComplianceSection';

function requirement(id: string, name: string, state: string) {
  return {
    requirement: { id, compliance_type_name: name },
    state,
  };
}

describe('LinkedComplianceSection', () => {
  it('starts collapsed, saying all is current, and opens on a tap', async () => {
    mockQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kind: 'data',
        data: {
          applicable: true,
          requirements: [requirement('r1', 'Patch test', 'valid')],
          records: [],
        },
      },
    });
    await render(<LinkedComplianceSection bookingId="b1" />);
    expect(screen.getByText('Compliance')).toBeTruthy();
    expect(screen.getByText('All current')).toBeTruthy();
    expect(screen.queryByText('Patch test')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Compliance'));
    });
    expect(screen.getByText('Patch test')).toBeTruthy();
  });

  it('keeps a requirement that needs action on the closed header', async () => {
    mockQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kind: 'data',
        data: {
          applicable: true,
          requirements: [requirement('r1', 'Patch test', 'missing')],
          records: [],
        },
      },
    });
    await render(<LinkedComplianceSection bookingId="b1" />);
    expect(screen.getByText('1 to action')).toBeTruthy();
    expect(screen.queryByText('All current')).toBeNull();
  });

  it("reads the route's refusal as a note behind a closed header", async () => {
    mockQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { kind: 'note', text: 'This link does not share personal data.' },
    });
    await render(<LinkedComplianceSection bookingId="b1" />);
    expect(screen.getByText('Not available')).toBeTruthy();
    expect(screen.queryByText('This link does not share personal data.')).toBeNull();
  });
});
