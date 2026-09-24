/**
 * DiarySection title (web QA A-2, 2026-09-23). The tiles count appointments only,
 * but the diary lists every booking today, classes, events and resources included.
 * So an appointments venue with other booking types on calls it "Today's bookings".
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

import { DiarySection } from './DiarySection';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/components/bookings/BookingDetailSheet', () => ({ BookingDetailSheet: () => null }));

describe('DiarySection', () => {
  it("is \"Today's appointments\" when every booking is an appointment", async () => {
    await render(
      <DiarySection recentBookings={[]} isAppointment tableFocusSecondariesEnabled={false} />,
    );
    expect(screen.getByText("Today's appointments")).toBeTruthy();
    expect(screen.getByText('No appointments today')).toBeTruthy();
  });

  it("is \"Today's bookings\" when the venue runs other booking types too", async () => {
    await render(
      <DiarySection
        recentBookings={[]}
        isAppointment
        tableFocusSecondariesEnabled={false}
        listsOtherTypes
      />,
    );
    expect(screen.getByText("Today's bookings")).toBeTruthy();
    expect(screen.getByText('No bookings today')).toBeTruthy();
    expect(screen.getByText('All bookings →')).toBeTruthy();
  });
});
