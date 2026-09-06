/**
 * Ask ResNeo, end to end inside the app: a question asked, an answer streamed
 * into the conversation, the three refusals that are not answers, and the hand
 * off to Support.
 *
 * The network layer is mocked at `@/lib/assistant/client` (its own suite covers
 * the wire); what is under test here is what the person sees.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: mockPush }),
    Stack: { Screen: () => React.createElement(React.Fragment, null) },
  };
});

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-1' }));

const mockStream = jest.fn();
const mockFeedback = jest.fn();
jest.mock('@/lib/assistant/client', () => {
  class AssistantRequestError extends Error {
    blocked: string | null;
    status: number;
    constructor(message: string, blocked: string | null, status: number) {
      super(message);
      this.blocked = blocked;
      this.status = status;
    }
  }
  return {
    __esModule: true,
    AssistantRequestError,
    MAX_MESSAGE_CHARS: 2000,
    HISTORY_LIMIT: 11,
    streamAssistantAnswer: (...args: unknown[]) => mockStream(...args),
    sendAssistantFeedback: (...args: unknown[]) => mockFeedback(...args),
  };
});

import AssistantScreen from '@/app/(app)/assistant';
import { ASSISTANT_COPY } from '@/lib/assistant/copy';
import { takeHandoff } from '@/lib/assistant/handoff';
import { resetKeptAssistantConversation } from '@/lib/assistant/useAssistantChat';
import { AssistantRequestError } from '@/lib/assistant/client';

/** Type a question and press Send. */
async function ask(question: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(ASSISTANT_COPY.placeholder), question);
  });
  await act(async () => {
    fireEvent.press(screen.getByText(ASSISTANT_COPY.send));
  });
}

beforeEach(() => {
  mockStream.mockReset();
  mockFeedback.mockReset();
  mockPush.mockClear();
  resetKeptAssistantConversation();
  takeHandoff();
});

describe('Ask ResNeo screen', () => {
  it('opens on the empty state, with the reminder not to include client details', async () => {
    await render(<AssistantScreen />);
    expect(screen.getByText(ASSISTANT_COPY.description)).toBeTruthy();
    expect(screen.getByText(ASSISTANT_COPY.emptyTitle)).toBeTruthy();
  });

  it('streams an answer into the conversation, as steps', async () => {
    mockStream.mockImplementation(async ({ handlers }: any) => {
      handlers.onConversation('c-1');
      handlers.onToken('1. Open **Settings**.');
      handlers.onDone({
        assistantMessageId: 'm-1',
        text: '1. Open **Settings**.\n\nRead more: [Calendars](/help/settings/calendars)',
        citations: ['settings/calendars'],
        answered: true,
      });
    });

    await render(<AssistantScreen />);
    await ask('How do I add a calendar?');

    expect(screen.getByText('How do I add a calendar?')).toBeTruthy();
    // The step marker, the bolded control name and the article link each land
    // as their own node: the answer was parsed, not printed as markdown.
    expect(screen.getByText('1.')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Calendars')).toBeTruthy();
    expect(screen.getByText(ASSISTANT_COPY.feedbackPrompt)).toBeTruthy();
  });

  it('keeps the question on screen and offers Stop while the answer streams', async () => {
    let finish: (() => void) | null = null;
    mockStream.mockImplementation(
      ({ handlers }: any) =>
        new Promise<void>((resolve) => {
          handlers.onToken('Working');
          finish = resolve;
        }),
    );

    await render(<AssistantScreen />);
    await ask('Anything');

    expect(screen.getByText(ASSISTANT_COPY.stop)).toBeTruthy();
    expect(screen.getByText('Working')).toBeTruthy();
    await act(async () => {
      finish?.();
    });
    await waitFor(() => expect(screen.getByText(ASSISTANT_COPY.send)).toBeTruthy());
  });

  it('says the assistant is switched off, and stops taking questions', async () => {
    mockStream.mockRejectedValue(
      new AssistantRequestError(ASSISTANT_COPY.unavailable, 'unavailable', 404),
    );

    await render(<AssistantScreen />);
    await ask('How do I add a calendar?');

    expect(screen.getByText(ASSISTANT_COPY.unavailable)).toBeTruthy();
    // The unanswered turn is dropped rather than left looking like an answer.
    expect(screen.queryByText(ASSISTANT_COPY.feedbackPrompt)).toBeNull();
    expect(screen.getByLabelText(ASSISTANT_COPY.placeholder).props.editable).toBe(false);
  });

  it('hands the conversation to Support with the transcript ready', async () => {
    mockStream.mockImplementation(async ({ handlers }: any) => {
      handlers.onDone({
        assistantMessageId: 'm-1',
        text: 'I cannot find that.',
        citations: [],
        answered: false,
      });
    });

    await render(<AssistantScreen />);
    await ask('Something obscure');
    await act(async () => {
      fireEvent.press(screen.getByText(ASSISTANT_COPY.sendToSupport));
    });

    expect(mockPush).toHaveBeenCalledWith('/support');
    const handoff = takeHandoff();
    expect(handoff?.subject).toBe(ASSISTANT_COPY.handoffSubject);
    expect(handoff?.message).toContain('Me: Something obscure');
    expect(handoff?.message).toContain('Ask ResNeo: I cannot find that.');
  });

  it('rates an answer against the message the server logged', async () => {
    mockStream.mockImplementation(async ({ handlers }: any) => {
      handlers.onDone({
        assistantMessageId: 'm-7',
        text: 'Open Settings.',
        citations: [],
        answered: true,
      });
    });

    await render(<AssistantScreen />);
    await ask('How?');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Yes, this was helpful'));
    });

    expect(mockFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'm-7', rating: 1 }),
    );
    expect(screen.getByText(ASSISTANT_COPY.feedbackThanks)).toBeTruthy();
  });
});
