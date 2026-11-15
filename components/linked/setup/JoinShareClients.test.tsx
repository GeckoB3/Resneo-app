/**
 * Joining a collective that offers shared client lists (web plan §1A.2 step 2, D10, mockup board 3):
 * the last step asks "Share client lists?" with nothing chosen, Join waits for an answer, and the
 * answer travels in the same accept request.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { JoinPreview } from '@/types/collectives';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: jest.fn(),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token' }));
jest.mock('@/lib/queries/useBillingStatus', () => ({
  useStripeConnectLink: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useUpdateFeatureFlags: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ refetch: jest.fn() }) }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

let mockPreview: JoinPreview;
const mockJoin = jest.fn();
jest.mock('@/lib/queries/useCollectives', () => ({
  useJoinPreview: () => ({ data: mockPreview, isError: false, error: null, refetch: jest.fn() }),
  useCollectiveMemberAction: () => ({ mutate: mockJoin, isPending: false }),
}));

import { clientSharingCopy } from '@/lib/collective-area/client-sharing-copy';
import { setupCopy } from '@/lib/linked/setup-copy';

import { JoinCollectiveSheet } from './JoinCollectiveSheet';

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

async function toCheckStep() {
  await render(
    <JoinCollectiveSheet visible collectiveId="col-1" collectiveName="Northside" venueName="Light 3" onClose={jest.fn()} />,
  );
  for (let i = 0; i < 4; i += 1) {
    const next = screen.queryByRole('button', { name: setupCopy('join.next') });
    if (!next) break;
    await act(async () => {
      fireEvent.press(next);
    });
  }
  await act(async () => {
    fireEvent.press(
      screen.getByText(setupCopy('join.consent', { venue: 'Light 3', collective: 'Northside', host: 'Bright Cuts' })),
    );
  });
}

const joinButton = () => screen.getByRole('button', { name: setupCopy('join.confirm', { collective: 'Northside' }) });

beforeEach(() => {
  mockJoin.mockReset();
});

describe('Join: Share client lists?', () => {
  it('asks, with nothing chosen, and waits for an answer before joining', async () => {
    mockPreview = { ...basePreview, client_sharing_offered: true };
    await toCheckStep();
    expect(screen.getByText(clientSharingCopy('cs.join.title'))).toBeTruthy();
    expect(screen.getByText(clientSharingCopy('cs.join.required'))).toBeTruthy();
    expect(joinButton()).toBeDisabled();

    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.join.share')));
    });
    expect(joinButton()).not.toBeDisabled();
    await act(async () => {
      fireEvent.press(joinButton());
    });
    expect(mockJoin.mock.calls[0][0].payload).toEqual(
      expect.objectContaining({ action: 'accept', share_clients: 'share' }),
    );
  });

  it('sends Not now when chosen', async () => {
    mockPreview = { ...basePreview, client_sharing_offered: true };
    await toCheckStep();
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.join.notNow')));
    });
    await act(async () => {
      fireEvent.press(joinButton());
    });
    expect(mockJoin.mock.calls[0][0].payload.share_clients).toBe('not_now');
  });

  it('says nothing about it when the collective does not offer it', async () => {
    mockPreview = basePreview;
    await toCheckStep();
    expect(screen.queryByText(clientSharingCopy('cs.join.title'))).toBeNull();
    expect(joinButton()).not.toBeDisabled();
    await act(async () => {
      fireEvent.press(joinButton());
    });
    expect(mockJoin.mock.calls[0][0].payload.share_clients).toBeUndefined();
  });
});
