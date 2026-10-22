/**
 * The bookings bulk tray (web roles plan A2, §5.6, UR21): no "Message" for someone whose business
 * hides client phone numbers and emails from them; tagging stays.
 */
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));
jest.mock('@/lib/queries/useContactsBulk', () => ({
  useBulkAddTag: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import { BookingBulkBar } from '@/components/bookings/BookingBulkBar';
import type { ViewerAccess } from '@/lib/roles/roles';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';
import type { BookingListRow } from '@/types/booking-list';

const selected = [{ id: 'b1', guest_id: 'g1', guest_name: 'Ada' }] as BookingListRow[];

async function renderAs(access: ViewerAccess) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ViewerAccessProvider value={access}>{children}</ViewerAccessProvider>
  );
  await render(
    <BookingBulkBar
      selected={selected}
      allSelected={false}
      onToggleSelectAll={jest.fn()}
      onClear={jest.fn()}
      onMessageSelected={jest.fn()}
    />,
    { wrapper },
  );
}

describe('the bookings bulk tray', () => {
  it('offers no message when client contacts are hidden', async () => {
    await renderAs({ canSeeClientContact: false, canExportClients: true, otherDiaries: 'book' });
    expect(screen.getByText('Tag')).toBeTruthy();
    expect(screen.queryByText('Message')).toBeNull();
  });

  it('offers a message to everyone else', async () => {
    await renderAs({ canSeeClientContact: true, canExportClients: true, otherDiaries: 'book' });
    expect(screen.getByText('Message')).toBeTruthy();
  });
});
