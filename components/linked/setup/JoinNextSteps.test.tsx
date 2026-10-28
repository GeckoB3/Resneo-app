/**
 * Straight after joining (web `JoinNextSteps` and `JoinCollectiveDialog`, 2026-10-28). With paid
 * services and no Stripe, or forms off and needed, the join sheet stays open on "You have joined"
 * with Connect Stripe (Stripe's own pages, as Plan & payments opens them) and Turn on (the venue's
 * forms), then Done. With nothing in the way it closes as before.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { JoinPreview } from '@/types/collectives';
import type { AccountLinkView } from '@/types/linked-venues';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockConnect = jest.fn();
jest.mock('@/lib/queries/useBillingStatus', () => ({
  useStripeConnectLink: () => ({ mutate: mockConnect, isPending: false }),
}));
const mockOpenStripe = jest.fn();
jest.mock('@/lib/payments/stripe-onboarding', () => ({
  ...jest.requireActual('@/lib/payments/stripe-onboarding'),
  openStripeOnboarding: (url: string) => mockOpenStripe(url),
}));
const mockFlags = jest.fn();
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useUpdateFeatureFlags: () => ({ mutate: mockFlags, isPending: false }),
}));
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ refetch: jest.fn() }) }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

let mockPreview: JoinPreview;
const mockJoin = jest.fn();
jest.mock('@/lib/queries/useCollectives', () => ({
  useJoinPreview: () => ({ data: mockPreview, isError: false, error: null }),
  useCollectiveMemberAction: () => ({ mutate: mockJoin, isPending: false }),
}));

const mockRespond = jest.fn();
jest.mock('@/lib/queries/useLinkedVenues', () => ({
  useRespondLink: () => ({ mutate: mockRespond, isPending: false }),
}));

import { JoinCollectiveSheet } from './JoinCollectiveSheet';
import { JoinNextSteps } from './JoinNextSteps';
import { ReviewLinkRequestSheet } from './ReviewLinkRequestSheet';

const basePreview: JoinPreview = {
  consent_version: 'join-2026-09',
  collective_name: 'Northside',
  host_name: 'Bright Cuts',
  blocked: null,
  services_to_set_up: 3,
  same_name: [],
  own_services: [],
  forms: [],
  warnings: { no_stripe_paid_services: 0, form_services: 0, forms_off: false },
  other_models: null,
};

const needsBoth: JoinPreview = {
  ...basePreview,
  warnings: { no_stripe_paid_services: 2, form_services: 1, forms_off: true },
};

const draftFor = (turnOnForms = false) => ({ sameName: {}, optionMap: {}, own: {}, forms: {}, turnOnForms });

beforeEach(() => {
  mockConnect.mockReset();
  mockOpenStripe.mockReset();
  mockFlags.mockReset();
  mockJoin.mockReset();
  mockJoin.mockImplementation((_vars: unknown, options: { onSuccess: () => void }) => options.onSuccess());
});

describe('JoinNextSteps', () => {
  it('connects Stripe through the app, and turns the venue\'s forms on', async () => {
    mockConnect.mockImplementation((_vars: unknown, options: { onSuccess: (res: { url: string }) => void }) =>
      options.onSuccess({ url: 'https://connect.stripe.com/setup/abc' }),
    );
    mockOpenStripe.mockResolvedValue('returned');
    mockFlags.mockImplementation((_patch: unknown, options: { onSuccess: () => void }) => options.onSuccess());
    await render(<JoinNextSteps preview={needsBoth} draft={draftFor()} />);
    expect(screen.getByText('Before guests can book every service with you')).toBeTruthy();
    expect(
      screen.getByText('2 services on the page take a deposit or payment online. Connect Stripe so guests can book them with you.'),
    ).toBeTruthy();
    expect(
      screen.getByText('1 service on the page asks for a form, and your forms are off. Turn them on so guests can book it with you.'),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Connect Stripe' }));
    });
    expect(mockConnect).toHaveBeenCalled();
    expect(mockOpenStripe).toHaveBeenCalledWith('https://connect.stripe.com/setup/abc');

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Turn on' }));
    });
    expect(mockFlags.mock.calls[0]?.[0]).toEqual({ compliance_records_enabled: true });
    expect(screen.getByText('Your forms are on.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull();
  });

  it('says so when Stripe cannot be opened', async () => {
    mockConnect.mockImplementation((_vars: unknown, options: { onError: (e: unknown) => void }) =>
      options.onError(new Error('offline')),
    );
    await render(<JoinNextSteps preview={needsBoth} draft={draftFor()} />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Connect Stripe' }));
    });
    expect(
      screen.getByText('Could not open Stripe. Please try again, or connect it later in Settings, Payments.'),
    ).toBeTruthy();
  });

  it('leaves forms out when the venue ticked to turn them on as it joined, and shows nothing when nothing is in the way', async () => {
    await render(<JoinNextSteps preview={{ ...needsBoth, warnings: { ...needsBoth.warnings, no_stripe_paid_services: 0 } }} draft={draftFor(true)} />);
    expect(screen.queryByText('Before guests can book every service with you')).toBeNull();
  });
});

describe('JoinCollectiveSheet after joining', () => {
  async function joinThrough(onClose: () => void) {
    await render(
      <JoinCollectiveSheet
        visible
        collectiveId="col-1"
        collectiveName="Northside"
        venueName="Light 3"
        onClose={onClose}
      />,
    );
    // What joining means, your services, then check and join.
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByText(/^I understand that guests who visit Light 3/));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Join Northside' }));
    });
  }

  it('stays open on "You have joined" with what is still in the way, and Done closes it', async () => {
    mockPreview = needsBoth;
    const onClose = jest.fn();
    await joinThrough(onClose);
    expect(mockJoin).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('You have joined Northside')).toBeTruthy();
    expect(screen.getByText('Bright Cuts is setting up the services on the Northside page. Meanwhile:')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect Stripe' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes as before when nothing is in the way', async () => {
    mockPreview = basePreview;
    const onClose = jest.fn();
    await joinThrough(onClose);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ReviewLinkRequestSheet, accepted and joined', () => {
  const full = { calendar: 'full_details' as const, pii: true, act: 'create_edit_cancel' as const };
  const link: AccountLinkView = {
    id: 'link-1',
    status: 'pending',
    otherVenue: { id: 'v-host', name: 'Bright Cuts', slug: 'bright' },
    initiatedByMe: false,
    iCan: full,
    theyCan: full,
    requestMessage: null,
    pendingChange: null,
    createdAt: '2026-10-28T09:00:00Z',
    respondedAt: null,
    terminatedAt: null,
    terminationReason: null,
  } as AccountLinkView;

  it('ends on the receipt with what is still in the way', async () => {
    mockPreview = needsBoth;
    mockRespond.mockImplementation(
      (_vars: unknown, options: { onSuccess: (data: unknown) => void; onSettled?: () => void }) => {
        options.onSuccess({ collective: { joined: true, name: 'Northside' } });
        options.onSettled?.();
      },
    );
    await render(
      <ReviewLinkRequestSheet
        link={link}
        visible
        venueName="Light 3"
        collective={{ id: 'col-1', name: 'Northside', slug: 'northside', serviceModel: 'replicas' }}
        onClose={jest.fn()}
      />,
    );
    // The request, what joining means, your services, then check.
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Next' }));
      });
    }
    await act(async () => {
      fireEvent.press(screen.getByText(/^I understand what Bright Cuts will be able to see and do/));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Accept and join Northside' }));
    });
    expect(screen.getByText('You are linked with Bright Cuts and part of Northside')).toBeTruthy();
    expect(screen.getByText('Before guests can book every service with you')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect Stripe' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeTruthy();
  });
});
