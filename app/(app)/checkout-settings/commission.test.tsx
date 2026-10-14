/**
 * The old Checkout settings Commission route (2026-10-14): Commission moved out of Checkout into
 * Commission splits, so anything still linking here lands there. The rates themselves are tested
 * against the new screen in `app/(app)/commission-splits/index.test.tsx`.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { render } from '@testing-library/react-native';

const mockRedirects: string[] = [];
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    mockRedirects.push(href);
    return null;
  },
}));

import CommissionSettingsScreen from './commission';

it('sends anyone still linking here to Commission splits', async () => {
  await render(<CommissionSettingsScreen />);
  expect(mockRedirects).toEqual(['/commission-splits']);
});
