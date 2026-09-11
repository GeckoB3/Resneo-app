import { render, screen } from '@testing-library/react-native';

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token' }));

import { DataExportCard } from '@/components/reports/DataExportCard';

/**
 * Export your data — the footer and description are the web's
 * (`_reference/Resneo/src/app/dashboard/reports/DataExportSection.tsx`).
 */
describe('DataExportCard', () => {
  it('shows the web footer, without the developer note that used to follow it', async () => {
    await render(<DataExportCard bookingWord="Appointment" clientLabel="Client" isAppointment />);
    expect(screen.getByText("Files are generated in real time from your venue's data.")).toBeTruthy();
    expect(screen.queryByText(/expo-file-system/)).toBeNull();
  });

  it('uses the venue’s words for an appointment venue', async () => {
    await render(<DataExportCard bookingWord="Appointment" clientLabel="Client" isAppointment />);
    expect(screen.getByText(/Download a full CSV of all appointments or your client records/)).toBeTruthy();
    expect(screen.getByText(/You are entitled to your data at any time\./)).toBeTruthy();
    expect(screen.getByText('Export all appointments')).toBeTruthy();
    expect(screen.getByText('Export client list')).toBeTruthy();
  });

  it('keeps the guest wording for a venue that is not on appointments', async () => {
    await render(<DataExportCard bookingWord="Reservation" clientLabel="Guest" />);
    expect(screen.getByText(/Download a full CSV export of your bookings or guest records/)).toBeTruthy();
    expect(screen.getByText('Export guest list')).toBeTruthy();
  });
});
