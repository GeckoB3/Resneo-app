/**
 * "Set up with AI" on the Services screen (web parity: `AppointmentServicesView.ai-setup.test.tsx`).
 *
 * The routes are mocked at `lib/services-setup/api`, so the bodies the setup sends are what is
 * asserted: a typed list is read, reviewed and added through the ordinary create route, a new
 * heading is made first, a collective host puts the service on its page, a failed read shows the
 * server's advice, a saved review is picked up again, closing with unread sources asks first, and
 * a photo taken with the camera joins the list (or a refused camera says how to turn it on).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock('expo-clipboard', () => ({ hasImageAsync: jest.fn(async () => false), getImageAsync: jest.fn() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
const mockCamera = {
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
};
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: (...a: unknown[]) => mockCamera.requestCameraPermissionsAsync(...a),
  launchCameraAsync: (...a: unknown[]) => mockCamera.launchCameraAsync(...a),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));
// The resize and slice step runs in a WebView canvas; here a picture is sent as it came.
jest.mock('@/lib/services-setup/prepare-images', () => ({
  ...jest.requireActual('@/lib/services-setup/prepare-images'),
  prepareImageForUpload: jest.fn(async (img: { name: string; uri: string | null }) => ({
    parts: [{ label: img.name, files: [{ uri: img.uri ?? '', name: `${img.name}.jpg`, type: 'image/jpeg', size: 1000 }] }],
    truncated: false,
  })),
}));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'tok' }));

const mockApi = {
  readSetupSource: jest.fn(),
  createServiceCategory: jest.fn(),
  listServiceCategories: jest.fn(),
  createAppointmentService: jest.fn(),
  patchAppointmentService: jest.fn(),
  deleteAppointmentService: jest.fn(),
  fetchAppointmentServices: jest.fn(),
  offerOnCollectivePage: jest.fn(),
  takeOffCollectivePage: jest.fn(),
  createAddonGroup: jest.fn(),
  updateAddonGroup: jest.fn(),
  deleteAddonGroup: jest.fn(),
};
jest.mock('@/lib/services-setup/api', () => ({
  COULD_NOT_REACH: 'We could not reach ResNeo. Check your connection and try again.',
  readSetupSource: (...a: unknown[]) => mockApi.readSetupSource(...a),
  createServiceCategory: (...a: unknown[]) => mockApi.createServiceCategory(...a),
  listServiceCategories: (...a: unknown[]) => mockApi.listServiceCategories(...a),
  createAppointmentService: (...a: unknown[]) => mockApi.createAppointmentService(...a),
  patchAppointmentService: (...a: unknown[]) => mockApi.patchAppointmentService(...a),
  deleteAppointmentService: (...a: unknown[]) => mockApi.deleteAppointmentService(...a),
  fetchAppointmentServices: (...a: unknown[]) => mockApi.fetchAppointmentServices(...a),
  offerOnCollectivePage: (...a: unknown[]) => mockApi.offerOnCollectivePage(...a),
  takeOffCollectivePage: (...a: unknown[]) => mockApi.takeOffCollectivePage(...a),
  createAddonGroup: (...a: unknown[]) => mockApi.createAddonGroup(...a),
  updateAddonGroup: (...a: unknown[]) => mockApi.updateAddonGroup(...a),
  deleteAddonGroup: (...a: unknown[]) => mockApi.deleteAddonGroup(...a),
}));

const mockLoad = jest.fn();
jest.mock('@/lib/services-setup/setup-storage', () => ({
  loadServicesSetup: (...a: unknown[]) => mockLoad(...a),
  saveServicesSetup: jest.fn(async () => undefined),
  clearServicesSetup: jest.fn(async () => undefined),
}));
jest.mock('@/lib/services-setup/files', () => ({
  clearUploadCache: jest.fn(async () => undefined),
  stageDocument: jest.fn(async (uri: string) => uri),
}));

import { ServicesSetupSheet } from '@/components/services-setup/ServicesSetupSheet';
import { draftFromExtracted } from '@/lib/services-setup/drafts';
import type { ExtractedService } from '@/lib/services-setup/types';

function extracted(over: Partial<ExtractedService> = {}): ExtractedService {
  return {
    name: 'Cut and finish',
    category: 'Cuts',
    description: null,
    duration_minutes: 45,
    suggested_duration_minutes: 45,
    price_pence: 3500,
    price_kind: 'fixed',
    options: [],
    notes: [],
    looks_like_addon: false,
    ...over,
  };
}

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    await fireEvent.press(getEl());
  });
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const onClose = jest.fn();

async function renderSheet(over: Partial<React.ComponentProps<typeof ServicesSetupSheet>> = {}) {
  await render(
    <ServicesSetupSheet
      visible
      onClose={onClose}
      onServicesChanged={jest.fn()}
      onMoreSettings={jest.fn()}
      onOpenBookingPage={null}
      onOpenCalendars={jest.fn()}
      venueId="venue-1"
      websiteUrl={null}
      currencyCode="GBP"
      currencySymbol="£"
      categories={[{ id: 'cat-cuts', name: 'Cuts', sort_order: 0 }]}
      existingServices={[]}
      calendars={[{ id: 'cal-1', name: 'Sam' }]}
      stripeConnected
      collectiveHost={{ id: 'col-1', name: 'Glow Collective' }}
      {...over}
    />,
  );
  await flush();
}

async function readTypedList(services: ExtractedService[]) {
  mockApi.readSetupSource.mockResolvedValueOnce({
    ok: true,
    data: { ok: true, source: { kind: 'text', label: 'Your typed list', followed: [] }, services, currency: 'GBP', warnings: [] },
  });
  await press(() => screen.getByLabelText('Type or paste a list'));
  await act(async () => {
    await fireEvent.changeText(screen.getByPlaceholderText(/Ladies cut and blow dry/), 'Cut and finish 45 min 35');
  });
  await press(() => screen.getByText('Add this list'));
  await press(() => screen.getByText('Find my services'));
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoad.mockResolvedValue(null);
});

describe('ServicesSetupSheet', () => {
  it('reads a typed list, and adds a service through the ordinary create route', async () => {
    mockApi.createAppointmentService.mockResolvedValue({ id: 'svc-1' });
    mockApi.offerOnCollectivePage.mockResolvedValue({});
    await renderSheet();
    await readTypedList([extracted()]);

    expect(mockApi.readSetupSource).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'text', label: 'Your typed list', text: 'Cut and finish 45 min 35' }),
      '',
      'tok',
    );
    expect(screen.getByText(/1 service found/)).toBeTruthy();

    await press(() => screen.getByText('Add service'));
    await flush();
    // The heading exists already, so none is made; every service gets the setup's calendars.
    expect(mockApi.createServiceCategory).not.toHaveBeenCalled();
    expect(mockApi.createAppointmentService).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Cut and finish',
        duration_minutes: 45,
        price_pence: 3500,
        category_id: 'cat-cuts',
        practitioner_ids: ['cal-1'],
        payment_requirement: 'none',
        is_bookable_online: true,
      }),
      'tok',
    );
    // A collective host's new service goes on the combined page, as the web's box says.
    expect(mockApi.offerOnCollectivePage).toHaveBeenCalledWith('col-1', 'svc-1', 'tok');
    expect(screen.getByText(/^Added · 45 min · £35/)).toBeTruthy();
    expect(screen.getByText('Undo')).toBeTruthy();
  });

  it('makes a heading the venue does not have before adding its service', async () => {
    mockApi.createServiceCategory.mockResolvedValue({ category: { id: 'cat-new' } });
    mockApi.createAppointmentService.mockResolvedValue({ id: 'svc-2' });
    await renderSheet({ collectiveHost: null });
    await readTypedList([extracted({ name: 'Gloss', category: 'Colour' })]);

    await press(() => screen.getByText('Add service'));
    await flush();
    expect(mockApi.createServiceCategory).toHaveBeenCalledWith('Colour', 'tok');
    expect(mockApi.createAppointmentService).toHaveBeenCalledWith(expect.objectContaining({ category_id: 'cat-new' }), 'tok');
    expect(mockApi.offerOnCollectivePage).not.toHaveBeenCalled();
  });

  it('shows the server’s advice when a source cannot be read, with Retry and Remove', async () => {
    mockApi.readSetupSource.mockResolvedValueOnce({
      ok: false,
      error: 'That page would not let us read it. Add a screenshot of your price list instead.',
    });
    await renderSheet();
    await press(() => screen.getByLabelText('Type or paste a list'));
    await act(async () => {
      await fireEvent.changeText(screen.getByPlaceholderText(/Ladies cut and blow dry/), 'something');
    });
    await press(() => screen.getByText('Add this list'));
    await press(() => screen.getByText('Find my services'));
    await flush();

    expect(screen.getByText('That page would not let us read it. Add a screenshot of your price list instead.')).toBeTruthy();
    expect(screen.getByLabelText('Retry Your typed list')).toBeTruthy();
    expect(screen.getByLabelText('Remove Your typed list')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('carries on from a saved review', async () => {
    mockLoad.mockResolvedValue({
      version: 1,
      savedAt: Date.now(),
      drafts: [draftFromExtracted(extracted(), 'Your typed list', 'd1')],
      calendarIds: null,
      instructions: '',
    });
    await renderSheet();
    expect(screen.getByText('Carrying on from where you left off.')).toBeTruthy();
    expect(screen.getByText('Cut and finish')).toBeTruthy();
  });

  it('adds a photo taken with the camera as "Photo 1"', async () => {
    mockCamera.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    mockCamera.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cam/4F1C-9A.jpg', fileName: '4F1C-9A.jpg', mimeType: 'image/jpeg', width: 3024, height: 4032, fileSize: 2_100_000 }],
    });
    await renderSheet();
    await press(() => screen.getByLabelText('A photo or screenshot'));
    await press(() => screen.getByText('Take a photo'));
    await flush();

    expect(mockCamera.launchCameraAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 1 });
    expect(screen.getByText('What we will read (1)')).toBeTruthy();
    expect(screen.getByText('Photo 1')).toBeTruthy();
  });

  it('says how to turn the camera on when access is refused', async () => {
    mockCamera.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
    await renderSheet();
    await press(() => screen.getByLabelText('A photo or screenshot'));
    await press(() => screen.getByText('Take a photo'));
    await flush();

    expect(mockCamera.launchCameraAsync).not.toHaveBeenCalled();
    expect(
      screen.getByText('Resneo cannot use your camera. Turn on camera access for Resneo in your phone settings, or choose a photo instead.'),
    ).toBeTruthy();
  });

  it('asks before closing with something added but not read', async () => {
    await renderSheet();
    await press(() => screen.getByLabelText('Type or paste a list'));
    await act(async () => {
      await fireEvent.changeText(screen.getByPlaceholderText(/Ladies cut and blow dry/), 'Cut 20');
    });
    await press(() => screen.getByText('Add this list'));
    await press(() => screen.getByText('Cancel'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Close without reading?')).toBeTruthy();
    await press(() => screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
