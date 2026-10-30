/**
 * The name guests see, and the collective's own name (CQ-10.10, R2-28; web `PageNameSection`, D58).
 * The app had neither: its one field saved the collective's own name and called it "shown to customers".
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import type { CollectiveView } from '@/types/collectives';

const mockMutateAsync = jest.fn();
jest.mock('@/lib/queries/useCollectives', () => ({
  useUpdateCollective: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

import { CombinedPageNameSection } from './CombinedPageNameSection';

function collective(overrides: Partial<CollectiveView> = {}): CollectiveView {
  return {
    id: 'col-1',
    slug: 'plus-1',
    name: 'Plus 1',
    hostVenueId: 'v-host',
    myVenueId: 'v-host',
    isHost: true,
    bookingPageConfig: null,
    members: [
      { venueId: 'v-host', venueName: 'Aura Hair Studio', status: 'active', displayOrder: 0, soloPageBehavior: 'redirect' },
    ],
    ...overrides,
  } as CollectiveView;
}

const pressRadio = async (name: string) => {
  await act(async () => {
    fireEvent.press(screen.getByRole('radio', { name }));
  });
};
const blur = async (node: ReturnType<typeof screen.getByLabelText>) => {
  await act(async () => {
    fireEvent(node, 'blur');
  });
};
const type = async (node: ReturnType<typeof screen.getByLabelText>, text: string) => {
  await act(async () => {
    fireEvent.changeText(node, text);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  mockMutateAsync.mockReset();
  mockMutateAsync.mockResolvedValue({ collective: null });
});
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('CombinedPageNameSection', () => {
  it("reads the host's name by default, in the app's place names", async () => {
    await render(<CombinedPageNameSection collective={collective()} />);
    expect(screen.getByText('Name on your booking page')).toBeTruthy();
    expect(screen.getByText('Guests see this name at the top of the page, in search results and in their booking emails.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Aura Hair Studio' }).props.accessibilityState?.selected).toBe(true);
    expect(screen.getByRole('radio', { name: 'A different name' }).props.accessibilityState?.selected).toBe(false);
    expect(screen.getByText(/If you rename your venue under More, Venue profile, the page follows\./)).toBeTruthy();
    expect(screen.getByText(/What the collective is called inside ResNeo, for example on the Booking page and Linked venues screens/)).toBeTruthy();
    expect(screen.queryByLabelText('Name to show on the booking page')).toBeNull();
  });

  it('starts a first different name from the collective name, and saves it as the public name', async () => {
    await render(<CombinedPageNameSection collective={collective()} />);
    await pressRadio('A different name');
    expect(screen.getByLabelText('Name to show on the booking page').props.value).toBe('Plus 1');
    expect(mockMutateAsync).toHaveBeenCalledWith({ collectiveId: 'col-1', payload: { publicName: 'Plus 1' } });
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('saves a typed different name when the field is left, once', async () => {
    await render(<CombinedPageNameSection collective={collective({ bookingPageConfig: { public_name: 'Northside' } as never })} />);
    const field = screen.getByLabelText('Name to show on the booking page');
    expect(field.props.value).toBe('Northside');
    await blur(field);
    expect(mockMutateAsync).not.toHaveBeenCalled();

    await type(field, '  Northside Hair  ');
    await blur(field);
    expect(mockMutateAsync).toHaveBeenCalledWith({ collectiveId: 'col-1', payload: { publicName: 'Northside Hair' } });

    // Saved here, so leaving it again sends nothing, though the collective passed in is still stale.
    mockMutateAsync.mockClear();
    await blur(field);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('does not save a name that is too short, and says so', async () => {
    await render(<CombinedPageNameSection collective={collective({ bookingPageConfig: { public_name: 'Northside' } as never })} />);
    const field = screen.getByLabelText('Name to show on the booking page');
    await type(field, 'N');
    await blur(field);
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Type a name of at least 2 characters.')).toBeTruthy();
  });

  it("goes back to the host's name with a null public name", async () => {
    await render(<CombinedPageNameSection collective={collective({ bookingPageConfig: { public_name: 'Northside' } as never })} />);
    await pressRadio('Aura Hair Studio');
    expect(mockMutateAsync).toHaveBeenCalledWith({ collectiveId: 'col-1', payload: { publicName: null } });
    expect(screen.queryByLabelText('Name to show on the booking page')).toBeNull();
  });

  it('renames the collective with its name, not the public name', async () => {
    const onChanged = jest.fn();
    await render(<CombinedPageNameSection collective={collective()} onChanged={onChanged} />);
    const field = screen.getByLabelText('Collective name');
    await blur(field);
    expect(mockMutateAsync).not.toHaveBeenCalled();
    await type(field, 'Plus 2');
    await blur(field);
    expect(mockMutateAsync).toHaveBeenCalledWith({ collectiveId: 'col-1', payload: { name: 'Plus 2' } });
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('offers Save while a change is unsaved, as the keyboard can go away without leaving the field', async () => {
    await render(<CombinedPageNameSection collective={collective()} />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    await type(screen.getByLabelText('Collective name'), 'Plus 2');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    expect(mockMutateAsync).toHaveBeenCalledWith({ collectiveId: 'col-1', payload: { name: 'Plus 2' } });
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it("shows the server's sentence when a rename is refused", async () => {
    mockMutateAsync.mockRejectedValue(new ApiError('A collective with that name already exists.', 409));
    await render(<CombinedPageNameSection collective={collective()} />);
    const field = screen.getByLabelText('Collective name');
    await type(field, 'Taken');
    await blur(field);
    expect(screen.getByText('A collective with that name already exists.')).toBeTruthy();
    expect(screen.queryByText('Saved')).toBeNull();
  });
});
