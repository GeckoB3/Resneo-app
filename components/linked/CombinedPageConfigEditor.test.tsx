/**
 * CombinedPageConfigEditor — live-preview wiring (Domain 16, Medium).
 *
 * Verifies the host combined-page editor feeds the shared, prop-driven
 * `BookingPagePreview` from its current state + the assembled config:
 *   • the preview renders above the form and receives the stored config values
 *     (venue name, normalised brand/accent, font preset, announcement, cover
 *     layout, logo/cover crop boxes);
 *   • editing the announcement / brand colour flows straight through to the
 *     preview props (assembleConfig → preview is live).
 *
 * The preview itself is mocked to a prop-capturing spy (its own rendering is
 * covered elsewhere), and the heavy children / cropper sheets + data hooks are
 * stubbed so the editor mounts without a QueryClient or native modules. jest
 * hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { CollectiveView } from '@/types/collectives';

// --- Preview: capture the props each render hands it. ------------------------
const mockPreviewProps: Record<string, unknown>[] = [];
jest.mock('@/components/bookingPage/BookingPagePreview', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    BookingPagePreview: (props: Record<string, unknown>) => {
      mockPreviewProps.push(props);
      return React.createElement(Text, { testID: 'preview-mock' }, 'preview');
    },
  };
});

// --- Heavy children + native cropper sheets → inert. -------------------------
jest.mock('@/components/linked/CombinedPageGallery', () => ({ CombinedPageGallery: () => null }));
jest.mock('@/components/linked/CombinedPageTeamProfiles', () => ({
  CombinedPageTeamProfiles: () => null,
}));
jest.mock('@/components/bookingPage/CoverCropperSheet', () => ({ CoverCropperSheet: () => null }));
jest.mock('@/components/bookingPage/LogoFramingSheet', () => ({ LogoFramingSheet: () => null }));

// --- Data hooks: fake mutations (no QueryClient needed). ---------------------
const mockUpdate = { mutate: jest.fn(), mutateAsync: jest.fn(() => Promise.resolve({})), isPending: false };
const mockUpload = { mutateAsync: jest.fn(() => Promise.resolve('https://img/new.jpg')), isPending: false };
jest.mock('@/lib/queries/useCollectives', () => ({
  useUpdateCollective: () => mockUpdate,
  useUploadPageAsset: () => mockUpload,
  pickVenueImage: jest.fn(() => Promise.resolve(null)),
}));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

import { CombinedPageConfigEditor } from '@/components/linked/CombinedPageConfigEditor';

/** Most-recent props handed to the preview. */
function latestPreview(): Record<string, unknown> {
  return mockPreviewProps[mockPreviewProps.length - 1];
}

function makeCollective(overrides: Partial<CollectiveView> = {}): CollectiveView {
  return {
    id: 'col-1',
    slug: 'glow-collective',
    name: 'Glow Collective',
    status: 'active',
    branding: { logo_url: 'https://img/logo.png' },
    serviceGrouping: 'by_practitioner',
    allowAnyPractitioner: false,
    pageMode: 'unified_catalog',
    slugStrategy: 'dedicated',
    adoptedVenueId: null,
    timezone: 'Europe/London',
    bookingPageConfig: {
      brand_primary: '#003b6f',
      brand_accent: '#0e7490',
      font_preset: 'elegant',
      announcement: 'Now booking autumn slots',
      cover_photo_url: 'https://img/cover.jpg',
      cover_full_width: true,
      logo_crop: { x: 40, y: 60, zoom: 1.5 },
      cover_crop_box: { x: 0.1, y: 0.1, w: 0.8, h: 0.6, ar: 1.6 },
    },
    isHost: true,
    hostVenueId: 'v-1',
    myVenueId: 'v-1',
    myMembershipStatus: 'active',
    myConfig: null,
    members: [{ venueId: 'v-1', venueName: 'Glow Studio', status: 'active', displayOrder: 0, soloPageBehavior: 'keep_live' }],
    activeMemberCount: 1,
    ...overrides,
  };
}

beforeEach(() => {
  mockPreviewProps.length = 0;
  mockUpdate.mutate.mockClear();
  mockUpdate.mutateAsync.mockClear();
  mockToast.error.mockClear();
});

describe('CombinedPageConfigEditor — live preview wiring', () => {
  it('renders the preview above the form, fed from the assembled config', async () => {
    await render(<CombinedPageConfigEditor collective={makeCollective()} onChanged={jest.fn()} />);

    expect(screen.getByTestId('preview-mock')).toBeTruthy();

    const p = latestPreview();
    expect(p.venueName).toBe('Glow Collective');
    // Normalised brand/accent (lower-cased hex) flow through as props.
    expect(p.primary).toBe('#003b6f');
    expect(p.accent).toBe('#0e7490');
    expect(p.fontPreset).toBe('elegant');
    expect(p.announcement).toBe('Now booking autumn slots');
    expect(p.coverFullWidth).toBe(true);
    expect(p.logoUrl).toBe('https://img/logo.png');
    expect(p.coverUrl).toBe('https://img/cover.jpg');
    // Crop framing comes straight from the assembled config (round-trips as-is).
    expect(p.logoCrop).toEqual({ x: 40, y: 60, zoom: 1.5 });
    expect(p.coverCropBox).toEqual({ x: 0.1, y: 0.1, w: 0.8, h: 0.6, ar: 1.6 });
  });

  it('passes null colours / crop to the preview when the config is empty', async () => {
    await render(
      <CombinedPageConfigEditor
        collective={makeCollective({ bookingPageConfig: {}, branding: {} })}
        onChanged={jest.fn()}
      />,
    );

    const p = latestPreview();
    expect(p.primary).toBeNull();
    expect(p.accent).toBeNull();
    expect(p.logoUrl).toBeNull();
    expect(p.coverUrl).toBeNull();
    expect(p.logoCrop).toBeNull();
    expect(p.coverCropBox).toBeNull();
    expect(p.coverFullWidth).toBe(false);
  });

  it('reflects an announcement edit straight through to the preview props', async () => {
    await render(<CombinedPageConfigEditor collective={makeCollective()} onChanged={jest.fn()} />);

    const input = screen.getByDisplayValue('Now booking autumn slots');
    await act(async () => {
      fireEvent.changeText(input, 'Closed for refurb');
    });

    expect(latestPreview().announcement).toBe('Closed for refurb');
  });
});
