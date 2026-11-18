/**
 * CardBulkController (card-on-file-plan §4.16, §6.4): the question first, the server's words after,
 * a changed count asked again, and Undo for 5 minutes after Confirm without a card, the message
 * staying until dismissed.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';

import { CardBulkController, type CardBulkRequest } from './CardBulkController';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/haptics', () => ({ hapticSuccess: jest.fn(), hapticTap: jest.fn(), hapticSelect: jest.fn() }));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockConfirm = jest.fn();
const mockSend = jest.fn();
const mockPreview = jest.fn();
const mockUndo = jest.fn();
jest.mock('@/lib/queries/useCardsOnFile', () => ({
  ...jest.requireActual('@/lib/queries/useCardsOnFile'),
  useConfirmWithoutCard: () => ({ mutateAsync: mockConfirm, isPending: false }),
  useSendCardRequests: () => ({ mutateAsync: mockSend, isPending: false }),
  usePreviewCardRequests: () => ({ mutateAsync: mockPreview, isPending: false }),
  useUndoConfirmWithoutCard: () => ({ mutateAsync: mockUndo, isPending: false }),
}));

const NOW = Date.parse('2026-11-17T10:00:00Z');
const now = () => NOW;

const selectAll: CardBulkRequest = {
  action: 'confirm_without_card',
  count: 10,
  selection: { filter: { card_state: 'waiting', from_date: '2026-11-17', to_date: '2026-11-17' }, expectedCount: 10 },
};

beforeEach(() => {
  mockConfirm.mockReset();
  mockSend.mockReset();
  mockUndo.mockReset();
  mockPreview.mockReset();
  // No counts unless a test gives some: sending still works.
  mockPreview.mockRejectedValue(new Error('no preview'));
});

const previewOf = (o: Record<string, unknown>) => ({
  supported: true,
  clients: 1,
  emails: 1,
  texts: 0,
  reopened: 0,
  skipped: [],
  message: '',
  ...o,
});

describe('CardBulkController', () => {
  it('asks first, then shows the result with Undo and keeps it until dismissed', async () => {
    mockConfirm.mockResolvedValue({
      changed: 2,
      bookingIds: ['a', 'b'],
      unitExtra: 0,
      skipped: [],
      actionIds: ['act-1'],
      undoUntil: '2026-11-17T10:05:00Z',
      message: '2 bookings confirmed without a card.',
    });
    mockUndo.mockResolvedValue({ restored: 2, kept: 0 });
    const onDone = jest.fn();
    const request: CardBulkRequest = { action: 'confirm_without_card', count: 2, selection: { bookingIds: ['a', 'b'] } };
    const view = await render(<CardBulkController request={request} onDone={onDone} onCancel={jest.fn()} now={now} />);
    expect(screen.getByText('Confirm 2 bookings without a card?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Confirm 2 bookings'));
    expect(mockConfirm).toHaveBeenCalledWith({ bookingIds: ['a', 'b'] });
    expect(onDone).toHaveBeenCalled();
    await view.rerender(<CardBulkController request={null} onDone={onDone} onCancel={jest.fn()} now={now} />);
    const message = screen.getByText('2 bookings confirmed without a card.');
    expect(message.props.accessibilityLiveRegion).toBe('polite');
    await fireEvent.press(screen.getByText('Undo'));
    expect(mockUndo).toHaveBeenCalledWith(['act-1']);
    expect(screen.getByText('Undone. 2 bookings are back as they were.')).toBeTruthy();
    expect(screen.queryByText('Undo')).toBeNull();
    await fireEvent.press(screen.getByText('Dismiss'));
    expect(screen.queryByTestId('card-bulk-result')).toBeNull();
  });

  it('offers no Undo once the window has passed', async () => {
    mockConfirm.mockResolvedValue({
      changed: 1,
      bookingIds: ['a'],
      unitExtra: 0,
      skipped: [],
      actionIds: ['act-1'],
      undoUntil: '2026-11-17T09:59:00Z',
      message: '1 booking confirmed without a card.',
    });
    await render(
      <CardBulkController
        request={{ action: 'confirm_without_card', count: 1, selection: { bookingIds: ['a'] } }}
        onDone={jest.fn()}
        onCancel={jest.fn()}
        now={now}
      />,
    );
    await fireEvent.press(screen.getByText('Confirm 1 booking'));
    expect(screen.getByText('1 booking confirmed without a card.')).toBeTruthy();
    expect(screen.queryByText('Undo')).toBeNull();
  });

  it('asks again with the new number when the count changed, and sends it', async () => {
    mockConfirm
      .mockRejectedValueOnce(
        new ApiError('changed', 409, { error: 'changed', code: 'CARD_COUNT_CHANGED', count: 12 }),
      )
      .mockResolvedValueOnce({
        changed: 12,
        bookingIds: [],
        unitExtra: 0,
        skipped: [],
        actionIds: [],
        undoUntil: null,
        message: '12 bookings confirmed without a card.',
      });
    const onDone = jest.fn();
    await render(<CardBulkController request={selectAll} onDone={onDone} onCancel={jest.fn()} now={now} />);
    await fireEvent.press(screen.getByText('Confirm 10 bookings'));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText('Confirm 12 bookings without a card?')).toBeTruthy();
    expect(screen.getByText(/The number of bookings has changed to 12\. Please confirm again\./)).toBeTruthy();
    await fireEvent.press(screen.getByText('Confirm 12 bookings'));
    expect(mockConfirm.mock.calls[1][0]).toEqual({ ...selectAll.selection, expectedCount: 12 });
    expect(onDone).toHaveBeenCalled();
  });

  it('sends card requests and shows the server words', async () => {
    mockSend.mockResolvedValue({ clients: 3, emails: 3, texts: 2, reopened: 0, skipped: [], message: '3 clients: 3 emails and 2 texts.' });
    await render(
      <CardBulkController
        request={{ action: 'send_card_requests', count: 4, selection: { bookingIds: ['a', 'b', 'c', 'd'] } }}
        onDone={jest.fn()}
        onCancel={jest.fn()}
        now={now}
      />,
    );
    expect(screen.getByText('Send card requests for 4 bookings?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Send card requests'));
    expect(screen.getByText('3 clients: 3 emails and 2 texts.')).toBeTruthy();
    expect(screen.queryByText('Undo')).toBeNull();
  });

  it('shows the counts before sending, then sends', async () => {
    mockPreview.mockResolvedValue(previewOf({ clients: 12, emails: 12, texts: 9, message: 'This sends to 12 clients: 12 emails and 9 texts.' }));
    mockSend.mockResolvedValue({ clients: 12, emails: 12, texts: 9, reopened: 0, skipped: [], message: 'Card requests sent to 12 clients: 12 emails and 9 texts.' });
    await render(
      <CardBulkController
        request={{ action: 'send_card_requests', count: 14, selection: { bookingIds: ['a'] } }}
        onDone={jest.fn()}
        onCancel={jest.fn()}
        now={now}
      />,
    );
    expect(await screen.findByText(/This sends to 12 clients: 12 emails and 9 texts\./)).toBeTruthy();
    expect(mockPreview).toHaveBeenCalledWith({ bookingIds: ['a'] });
    expect(mockSend).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Send card requests'));
    expect(mockSend).toHaveBeenCalledWith({ bookingIds: ['a'] });
    expect(screen.getByText('Card requests sent to 12 clients: 12 emails and 9 texts.')).toBeTruthy();
  });

  it('when nobody would get one, says so and does not send', async () => {
    mockPreview.mockResolvedValue(
      previewOf({ clients: 0, emails: 0, texts: 0, message: 'No requests will be sent. Both clients were already sent one today.' }),
    );
    await render(
      <CardBulkController
        request={{ action: 'send_card_requests', count: 2, selection: { bookingIds: ['a', 'b'] } }}
        onDone={jest.fn()}
        onCancel={jest.fn()}
        now={now}
      />,
    );
    expect(await screen.findByText(/Both clients were already sent one today\./)).toBeTruthy();
    await fireEvent.press(screen.getByText('Send card requests'));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a select-all whose count changed is asked again with the new number before sending', async () => {
    mockPreview
      .mockRejectedValueOnce(new ApiError('changed', 409, { error: 'changed', code: 'CARD_COUNT_CHANGED', count: 12 }))
      .mockResolvedValue(previewOf({ clients: 5, emails: 5, texts: 3, message: 'This sends to 5 clients: 5 emails and 3 texts.' }));
    const sendAll: CardBulkRequest = { ...selectAll, action: 'send_card_requests' };
    await render(<CardBulkController request={sendAll} onDone={jest.fn()} onCancel={jest.fn()} now={now} />);
    expect(await screen.findByText('Send card requests for 12 bookings?')).toBeTruthy();
    expect(await screen.findByText(/This sends to 5 clients: 5 emails and 3 texts\./)).toBeTruthy();
    expect(screen.getByText(/The number of bookings has changed to 12\. Please confirm again\./)).toBeTruthy();
    expect(mockPreview.mock.calls[1][0]).toEqual({ ...selectAll.selection, expectedCount: 12 });
  });

  it('an older server that sent on the preview: shows what went and closes the question', async () => {
    mockPreview.mockResolvedValue({ ...previewOf({ message: '3 clients: 3 emails and 2 texts.' }), supported: false });
    const onDone = jest.fn();
    await render(
      <CardBulkController
        request={{ action: 'send_card_requests', count: 4, selection: { bookingIds: ['a'] } }}
        onDone={onDone}
        onCancel={jest.fn()}
        now={now}
      />,
    );
    expect(await screen.findByText('3 clients: 3 emails and 2 texts.')).toBeTruthy();
    expect(onDone).toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('says a refusal in words', async () => {
    mockSend.mockRejectedValue(new Error('Something went wrong. Please try again.'));
    await render(
      <CardBulkController
        request={{ action: 'send_card_requests', count: 1, selection: { bookingIds: ['a'] } }}
        onDone={jest.fn()}
        onCancel={jest.fn()}
        now={now}
      />,
    );
    await fireEvent.press(screen.getByText('Send card requests'));
    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
  });
});
