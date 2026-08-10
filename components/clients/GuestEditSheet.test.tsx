/**
 * GuestEditSheet — the "Edit" form behind a contact's detail screen.
 *
 * Pinned here is the layout, because it shipped broken: the Sheet was not
 * `fill` and its ScrollView was `flexGrow: 0`, so the body sized to its content
 * — the form could not be scrolled and its pinned Save/Cancel row was pushed
 * off the bottom of the sheet. Reported from an iPhone as "unable to scroll and
 * cannot see the bottom of the form". The Event, Resource, ClassType and Modify
 * editors were all fixed for this same pattern; this one was missed.
 *
 * `fill` also means the Sheet supplies no horizontal padding, so the body must
 * carry the standard inset itself or the form renders edge-to-edge.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

import { GuestEditSheet, type GuestEditTarget } from './GuestEditSheet';
import { spacing } from '@/theme/index';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const mockSheetProps: { fill?: boolean }[] = [];
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({
      visible,
      fill,
      children,
    }: {
      visible: boolean;
      fill?: boolean;
      children: React.ReactNode;
    }) => {
      mockSheetProps.push({ fill });
      return visible ? React.createElement(View, null, children) : null;
    },
  };
});

jest.mock('@/lib/queries/useGuestMutations', () => ({
  useUpdateGuest: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const TARGET: GuestEditTarget = {
  id: 'guest-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  phone: '07700900000',
  email: 'ada@example.com',
  notes: '',
  tags: '',
  marketingConsent: false,
  marketingOptOut: false,
  addressLine1: '',
  addressLine2: '',
  addressCity: '',
  addressPostcode: '',
};

type TreeNode = {
  parent: TreeNode | null;
  props: { style?: unknown; contentContainerStyle?: unknown };
};

function flatten(style: unknown): Record<string, unknown> {
  const parts = Array.isArray(style) ? style : [style];
  return Object.assign({}, ...parts.filter(Boolean).map((s) => (Array.isArray(s) ? flatten(s) : s)));
}

beforeEach(() => {
  mockSheetProps.length = 0;
});

describe('GuestEditSheet', () => {
  it('fills the sheet so the form scrolls and the actions stay reachable', async () => {
    await render(<GuestEditSheet target={TARGET} onClose={jest.fn()} />);

    expect(mockSheetProps.every((p) => p.fill === true)).toBe(true);
    // The pinned actions render alongside the scrolling form, not below it.
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('gives the ScrollView room to flex, so a long form can scroll', async () => {
    await render(<GuestEditSheet target={TARGET} onClose={jest.fn()} />);

    // Walk up from a field inside the scroll body to the ScrollView itself,
    // identified by the contentContainerStyle prop only it carries.
    let node = screen.getByText('First name') as unknown as TreeNode | null;
    let style: Record<string, unknown> | null = null;
    for (let i = 0; node && i < 10; i += 1) {
      if (node.props?.contentContainerStyle !== undefined) {
        style = flatten(node.props.style);
        break;
      }
      node = node.parent;
    }

    expect(style).not.toBeNull();
    // The regression was `flexGrow: 0` — the body sized to content and froze.
    expect(style?.flex).toBe(1);
    expect(style?.flexGrow).toBeUndefined();
  });

  it('pads itself horizontally, since a fill Sheet supplies none', async () => {
    await render(<GuestEditSheet target={TARGET} onClose={jest.fn()} />);

    let node = screen.getByText('Edit guest') as unknown as TreeNode | null;
    let inset: unknown;
    for (let i = 0; node && i < 6; i += 1) {
      const pad = flatten(node.props?.style).paddingHorizontal;
      if (typeof pad === 'number') {
        inset = pad;
        break;
      }
      node = node.parent;
    }
    expect(inset).toBe(spacing.lg);
  });

  it('renders nothing without a target', async () => {
    await render(<GuestEditSheet target={null} onClose={jest.fn()} />);
    expect(screen.queryByText('Edit guest')).toBeNull();
  });
});
