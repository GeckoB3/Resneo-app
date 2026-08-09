/**
 * Team-photo framing (web parity R11-1, `team_profiles[id].photo_crop`).
 *
 * Framing is a draft like the photo itself: "Adjust" swaps the sheet content to
 * the shared ImageFramingEditor (in-sheet mode step, no stacked Sheet), the
 * choice lands in the local profile map, and everything publishes together on
 * "Save team profiles". A replaced photo starts centred (photo_crop reset).
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));

// Render Sheet children inline when visible (avoids gesture-handler/Modal).
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

// Chainable no-op gestures — the Stepper drives zoom in this suite.
jest.mock('react-native-gesture-handler', () => {
  const chainable = () => {
    const gesture: Record<string, () => unknown> = {};
    for (const m of ['enabled', 'onChange', 'onStart', 'onUpdate', 'onEnd']) {
      gesture[m] = () => gesture;
    }
    return gesture;
  };
  return {
    Gesture: {
      Pan: chainable,
      Pinch: chainable,
      Simultaneous: (...gestures: unknown[]) => gestures,
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

type ProfileBlob = Record<
  string,
  { photo?: string | null; photo_crop?: { x?: number; y?: number; zoom?: number } | null }
>;
let mockProfiles: ProfileBlob = {};
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: { id: 'v1', booking_page_config: { team_profiles: mockProfiles } },
  }),
}));

const mockUpdate = jest.fn((..._a: unknown[]) => Promise.resolve({}));
let mockTeam: { id: string; name: string }[] = [];
jest.mock('@/lib/queries/useBookingPage', () => ({
  useBookingPageTeam: () => ({
    data: mockTeam,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
  useUpdateBookingPageConfig: () => ({ mutateAsync: mockUpdate, isPending: false }),
}));

const mockPick = jest.fn(() => Promise.resolve<{ uri: string; mimeType: string } | null>(null));
const mockUpload = jest.fn((_p: unknown) => Promise.resolve('https://img/new.jpg'));
jest.mock('@/lib/queries/useVenueImageUpload', () => ({
  pickVenueImage: () => mockPick(),
  useUploadTeamPhoto: () => ({ mutateAsync: mockUpload, isPending: false }),
}));

import { TeamProfilesSheet } from '@/components/bookingPage/TeamProfilesSheet';

const CROP = { x: 60, y: 40, zoom: 1.5 };

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTeam = [{ id: 'm1', name: 'Sam' }];
  mockProfiles = { m1: { photo: 'https://img/sam.jpg', photo_crop: CROP } };
});

describe('TeamProfilesSheet framing', () => {
  it('Adjust edits the framing as a draft; Save team profiles publishes it', async () => {
    await render(<TeamProfilesSheet visible onClose={jest.fn()} />);

    await press(screen.getByText('Adjust'));
    expect(screen.getByText('Reposition — Sam')).toBeTruthy();

    // One stepper tick: zoom 1.5 → 1.55, stored rounded to 1.6 (server round1).
    await act(async () => {
      fireEvent(screen.getByLabelText(/^Zoom \d+%$/), 'accessibilityAction', {
        nativeEvent: { actionName: 'increment' },
      });
    });
    await press(screen.getByText('Save'));

    // Draft only — nothing PATCHed yet, back on the list with a publish nudge.
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.queryByText('Reposition — Sam')).toBeNull();
    expect(mockToast.info).toHaveBeenCalled();

    await press(screen.getByText('Save team profiles'));
    expect(mockUpdate).toHaveBeenCalledWith({
      team_profiles: {
        m1: expect.objectContaining({
          photo: 'https://img/sam.jpg',
          photo_crop: { x: 60, y: 40, zoom: 1.6 },
        }),
      },
    });
  });

  it('a replaced photo starts centred (photo_crop reset in the draft)', async () => {
    mockPick.mockResolvedValueOnce({ uri: 'file:///new.jpg', mimeType: 'image/jpeg' });
    await render(<TeamProfilesSheet visible onClose={jest.fn()} />);

    await press(screen.getByText('Change photo'));
    await press(screen.getByText('Save team profiles'));

    expect(mockUpdate).toHaveBeenCalledWith({
      team_profiles: {
        m1: expect.objectContaining({ photo: 'https://img/new.jpg', photo_crop: null }),
      },
    });
  });
});
