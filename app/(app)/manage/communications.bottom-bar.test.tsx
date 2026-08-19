/**
 * Communications — the sticky save bar must not reserve space while hidden.
 *
 * The bar is armed by unsaved changes and animates out of view otherwise
 * (opacity 0, translated down). It was laid out IN FLOW, so while invisible it
 * went on reserving its whole height — button, padding and safe-area inset,
 * well over 100pt — which a device sees as a large white bar under the page.
 * Reported from a device, alongside the same class of bug on the booking
 * screen (see app/(app)/booking/new.bottom-inset.test.tsx).
 *
 * Two things are pinned here: the bar overlays rather than occupies, and the
 * home-indicator strip is reserved once rather than twice.
 *
 * `hours.tsx` shares the bar's styling but renders it ALWAYS VISIBLE, so
 * in-flow is correct there — do not unify the two without checking that.
 */
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

jest.mock('@/components/manage/CommunicationPreviewSheet', () => ({
  CommunicationPreviewSheet: () => null,
}));

const mockInsets = { top: 47, bottom: 34, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => mockInsets,
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

jest.mock('@/lib/queries/useCommunications', () => ({
  useCommunicationPolicies: () => ({
    data: { appointments_other: {} },
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useNotificationSettings: () => ({
    data: {
      daily_schedule_enabled: false,
      staff_new_booking_alert: false,
      staff_cancellation_alert: false,
    },
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useUpdateCommunicationPolicies: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateNotificationSettings: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePreviewCommunication: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/lib/queries/useVenueSettings', () => ({
  useUpdateVenue: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: {
      current_user_role: 'admin',
      email: 'venue@example.com',
      owner_booking_notification_enabled: false,
      owner_booking_notification_email: null,
      google_review_url: null,
      review_request_enabled: false,
      pricing_tier: 'pro',
      stripe_connected_account_id: 'acct_1',
    },
    featureFlags: { resolved: {} },
    refetch: jest.fn(),
    isLoading: false,
    isError: false,
  }),
}));

import CommunicationsScreen from '@/app/(app)/manage/communications';
import { spacing } from '@/theme/index';

function flatten(style: unknown): Record<string, unknown> {
  const parts = Array.isArray(style) ? style : [style];
  return Object.assign({}, ...parts.filter(Boolean).map((s) => (Array.isArray(s) ? flatten(s) : s)));
}

type TreeNode = {
  parent: TreeNode | null;
  props: { style?: unknown; contentContainerStyle?: unknown };
};

/** The nearest ancestor of the Save button that carries a `position`. */
function barStyle(): Record<string, unknown> {
  let node = screen.getByText('Save changes') as unknown as TreeNode | null;
  for (let i = 0; node && i < 8; i += 1) {
    const flat = flatten(node.props?.style);
    if (flat.position !== undefined || flat.borderTopWidth !== undefined) return flat;
    node = node.parent;
  }
  return {};
}

/**
 * Bottom padding on the page's scroll content.
 *
 * Anchored on content INSIDE the ScrollView — the Save button is in the sticky
 * bar, which is a sibling of the scroll, so walking up from it never passes
 * through the content container at all.
 */
function scrollContentPad(): number | undefined {
  let node = screen.getByText('Business notifications') as unknown as TreeNode | null;
  for (let i = 0; node && i < 20; i += 1) {
    const pad = flatten(node.props?.contentContainerStyle).paddingBottom;
    if (typeof pad === 'number') return pad;
    node = node.parent;
  }
  return undefined;
}

describe('Communications — sticky save bar', () => {
  it('overlays the page instead of reserving a band beneath it', async () => {
    await render(<CommunicationsScreen />);

    const bar = barStyle();
    // Absolute means an invisible (unarmed) bar costs no layout height.
    expect(bar.position).toBe('absolute');
    expect(bar.bottom).toBe(0);
    expect(bar.left).toBe(0);
    expect(bar.right).toBe(0);
  });

  it('reserves the home-indicator strip in the bar, not twice over', async () => {
    await render(<CommunicationsScreen />);

    // The bar clears the indicator itself...
    expect(barStyle().paddingBottom).toBe(spacing.md + mockInsets.bottom);
  });
});

describe('Communications — scroll content', () => {
  it('clears the indicator itself while the bar is unarmed', async () => {
    await render(<CommunicationsScreen />);

    // Nothing is dirty on first render, so the bar is hidden and the content is
    // what has to clear the indicator.
    expect(scrollContentPad()).toBe(spacing['2xl'] + mockInsets.bottom);
  });

  it('needs no extra room on a device with no home indicator', async () => {
    mockInsets.bottom = 0;
    try {
      await render(<CommunicationsScreen />);
      expect(scrollContentPad()).toBe(spacing['2xl']);
    } finally {
      mockInsets.bottom = 34;
    }
  });
});
