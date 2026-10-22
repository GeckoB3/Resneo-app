/**
 * Who is looking, for every screen in the staff app (web roles plan A2): the signed-in person's
 * switches from staff/me, else from the venue payload, else everything; outside the provider
 * everything is allowed. And what a hidden phone or email looks like.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

let mockStaffMe: unknown = undefined;
let mockVenue: unknown = null;
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => ({ data: mockStaffMe }) }));
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ venue: mockVenue }) }));

import { HiddenContactField, HiddenContactValue } from '@/components/roles/HiddenContact';
import {
  LiveViewerAccessProvider,
  useClientContactHidden,
  useDiaryScope,
  useViewerAccess,
  ViewerAccessProvider,
} from '@/providers/ViewerAccessProvider';

function Probe({ flag }: { flag?: boolean }) {
  const access = useViewerAccess();
  const hidden = useClientContactHidden(flag);
  return (
    <Text>
      {`contact:${access.canSeeClientContact} export:${access.canExportClients} diaries:${access.otherDiaries} hidden:${hidden}`}
    </Text>
  );
}

/** Other people's diaries: whether this person may add to their own and to someone else's calendar. */
function DiaryProbe() {
  const diary = useDiaryScope();
  return <Text>{`restricted:${diary.restricted} mine:${diary.allows('cal-mine')} theirs:${diary.allows('cal-theirs')}`}</Text>;
}

beforeEach(() => {
  mockStaffMe = undefined;
  mockVenue = null;
});

describe('useViewerAccess', () => {
  it('allows everything outside the provider (tests, the customer app)', async () => {
    await render(<Probe />);
    expect(screen.getByText('contact:true export:true diaries:book hidden:false')).toBeTruthy();
  });

  it('still reads "Hidden" there when the response says contacts_hidden', async () => {
    await render(<Probe flag />);
    expect(screen.getByText('contact:true export:true diaries:book hidden:true')).toBeTruthy();
  });

  it('takes a value from ViewerAccessProvider', async () => {
    await render(
      <ViewerAccessProvider value={{ canSeeClientContact: false, canExportClients: false, otherDiaries: 'view' }}>
        <Probe />
      </ViewerAccessProvider>,
    );
    expect(screen.getByText('contact:false export:false diaries:view hidden:true')).toBeTruthy();
  });
});

describe('LiveViewerAccessProvider', () => {
  it("reads the signed-in person's switches from staff/me", async () => {
    mockStaffMe = {
      staff: {
        id: 's1',
        role: 'staff',
        role_key: 'staff',
        permissions: { client_contact: false, export_clients: false, other_diaries: 'view' },
      },
    };
    await render(
      <LiveViewerAccessProvider>
        <Probe />
      </LiveViewerAccessProvider>,
    );
    expect(screen.getByText('contact:false export:false diaries:view hidden:true')).toBeTruthy();
  });

  it('falls back to the venue payload while staff/me loads', async () => {
    mockVenue = {
      current_user_role: 'staff',
      current_user_role_key: 'front_desk',
      current_user_permissions: { role_key: 'front_desk', client_contact: false },
    };
    await render(
      <LiveViewerAccessProvider>
        <Probe />
      </LiveViewerAccessProvider>,
    );
    expect(screen.getByText('contact:false export:true diaries:book hidden:true')).toBeTruthy();
  });

  it('gives an admin everything, whatever their stored switches say', async () => {
    mockStaffMe = { staff: { id: 'a1', role: 'admin', role_key: 'admin', permissions: { client_contact: false } } };
    await render(
      <LiveViewerAccessProvider>
        <Probe />
      </LiveViewerAccessProvider>,
    );
    expect(screen.getByText('contact:true export:true diaries:book hidden:false')).toBeTruthy();
  });

  it('allows everything before either answers', async () => {
    await render(
      <LiveViewerAccessProvider>
        <Probe />
      </LiveViewerAccessProvider>,
    );
    expect(screen.getByText('contact:true export:true diaries:book hidden:false')).toBeTruthy();
  });
});

describe('useDiaryScope (§5.11)', () => {
  it('allows every calendar outside the provider and for Can book and change', async () => {
    await render(<DiaryProbe />);
    expect(screen.getByText('restricted:false mine:true theirs:true')).toBeTruthy();
  });

  it("allows only the person's own calendars from staff/me for View only", async () => {
    mockStaffMe = {
      staff: { id: 's1', role: 'staff', role_key: 'staff', linked_calendar_ids: ['cal-mine'], permissions: { other_diaries: 'view' } },
    };
    await render(
      <LiveViewerAccessProvider>
        <DiaryProbe />
      </LiveViewerAccessProvider>,
    );
    expect(screen.getByText('restricted:true mine:true theirs:false')).toBeTruthy();
  });

  it('does the same for Hidden', async () => {
    mockStaffMe = {
      staff: { id: 's1', role: 'staff', role_key: 'staff', linked_calendar_ids: ['cal-mine'], permissions: { other_diaries: 'hidden' } },
    };
    await render(
      <LiveViewerAccessProvider>
        <DiaryProbe />
      </LiveViewerAccessProvider>,
    );
    expect(screen.getByText('restricted:true mine:true theirs:false')).toBeTruthy();
  });

  it('never limits an admin, whatever their stored switch says', async () => {
    mockStaffMe = { staff: { id: 'a1', role: 'admin', role_key: 'admin', linked_calendar_ids: [], permissions: { other_diaries: 'view' } } };
    await render(
      <LiveViewerAccessProvider>
        <DiaryProbe />
      </LiveViewerAccessProvider>,
    );
    expect(screen.getByText('restricted:false mine:true theirs:true')).toBeTruthy();
  });
});

describe('HiddenContact', () => {
  it('reads "Hidden", with the tip for screen readers, and underneath when asked', async () => {
    await render(<HiddenContactValue label="Phone" showTip />);
    const word = screen.getByText('Hidden');
    expect(word.props.accessibilityLabel).toBe('Phone: Hidden');
    expect(word.props.accessibilityHint).toBe('Your business has hidden client phone numbers and emails for you.');
    expect(screen.getByText('Your business has hidden client phone numbers and emails for you.')).toBeTruthy();
  });

  it('keeps to the one word in a list', async () => {
    await render(<HiddenContactValue />);
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.queryByText('Your business has hidden client phone numbers and emails for you.')).toBeNull();
  });

  it('is a read-only field reading "Hidden" in a form', async () => {
    await render(<HiddenContactField label="Email" />);
    const field = screen.getByDisplayValue('Hidden');
    expect(field.props.editable).toBe(false);
    expect(screen.getByText('Your business has hidden client phone numbers and emails for you.')).toBeTruthy();
  });
});
