/**
 * CourseEnrollmentsSheet (Domain 06) — the money action web can do that the app
 * couldn't: cancel a course enrollment and surface the refunded amount. This
 * pins (1) the in-window cancel → "£X refunded" success toast, and (2) the pure
 * `cancelToastMessage` copy for refund vs no-refund.
 *
 * jest hoists mock factories above imports, so factory-closed vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// Render Sheet children inline when visible (avoids gesture-handler / Modal).
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

// Admin venue so the cancel actions render.
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: { current_user_role: 'admin' } }),
}));

// Controlled enrollments query + cancel mutation.
const mockRefetch = jest.fn();
let mockEnrollmentsData: any = null;
const mockCancelMutate = jest.fn();
jest.mock('@/lib/queries/useClassProducts', () => ({
  useCourseEnrollments: () => ({
    data: mockEnrollmentsData,
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: mockRefetch,
  }),
  useCancelCourseEnrollment: () => ({ mutate: mockCancelMutate, isPending: false }),
}));

import { CourseEnrollmentsSheet, cancelToastMessage } from '@/components/classes/CourseEnrollmentsSheet';

function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  return act(async () => {
    fireEvent.press(getEl());
  });
}

beforeEach(() => {
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockCancelMutate.mockClear();
  mockRefetch.mockClear();
  mockEnrollmentsData = {
    product: { id: 'course-1', name: 'Pilates', cancellation_window_days: 7, session_instance_ids: [] },
    enrollments: [
      {
        id: 'enr-1',
        user_id: 'u-1',
        status: 'active',
        stripe_payment_intent_id: 'pi_1',
        created_at: '2026-06-01T10:00:00Z',
        updated_at: '2026-06-01T10:00:00Z',
        guest: { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' },
      },
    ],
    session_enrollments: [],
  };
});

describe('cancelToastMessage', () => {
  it('reports the refunded amount when a refund was issued', () => {
    expect(cancelToastMessage(4500)).toBe('Enrollment cancelled. £45.00 refunded.');
  });

  it('reports no refund when the amount is zero/absent', () => {
    expect(cancelToastMessage(0)).toBe('Enrollment cancelled — no refund was issued.');
    expect(cancelToastMessage(null)).toBe('Enrollment cancelled — no refund was issued.');
    expect(cancelToastMessage(undefined)).toBe('Enrollment cancelled — no refund was issued.');
  });
});

describe('CourseEnrollmentsSheet — cancel → refund toast', () => {
  it('lists an enrollee and shows a refunded-amount toast after cancelling', async () => {
    // The mutation resolves via its onSuccess callback with a refund amount.
    mockCancelMutate.mockImplementation((_input, opts) => {
      opts?.onSuccess?.({ ok: true, refund_amount_pence: 4500 });
    });

    // Awaited so RTL flushes act() and populates `screen` (this RTL build reports
    // "render not called" if screen is read before the render promise resolves).
    await act(async () => {
      render(<CourseEnrollmentsSheet course={{ id: 'course-1', name: 'Pilates' }} onClose={jest.fn()} />);
    });

    // Enrollee row is rendered.
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();

    // Open the cancel confirm, then confirm. The confirm sheet has both a
    // "Cancel enrollment" heading and button, so press the last match (button).
    await press(() => screen.getByText('Cancel'));
    const confirmButtons = screen.getAllByText('Cancel enrollment');
    await press(() => confirmButtons[confirmButtons.length - 1]);

    // The cancel route was called with this course + enrollment, no bypass.
    expect(mockCancelMutate).toHaveBeenCalledTimes(1);
    expect(mockCancelMutate.mock.calls[0][0]).toMatchObject({
      courseId: 'course-1',
      enrollmentId: 'enr-1',
      bypass_window: false,
    });

    // The refunded amount is surfaced in a success toast.
    expect(mockToast.success).toHaveBeenCalledWith('Enrollment cancelled. £45.00 refunded.');
  });

  it('force-cancel sends bypass_window:true', async () => {
    mockCancelMutate.mockImplementation((_input, opts) => {
      opts?.onSuccess?.({ ok: true, refund_amount_pence: 0 });
    });

    await act(async () => {
      render(<CourseEnrollmentsSheet course={{ id: 'course-1', name: 'Pilates' }} onClose={jest.fn()} />);
    });

    await press(() => screen.getByText('Force-cancel'));
    // Two "Force-cancel" labels now exist (card + confirm). Press the confirm one.
    const buttons = screen.getAllByText('Force-cancel');
    await press(() => buttons[buttons.length - 1]);

    expect(mockCancelMutate.mock.calls[0][0]).toMatchObject({
      courseId: 'course-1',
      enrollmentId: 'enr-1',
      bypass_window: true,
    });
    expect(mockToast.success).toHaveBeenCalledWith('Enrollment cancelled — no refund was issued.');
  });
});
