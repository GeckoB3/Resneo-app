import { fireEvent, render, screen } from '@testing-library/react-native';

import { MemberContactDetails } from '@/components/linked/MemberContactDetails';

const mockMutate = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/queries/useBookingPage', () => ({
  useUpdateBookingPageConfig: () => ({ mutate: mockMutate }),
}));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ error: jest.fn() }) }));
const mockVenue = { email: 'steph@example.com' };
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: {
      get email() {
        return mockVenue.email;
      },
      name: 'Beauty By Steph',
      address: '17 King Street, Winterton, DN159TP',
      phone: null,
      website_url: null,
      login_emails: ['owner@example.com'],
      booking_page_config: { contact_display: { top: { address: false } } },
    },
  }),
}));

describe('MemberContactDetails', () => {
  beforeEach(() => mockMutate.mockClear());

  it('shows the venue’s own details and says whose the page shows', async () => {
    await render(<MemberContactDetails hostName="The Beauty Parlour" />);
    expect(screen.getByText('Beauty By Steph')).toBeTruthy();
    expect(screen.getByText(/show The Beauty Parlour’s details, and The Beauty Parlour chooses which/)).toBeTruthy();
  });

  it('asks before a sign-in address goes on the list, and saves nothing until it is answered', async () => {
    mockVenue.email = 'owner@example.com';
    await render(<MemberContactDetails hostName="The Beauty Parlour" />);
    await fireEvent(screen.getByTestId('contact-about-email'), 'valueChange', true);
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('guest-email-prompt')).toBeTruthy();
    await fireEvent.press(screen.getByText('Show it anyway'));
    expect(mockMutate.mock.calls.at(-1)?.[0].contact_display.about.email).toBe(true);
    mockVenue.email = 'steph@example.com';
  });

  it('saves its choice for the list, keeping the choices its own page holds', async () => {
    await render(<MemberContactDetails hostName="The Beauty Parlour" />);
    await fireEvent(screen.getByTestId('contact-about-email'), 'valueChange', true);
    const sent = mockMutate.mock.calls.at(-1)?.[0];
    expect(sent.contact_display.about.email).toBe(true);
    expect(sent.contact_display.top.address).toBe(false);
  });
});
