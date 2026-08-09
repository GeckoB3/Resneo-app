/**
 * Service-photo framing (web parity R11-1, `service_photo_crops`).
 *
 * The sheet swaps its content to the shared ImageFramingEditor ("Adjust") —
 * an in-sheet mode step, not a second stacked Sheet — and every save PATCHes
 * the whole pruned crop map alongside any photo change:
 *   - framing save   → `{ service_photo_crops }` alone;
 *   - photo replace  → new photo + that service's framing dropped (a new photo
 *     starts centred), in ONE PATCH;
 *   - photo remove   → same drop.
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

// The framing editor builds pan/pinch gestures at render; chainable no-ops are
// enough — gestures themselves are exercised on device, not here (the Stepper
// drives zoom in this suite).
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

type ConfigBlob = {
  service_photos?: Record<string, string> | null;
  service_photo_crops?: Record<string, { x?: number; y?: number; zoom?: number }> | null;
};
let mockConfig: ConfigBlob = {};
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: { id: 'v1', booking_page_config: mockConfig } }),
}));

let mockServices: { id: string; name: string }[] = [];
jest.mock('@/lib/queries/useServicesManage', () => ({
  useManagedServices: () => ({ data: { services: mockServices }, isLoading: false }),
}));

const mockUpdate = jest.fn((..._a: unknown[]) => Promise.resolve({}));
jest.mock('@/lib/queries/useBookingPage', () => ({
  useUpdateBookingPageConfig: () => ({ mutateAsync: mockUpdate, isPending: false }),
}));

const mockPick = jest.fn(() => Promise.resolve<{ uri: string; mimeType: string } | null>(null));
const mockUpload = jest.fn((_p: unknown) => Promise.resolve('https://img/new.jpg'));
const mockDeletePhoto = jest.fn((_url: unknown) => Promise.resolve());
jest.mock('@/lib/queries/useVenueImageUpload', () => ({
  pickVenueImage: () => mockPick(),
  useUploadServicePhoto: () => ({ mutateAsync: mockUpload, isPending: false }),
  useDeleteServicePhoto: () => ({ mutateAsync: mockDeletePhoto, isPending: false }),
}));

import { ServicePhotosSheet } from '@/components/bookingPage/ServicePhotosSheet';

const CROP_A = { x: 60, y: 40, zoom: 1.5 };
const CROP_B = { x: 30, y: 70, zoom: 2 };

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockServices = [
    { id: 's1', name: 'Hair Cut' },
    { id: 's2', name: 'Blow Dry' },
  ];
  mockConfig = {
    service_photos: { s1: 'https://img/a.jpg', s2: 'https://img/b.jpg' },
    service_photo_crops: { s1: CROP_A, s2: CROP_B },
  };
});

describe('ServicePhotosSheet framing', () => {
  it('Adjust opens the in-sheet framing editor and Save PATCHes the pruned crop map', async () => {
    await render(<ServicePhotosSheet visible onClose={jest.fn()} />);

    await press(screen.getAllByText('Adjust')[0]!);
    expect(screen.getByText('Reposition — Hair Cut')).toBeTruthy();

    // One stepper tick: zoom 1.5 → 1.55, stored rounded to 1.6 (server round1).
    await act(async () => {
      fireEvent(screen.getByLabelText(/^Zoom \d+%$/), 'accessibilityAction', {
        nativeEvent: { actionName: 'increment' },
      });
    });
    await press(screen.getByText('Save'));

    expect(mockUpdate).toHaveBeenCalledWith({
      service_photo_crops: { s1: { x: 60, y: 40, zoom: 1.6 }, s2: CROP_B },
    });
    // Back on the list after a successful save.
    expect(screen.queryByText('Reposition — Hair Cut')).toBeNull();
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('Reset + Save removes the stored crop, and null clears the key when none remain', async () => {
    mockConfig.service_photo_crops = { s1: CROP_A };
    await render(<ServicePhotosSheet visible onClose={jest.fn()} />);

    await press(screen.getAllByText('Adjust')[0]!);
    await press(screen.getByText('Reset'));
    await press(screen.getByText('Save'));

    expect(mockUpdate).toHaveBeenCalledWith({ service_photo_crops: null });
  });

  it('replacing a photo drops its framing in the same PATCH', async () => {
    mockPick.mockResolvedValueOnce({ uri: 'file:///new.jpg', mimeType: 'image/jpeg' });
    await render(<ServicePhotosSheet visible onClose={jest.fn()} />);

    await press(screen.getAllByText('Change')[0]!);

    expect(mockUpdate).toHaveBeenCalledWith({
      service_photos: { s1: 'https://img/new.jpg', s2: 'https://img/b.jpg' },
      service_photo_crops: { s2: CROP_B },
    });
  });

  it('removing a photo drops its framing too', async () => {
    await render(<ServicePhotosSheet visible onClose={jest.fn()} />);

    await press(screen.getAllByText('Remove')[0]!);

    expect(mockUpdate).toHaveBeenCalledWith({
      service_photos: { s2: 'https://img/b.jpg' },
      service_photo_crops: { s2: CROP_B },
    });
    expect(mockDeletePhoto).toHaveBeenCalledWith('https://img/a.jpg');
  });
});
