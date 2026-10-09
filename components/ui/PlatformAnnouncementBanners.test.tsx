/**
 * Platform announcements (web `PlatformAnnouncementBanners.tsx`): one banner per active
 * announcement with its severity pill, and a close button that hides it at once on every screen
 * and records the dismissal; a failed save brings it back on the next read, as on the web.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-1' }));

const mockApiFetch = jest.fn();
jest.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { PlatformAnnouncementBanners } from '@/components/ui/PlatformAnnouncementBanners';

const ANNOUNCEMENTS = [
  { id: 'a1', title: 'Planned maintenance', body: 'Sunday 02:00 to 03:00.\nBookings stay open.', severity: 'warning' },
  { id: 'a2', title: 'New: gift vouchers', body: 'Sell vouchers from your booking page.', severity: 'info' },
];

const clients: QueryClient[] = [];

function renderWithClient(ui: ReactNode) {
  // No garbage-collection timers, so the suite exits cleanly.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

afterEach(() => {
  while (clients.length) clients.pop()!.clear();
});

describe('PlatformAnnouncementBanners', () => {
  it('shows each announcement with the web’s severity pill', async () => {
    mockApiFetch.mockResolvedValue({ announcements: ANNOUNCEMENTS });
    await renderWithClient(<PlatformAnnouncementBanners />);
    expect(await screen.findByText('Planned maintenance')).toBeTruthy();
    expect(screen.getByText('Important')).toBeTruthy();
    expect(screen.getByText('New: gift vouchers')).toBeTruthy();
    expect(screen.getByText('Announcement')).toBeTruthy();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/announcements', { accessToken: 'token-1' });
  });

  it('hides one at once on dismiss and records it for this person', async () => {
    mockApiFetch.mockImplementation((path: string) =>
      Promise.resolve(path === '/api/announcements' ? { announcements: ANNOUNCEMENTS } : { ok: true }),
    );
    await renderWithClient(<PlatformAnnouncementBanners />);
    await screen.findByText('Planned maintenance');
    await act(async () => {
      fireEvent.press(screen.getAllByLabelText('Dismiss announcement')[0]!);
    });
    await waitFor(() => expect(screen.queryByText('Planned maintenance')).toBeNull());
    expect(screen.getByText('New: gift vouchers')).toBeTruthy();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/announcements/dismiss', {
      accessToken: 'token-1',
      method: 'POST',
      body: JSON.stringify({ announcement_id: 'a1' }),
    });
  });

  it('shows nothing, and no error, when the read fails or there are none', async () => {
    mockApiFetch.mockRejectedValue(new Error('Not found'));
    await renderWithClient(<PlatformAnnouncementBanners />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.queryByLabelText('Dismiss announcement')).toBeNull();

    mockApiFetch.mockResolvedValue({ announcements: [] });
    await renderWithClient(<PlatformAnnouncementBanners />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(screen.queryByLabelText('Dismiss announcement')).toBeNull();
  });
});
