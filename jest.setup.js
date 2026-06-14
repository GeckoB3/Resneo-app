/**
 * Global Jest setup.
 *
 * Pure-logic suites need nothing here. Component suites add native-module mocks
 * (reanimated, gesture-handler, haptics, etc.) below as they are introduced.
 */

// Silence the noisy New-Architecture / Reanimated startup logs in test output.
// eslint-disable-next-line no-undef
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
