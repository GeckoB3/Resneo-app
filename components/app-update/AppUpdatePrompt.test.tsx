/**
 * The store-update prompt: recommended (can be put off) vs required (cannot),
 * silent whenever anything is unknown, and never over the Face ID lock.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { AppVersionPolicy } from '@/lib/app-update/version-policy';

const mockRuntime = {
  installed: '1.1.2' as string | null,
  policy: null as AppVersionPolicy | null,
  snooze: null as { version: string; at: number } | null,
  saveSnooze: jest.fn(async () => {}),
  openStoreListing: jest.fn(async () => {}),
  fetchVersionPolicy: jest.fn(),
};
jest.mock('@/lib/app-update/app-update-runtime', () => ({
  getInstalledStoreVersion: () => mockRuntime.installed,
  fetchVersionPolicy: () => mockRuntime.fetchVersionPolicy(),
  loadSnooze: async () => mockRuntime.snooze,
  saveSnooze: (...args: unknown[]) => mockRuntime.saveSnooze(...(args as [])),
  openStoreListing: () => mockRuntime.openStoreListing(),
}));

const mockLock = { isLocked: false };
jest.mock('@/providers/AppLockProvider', () => ({ useAppLock: () => mockLock }));

import { AppUpdatePrompt } from '@/components/app-update/AppUpdatePrompt';

// jest-expo runs as iOS.
const IOS_120: AppVersionPolicy = {
  ios: { latest: '1.2.0', minimum: '1.1.0', message: 'Take payments with Tap to Pay on iPhone.' },
  android: { latest: '1.1.2', minimum: '1.1.0', message: null },
};

async function renderPrompt() {
  await act(async () => {
    render(<AppUpdatePrompt />);
  });
}

beforeEach(() => {
  mockRuntime.installed = '1.1.2';
  mockRuntime.policy = IOS_120;
  mockRuntime.snooze = null;
  mockRuntime.fetchVersionPolicy.mockReset();
  mockRuntime.fetchVersionPolicy.mockImplementation(async () => mockRuntime.policy);
  mockRuntime.saveSnooze.mockClear();
  mockRuntime.openStoreListing.mockClear();
  mockLock.isLocked = false;
});

it('offers a newer store version, with the message, and can be put off', async () => {
  await renderPrompt();

  expect(screen.getByText('A new version is available')).toBeTruthy();
  expect(screen.getByText('Take payments with Tap to Pay on iPhone.')).toBeTruthy();

  await act(async () => {
    fireEvent.press(screen.getByText('Not now'));
  });
  expect(mockRuntime.saveSnooze).toHaveBeenCalledWith('1.2.0');
  expect(screen.queryByText('A new version is available')).toBeNull();
});

it('opens the store from Update', async () => {
  await renderPrompt();
  await act(async () => {
    fireEvent.press(screen.getByText('Update'));
  });
  expect(mockRuntime.openStoreListing).toHaveBeenCalled();
});

it('requires the update below the minimum, with no way past', async () => {
  mockRuntime.installed = '1.0.9';
  await renderPrompt();

  expect(screen.getByText('Update required')).toBeTruthy();
  expect(screen.queryByText('Not now')).toBeNull();
});

it('says nothing on the latest version', async () => {
  mockRuntime.installed = '1.2.0';
  await renderPrompt();
  expect(screen.queryByText('A new version is available')).toBeNull();
});

it('says nothing without a policy file', async () => {
  mockRuntime.policy = null;
  await renderPrompt();
  expect(screen.queryByText('A new version is available')).toBeNull();
});

it('does not even ask when the installed version is unknown (development, Expo Go)', async () => {
  mockRuntime.installed = null;
  await renderPrompt();
  expect(mockRuntime.fetchVersionPolicy).not.toHaveBeenCalled();
});

it('stays quiet during a snooze for that version', async () => {
  mockRuntime.snooze = { version: '1.2.0', at: Date.now() };
  await renderPrompt();
  expect(screen.queryByText('A new version is available')).toBeNull();
});

it('waits for the Face ID lock to be lifted', async () => {
  mockLock.isLocked = true;
  await renderPrompt();
  expect(screen.queryByText('A new version is available')).toBeNull();
});
